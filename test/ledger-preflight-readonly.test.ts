import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{chmodSync,existsSync,lstatSync,mkdirSync,readFileSync,symlinkSync,writeFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join,resolve} from 'node:path';
import {Router,defaultPolicy} from '../src/core.ts';
import {automaticHook,loadAutomaticHookPolicy} from '../src/automatic-hook.ts';
import {ContextRetries} from '../src/context-retry.ts';
import {hookInput} from '../src/hook.ts';
import {acquireLedgerLock} from '../src/ledger-lock.ts';
import {createTestTemp} from '../test-support/temp.ts';

const posix={skip:process.platform==='win32'};
const description='Review a self-contained synthetic module for missing guards and incorrect imports. Return findings only, without tools or edits.';
const event=(short=false)=>({hook_event_name:'PreToolUse',session_id:'synthetic-ledger-session',tool_use_id:'synthetic-call',tool_name:'spawn_agent',tool_input:{task_name:short?'short':'Review module guards',message:short?'gAAAAA'+'A'.repeat(96):description,fork_turns:'none'}});
function fixture(t){
 const dir=createTestTemp(t,'codex-readonly-preflight-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});
 const policyPath=join(dir,'policy.json'),path=join(state,'ledger.json');
 writeFileSync(policyPath,JSON.stringify({schema_version:1,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',enabled:true,state_directory:state}),{mode:0o600});
 let calls=0;
 const router=new Router({policy:{...defaultPolicy,provider_id:'decisions'},ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-routine'};}});
 const profile=router.policy.profiles.find(p=>p.id==='codex-routine')!;
 const data={version:1,calls:2,estimated_usd:0.02,days:{'2026-11-11':2},requests:{
  saved_unknown:{digest:'a'.repeat(64),state:'unknown'},
  saved_cache:{digest:'b'.repeat(64),state:'complete',result:router.result('keep_current','preserved_constraints')},
  advice_original:{digest:'c'.repeat(64),state:'complete',result:router.result('recommended','allowed_profile',{profile_id:profile.id,profile})},
 }};
 writeFileSync(path,JSON.stringify(data),{mode:0o600});
 const seed={request_id:'missing_original',client:'codex' as const,eligible_profile_ids:[profile.id],policy_fingerprint:loadAutomaticHookPolicy(policyPath).fingerprint!,fill_model:true,fill_effort:true};
 const advice={...seed,request_id:'advice_original',fresh_eligible:true,application_blocked:'inherited_context_application_unverified'};
 return {dir,state,path,router,policyPath,seed,advice,data,get calls(){return calls;}};
}
function watch(path:string){
 const original=fs.chmodSync,calls:unknown[]=[];
 fs.chmodSync=((p,...args)=>{if(resolve(String(p))===resolve(path))calls.push(args[0]);return original(p,...args);})as typeof fs.chmodSync;syncBuiltinESMExports();
 return {calls,restore(){fs.chmodSync=original;syncBuiltinESMExports();}};
}
function unchanged(f,before:Buffer,mode:number){assert.deepEqual(readFileSync(f.path),before);assert.equal(lstatSync(f.path).mode&0o777,mode);assert.equal(existsSync(f.path+'.lock'),false);assert.equal(f.calls,0);}
for(const mode of [0o600,0o400,0o644])for(const kind of ['short-hook','legacy-hook','register','advice','fresh']as const){
 test(`${kind} preflight preserves ledger bytes/mode without chmod: ${mode.toString(8)}`,posix,async t=>{
  const f=fixture(t),retries=new ContextRetries(f.router,f.policyPath);
  if(kind==='legacy-hook'){
   const id=hookInput({client:'codex',event:event()})!.request_id;
   writeFileSync(f.path,JSON.stringify({...f.data,requests:{...f.data.requests,[id]:{digest:'d'.repeat(64),state:'unknown'}}}));
  }
  let ticket:string|undefined;
  if(kind==='fresh'){ticket=retries.registerAdvice(f.advice).retry_id;assert.ok(ticket);}
  chmodSync(f.path,mode);const before=readFileSync(f.path),watched=watch(f.path);
  try{
   if(kind==='short-hook'||kind==='legacy-hook'){
    const r=await automaticHook({client:'codex',event:event(kind==='short-hook'),router:f.router,policyPath:f.policyPath,...(kind==='short-hook'?{onNeedsContext:()=>({reason:'fixture_no_ticket'})}:{})});
    assert.equal(r.observation.reason,mode===0o644?'ledger_error':kind==='legacy-hook'?'legacy_request_exists':'insufficient_context');
   }else if(kind==='register'||kind==='advice'){
    const r=kind==='register'?retries.register(f.seed):retries.registerAdvice(f.advice);
    if(mode===0o644)assert.equal(r.reason,'ledger_error');else assert.ok(r.retry_id);
   }else{
    const r=retries.prepareFresh(ticket!,'review_synthetic_module',description,{independent_task:true,same_task:true,original_call_outcome:'blocked',history_requirement:'not_required',standalone_context_complete:true});
    assert.equal(r.status,mode===0o644?'rejected':'prepared');if(mode===0o644)assert.equal(r.reason,'fresh_delegation_unavailable');
   }
   assert.deepEqual(watched.calls,[]);unchanged(f,before,mode);
  }finally{watched.restore();}
 });
}
test('unreadable or corrupt ledger is refused without chmod or repair',posix,async t=>{
 for(const kind of ['corrupt','unreadable']){
  if(kind==='unreadable'&&process.getuid?.()===0)continue;
  const f=fixture(t);if(kind==='corrupt')writeFileSync(f.path,'{invalid');chmodSync(f.path,kind==='corrupt'?0o400:0o200);
  const watched=watch(f.path);try{
   const r=await automaticHook({client:'codex',event:event(),router:f.router,policyPath:f.policyPath});assert.equal(r.observation.reason,'ledger_error');
   assert.deepEqual(watched.calls,[]);assert.equal(lstatSync(f.path).mode&0o777,kind==='corrupt'?0o400:0o200);assert.equal(f.calls,0);assert.equal(existsSync(f.path+'.lock'),false);
  }finally{watched.restore();chmodSync(f.path,0o600);}
 }
});
test('foreign owner and symlink guards remain in force without metadata repair',posix,async t=>{
 const f=fixture(t),original=fs.lstatSync,watched=watch(f.path),before=readFileSync(f.path);
 fs.lstatSync=((p,...args)=>{const value=original(p,...args);return resolve(String(p))===resolve(f.path)?Object.assign(Object.create(Object.getPrototypeOf(value)),value,{uid:value.uid+1}):value;})as typeof fs.lstatSync;syncBuiltinESMExports();
 try{assert.equal(new ContextRetries(f.router,f.policyPath).register(f.seed).reason,'ledger_error');assert.deepEqual(watched.calls,[]);}finally{fs.lstatSync=original;watched.restore();syncBuiltinESMExports();}
 const other=join(f.state,'other.json');writeFileSync(other,before,{mode:0o600});fs.unlinkSync(f.path);symlinkSync(other,f.path);
 const spy=watch(f.path);try{const r=await automaticHook({client:'codex',event:event(),router:f.router,policyPath:f.policyPath});assert.equal(r.observation.reason,'ledger_error');assert.deepEqual(spy.calls,[]);assert.deepEqual(readFileSync(other),before);assert.ok(lstatSync(f.path).isSymbolicLink());}finally{spy.restore();}
});
test('missing ledger preflight does not create a ledger or lock',posix,t=>{
 const f=fixture(t);fs.unlinkSync(f.path);const watched=watch(f.path);
 try{assert.ok(new ContextRetries(f.router,f.policyPath).register(f.seed).retry_id);assert.deepEqual(watched.calls,[]);assert.equal(existsSync(f.path),false);assert.equal(existsSync(f.path+'.lock'),false);}finally{watched.restore();}
});
test('normal writes retain their existing lock and reservation behavior after read-only preflight',posix,async t=>{
 const f=fixture(t),before=JSON.parse(readFileSync(f.path,'utf8'));let writer=false;const chmod=fs.chmodSync,phases:boolean[]=[];const advise=f.router.advise.bind(f.router);
 f.router.advise=(...args)=>{writer=true;return advise(...args);};
 fs.chmodSync=((p,...args)=>{if(resolve(String(p))===resolve(f.path))phases.push(writer);return chmod(p,...args);})as typeof fs.chmodSync;syncBuiltinESMExports();
 f.router.provider=async()=>{assert.throws(()=>acquireLedgerLock(f.path),e=>(e as {code?:string}).code==='ledger_locked');return{choice:'codex-routine'};};
 try{
  const r=await automaticHook({client:'codex',event:event(),router:f.router,policyPath:f.policyPath});assert.equal(r.observation.reason,'operator_policy_defaults');
  assert.ok(phases.length>0);assert.ok(phases.every(Boolean));
  const after=JSON.parse(readFileSync(f.path,'utf8'));assert.equal(after.calls,before.calls+1);for(const [id,value]of Object.entries(before.requests))assert.deepEqual(after.requests[id],value);
  assert.equal(lstatSync(f.path).mode&0o777,0o600);
 }finally{fs.chmodSync=chmod;syncBuiltinESMExports();}
});
