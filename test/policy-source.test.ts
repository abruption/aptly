import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CODEX_HOME_POLICY_SOURCE, resolvePolicySource } from '../src/policy-source.ts';
import { createServer } from '../src/server.ts';
import { setupHosts } from '../src/setup.ts';
import { createTestTemp } from '../test-support/temp.ts';

const selector=CODEX_HOME_POLICY_SOURCE;
test('selector defaults to the user home and preserves explicit overrides and fixed sources',()=>{
 assert.equal(resolvePolicySource(undefined,{},'/tmp/example-home'),undefined);
 assert.equal(resolvePolicySource('/shared/policy.json',{CODEX_HOME:'bad'},'/tmp/example-home'),'/shared/policy.json');
 assert.equal(resolvePolicySource('@codex-home ',{},'/tmp/example-home'),'@codex-home ');
 assert.equal(resolvePolicySource(selector,{},'/tmp/example-home'),join('/tmp/example-home','.codex','aptly','auto-policy.json'));
 assert.equal(resolvePolicySource(selector,{CODEX_HOME:undefined},'/tmp/example-home'),join('/tmp/example-home','.codex','aptly','auto-policy.json'));
 assert.equal(resolvePolicySource(selector,{CODEX_HOME:'/first'},'/unused'),join('/first','aptly','auto-policy.json'));
 assert.equal(resolvePolicySource(selector,{CODEX_HOME:'/second'},'/unused'),join('/second','aptly','auto-policy.json'));
});

test('invalid default home is rejected without resolving against cwd',()=>{
 for(const home of ['', 'relative', '/bad\npath'])assert.throws(()=>resolvePolicySource(selector,{},home),{message:'policy_source_home_invalid'});
});

test('invalid explicit Codex homes fail before server runtime initialization',()=>{
 for(const home of ['', '  ', 'relative', '/bad\npath', '/bad\u007fpath', '/bad\0path']){
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

// Exercise the real stdio initialization path without injecting CODEX_HOME.
test('default-home MCP initializes without CODEX_HOME and reads the default policy',async t=>{
 const home=createTestTemp(t,'codex-default-mcp-');
 setupHosts({home,env:{},clients:['codex'],mode:'advisory',transmission:'description'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.ts',import.meta.url))],env:{HOME:home,USERPROFILE:home,ROUTER_PROVIDER:'fixture',APTLY_HOOK_POLICY_PATH:selector},stderr:'pipe'});
 const client=new Client({name:'default-home-regression',version:'1'});
 t.after(async()=>{await client.close();});
 await client.connect(transport);
 const response=await client.callTool({name:'get_routing_capabilities',arguments:{}});
 assert.notEqual(response.isError,true);
 const caps=response.structuredContent??JSON.parse(response.content[0].text);
 assert.equal(caps.provider,'fixture');
 assert.equal(caps.automatic_hook.mode,'advisory');
 assert.equal(caps.automatic_hook.transmission,'description');
 assert.equal(caps.runtime_diagnostics.policy_source_kind,'codex_home');
});

test('explicit CODEX_HOME takes precedence over a different default-home policy in stdio',async t=>{
 const home=createTestTemp(t,'codex-explicit-mcp-');
 const custom=join(home,'custom-account');
 setupHosts({home,env:{},clients:['codex'],mode:'advisory',transmission:'none'});
 setupHosts({home,env:{CODEX_HOME:custom},clients:['codex'],mode:'advisory',transmission:'description'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.ts',import.meta.url))],env:{HOME:home,USERPROFILE:home,CODEX_HOME:custom,ROUTER_PROVIDER:'fixture',APTLY_HOOK_POLICY_PATH:selector},stderr:'pipe'});
 const client=new Client({name:'explicit-home-regression',version:'1'});
 t.after(async()=>{await client.close();});
 await client.connect(transport);
 const response=await client.callTool({name:'get_routing_capabilities',arguments:{}});
 assert.notEqual(response.isError,true);
 const caps=response.structuredContent??JSON.parse(response.content[0].text);
 assert.equal(caps.automatic_hook.transmission,'description');
});
