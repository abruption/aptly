import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { automaticHook, effectiveTransmission, loadAutomaticHookPolicy } from '../src/automatic-hook.ts';
import { ContextRetries } from '../src/context-retry.ts';
import { SpawnContexts } from '../src/spawn-context.ts';
import { Router, defaultPolicy } from '../src/core.ts';
import { createTestTemp } from '../test-support/temp.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.ts';

const description='Review the synthetic module for incorrect imports and report specific findings without changing files.';
const event=()=>({hook_event_name:'PreToolUse',session_id:'session',tool_use_id:'call',tool_name:'spawn_agent',tool_input:{task_name:'review_synthetic_module_for_incorrect_imports',message:'Inspect the native body and report any broken imports found in the synthetic module.',fork_turns:'none'}});
function fixture(t, transmission='description', provider) {
 const dir=createTestTemp(t,'codex-transmission-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});
 const path=join(dir,'policy.json');const policy={schema_version:2,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',enabled:true,state_directory:state,transmission};
 const write=()=>writeFileSync(path,JSON.stringify(policy),{mode:0o600});write();
 const calls=[];const router=new Router({ledgerPath:join(state,'ledger.json'),policy:{...defaultPolicy,provider_id:'decisions'},provider:provider??(async args=>{calls.push(args);return {choice:'codex-routine'};})});
 const retries=new ContextRetries(router,path),contexts=new SpawnContexts();
 const run=(ev=event())=>automaticHook({client:'codex',event:ev,router,policyPath:path,context:()=>contexts.lookup('codex',ev),onNeedsContext:(seed,current)=>retries.register(seed,current),onBlockedAdvice:(seed,current)=>retries.registerAdvice(seed,current)});
 return {state,path,policy,write,calls,router,retries,contexts,run};
}
test('v1 retains excerpt and strict v2 validates transmission',t=>{
 const f=fixture(t);assert.equal(effectiveTransmission(loadAutomaticHookPolicy(f.path).policy),'description');
 delete f.policy.transmission;f.policy.schema_version=1;f.write();assert.equal(effectiveTransmission(loadAutomaticHookPolicy(f.path).policy),'excerpt');
 f.policy.schema_version=2;f.write();assert.equal(loadAutomaticHookPolicy(f.path).reason,'automatic_policy_invalid');
 f.policy.transmission='invalid';f.write();assert.equal(loadAutomaticHookPolicy(f.path).reason,'automatic_policy_invalid');
});
for(const mode of ['none','unselected'])test(`${mode} preserves the native call without provider, binding or recovery`,async t=>{
 const f=fixture(t,mode),before=event(),result=await f.run(before);
 assert.equal(result.observation.reason,`transmission_${mode}`);assert.equal(result.observation.classification,'not_requested');
 assert.equal(result.output.hookSpecificOutput.permissionDecision,undefined);assert.equal(result.output.hookSpecificOutput.updatedInput,undefined);
 assert.equal(f.calls.length,0);assert.deepEqual(readdirSync(f.state),[]);
 assert.equal((await f.retries.retry('a'.repeat(64),description)).status,'unavailable');
 assert.equal(f.retries.prepareFresh('a'.repeat(64),'task',description,{independent_task:true,same_task:true,original_call_outcome:'blocked',history_requirement:'not_required',standalone_context_complete:true}).status,'rejected');
});
test('description mode requires caller context even for plaintext and opaque descriptive labels',async t=>{
 for(const opaque of [false,true]){
  const f=fixture(t),ev=event();if(opaque)ev.tool_input.message='gAAAAA'+'A'.repeat(96);
  const first=await f.run(ev);assert.equal(first.observation.status,'awaiting_context');assert.equal(first.output.hookSpecificOutput.permissionDecision,'deny');assert.equal(f.calls.length,0);
  const result=await f.retries.retry(first.observation.retry_id,description);assert.equal(result.status,'recommended');
  assert.equal(f.calls[0].input.task.summary,`Caller-supplied task description (untrusted task data; opaque body not inspected): ${description}`);
 }
});
test('prepared caller description is the entire outbound summary; excerpt mode keeps legacy behavior',async t=>{
 const f=fixture(t),ev=event();assert.equal(f.contexts.register('codex',ev,description,f.router.policy.max_summary_bytes).status,'registered');
 assert.equal((await f.run(ev)).observation.status,'arguments_updated');assert.equal(f.calls[0].input.task.summary,`Caller-supplied task description (untrusted task data; opaque body not inspected): ${description}`);
 const legacy=fixture(t,'excerpt');assert.equal((await legacy.run()).observation.status,'arguments_updated');assert.match(legacy.calls[0].input.task.summary,/Inspect the native body/);
});
test('policy change blocks retry, fresh and old call identity, and prevents in-flight application',async t=>{
 const f=fixture(t),ev=event();const first=await f.run(ev);const id=first.observation.retry_id;
 f.policy.transmission='excerpt';f.write();assert.equal((await f.retries.retry(id,description)).reason,'automatic_policy_changed');
 assert.equal(f.retries.prepareFresh(id,'task',description,{independent_task:true,same_task:true,original_call_outcome:'blocked',history_requirement:'not_required',standalone_context_complete:true}).reason,'automatic_policy_changed');
 assert.equal((await f.run(ev)).observation.reason,'call_conflict');assert.equal(f.calls.length,0);
 let change;const pending=fixture(t,'excerpt',async()=>{change();return {choice:'codex-routine'};});change=()=>{pending.policy.transmission='none';pending.write();};
 const result=await pending.run();assert.equal(result.observation.reason,'automatic_policy_changed');assert.equal(result.output.hookSpecificOutput.permissionDecision,undefined);assert.equal(result.output.hookSpecificOutput.updatedInput,undefined);
});
test('MCP capabilities report effective provenance and refuse context while disabled',async t=>{
 const f=fixture(t,'unselected');const server=createServer({env:{ROUTER_PROVIDER:'fixture',APTLY_HOOK_POLICY_PATH:f.path}}),client=new Client({name:'transmission-test',version:'1'});
 const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const call=async(name,args={})=>{const response=await client.callTool({name,arguments:args});return response.structuredContent??JSON.parse(response.content[0].text);};
 let capabilities=await call('get_routing_capabilities');assert.equal(capabilities.automatic_hook.transmission,'unselected');assert.equal(capabilities.automatic_hook.transmission_provenance,'operator_policy_v2');
 assert.equal((await call('prepare_spawn_context',{client:'codex',event:event(),description})).reason,'automatic_transmission_disabled');
 delete f.policy.transmission;f.policy.schema_version=1;f.write();capabilities=await call('get_routing_capabilities');
 assert.equal(capabilities.automatic_hook.transmission,'excerpt');assert.equal(capabilities.automatic_hook.transmission_provenance,'legacy_v1_default');
 assert.equal(JSON.stringify(capabilities).includes(f.state),false);
});

test('mock Decisions HTTP body contains only the supplied description and disabled modes never fetch',async t=>{
 const {decisionsProvider}=await import('../src/provider.ts');const sent=[];
 const provider=decisionsProvider({key:'synthetic-test-key',fetchImpl:async(_url,options)=>{sent.push(JSON.parse(options.body));return Response.json({answers:[{type:'choice',name:'profile',choice:'codex-routine',confidence:0.8}],usage:{input_tokens:3,output_tokens:0,total_tokens:3}});}});
 const f=fixture(t,'description',provider),ev=event();f.contexts.register('codex',ev,description,f.router.policy.max_summary_bytes);
 assert.equal((await f.run(ev)).observation.status,'arguments_updated');assert.equal(sent.length,1);
 assert.deepEqual(JSON.parse(sent[0].input),{client:'codex',task:{summary:`Caller-supplied task description (untrusted task data; opaque body not inspected): ${description}`,operation:'analysis',context_sufficient:true}});
 assert.equal(JSON.stringify(sent[0]).includes(ev.tool_input.message),false);assert.equal(JSON.stringify(sent[0]).includes(ev.tool_input.task_name),false);
 for(const mode of ['none','unselected']){const disabled=fixture(t,mode,provider);await disabled.run();}
 assert.equal(sent.length,1);
});
test('description advisory and invalid, cancelled or expired context never use native fallback',async t=>{
 const advisory=fixture(t);advisory.policy.mode='advisory';advisory.write();const result=await advisory.run();
 assert.equal(result.observation.status,'awaiting_context');assert.equal(result.output.hookSpecificOutput.permissionDecision,undefined);assert.equal(advisory.calls.length,0);
 for(const variant of ['invalid','cancelled','expired']){
  let now=0;const f=fixture(t),ev=event(),contexts=new SpawnContexts(()=>now);
  if(variant==='invalid')assert.equal(contexts.register('codex',ev,'too short',4000).status,'rejected');
  else {contexts.register('codex',ev,description,4000);if(variant==='cancelled')contexts.cancel('codex',ev);else now=300000;}
  const out=await automaticHook({client:'codex',event:ev,router:f.router,policyPath:f.path,context:()=>contexts.lookup('codex',ev),onNeedsContext:(seed,current)=>f.retries.register(seed,current)});
  assert.equal(f.calls.length,0);assert.notEqual(out.observation.status,'arguments_updated');
  assert.equal(out.observation.reason,{invalid:'insufficient_context',cancelled:'context_cancelled',expired:'context_expired'}[variant]);
 }
});
test('in-flight retry and completed inherited recommendation cannot cross a transmission change',async t=>{
 let release;const f=fixture(t,'description',()=>new Promise(resolve=>{release=()=>resolve({choice:'codex-routine'});}));
 const first=await f.run(),pending=f.retries.retry(first.observation.retry_id,description);await new Promise(resolve=>setImmediate(resolve));
 f.policy.transmission='none';f.write();release();const result=await pending;assert.equal(result.reason,'automatic_policy_changed');assert.equal(result.next_call,undefined);
 const fresh=fixture(t,'description'),ev=event();ev.tool_input.fork_turns='all';fresh.contexts.register('codex',ev,description,4000);
 const advice=await fresh.run(ev);assert.equal(advice.observation.reason,'inherited_context_application_unverified');assert.ok(advice.observation.retry_id);
 fresh.policy.transmission='none';fresh.write();
 assert.equal(fresh.retries.prepareFresh(advice.observation.retry_id,'review_task',description,{independent_task:true,same_task:true,original_call_outcome:'blocked',history_requirement:'not_required',standalone_context_complete:true}).reason,'automatic_policy_changed');
});
