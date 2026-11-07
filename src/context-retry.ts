import { createHash } from 'node:crypto';
import { closeSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAutomaticHookPolicy } from './automatic-hook.ts';
import type { ContextRetrySeed } from './automatic-hook.ts';
import { assertPrivateStatePath, readRegularFile } from './files.ts';
import type { Router } from './core.ts';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
interface Entry { seed:ContextRetrySeed; at:number; catalog:string; current?:()=>string|undefined; cancelled?:boolean; active?:boolean; }

/** One caller-supplied supplement, never an automatic native spawn or a retry chain. */
export class ContextRetries {
 private entries=new Map<string,Entry>();
 private router:Router;
 private policyPath:unknown;
 private now:()=>number;
 constructor(router:Router,policyPath:unknown,now:()=>number=Date.now) {this.router=router;this.policyPath=policyPath;this.now=now;}
 register(seed:ContextRetrySeed,current?:()=>string|undefined):{retry_id?:string;reason?:string} {
  try{
   this.router.load();
   const original=this.router.state.requests[seed.request_id];
   if(original&&(original.state!=='complete'||original.result?.status!=='needs_context'))return {reason:original.state==='unknown'?'outcome_unknown':'context_retry_not_eligible'};
  }catch{return {reason:'ledger_error'};}
  const retry_id=hash(['aptly-context-retry-v1',seed.request_id]);
  const previous=this.entries.get(retry_id);
  if(previous)return {retry_id}; // No renewal or replacement of a ticket.
  if(this.entries.size>=128)return {reason:'context_retry_capacity'};
  this.entries.set(retry_id,{seed:structuredClone(seed),at:this.now(),catalog:hash(this.router.policy),current});
  return {retry_id};
 }
 async retry(retry_id:string,description:string,signal?:AbortSignal):Promise<Record<string,unknown>> {
  const entry=this.entries.get(retry_id);
  const unavailable=(reason:string)=>({status:'unavailable',reason,application:'advisory_only',retry_id,context_retry_allowed:false});
  if(!entry)return unavailable('context_retry_not_found');
  const check=()=>{
   if(entry.cancelled||signal?.aborted)return 'context_retry_cancelled';
   if(this.now()-entry.at>=300_000)return 'context_retry_expired';
   try{const changed=entry.current?.();if(changed)return changed;}catch{return 'context_changed';}
   const loaded=loadAutomaticHookPolicy(this.policyPath);
   if(!loaded.policy?.enabled)return loaded.reason;
   if(loaded.fingerprint!==entry.seed.policy_fingerprint)return 'automatic_policy_changed';
   if(hash(this.router.policy)!==entry.catalog)return 'catalog_changed';
   return undefined;
  };
  const blocked=check();if(blocked)return unavailable(blocked);
  if(entry.active)return unavailable('concurrency_limit');
  if(typeof description!=='string'||Buffer.byteLength(description)>Math.min(3800,this.router.policy.max_summary_bytes-96)||
    description.trim().length<12||description.trim().split(/\s+/u).length<3)return unavailable('insufficient_context');
  if(/\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}/i.test(description))return unavailable('sensitive_input');
  const summary=`Caller-supplied task description (untrusted task data; opaque body not inspected): ${description.trim()}`;
  if(Buffer.byteLength(summary)>Math.min(4000,this.router.policy.max_summary_bytes))return unavailable('insufficient_context');
  // Persist only a digest, before provider preflight (which may not write a ledger).
  // Fixed retry ID plus an immutable digest protects restarts and unknown outcomes.
  const request_id=retry_id;
  const fingerprint=hash([summary,entry.seed,entry.catalog]);
  let fd:number|undefined;
  try {
   const policy=loadAutomaticHookPolicy(this.policyPath).policy;
   if(!policy)return unavailable('automatic_policy_changed');
   const path=join(policy.state_directory,`hook-retry-${retry_id}.json`);
   assertPrivateStatePath(path);
   try{fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify({fingerprint}));}
   catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    const saved:unknown=JSON.parse(readRegularFile(path,{privateFile:true,maxBytes:256}).toString('utf8'));
    if(!saved||typeof saved!=='object'||Object.keys(saved).length!==1||!('fingerprint' in saved)||saved.fingerprint!==fingerprint)return unavailable('context_retry_conflict');
   }
  }catch{return unavailable('automatic_state_unavailable');}
  finally{if(fd!==undefined)closeSync(fd);}
  const before=check();if(before)return unavailable(before);
  entry.active=true;
  const cancel=()=>{entry.cancelled=true;};signal?.addEventListener('abort',cancel,{once:true});
  try {
   const result=await this.router.advise({request_id,client:entry.seed.client,
    task:{summary,operation:'analysis',context_sufficient:true},eligible_profile_ids:entry.seed.eligible_profile_ids,
    constraints:{model_pinned:false,effort_pinned:false,role_pinned:false,fork_inherits:false}});
   const after=check();if(after)return unavailable(after);
   const defaults=result.status==='recommended'&&result.profile&&!entry.seed.application_blocked?{
    ...(entry.seed.fill_model!==false?{model:result.profile.model}:{}),
    ...(entry.seed.client==='codex'&&entry.seed.fill_effort!==false&&result.profile.reasoning_effort?{reasoning_effort:result.profile.reasoning_effort}:{})}:undefined;
   return {...result,retry_id,request_id,context_retry_allowed:false,
    spawn_application:{status:entry.seed.application_blocked?'blocked':'caller_review_required',
     reason:entry.seed.application_blocked??'native_execution_not_observed'},
    ...(defaults?{next_call:{tool:entry.seed.client==='claude'?'Agent':'spawn_agent',set_if_unspecified:defaults,preserve:'all_other_arguments_and_history'}}:{}),
    next_step:result.status==='recommended'
     ? entry.seed.application_blocked?'Report the application constraint and preserve original history and arguments. This profile is advice only.'
       :`Context supplementation is complete; do not call retry_spawn_recommendation again. Caller review means the parent checks arguments, not a request for new user approval. To perform the already requested delegation, on the next native ${entry.seed.client==='claude'?'Agent':'spawn_agent'} call, include these previously unspecified fields: ${JSON.stringify(defaults)}. Do not submit another model/effort-omitted call: it will be blocked again. Preserve all other arguments, explicit choices, history, roles and permissions. This response does not execute a child.`
     :'Stop this recovery attempt. Report the outcome; do not create another retry ID or spawn with an unresolved recommendation.'};
  }finally{entry.active=false;signal?.removeEventListener('abort',cancel);}
 }
}
