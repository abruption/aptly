import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {automaticHook} from '../src/automatic-hook.ts';
import {ContextRetries} from '../src/context-retry.ts';
import {Router,defaultPolicy} from '../src/core.ts';
import {createServer} from '../src/server.ts';
import {createTestTemp} from '../test-support/temp.ts';

const description='Read supplied synthetic numbers and return their sorted literal list without using tools.';
const task='Sort only the supplied numbers [3, 1, 2] and return [1, 2, 3]. No files, tools, network or other agents.';
const intent={independent_task:true,same_task:true,original_call_outcome:'blocked',history_requirement:'not_required',standalone_context_complete:true};
const native=()=>({hook_event_name:'PreToolUse',session_id:'synthetic-session',tool_use_id:'synthetic-call',tool_name:'spawn_agent',tool_input:{task_name:'review_123_refresh',message:'gAAAAA'+'A'.repeat(96),fork_turns:'all'}});
function fixture(t,options={}){
 const dir=createTestTemp(t,'codex-fresh-delegation-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});const policyPath=join(dir,'policy.json');
 const policy={schema_version:1,kind:'aptly-auto-hook',mode:options.mode??'defaults',issuer:'operator_installation',enabled:true,state_directory:state};
 const write=()=>writeFileSync(policyPath,JSON.stringify(policy),{mode:0o600});write();let calls=0,now=0;
 const router=new Router({ledgerPath:join(state,'ledger.json'),policy:{...defaultPolicy,provider_id:'decisions'},provider:async args=>{calls++;return options.provider?options.provider(args):{choice:args.profiles[0].id};}});
 const retries=new ContextRetries(router,policyPath,()=>now);
 const run=(event=native())=>automaticHook({client:'codex',event,router,policyPath,onNeedsContext:(s,c)=>retries.register(s,c),onBlockedAdvice:(s,c)=>retries.registerAdvice(s,c)});
 const ready=async(event=native())=>{const first=await run(event),id=first.observation.retry_id;if(first.observation.reason==='insufficient_context')await retries.retry(id,description);return {id,event,first};};
 return {dir,state,policy,policyPath,write,router,retries,run,ready,calls:()=>calls,setNow:value=>now=value};
}
test('independent preparation reuses known advice, keeps the original blocked and binds one standalone task',async t=>{
 const f=fixture(t),{id,event,first}=await f.ready(),before=structuredClone(event);
 assert.equal(first.output.hookSpecificOutput.permissionDecision,'deny');assert.equal(f.calls(),1);
 const prepared=f.retries.prepareFresh(id,'sort_supplied_values',task,intent);
 assert.equal(prepared.status,'prepared');assert.equal(prepared.intent_provenance,'caller_declared_not_verified');
 assert.equal(prepared.original_invocation,'deny_returned_execution_not_observed');assert.equal(prepared.execution,'not_observed');
 assert.deepEqual(prepared.next_call.arguments,{task_name:'sort_supplied_values',message:task,fork_turns:'none',model:'gpt-6-luna',reasoning_effort:'max'});
 assert.deepEqual(event,before);assert.equal(f.retries.prepareFresh(id,'sort_supplied_values',task,intent).preparation_id,prepared.preparation_id);
 assert.equal(f.retries.prepareFresh(id,'sort_supplied_values',task+' Changed task.',intent).reason,'fresh_delegation_conflict');assert.equal(f.calls(),1);
 const stored=readdirSync(f.state).map(p=>readFileSync(join(f.state,p),'utf8')).join('');for(const text of [task,event.tool_input.message,event.session_id])assert.equal(stored.includes(text),false);
 assert.equal(new ContextRetries(f.router,f.policyPath).prepareFresh(id,'sort_supplied_values',task,intent).reason,'context_retry_not_found');
});
test('required/unknown history, changed scope and incomplete or undeclared independence never produce a fresh call',async t=>{
 const f=fixture(t),{id}=await f.ready();
 for(const patch of [{history_requirement:'required'},{history_requirement:'unknown'},{original_call_outcome:'executed'},{original_call_outcome:'unknown'},{independent_task:false},{same_task:false},{standalone_context_complete:false}]){
  const result=f.retries.prepareFresh(id,'sort_values',task,{...intent,...patch});assert.equal(result.status,'rejected');assert.equal(Object.hasOwn(result,'next_call'),false);
 }
 assert.equal(f.calls(),1);assert.equal(readdirSync(f.state).some(p=>p.startsWith('hook-fresh-')),false);
});
test('direct completed inherited advice also supplies a fresh reference, never another paid supplement',async t=>{
 const f=fixture(t),ev=native();ev.tool_input.message=description;
 const {id,first}=await f.ready(ev);assert.equal(first.observation.reason,'inherited_context_application_unverified');
 assert.match(first.output.hookSpecificOutput.permissionDecisionReason,/prepare_fresh_delegation/);
 assert.equal((await f.retries.retry(id,description)).reason,'context_retry_not_eligible');
 assert.equal(f.retries.prepareFresh(id,'sort_values',task,intent).status,'prepared');assert.equal(f.calls(),1);
});
test('advisory execution, unsupported original arguments and non-inherited calls cannot duplicate a child through fresh preparation',async t=>{
 for(const variant of ['advisory','sandbox','other-history','none']){
  const f=fixture(t,{mode:variant==='advisory'?'advisory':'defaults'}),ev=native();
  if(variant==='sandbox')ev.tool_input.sandbox='read-only';if(variant==='other-history')ev.tool_input.inherit_history=true;if(variant==='none')ev.tool_input.fork_turns='none';
  const {id}=await f.ready(ev);assert.equal(f.retries.prepareFresh(id,'sort_values',task,intent).reason,'fresh_delegation_unsupported');assert.equal(f.calls(),1);
 }
});
test('model-only and effort-only pins remain exact allowlisted tuple constraints on the separate call',async t=>{
 for(const pin of [{model:'gpt-6.1-terra'},{reasoning_effort:'high'}]){
  const f=fixture(t),ev=native();Object.assign(ev.tool_input,pin);const {id}=await f.ready(ev);
  const result=f.retries.prepareFresh(id,'sort_values',task,intent);assert.equal(result.status,'prepared');
  assert.equal(result.next_call.arguments.model,'gpt-6.1-terra');assert.equal(result.next_call.arguments.reasoning_effort,'high');
  for(const [key,value] of Object.entries(pin))assert.equal(result.next_call.arguments[key],value);assert.equal(f.calls(),1);
 }
});
test('unknown outcomes, unavailable advice, secrets, expiry, changed policy/catalog and original invocation stop preparation',async t=>{
 for(const choice of ['needs_context','keep_current','network']){
  const f=fixture(t,{provider:async()=>{if(choice==='network')throw Object.assign(Error('synthetic'),{code:'network'});return {choice};}}),{id}=await f.ready();
  assert.equal(f.retries.prepareFresh(id,'sort_values',task,intent).status,'rejected');assert.equal(f.calls(),1);
 }
 for(const change of ['expiry','policy','catalog','event','cancel']){
  const f=fixture(t),{id,event}=await f.ready(),controller=new AbortController();
  if(change==='expiry')f.setNow(300000);if(change==='policy'){f.policy.enabled=false;f.write();}if(change==='catalog')f.router.policy.catalog_version='changed';if(change==='event')event.tool_input.message='Changed original task.';if(change==='cancel')controller.abort();
  assert.equal(f.retries.prepareFresh(id,'sort_values',task,intent,controller.signal).status,'rejected');assert.equal(f.calls(),1);
 }
 const f=fixture(t),{id}=await f.ready();for(const text of ['Do it','x'.repeat(12001),'Review token sk-syntheticonly12345678 safely.'])assert.equal(f.retries.prepareFresh(id,'sort_values',text,intent).status,'rejected');
});
test('MCP preparation has an advertised schema, costs no new classification and is separately observable',async t=>{
 const f=fixture(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({answers:[{type:'choice',name:'profile',choice:'codex-routine',confidence:0.9}],usage:{input_tokens:5,output_tokens:0,total_tokens:5}});});
 const server=createServer({env:{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:'synthetic-only',ROUTER_LEDGER_PATH:f.router.ledgerPath,APTLY_HOOK_POLICY_PATH:f.policyPath}}),client=new Client({name:'fresh-mcp-test',version:'1'});
 const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true);return r.structuredContent??JSON.parse(r.content[0].text);};
 const tool=(await client.listTools()).tools.find(t=>t.name==='prepare_fresh_delegation');assert.equal(tool.annotations.openWorldHint,false);assert.ok(tool.inputSchema.properties.declaration);
 const ev=native();await call('route_spawn_hook',{client:'codex',event:ev});const original=await call('get_spawn_routing_observation',{client:'codex',event:ev});
 const retry_id=original.retry_id;await call('retry_spawn_recommendation',{retry_id,description});
 const result=await call('prepare_fresh_delegation',{retry_id,task_name:'sort_values',standalone_task:task,declaration:intent});assert.equal(result.status,'prepared',JSON.stringify(result));assert.equal(calls,1);
 let observed=await call('get_spawn_routing_observation',{retry_id});assert.equal(observed.status,'awaiting_context');assert.equal(observed.context_retry.outcome.application,'blocked');assert.equal(observed.fresh_delegation.outcome.preparation_id,result.preparation_id);assert.equal(observed.execution,'not_observed');
 await call('prepare_fresh_delegation',{retry_id,task_name:'sort_values',standalone_task:task+' Another task.',declaration:intent});
 observed=await call('get_spawn_routing_observation',{retry_id});assert.equal(observed.fresh_delegation.outcome.preparation_id,result.preparation_id);assert.equal(observed.fresh_delegation.last_attempt.reason,'fresh_delegation_conflict');assert.equal(calls,1);
 assert.equal(JSON.stringify(observed).includes(task),false);
});
