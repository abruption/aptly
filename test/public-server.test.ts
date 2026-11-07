import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createTestTemp } from '../test-support/temp.ts';
import { defaultPolicy } from '../src/core.ts';
import { provenanceRequirements,digestToolInput } from '../src/provenance.ts';
const event=()=>({hook_event_name:'PreToolUse',tool_name:'collaborationspawn_agent',session_id:'session-test',cwd:'/synthetic-workspace',tool_use_id:'call-test',tool_input:{task_name:'Routine list processing',fork_turns:'none',message:'private task body not forwarded',sandbox:'read-only'}});
const task={summary:'Sort the supplied numbers 3, 1, 2 into ascending order.',operation:'analysis',context_sufficient:true};
function context(ev){const spec=provenanceRequirements.codex;return{schema_version:1,client:'codex',client_version:spec.versions[0],session_id:ev.session_id,cwd:ev.cwd,tool_use_id:ev.tool_use_id,tool_input_sha256:digestToolInput({client:'codex',event:ev}),issued_at:Date.now()-1000,expires_at:Date.now()+60000,layers:spec.layers.map(source=>({source,model:'unset',effort:'unset'})),environment:Object.fromEntries(spec.environment.map(name=>[name,'unset'])),host_extensions:'none'};}
async function connect(t,env){
 const client=new Client({name:'public-server-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.ts',import.meta.url))],env:{ROUTER_PROVIDER:'fixture',OPENAI_API_KEY:'',ROUTER_CONFIG_PATH:'',...env},stderr:'pipe'});
 let bytes=0;transport.stderr?.on('data',d=>bytes+=d.length);
 await client.connect(transport);t.after(async()=>{await client.close();assert.equal(bytes,0);});return client;
}
const call=async(client,name,args)=>client.callTool({name,arguments:args});
const data=response=>response.structuredContent??JSON.parse(response.content[0].text);
test('public server has no PoC bypasses, denial tools or transcript reader',async t=>{
 const client=await connect(t,{ROUTER_POC_APPLY:'1',ROUTER_POC_VERIFIED:'1',ROUTER_POC_DENY:'1'});
 const names=(await client.listTools()).tools.map(x=>x.name);
 assert.deepEqual(names.sort(),['cancel_spawn_context','prepare_spawn_context','get_routing_capabilities','get_routing_precedence','get_spawn_routing_observation','prepare_fresh_delegation','recommend_agent','retry_spawn_recommendation','route_spawn_hook'].sort());
 const ev=event();
 const diagnostic=data(await call(client,'get_routing_precedence',{client:'codex',event:ev,context:{evidence_verified:true}}));
 assert.equal(diagnostic.status,'unknown');assert.equal(diagnostic.reason,'context_missing');
 const output=data(await call(client,'route_spawn_hook',{client:'codex',event:ev,task}));assert.deepEqual(output,{});
 assert.doesNotMatch(JSON.stringify(diagnostic),/private task|synthetic-workspace/);
});
test('per-call private host evidence enables only matching, unpinned calls',async t=>{
 const dir=createTestTemp(t,'codex-public-server-'),path=join(dir,'context.json'),config=join(dir,'router.json');
 const ev=event();
 const envelope=ctx=>({schema_version:1,authority:'effective-host-settings-v1',context:ctx,sources:[]});
 writeFileSync(path,JSON.stringify(envelope(context(ev))),{mode:0o600});
 writeFileSync(config,JSON.stringify({schema_version:1,mode:'apply',context_path:path}),{mode:0o600});
 const client=await connect(t,{ROUTER_CONFIG_PATH:config});
 const diagnostic=data(await call(client,'get_routing_precedence',{client:'codex',event:ev}));assert.equal(diagnostic.status,'eligible');
 const output=data(await call(client,'route_spawn_hook',{client:'codex',event:ev,task}));
 assert.equal(output.hookSpecificOutput.updatedInput.model,defaultPolicy.profiles.find(p => p.id === 'codex-simple').model);assert.equal(output.hookSpecificOutput.updatedInput.sandbox,'read-only');
 for(const mutated of [{...ev,tool_use_id:'other-call'},{...ev,tool_input:{...ev.tool_input,message:'changed'}},{...ev,tool_input:{...ev.tool_input,model:null}},{...ev,tool_input:{...ev.tool_input,resume:'existing'}}]){
  assert.deepEqual(data(await call(client,'route_spawn_hook',{client:'codex',event:mutated,task})),{});
 }
 const expired=context(ev);expired.issued_at=Date.now()-3000;expired.expires_at=Date.now()-1000;
 writeFileSync(path,JSON.stringify(envelope(expired)));
 assert.equal(data(await call(client,'get_routing_precedence',{client:'codex',event:ev})).reason,'context_expired');
 writeFileSync(path,JSON.stringify(envelope(context(ev))));writeFileSync(config,JSON.stringify({schema_version:1,mode:'shadow',context_path:path}));
 assert.deepEqual(data(await call(client,'route_spawn_hook',{client:'codex',event:ev,task})),{});
});
