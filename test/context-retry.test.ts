import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { automaticHook, loadAutomaticHookPolicy } from '../src/automatic-hook.ts';
import { ContextRetries } from '../src/context-retry.ts';
import { SpawnContexts } from '../src/spawn-context.ts';
import { Router, defaultPolicy } from '../src/core.ts';
import { createServer } from '../src/server.ts';
import { hookInput } from '../src/hook.ts';
import { createTestTemp } from '../test-support/temp.ts';

const description='Review a synthetic refresh change for conflict markers and incorrect imports. Return findings only; do not edit files.';
const event=()=>({hook_event_name:'PreToolUse',session_id:'synthetic-session',tool_use_id:'synthetic-call',tool_name:'spawn_agent',
 tool_input:{task_name:'review_12345_refresh',message:'gAAAAA'+'A'.repeat(96),fork_turns:'none'}});
function fixture(t,options={}){
 const dir=createTestTemp(t,'codex-context-retry-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});
 const policyPath=join(dir,'policy.json'),ledgerPath=join(state,'ledger.json');
 const policy={schema_version:1,kind:'aptly-auto-hook',mode:options.mode??'defaults',issuer:'operator_installation',enabled:true,state_directory:state};
 const write=()=>writeFileSync(policyPath,JSON.stringify(policy),{mode:0o600});write();
 const calls=[];let now=0;
 const router=new Router({ledgerPath,policy:{...defaultPolicy,provider_id:'decisions',...options.routerPolicy},provider:options.provider??(async args=>{calls.push(args);return {choice:'codex-routine'};})});
 const retries=new ContextRetries(router,policyPath,()=>now);
 const run=(ev=event())=>automaticHook({client:'codex',event:ev,router,policyPath,onNeedsContext:(seed,current)=>retries.register(seed,current)});
 return {dir,state,policy,policyPath,ledgerPath,router,retries,run,calls,write,setNow:value=>{now=value;}};
}
test('opaque short-name Hook denies, accepts one supplement, deduplicates and never executes',async t=>{
 const f=fixture(t),ev=event(),before=structuredClone(ev),first=await f.run(ev);
 assert.equal(first.observation.reason,'insufficient_context');assert.equal(first.observation.status,'awaiting_context');
 const retry_id=first.observation.retry_id;
 assert.match(retry_id,/^[a-f0-9]{64}$/);assert.equal(f.calls.length,0);
 assert.equal(first.output.hookSpecificOutput.permissionDecision,'deny');
 assert.match(first.output.hookSpecificOutput.permissionDecisionReason,/retry_spawn_recommendation/);
 let executions=0;if(first.output.hookSpecificOutput.permissionDecision!=='deny')executions++;
 assert.equal(executions,0);
 const result=await f.retries.retry(retry_id,description);
 assert.equal(result.status,'recommended');assert.equal(result.profile.model,'gpt-6.1-terra');
 assert.equal(result.spawn_application.status,'caller_review_required');assert.equal(result.retry_allowed,false);
 assert.equal(f.calls.length,1);assert.match(f.calls[0].input.task.summary,/Caller-supplied/);
 assert.equal(f.calls[0].input.task.summary.includes(ev.tool_input.message),false);
 assert.equal(JSON.stringify(f.calls).includes('review_12345_refresh'),false);
 assert.equal((await f.retries.retry(retry_id,description)).cached,true);assert.equal(f.calls.length,1);
 assert.equal((await f.retries.retry(retry_id,description+' Additional scope.')).reason,'context_retry_conflict');
 assert.deepEqual(ev,before);assert.equal(executions,0);
 const stored=readdirSync(f.state).filter(name=>name.endsWith('.json')).map(name=>readFileSync(join(f.state,name),'utf8')).join('');
 for(const raw of [description,ev.tool_input.message,ev.session_id,ev.tool_use_id])assert.equal(stored.includes(raw),false);
 const next=await f.run(ev);assert.equal(next.observation.retry_id,retry_id);
 const reloaded=new ContextRetries(new Router({policy:f.router.policy,ledgerPath:f.ledgerPath,provider:async()=>{throw Error('must not send');}}),f.policyPath);
 const seed={request_id:first.observation.request_id,client:'codex',eligible_profile_ids:f.router.policy.profiles.filter(p=>p.client==='codex').map(p=>p.id),policy_fingerprint:loadAutomaticHookPolicy(f.policyPath).fingerprint};
 assert.equal(reloaded.register(seed).retry_id,retry_id);
 assert.equal((await reloaded.retry(retry_id,description)).cached,true);
 assert.equal((await reloaded.retry(retry_id,description+' changed')).reason,'context_retry_conflict');
});
test('provider needs_context allows one supplement but repeated abstention creates no chain',async t=>{
 let calls=0;const f=fixture(t,{provider:async()=>{calls++;return {choice:'needs_context'};}}),ev=event();
 ev.tool_input.message='Review this synthetic module for correctness.';
 const first=await f.run(ev);assert.equal(calls,1);assert.equal(first.observation.reason,'provider_needs_context');
 const result=await f.retries.retry(first.observation.retry_id,description);
 assert.equal(result.status,'needs_context');assert.equal(result.retry_allowed,false);assert.equal(calls,2);
 assert.equal((await f.retries.retry(first.observation.retry_id,description)).cached,true);assert.equal(calls,2);
 assert.equal((await f.run(ev)).observation.retry_id,first.observation.retry_id);assert.equal(calls,2);
});
test('inherited/default history remains blocked even after a successful recommendation',async t=>{
 for(const fork of ['all',undefined]){
  const f=fixture(t),ev=event();if(fork)ev.tool_input.fork_turns=fork;else delete ev.tool_input.fork_turns;
  const first=await f.run(ev),result=await f.retries.retry(first.observation.retry_id,description);
  assert.equal(result.status,'recommended');assert.equal(result.spawn_application.status,'blocked');
  assert.equal(result.spawn_application.reason,'inherited_context_application_unverified');
  assert.match(result.next_step,/preserve original history/);assert.equal(ev.tool_input.fork_turns,fork);
 }
});
test('advisory policy supplies context feedback without denying',async t=>{
 const f=fixture(t,{mode:'advisory'}),result=await f.run();
 assert.match(result.output.hookSpecificOutput.additionalContext,/retry_spawn_recommendation/);
 assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'permissionDecision'),false);
});
test('Claude general-purpose context recovery stays within Claude profiles and does not add effort',async t=>{
 const f=fixture(t);f.router.provider=async args=>{f.calls.push(args);return {choice:'claude-routine'};};
 const ev={hook_event_name:'PreToolUse',session_id:'synthetic-claude',tool_use_id:'synthetic-call',tool_name:'Agent',
  tool_input:{description:'Review',prompt:'Do it',subagent_type:'general-purpose'}};
 const first=await automaticHook({client:'claude',event:ev,router:f.router,policyPath:f.policyPath,onNeedsContext:(seed,current)=>f.retries.register(seed,current)});
 assert.equal(first.output.hookSpecificOutput.permissionDecision,'deny');
 const result=await f.retries.retry(first.observation.retry_id,description);
 assert.equal(result.status,'recommended');assert.equal(result.profile.model,'sonnet');
 assert.equal(Object.hasOwn(result.profile,'reasoning_effort'),false);assert.ok(f.calls[0].profiles.every(p=>p.client==='claude'));
});
test('partial pins restrict retry candidates; both pins, roles and sensitive input issue no ticket',async t=>{
 const f=fixture(t),ev=event();ev.tool_input.model='gpt-6.1-terra';
 const first=await f.run(ev),result=await f.retries.retry(first.observation.retry_id,description);
 assert.equal(result.profile.model,'gpt-6.1-terra');assert.deepEqual(f.calls[0].profiles.map(p=>p.id),['codex-routine']);
 for(const patch of [{model:'gpt-6.1-terra',reasoning_effort:'high'},{role:'reviewer'},{resume:'synthetic'},
  {message:'Review the token sk-syntheticonly12345678 safely'}]){
  const fresh=fixture(t),input=event();Object.assign(input.tool_input,patch);
  assert.equal((await fresh.run(input)).observation.retry_id,undefined);assert.equal(fresh.calls.length,0);
 }
});
test('timeout stays unknown across repeats and restart; no replacement paid ID',async t=>{
 let calls=0;const f=fixture(t,{routerPolicy:{timeout_ms:5},provider:async()=>{calls++;return new Promise(()=>{});}});
 const first=await f.run(),id=first.observation.retry_id;
 assert.equal((await f.retries.retry(id,description)).reason,'timeout');assert.equal(calls,1);
 assert.equal((await f.retries.retry(id,description)).reason,'outcome_unknown');assert.equal(calls,1);
 assert.equal((await f.run()).observation.retry_id,id);assert.equal(calls,1);
 const retries=new ContextRetries(f.router,f.policyPath);retries.register({request_id:first.observation.request_id,client:'codex',eligible_profile_ids:f.router.policy.profiles.filter(p=>p.client==='codex').map(p=>p.id),policy_fingerprint:loadAutomaticHookPolicy(f.policyPath).fingerprint});
 assert.equal((await retries.retry(id,description)).reason,'outcome_unknown');assert.equal(calls,1);
});
test('description binding survives local provider-preflight failure and ticket recreation',async t=>{
 const provider=Object.assign(async()=>({choice:'codex-routine'}),{preflight(){throw Object.assign(Error('not configured'),{code:'unauthorized'});}});
 const f=fixture(t,{provider}),first=await f.run(),id=first.observation.retry_id;
 assert.equal((await f.retries.retry(id,description)).reason,'unauthorized');
 assert.equal((await f.retries.retry(id,description+' changed')).reason,'context_retry_conflict');
 const again=new ContextRetries(f.router,f.policyPath);again.register({request_id:first.observation.request_id,client:'codex',eligible_profile_ids:f.router.policy.profiles.filter(p=>p.client==='codex').map(p=>p.id),policy_fingerprint:loadAutomaticHookPolicy(f.policyPath).fingerprint});
 assert.equal((await again.retry(id,description+' changed')).reason,'context_retry_conflict');
});
test('bounds, expiry, policy/catalog changes, cancellation, concurrency and budgets do not loop',async t=>{
 const f=fixture(t),first=await f.run(),id=first.observation.retry_id;
 for(const invalid of ['', 'Do it','😀'.repeat(1000)])assert.equal((await f.retries.retry(id,invalid)).reason,'insufficient_context');
 assert.equal((await f.retries.retry(id,'Review Bearer synthetic_token_123 safely')).reason,'sensitive_input');assert.equal(f.calls.length,0);
 f.setNow(300000);assert.equal((await f.retries.retry(id,description)).reason,'context_retry_expired');
 assert.equal((await f.run()).observation.retry_id,id);assert.equal((await f.retries.retry(id,description)).reason,'context_retry_expired');
 for(const change of ['disabled','mode','catalog']){
  const g=fixture(t),pending=await g.run();
  if(change==='catalog')g.router.policy.catalog_version='changed';else{if(change==='disabled')g.policy.enabled=false;else g.policy.mode='advisory';g.write();}
  assert.notEqual((await g.retries.retry(pending.observation.retry_id,description)).status,'recommended');assert.equal(g.calls.length,0);
 }
 const controller=new AbortController();controller.abort();const g=fixture(t),pending=await g.run();
 assert.equal((await g.retries.retry(pending.observation.retry_id,description,controller.signal)).reason,'context_retry_cancelled');
 const budget=fixture(t,{routerPolicy:{max_estimated_usd:0.001}}),b=await budget.run();
 assert.equal((await budget.retries.retry(b.observation.retry_id,description)).reason,'budget_exhausted');assert.equal(budget.calls.length,0);
 let release;const busy=fixture(t,{provider:()=>new Promise(resolve=>{release=()=>resolve({choice:'codex-routine'});})}),p=await busy.run();
 const inflight=busy.retries.retry(p.observation.retry_id,description);await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await busy.retries.retry(p.observation.retry_id,description)).reason,'concurrency_limit');
 busy.policy.enabled=false;busy.write();release();assert.equal((await inflight).reason,'automatic_policy_disabled');
});
test('legacy requests and changed native calls cannot acquire a replacement recovery binding',async t=>{
 const f=fixture(t),ev=event();
 const legacy=hookInput({client:'codex',event:ev,policy:f.router.policy});
 await f.router.recommend(legacy);
 assert.equal((await f.run(ev)).observation.reason,'legacy_request_exists');
 const g=fixture(t);await g.run(ev);ev.tool_input.fork_turns='all';
 assert.equal((await g.run(ev)).observation.reason,'call_conflict');
});
test('original context cancellation/expiry and changed original events revoke recovery before/after payment',async t=>{
 for(const variant of ['cancel','expire','changed']){
  let now=0,calls=0;const f=fixture(t,{provider:async()=>{calls++;return {choice:'needs_context'};}}),ev=event(),contexts=new SpawnContexts(()=>now);
  contexts.register('codex',ev,description,4000);
  const first=await automaticHook({client:'codex',event:ev,router:f.router,policyPath:f.policyPath,context:()=>contexts.lookup('codex',ev),onNeedsContext:(seed,current)=>f.retries.register(seed,current)});
  if(variant==='cancel')contexts.cancel('codex',ev);else if(variant==='expire')now=300000;else ev.tool_input.fork_turns='all';
  assert.equal((await f.retries.retry(first.observation.retry_id,description)).reason,{cancel:'context_cancelled',expire:'context_expired',changed:'context_mismatch'}[variant]);
  assert.equal(calls,1);
 }
 let changed=false,release;const f=fixture(t,{provider:()=>new Promise(resolve=>{release=()=>resolve({choice:'codex-routine'});})});
 const seed={request_id:'synthetic-local-context',client:'codex',eligible_profile_ids:['codex-routine'],policy_fingerprint:loadAutomaticHookPolicy(f.policyPath).fingerprint};
 const {retry_id}=f.retries.register(seed,()=>changed?'context_cancelled':undefined);
 const pending=f.retries.retry(retry_id,description);await new Promise(resolve=>setImmediate(resolve));changed=true;release();
 assert.equal((await pending).reason,'context_cancelled');
});
test('an original unknown request cannot gain a local-context retry when summary limits change',async t=>{
 let calls=0;const f=fixture(t,{provider:async()=>{calls++;throw Object.assign(Error('transport'),{code:'network'});}}),ev=event();
 ev.tool_input.message='Review this synthetic change for incorrect imports.';
 assert.equal((await f.run(ev)).observation.reason,'network');assert.equal(calls,1);
 f.router.policy.max_summary_bytes=40;
 const local=await f.run(ev);assert.equal(local.observation.retry_id,undefined);
 assert.match(local.output.hookSpecificOutput.permissionDecisionReason,/outcome_unknown/);assert.equal(calls,1);
});
test('expiry and cancellation while retry is in flight suppress advice without refunding its request',async t=>{
 for(const variant of ['expiry','cancel']){
  let release;const f=fixture(t,{provider:()=>new Promise(resolve=>{release=()=>resolve({choice:'codex-routine'});})}),first=await f.run(),controller=new AbortController();
  const pending=f.retries.retry(first.observation.retry_id,description,controller.signal);await new Promise(resolve=>setImmediate(resolve));
  if(variant==='expiry')f.setNow(300000);else controller.abort();release();
  assert.equal((await pending).reason,variant==='expiry'?'context_retry_expired':'context_retry_cancelled');
  f.router.load();assert.equal(f.router.state.calls,1);
  assert.equal((await f.retries.retry(first.observation.retry_id,description)).reason,variant==='expiry'?'context_retry_expired':'context_retry_cancelled');
 }
});
test('real MCP transport exposes recovery without future call IDs and returns correlated advice',async t=>{
 const f=fixture(t);let requests=0;
 t.mock.method(globalThis,'fetch',async(_url,request)=>{
  requests++;const body=JSON.parse(request.body);
  assert.match(JSON.parse(body.input).task.summary,/Caller-supplied task description/);
  assert.equal(request.body.includes(event().tool_input.message),false);
  return Response.json({answers:[{type:'choice',name:'profile',choice:'codex-routine',confidence:0.9}],usage:{input_tokens:10,output_tokens:0,total_tokens:10}});
 });
 const server=createServer({env:{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:'synthetic-test-only',ROUTER_LEDGER_PATH:f.ledgerPath,APTLY_HOOK_POLICY_PATH:f.policyPath}}),client=new Client({name:'retry-test',version:'1'});
 const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true);return result.structuredContent??JSON.parse(result.content[0].text);};
 const listed=(await client.listTools()).tools.find(tool=>tool.name==='retry_spawn_recommendation');
 assert.equal(listed.annotations.readOnlyHint,true);assert.equal(listed.annotations.destructiveHint,false);
 const observationTool=(await client.listTools()).tools.find(tool=>tool.name==='get_spawn_routing_observation');
 assert.deepEqual(Object.keys(observationTool.inputSchema.properties).sort(),['client','event','retry_id']);
 const args={client:'codex',event:event()},hook=await call('route_spawn_hook',args);
 assert.equal(hook.hookSpecificOutput.permissionDecision,'deny');
 const observed=await call('get_spawn_routing_observation',args);assert.equal(observed.reason,'insufficient_context');
 const result=await call('retry_spawn_recommendation',{retry_id:observed.retry_id,description});
 assert.equal(result.status,'recommended');assert.equal(requests,1);
 const byId=await call('get_spawn_routing_observation',{retry_id:observed.retry_id});
 assert.equal(byId.correlation_id,observed.correlation_id);assert.equal(byId.status,'awaiting_context');
 assert.equal(byId.context_retry.outcome.status,'recommended');assert.equal(byId.context_retry.outcome.profile_id,'codex-routine');
 for(const invalid of [{retry_id:observed.retry_id,...args},{client:'codex'},{event:args.event},{retry_id:'invalid'},{}]){
  const reply=await client.callTool({name:'get_spawn_routing_observation',arguments:invalid});assert.equal(reply.isError,true);
 }
 assert.equal((await call('retry_spawn_recommendation',{retry_id:observed.retry_id,description})).cached,true);assert.equal(requests,1);
 assert.equal((await call('get_spawn_routing_observation',{retry_id:observed.retry_id})).context_retry.outcome.classification,'cache_hit');assert.equal(requests,1);
 await call('route_spawn_hook',args);
 assert.equal((await call('get_spawn_routing_observation',{retry_id:observed.retry_id})).context_retry.outcome.status,'recommended');assert.equal(requests,1);
 t.mock.method(ContextRetries.prototype,'retry',async()=>{throw Error('SYNTHETIC_PRIVATE_ASYNC_ERROR');});
 const failed=await call('retry_spawn_recommendation',{retry_id:observed.retry_id,description});
 assert.equal(failed.reason,'context_retry_unavailable');assert.equal(JSON.stringify(failed).includes('SYNTHETIC_PRIVATE'),false);
 const after=await call('get_spawn_routing_observation',{retry_id:observed.retry_id});
 assert.equal(after.context_retry.outcome.status,'recommended');assert.equal(after.context_retry.last_attempt.reason,'context_retry_unavailable');assert.equal(requests,1);
 assert.equal((await call('get_spawn_routing_observation',args)).execution,'not_observed');
});
