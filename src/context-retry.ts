import { createHash } from 'node:crypto';
import { closeSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { effectiveTransmission, loadAutomaticHookPolicy } from './automatic-hook.ts';
import type { ContextRetrySeed } from './automatic-hook.ts';
import { assertPrivateStatePath, readRegularFile } from './files.ts';
import type { Router } from './core.ts';
import { hasSufficientTaskText } from './context-sufficiency.ts';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface FreshDeclaration { independent_task:boolean; same_task:boolean; original_call_outcome:'blocked'|'executed'|'unknown'; history_requirement:'not_required'|'required'|'unknown'; standalone_context_complete:boolean; }
interface Entry { seed:ContextRetrySeed; at:number; catalog:string; current?:()=>string|undefined; cancelled?:boolean; active?:boolean; recommendation_id?:string; }

/** One caller-supplied supplement, never an automatic native spawn or a retry chain. */
export class ContextRetries {
 private entries=new Map<string,Entry>();
 private router:Router;
 private policyPath:unknown;
 private now:()=>number;
 constructor(router:Router,policyPath:unknown,now:()=>number=Date.now) {this.router=router;this.policyPath=policyPath;this.now=now;}
 private current(entry:Entry,signal?:AbortSignal):string|undefined {
  if(entry.cancelled||signal?.aborted)return 'context_retry_cancelled';
  if(this.now()-entry.at>=300_000)return 'context_retry_expired';
  try{const changed=entry.current?.();if(changed)return changed;}catch{return 'context_changed';}
  const loaded=loadAutomaticHookPolicy(this.policyPath);
  if(!loaded.policy?.enabled)return loaded.reason;
  if(loaded.fingerprint!==entry.seed.policy_fingerprint)return 'automatic_policy_changed';
  if(['none','unselected'].includes(effectiveTransmission(loaded.policy)))return 'automatic_transmission_disabled';
  if(hash(this.router.policy)!==entry.catalog)return 'catalog_changed';
  return undefined;
 }
 register(seed:ContextRetrySeed,current?:()=>string|undefined):{retry_id?:string;reason?:string} {
  const policy=loadAutomaticHookPolicy(this.policyPath);
  if(!policy.policy?.enabled||policy.fingerprint!==seed.policy_fingerprint||['none','unselected'].includes(effectiveTransmission(policy.policy)))return {reason:'automatic_policy_changed'};
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
 registerAdvice(seed:ContextRetrySeed,current?:()=>string|undefined):{retry_id?:string;reason?:string} {
  const policy=loadAutomaticHookPolicy(this.policyPath);
  if(!policy.policy?.enabled||policy.fingerprint!==seed.policy_fingerprint||['none','unselected'].includes(effectiveTransmission(policy.policy)))return {reason:'automatic_policy_changed'};
  if(!seed.fresh_eligible||seed.application_blocked!=='inherited_context_application_unverified')return {reason:'fresh_delegation_unsupported'};
  try{this.router.load();const record=this.router.state.requests[seed.request_id];
   if(!record||record.state!=='complete'||record.result?.status!=='recommended')return {reason:'recommendation_not_available'};
  }catch{return {reason:'ledger_error'};}
  const retry_id=hash(['aptly-blocked-advice-v1',seed.request_id]);
  if(this.entries.has(retry_id))return {retry_id};
  if(this.entries.size>=128)return {reason:'context_retry_capacity'};
  this.entries.set(retry_id,{seed:structuredClone(seed),at:this.now(),catalog:hash(this.router.policy),current,recommendation_id:seed.request_id});return {retry_id};
 }
 async retry(retry_id:string,description:string,signal?:AbortSignal):Promise<Record<string,unknown>> {
  const entry=this.entries.get(retry_id);
  const unavailable=(reason:string)=>({status:'unavailable',reason,application:'advisory_only',retry_id,context_retry_allowed:false});
  if(!entry)return unavailable('context_retry_not_found');
  if(entry.recommendation_id)return unavailable('context_retry_not_eligible');
  const check=()=>this.current(entry,signal);
  const blocked=check();if(blocked)return unavailable(blocked);
  if(entry.active)return unavailable('concurrency_limit');
  if(typeof description!=='string'||Buffer.byteLength(description)>Math.min(3800,this.router.policy.max_summary_bytes-96)||
    !hasSufficientTaskText(description))return unavailable('insufficient_context');
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
     ? entry.seed.application_blocked?`Report the application constraint and preserve original history and arguments for the ORIGINAL invocation. This profile is advice only. ${entry.seed.fresh_eligible?'This is the SAME task but a NEW invocation, not a retry of the original call. Use only the separate caller-declared preparation protocol offered below. Only after the host reports the original tool call blocked, if you can declare that this is the same independent task, the user does not require inherited history, and you can supply complete standalone instructions, call prepare_fresh_delegation with this retry_id, task_name, standalone_task and declaration {independent_task:true,same_task:true,original_call_outcome:"blocked",history_requirement:"not_required",standalone_context_complete:true}. It prepares a separate fresh invocation without a new classification. Never use it when history is required or unknown, or when original execution is unknown.':''}`
       :`Context supplementation is complete; do not call retry_spawn_recommendation again. Caller review means the parent checks arguments, not a request for new user approval. To perform the already requested delegation, on the next native ${entry.seed.client==='claude'?'Agent':'spawn_agent'} call, include these previously unspecified fields: ${JSON.stringify(defaults)}. Do not submit another model/effort-omitted call: it will be blocked again. Preserve all other arguments, explicit choices, history, roles and permissions. This response does not execute a child.`
     :'Stop this recovery attempt. Report the outcome; do not create another retry ID or spawn with an unresolved recommendation.'};
  }finally{entry.active=false;signal?.removeEventListener('abort',cancel);}
 }
 /** Caller-declared independent work only; never rewrites or executes the blocked call. */
 prepareFresh(retry_id:string,task_name:string,standalone_task:string,declaration:FreshDeclaration,signal?:AbortSignal):Record<string,unknown> {
  const reject=(reason:string)=>({status:'rejected',reason,application:'advisory_only',source_retry_id:retry_id,execution:'not_observed'});
  const entry=this.entries.get(retry_id);if(!entry)return reject('context_retry_not_found');
  const blocked=this.current(entry,signal);if(blocked)return reject(blocked);
  if(entry.seed.client!=='codex'||entry.seed.application_blocked!=='inherited_context_application_unverified'||entry.seed.fresh_eligible!==true)return reject('fresh_delegation_unsupported');
  if(!declaration||declaration.history_requirement!=='not_required')return reject('history_requirement_preserved');
  if(declaration.independent_task!==true)return reject('independent_task_not_declared');
  if(declaration.same_task!==true)return reject('task_scope_changed');
  if(declaration.original_call_outcome!=='blocked')return reject('original_execution_not_confirmed_blocked');
  if(declaration.standalone_context_complete!==true)return reject('standalone_context_incomplete');
  if(typeof task_name!=='string'||!task_name.trim()||Buffer.byteLength(task_name)>128||typeof standalone_task!=='string'||Buffer.byteLength(standalone_task)>12000||!hasSufficientTaskText(standalone_task))return reject('insufficient_context');
  if(/\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}/i.test(task_name+'\n'+standalone_task))return reject('sensitive_input');
  if(entry.active||this.router.active)return reject('concurrency_limit');
  try {
   this.router.load();const record=this.router.state.requests[entry.recommendation_id??retry_id];
   if(!record)return reject('recommendation_not_found');
   if(record.state!=='complete')return reject('outcome_unknown');
   const result=record.result;this.router.validateOutcome(result);
   if(result.status!=='recommended'||!result.profile)return reject('recommendation_not_available');
   const profile=this.router.policy.profiles.find(p=>p.id===result.profile_id);
   if(!profile||!entry.seed.eligible_profile_ids.includes(profile.id)||hash(profile)!==hash(result.profile)||result.policy_version!==this.router.policy.version||result.catalog_version!==this.router.policy.catalog_version)return reject('profile_changed');
   const preparation_id=hash(['aptly-fresh-delegation-v1',retry_id]);
   const fingerprint=hash([entry.seed,entry.catalog,profile,declaration,task_name,standalone_task]);
   const policy=loadAutomaticHookPolicy(this.policyPath).policy;if(!policy)return reject('automatic_policy_changed');
   const path=join(policy.state_directory,`hook-fresh-${preparation_id}.json`);assertPrivateStatePath(path);
   let fd:number|undefined;
   try {
    try{fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify({fingerprint}));}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
     const previous:unknown=JSON.parse(readRegularFile(path,{privateFile:true,maxBytes:256}).toString('utf8'));
     if(!previous||typeof previous!=='object'||Object.keys(previous).length!==1||!('fingerprint' in previous)||previous.fingerprint!==fingerprint)return reject('fresh_delegation_conflict');}
   }finally{if(fd!==undefined)closeSync(fd);}
   const changed=this.current(entry,signal);if(changed)return reject(changed);
   return {status:'prepared',reason:'caller_declared_independent',application:'advisory_only',source_retry_id:retry_id,preparation_id,
    profile_id:profile.id,profile:structuredClone(profile),intent_provenance:'caller_declared_not_verified',original_invocation:'deny_returned_execution_not_observed',execution:'not_observed',
    next_call:{tool:'spawn_agent',arguments:{task_name,message:standalone_task,fork_turns:'none',model:profile.model,reasoning_effort:profile.reasoning_effort}},
    next_step:'Review and submit this separate native invocation only after a host-reported blocked outcome, under existing delegation authorization and unchanged host permissions. Original arguments were not rewritten; host execution is not observed by this server. Do not add history/role/resume overrides or reuse this preparation for another task. Preparation does not prove interception, permission approval, single execution or child execution.'};
  }catch{return reject('fresh_delegation_unavailable');}
 }
}
