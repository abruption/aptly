import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from '../src/server.ts';
import {readStatistics,serializeStatisticsConfig,recordStatisticsRecommendation} from '../src/statistics.ts';
import {createTestTemp} from '../test-support/temp.ts';
test('statistics enabled/corrupt/locked cannot change cached Hook output or budget ledger', {skip:process.platform==='win32'}, async t=>{
 const root=createTestTemp(t,'codex-stats-server-'),state=join(root,'state');mkdirSync(state,{mode:0o700});
 const policy=join(root,'policy.json'),ledger=join(state,'ledger.json');
 writeFileSync(policy,JSON.stringify({schema_version:2,kind:'aptly-auto-hook',mode:'advisory',issuer:'operator_installation',enabled:true,state_directory:state,transmission:'excerpt'}),{mode:0o600});
 const server=createServer({env:{ROUTER_PROVIDER:'fixture',ROUTER_LEDGER_PATH:ledger,APTLY_HOOK_POLICY_PATH:policy}});
 const client=new Client({name:'statistics-fixture',version:'1'}),[left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const event={hook_event_name:'PreToolUse',session_id:'fixture-session',tool_use_id:'fixture-tool',tool_name:'spawn_agent',tool_input:{task_name:'review_supplied_fixture_values_without_tools',message:'Review the supplied synthetic values for this small standalone fixture; do not access files or external tools.',fork_turns:'none'}};
 const call=()=>client.callTool({name:'route_spawn_hook',arguments:{client:'codex',event}});
 const first=await call();assert.equal(first.isError,undefined);
 const budget=readFileSync(ledger,'utf8');
 writeFileSync(join(state,'stats-config.json'),serializeStatisticsConfig({schema_version:1,enabled_clients:['codex']}),{mode:0o600});writeFileSync(join(state,'stats-key'),'a'.repeat(64)+'\n',{mode:0o600});
 assert.deepEqual(await call(),first);assert.equal(readFileSync(ledger,'utf8'),budget);
 assert.equal(readStatistics({stateDirectory:state}).delegations,1);
 const lock=new DatabaseSync(join(state,'stats.sqlite'));lock.exec('BEGIN IMMEDIATE');
 try{assert.deepEqual(await call(),first);assert.equal(readFileSync(ledger,'utf8'),budget);}finally{lock.exec('ROLLBACK');lock.close();}
 writeFileSync(join(state,'stats.sqlite'),'malformed fixture');
 assert.deepEqual(await call(),first);assert.equal(readFileSync(ledger,'utf8'),budget);
});
test('manual MCP recommendations remain unbound and duplicate requests count once',{skip:process.platform==='win32'},async t=>{
 const root=createTestTemp(t,'codex-stats-advice-'),state=join(root,'state');mkdirSync(state,{mode:0o700});
 const policy=join(root,'policy.json');writeFileSync(policy,JSON.stringify({schema_version:2,kind:'aptly-auto-hook',mode:'advisory',issuer:'operator_installation',enabled:true,state_directory:state,transmission:'excerpt'}),{mode:0o600});
 writeFileSync(join(state,'stats-config.json'),serializeStatisticsConfig({schema_version:1,enabled_clients:['codex']}),{mode:0o600});writeFileSync(join(state,'stats-key'),'b'.repeat(64)+'\n',{mode:0o600});
 const server=createServer({env:{ROUTER_PROVIDER:'fixture',ROUTER_LEDGER_PATH:join(state,'ledger.json'),APTLY_HOOK_POLICY_PATH:policy}}),client=new Client({name:'statistics-fixture',version:'1'}),[left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);t.after(async()=>{await client.close();await server.close();});
 const args={request_id:'manual-fixture',client:'codex',task:{summary:'Review the small supplied synthetic module for a bounded fixture.',operation:'review',context_sufficient:true}};
 await client.callTool({name:'recommend_agent',arguments:args});await client.callTool({name:'recommend_agent',arguments:args});
 const result=readStatistics({stateDirectory:state});assert.equal(result.unbound,1);assert.equal(result.observation_denominator,0);
});
