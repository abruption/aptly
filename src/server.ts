import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Client } from './types.ts';
import { pathToFileURL } from 'node:url';
import { runtime } from './runtime.ts';
import { VERSION } from './version.ts';
import { hookInput, hookOutput } from './hook.ts';
import { resolveProvenance } from './provenance.ts';
import { loadConfiguration, loadHostContext } from './config.ts';
import { automaticHook, loadAutomaticHookPolicy } from './automatic-hook.ts';
import type { AutomaticHookObservation } from './automatic-hook.ts';

const taskSchema=z.object({summary:z.string().min(1).max(4000),operation:z.enum(['read_only','write','review','analysis']),context_sufficient:z.boolean()}).strict();
const constraintsSchema=z.object({model_pinned:z.boolean().optional(),effort_pinned:z.boolean().optional(),role_pinned:z.boolean().optional(),fork_inherits:z.boolean().optional(),provenance_verified:z.boolean().optional()}).strict();
const hookSchema={client:z.enum(['codex','claude']),event:z.record(z.string(),z.unknown())};
const content=(result:Record<string,unknown>):CallToolResult=>({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});

export function createServer({env=process.env}:{env?:NodeJS.ProcessEnv}={}) {
 const {router,mode,modelInfo,disabledClients}=runtime(env);
 let lastAutomaticHook:AutomaticHookObservation|null=null;
 const server=new McpServer({name:'aptly',version:VERSION});
 const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:mode==='decisions'};
 const evidence=(client:Client,event:Record<string,unknown>)=>{
  const config=loadConfiguration(env);
  const loaded=loadHostContext(config.context_path);
  const precedence=resolveProvenance({client,event,context:loaded.context});
  return {config,loaded,precedence};
 };
 server.registerTool('get_routing_capabilities',{description:'Advisory profile catalog, provider and local budget limits. No paid call.',annotations,inputSchema:{}},async()=>content({
  ...router.capabilities(),provider:mode,hook_mode:loadConfiguration(env).mode,
  precedence:'per_call_effective_host_evidence_required',automatic_settings_discovery:false,
  recommendation:{application:'advisory_only',host_evidence_required:false,constraints:'caller_declared_pins'},
  model_information:{status:modelInfo.status,refresh:'explicit_only',account_access_verified:false},disabled_clients:disabledClients,
  automatic_hook:{status:loadAutomaticHookPolicy(env.APTLY_HOOK_POLICY_PATH).reason,mode:loadAutomaticHookPolicy(env.APTLY_HOOK_POLICY_PATH).policy?.mode??'disabled',host_settings_verified:false,last_result:lastAutomaticHook},
 }));
 server.registerTool('recommend_agent',{
  description:'Recommend an allowlisted profile for a supplied task only; never inspects host settings, spawns, or authorizes an agent. Optional constraints describe caller-declared choices to preserve; omitted flags are not claims about current host settings. Decisions mode may incur a bounded classification request.',annotations,
  inputSchema:{request_id:z.string().min(1).max(96),client:z.enum(['codex','claude']),task:taskSchema,eligible_profile_ids:z.array(z.string()).min(1).max(20).optional(),constraints:constraintsSchema.optional()}
 },async input=>content({...await router.advise(input),provider:mode}));
 server.registerTool('get_routing_precedence',{
  description:'Explain preserved choices and unknown effective setting sources. Never classifies, reads a transcript, or changes permissions.',annotations:{...annotations,openWorldHint:false},inputSchema:hookSchema
 },async({client,event})=>{
  const {precedence,loaded,config}=evidence(client,event);
  return content({...precedence,evidence_status:loaded.reason,configuration_status:config.error??'ok',application:'advisory_only'});
 });
 server.registerTool('route_spawn_hook',{
  description:'Native PreToolUse Hook. An installed operator policy can select unpinned fresh-agent defaults through Decisions; otherwise the legacy evidence-gated path remains shadow by default. Explicit choices, role/fork/resume and failures preserve the call. Optional task never supplies policy.',annotations,
  inputSchema:{...hookSchema,task:taskSchema.optional()}
 },async ({client,event,task},extra)=>{
  if(env.APTLY_HOOK_POLICY_PATH!==undefined){
   const result=await automaticHook({client,event,router,policyPath:env.APTLY_HOOK_POLICY_PATH,signal:extra.signal});
   lastAutomaticHook=result.observation;
   return {content:[{type:'text',text:JSON.stringify(result.output)}]};
  }
  const input=hookInput({client,event,policy:router.policy});
  if(!input)return {content:[{type:'text',text:'{}'}]};
  const before=evidence(client,event);
  input.constraints=before.precedence.constraints;
  if(task)input.task=task;
  const recommendation=await router.recommend(input);
  // Revalidate binding, expiry, source fingerprints and operator configuration
  // after an asynchronous provider call. A changed source cannot enable apply.
  const after=evidence(client,event);
  const apply=before.config.mode==='apply'&&!before.config.error&&!after.config.error&&after.config.mode==='apply'&&
   before.config.context_path===after.config.context_path&&before.precedence.status==='eligible'&&after.precedence.status==='eligible'&&
   before.loaded.fingerprint===after.loaded.fingerprint&&JSON.stringify(before.loaded.context)===JSON.stringify(after.loaded.context);
  const output=hookOutput({client,event,recommendation,mode:apply?'apply':'shadow',compatibilityVerified:apply,policy:router.policy});
  return {content:[{type:'text',text:JSON.stringify(output)}]};
 });
 return server;
}
export async function serve(options?:{env?:NodeJS.ProcessEnv}){const server=createServer(options);await server.connect(new StdioServerTransport());return server;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await serve();}catch{process.stderr.write('aptly: server_configuration_error\n');process.exitCode=1;}
}
