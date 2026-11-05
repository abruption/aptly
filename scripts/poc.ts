// Portable, no-key smoke test. Personal credential launchers are never required.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { isRecord } from '../src/types.ts';
const client=new Client({name:'aptly-smoke',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL(`../src/server${import.meta.url.endsWith('.ts')?'.ts':'.js'}`,import.meta.url))],env:{ROUTER_PROVIDER:'fixture',OPENAI_API_KEY:'',ROUTER_CONFIG_PATH:''},stderr:'pipe'});
let stderrBytes=0;transport.stderr?.on('data',d=>stderrBytes+=d.length);
try{
 await client.connect(transport);
 const tools=await client.listTools();
 const request={request_id:'public-smoke-v1',client:'codex',task:{summary:'Sort the supplied numbers 3, 1, 2 into ascending order.',operation:'analysis',context_sufficient:true},eligible_profile_ids:['codex-simple','codex-routine','codex-deep']};
 const first=await client.callTool({name:'recommend_agent',arguments:request});
 const second=await client.callTool({name:'recommend_agent',arguments:request});
 const value=isRecord(first.structuredContent)?first.structuredContent:{};
 const cached=isRecord(second.structuredContent)?second.structuredContent:{};
 const passed=value?.status==='recommended'&&value.profile_id==='codex-simple'&&value.provider==='fixture'&&cached.cached===true&&stderrBytes===0;
 console.log(JSON.stringify({passed,provider:'fixture',tools:tools.tools.map(t=>t.name),profile_id:value?.profile_id,cache_verified:cached.cached===true,paid_calls:0,spawned_agents:0},null,2));
 if(!passed)process.exitCode=1;
}finally{await client.close();}
