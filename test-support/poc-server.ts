import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { runtime } from '../src/runtime.ts';
import { hookInput,hookOutput } from '../src/hook.ts';
const {router,mode}=runtime();
const server=new McpServer({name:'aptly-poc',version:'0.0.0'});
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:mode==='decisions'};
const content=result=>({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});
const inputSchema={
  request_id:z.string().min(1).max(96),client:z.enum(['codex','claude']),
  task:z.object({summary:z.string().min(1).max(4000),operation:z.enum(['read_only','write','review','analysis']),context_sufficient:z.boolean()}).strict(),
  eligible_profile_ids:z.array(z.string()).min(1).max(20),
  constraints:z.object({model_pinned:z.boolean().optional(),effort_pinned:z.boolean().optional(),role_pinned:z.boolean().optional(),fork_inherits:z.boolean().optional(),provenance_verified:z.boolean().optional()}).strict()
};
server.registerTool('get_routing_capabilities',{description:'Local advisory profile catalog and limits; no paid call.',annotations,inputSchema:{}},async()=>content({...router.capabilities(),provider:mode}));
server.registerTool('recommend_agent',{description:'Advisory recommendation only; never spawns agents. Preserve explicit settings. Decisions mode may incur one bounded classification request.',annotations,inputSchema},async input=>content({...await router.recommend(input),provider:mode}));
server.registerTool('route_spawn_hook',{
 description:'Native PreToolUse MCP Hook. Default shadow only; no permission changes. Task label only, preserving unverified settings.',annotations,
 inputSchema:{client:z.enum(['codex','claude']),event:z.record(z.string(),z.unknown())}
},async ({client,event})=>{
 const input=hookInput({client,event});
 let manifest, knownCase;
 if(input && process.env.ROUTER_POC_MANIFEST) {
   // Explicit synthetic PoC fixture only; never derive trusted provenance from task text.
   try { manifest=JSON.parse(readFileSync(process.env.ROUTER_POC_MANIFEST,'utf8')); knownCase=manifest.cases?.[input.task.summary]; } catch {}
   if(knownCase && process.env.ROUTER_POC_VERIFIED==='1') {
     input.task={summary:knownCase.summary,operation:'analysis',context_sufficient:true};
     input.constraints.provenance_verified=true;
   }
 }
 const recommendation=input?(knownCase && process.env.ROUTER_POC_SIMULATE_FAILURE==='1'?{status:'unavailable',reason:'simulated_network',application:'advisory_only'}:await router.recommend(input)):null;
 const apply=Boolean(knownCase && process.env.ROUTER_POC_VERIFIED==='1' && process.env.ROUTER_POC_APPLY==='1');
 const output=hookOutput({client,event,recommendation,mode:apply?'apply':'shadow',compatibilityVerified:apply});
 if(process.env.ROUTER_OBSERVATIONS) {
   const observation={time:new Date().toISOString(),client,event:'PreToolUse',tool_name:/^[A-Za-z0-9_:.~-]{1,128}$/.test(event.tool_name??'')?event.tool_name:'unknown',recognized:!!input,request_id:input?.request_id,status:recommendation?.status??'ignored',reason:recommendation?.reason,profile_id:recommendation?.profile_id,provider:mode,application_requested:!!output.hookSpecificOutput,updated_model:output.hookSpecificOutput?.updatedInput?.model,updated_effort:output.hookSpecificOutput?.updatedInput?.reasoning_effort};
   try {appendFileSync(process.env.ROUTER_OBSERVATIONS,JSON.stringify(observation)+'\n',{mode:0o600});}catch{}
 }
 return {content:[{type:'text',text:JSON.stringify(output)}]};
});
server.registerTool('observe_subagent_stop',{
 description:'PoC only: records child identity and transcript path, never transcript contents or last message.',
 annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 inputSchema:{client:z.enum(['codex','claude']),agent_id:z.string().max(256),agent_transcript_path:z.union([z.string().max(2048),z.null()]).optional()}
},async ({client,agent_id,agent_transcript_path})=>{
 const base=resolve(homedir(),client==='codex'?'.codex':'.claude');
 const configuredCodex=process.env.ROUTER_CODEX_TRANSCRIPT_ROOT?resolve(process.env.ROUTER_CODEX_TRANSCRIPT_ROOT):(process.env.CODEX_HOME?resolve(process.env.CODEX_HOME):base);
 const safePath=typeof agent_transcript_path==='string'&&!/sk-|Bearer/i.test(agent_transcript_path)&&resolve(agent_transcript_path).startsWith((client==='codex'?configuredCodex:base)+sep)&&agent_transcript_path.endsWith('.jsonl')?agent_transcript_path:null;
 if(process.env.ROUTER_OBSERVATIONS && /^[A-Za-z0-9_-]+$/.test(agent_id)) {
  try {appendFileSync(process.env.ROUTER_OBSERVATIONS,JSON.stringify({time:new Date().toISOString(),client,event:'SubagentStop',agent_id,agent_transcript_path:safePath})+'\n',{mode:0o600});}catch{}
 }
 return {content:[{type:'text',text:'{}'}]};
});
if(process.env.ROUTER_POC_DENY==='1' && process.env.ROUTER_POC_MANIFEST) {
 server.registerTool('deny_spawn_poc',{description:'Synthetic security Hook conflict test only.',annotations:{readOnlyHint:true},inputSchema:{}},async()=>{
  if(process.env.ROUTER_OBSERVATIONS)try{appendFileSync(process.env.ROUTER_OBSERVATIONS,JSON.stringify({time:new Date().toISOString(),event:'SyntheticDeny',denial_returned:true})+'\n',{mode:0o600});}catch{}
  return {content:[{type:'text',text:JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Synthetic PoC deny policy'}})}]};
 });
}
await server.connect(new StdioServerTransport());
