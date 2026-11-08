import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {automaticHook} from '../src/automatic-hook.ts';
import {Router,defaultPolicy} from '../src/core.ts';
import {createTestTemp} from '../test-support/temp.ts';

const event=()=>({hook_event_name:'PreToolUse',session_id:'synthetic-session',tool_use_id:'synthetic-call',tool_name:'spawn_agent',
 tool_input:{task_name:'Sort numbers',message:'Sort the supplied synthetic numbers [3, 1, 2].',fork_turns:'none',sandbox:'read-only'}});
function fixture(t,options={}){
 const dir=createTestTemp(t,'codex-routing-outcome-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});
 const policyPath=join(dir,'policy.json');let calls=0;
 const policy={schema_version:1,kind:'aptly-auto-hook',mode:options.mode??'defaults',issuer:'operator_installation',enabled:options.enabled??true,state_directory:state};
 writeFileSync(policyPath,JSON.stringify(policy),{mode:0o600});
 const router=new Router({ledgerPath:join(state,'ledger.json'),policy:{...defaultPolicy,provider_id:'decisions',...options.routerPolicy},provider:async args=>{calls++;return options.provider?options.provider(args):{choice:'codex-simple'};}});
 return {router,policyPath,calls:()=>calls,run:(ev=event(),extra={})=>automaticHook({client:'codex',event:ev,router,policyPath,...extra})};
}
test('defaults denies inherited/omitted/history application instead of silently executing parent defaults',async t=>{
 for(const patch of [{fork_turns:'all'},{fork_turns:undefined},{fork_context:true},{inherit_history:true}]){
  const f=fixture(t),ev=event();Object.assign(ev.tool_input,patch);if(patch.fork_turns===undefined&&Object.hasOwn(patch,'fork_turns'))delete ev.tool_input.fork_turns;
  const before=structuredClone(ev),result=await f.run(ev);
  assert.equal(result.observation.status,'blocked');assert.equal(result.observation.recommendation,'produced');
  assert.equal(result.observation.application,'blocked');assert.equal(result.observation.execution,'not_observed');
  assert.equal(result.output.hookSpecificOutput.permissionDecision,'deny');
  assert.match(result.output.hookSpecificOutput.permissionDecisionReason,/Report this constraint and stop/);
  assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'updatedInput'),false);assert.deepEqual(ev,before);
  let executions=0;if(result.output.hookSpecificOutput.permissionDecision!=='deny')executions++;
  assert.equal(executions,0);await f.run(ev);assert.equal(f.calls(),1);
 }
});
test('advisory inherited guidance never blocks, rewrites or claims execution',async t=>{
 const f=fixture(t,{mode:'advisory'}),ev=event();delete ev.tool_input.fork_turns;
 const result=await f.run(ev);assert.equal(result.observation.reason,'inherited_context_application_unverified');
 assert.match(result.output.hookSpecificOutput.additionalContext,/history and arguments are preserved/);
 assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'permissionDecision'),false);
 assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'updatedInput'),false);
});
test('enabled eligible defaults deny bounded failures; advisory provides safe feedback only',async t=>{
 for(const mode of ['defaults','advisory'])for(const scenario of ['network','choice','budget','throw']){
  const f=fixture(t,{mode,provider:async()=>{
   if(scenario==='network')throw Object.assign(Error('SYNTHETIC_PRIVATE_RAW_ERROR'),{code:'network'});
   return {choice:scenario==='choice'?'foreign-profile':'codex-simple'};
  },routerPolicy:scenario==='budget'?{max_total_calls:1}:undefined});
  if(scenario==='budget'){await f.run();assert.equal(f.calls(),1);}
  const ev=event();if(scenario==='budget')ev.tool_use_id='second-synthetic-call';
  const result=await f.run(ev,scenario==='throw'?{context:()=>{throw Error('SYNTHETIC_PRIVATE_RAW_ERROR');}}:{});
  assert.equal(result.observation.reason,{network:'network',choice:'invalid_choice',budget:'budget_exhausted',throw:'automatic_hook_unavailable'}[scenario]);
  assert.match(result.output.hookSpecificOutput.additionalContext,/Report this outcome/);
  assert.equal(result.output.hookSpecificOutput.permissionDecision,mode==='defaults'?'deny':undefined);
  assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'updatedInput'),false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_RAW_ERROR'),false);
  if(scenario==='budget')assert.equal(f.calls(),1);
  if(scenario==='network'){const next=await f.run(ev);assert.equal(next.observation.reason,'outcome_unknown');assert.equal(f.calls(),1);}
 }
});
test('disabled/missing policy, explicit tuple, fixed role and resumed identity remain intentional local preservation',async t=>{
 for(const scenario of ['disabled','missing','tuple','role','resume']){
  const f=fixture(t,{enabled:scenario!=='disabled'}),ev=event();
  if(scenario==='tuple')Object.assign(ev.tool_input,{model:'gpt-6-luna',reasoning_effort:'max'});
  if(scenario==='role')ev.tool_input.role='reviewer';if(scenario==='resume')ev.tool_input.resume='synthetic-agent';
  const result=await f.run(ev,scenario==='missing'?{policyPath:undefined}:{});
  assert.deepEqual(result.output,{});assert.equal(result.observation.status,'preserved');assert.equal(f.calls(),0);
 }
});
test('a changed advisory policy never emits a defaults denial from the earlier snapshot',async t=>{
 let release;const f=fixture(t,{provider:()=>new Promise(resolve=>{release=()=>resolve({choice:'codex-simple'});})});
 const pending=f.run();await new Promise(resolve=>setImmediate(resolve));
 const {readFileSync}=await import('node:fs');const policy=JSON.parse(readFileSync(f.policyPath,'utf8'));policy.mode='advisory';
 writeFileSync(f.policyPath,JSON.stringify(policy),{mode:0o600});release();
 const result=await pending;assert.equal(result.observation.reason,'automatic_policy_changed');
 assert.equal(result.output.hookSpecificOutput.permissionDecision,undefined);assert.match(result.output.hookSpecificOutput.additionalContext,/automatic_policy_changed/);
});
