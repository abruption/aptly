import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CODEX_HOME_POLICY_SOURCE, resolvePolicySource } from '../src/policy-source.ts';
import { createServer } from '../src/server.ts';
import { setupHosts } from '../src/setup.ts';
import { createTestTemp } from '../test-support/temp.ts';

const selector=CODEX_HOME_POLICY_SOURCE;
test('selector uses only the supplied environment, fixed sources are unchanged',()=>{
 assert.equal(resolvePolicySource(undefined,{},'/tmp/example-home'),undefined);
 assert.equal(resolvePolicySource('/shared/policy.json',{CODEX_HOME:'bad'},'/tmp/example-home'),'/shared/policy.json');
 assert.equal(resolvePolicySource('@codex-home ',{},'/tmp/example-home'),'@codex-home ');
 assert.throws(()=>resolvePolicySource(selector,{},'/tmp/example-home'),{message:'policy_source_home_invalid'});
 assert.equal(resolvePolicySource(selector,{CODEX_HOME:'/first'},'/unused'),'/first/aptly/auto-policy.json');
 assert.equal(resolvePolicySource(selector,{CODEX_HOME:'/second'},'/unused'),'/second/aptly/auto-policy.json');
});

test('invalid explicit Codex homes fail before server runtime initialization',()=>{
 for(const home of [undefined, '', '  ', 'relative', '/bad\npath', '/bad\u007fpath', '/bad\0path']){
  assert.throws(()=>resolvePolicySource(selector,{CODEX_HOME:home}),{message:'policy_source_home_invalid'});
  // A deliberately invalid provider would otherwise fail runtime construction first.
  assert.throws(()=>createServer({env:{APTLY_HOOK_POLICY_PATH:selector,CODEX_HOME:home,ROUTER_PROVIDER:'invalid'}}),{message:'policy_source_home_invalid'});
 }
});

test('Codex-bound policy is snapshotted and cannot route or register Claude context',async t=>{
 const home=createTestTemp(t,'codex-policy-source-');
 setupHosts({home,env:{},clients:['codex'],mode:'advisory',transmission:'excerpt'});
 const env={ROUTER_PROVIDER:'fixture',APTLY_HOOK_POLICY_PATH:selector,CODEX_HOME:join(home,'.codex')};
 const server=createServer({env}),client=new Client({name:'policy-source-test',version:'1'});
 env.CODEX_HOME=join(home,'other');
 const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);
 t.after(async()=>{await client.close();await server.close();});
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true);return r.structuredContent??JSON.parse(r.content[0].text);};
 const caps=await call('get_routing_capabilities');assert.equal(caps.automatic_hook.mode,'advisory');
 const event={hook_event_name:'PreToolUse',session_id:'session',tool_use_id:'call',tool_name:'Agent',tool_input:{description:'Sort numbers',prompt:'Sort the supplied synthetic numbers 3, 2, 1.',subagent_type:'general-purpose'}};
 assert.equal((await call('prepare_spawn_context',{client:'claude',event,description:'Sort the supplied synthetic numbers.'})).reason,'policy_source_client_mismatch');
 assert.deepEqual(await call('route_spawn_hook',{client:'claude',event}),{});
 const observed=await call('get_spawn_routing_observation',{client:'claude',event});assert.equal(observed.reason,'policy_source_client_mismatch');assert.equal(observed.recommendation,'not_produced');
 const codexEvent={...event,tool_name:'spawn_agent',tool_use_id:'codex',tool_input:{task_name:'Sort numbers',message:'Sort the supplied synthetic numbers 3, 2, 1.',fork_turns:'none'}};
 assert.match((await call('route_spawn_hook',{client:'codex',event:codexEvent})).hookSpecificOutput.additionalContext,/Aptly suggests/);
});
