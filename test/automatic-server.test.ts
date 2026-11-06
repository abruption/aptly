import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.ts';
import { setupHosts } from '../src/setup.ts';
import { createTestTemp } from '../test-support/temp.ts';

test('product MCP consumes installed policy, ignores caller policy and preserves fixture defaults', async t => {
 const home=createTestTemp(t,'codex-automatic-server-');
 assert.equal(setupHosts({home,env:{},clients:['codex'],mode:'advisory'}).status,'complete');
 const policyPath=join(home,'.codex','aptly','auto-policy.json');
 const env={ROUTER_PROVIDER:'fixture',APTLY_HOOK_POLICY_PATH:policyPath};
 const server=createServer({env}),client=new Client({name:'automatic-server-test',version:'1'});
 const [left,right]=InMemoryTransport.createLinkedPair();
 await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});return r.structuredContent??JSON.parse(r.content[0].text);};
 const capabilities=await call('get_routing_capabilities');
 assert.equal(capabilities.automatic_hook.mode,'advisory');assert.equal(capabilities.automatic_hook.host_settings_verified,false);
 assert.equal(capabilities.automatic_hook.observation_tool,'get_spawn_routing_observation');
 assert.equal(Object.hasOwn(capabilities.automatic_hook,'last_result'),false);
 const event={hook_event_name:'PreToolUse',session_id:'test-session',tool_use_id:'advisory-call',tool_name:'spawn_agent',tool_input:{task_name:'Sort values',message:'Sort the supplied numbers [3, 1, 2] in ascending order.',fork_turns:'none'}};
 const reply=await call('route_spawn_hook',{client:'codex',event,mode:'defaults'});
 assert.match(reply.hookSpecificOutput.additionalContext,/Aptly suggests/);
 assert.equal(Object.hasOwn(reply.hookSpecificOutput,'updatedInput'),false);
 writeFileSync(policyPath,JSON.stringify({schema_version:1,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',enabled:true,state_directory:join(home,'.codex','aptly','state')}));
 assert.deepEqual(await call('route_spawn_hook',{client:'codex',event:{...event,tool_use_id:'fixture-defaults-call'}}),{});
 const last=await call('get_spawn_routing_observation',{client:'codex',event:{...event,tool_use_id:'fixture-defaults-call'}});
 assert.equal(last.status,'preserved');assert.equal(last.reason,'synthetic_provider');assert.equal(last.execution,'not_observed');
 writeFileSync(policyPath,'{}');
 assert.deepEqual(await call('route_spawn_hook',{client:'codex',event}),{});
});

for(const host of ['codex','claude'])test(`${host}: installed Hook reaches MCP before fixture native dispatch, including inherited/default history`,async t=>{
 const home=createTestTemp(t,'codex-preflight-dispatch-');setupHosts({home,env:{},clients:[host],mode:'advisory'});
 const dir=join(home,host==='codex'?'.codex':'.claude');
 const {readFileSync}=await import('node:fs');
 const entry=JSON.parse(readFileSync(join(dir,host==='codex'?'hooks.json':'settings.json'),'utf8')).hooks.PreToolUse[0];
 const installed=entry.hooks[0];assert.equal(installed.type,'mcp_tool');assert.equal(installed.tool,'route_spawn_hook');
 const server=createServer({env:{ROUTER_PROVIDER:'fixture',APTLY_HOOK_POLICY_PATH:join(dir,'aptly/auto-policy.json')}}),client=new Client({name:'fixture-native-dispatch',version:'1'});
 const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true);return r.structuredContent??JSON.parse(r.content[0].text);};
 for(const fork of ['all','omitted','none']){
  const event={hook_event_name:'PreToolUse',session_id:'fixture-session',tool_use_id:fork,tool_name:host==='codex'?'spawn_agent':'Agent',
   tool_input:host==='codex'?{task_name:'Sort numbers',message:'Sort the supplied synthetic numbers 3, 2, 1.'}:{description:'Sort numbers',prompt:'Sort the supplied synthetic numbers 3, 2, 1.',subagent_type:'general-purpose'}};
  if(fork!=='omitted'&&(host==='codex'||fork==='all'))event.tool_input.fork_turns=fork;
  const before=structuredClone(event);assert.ok(new RegExp(entry.matcher).test(event.tool_name));
  assert.equal((await call('get_spawn_routing_observation',{client:host,event})).preflight,'not_observed');
  // Emulate the installed host's placeholder expansion, not a voluntary recommendation call.
  const args={client:installed.input.client,event:Object.fromEntries(Object.entries(installed.input.event).filter(([key])=>key in event).map(([key])=>[key,event[key]]))};
  const output=await call(installed.tool,args);
  const observed=await call('get_spawn_routing_observation',{client:host,event});assert.equal(observed.preflight,'observed');assert.equal(observed.recommendation,'produced');assert.equal(observed.execution,'not_observed');
  if(fork==='all'||(host==='codex'&&fork==='omitted'))assert.equal(observed.application,'blocked');
  let executions=0;const native=(input)=>{executions++;assert.deepEqual(input,before.tool_input);};
  native(output.hookSpecificOutput?.updatedInput??event.tool_input);assert.equal(executions,1);assert.deepEqual(event,before);
  assert.equal((await call('get_spawn_routing_observation',{client:host,event:{...event,session_id:'unrelated'}})).preflight,'not_observed');
 }
});
