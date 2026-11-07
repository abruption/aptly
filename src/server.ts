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
import { automaticHook, loadAutomaticHookPolicy, initialHookObservation } from './automatic-hook.ts';
import { SpawnContexts } from './spawn-context.ts';
import { RoutingObservations } from './routing-observations.ts';
import { ContextRetries } from './context-retry.ts';

const taskSchema=z.object({summary:z.string().min(1).max(4000),operation:z.enum(['read_only','write','review','analysis']),context_sufficient:z.boolean()}).strict();
const constraintsSchema=z.object({model_pinned:z.boolean().optional(),effort_pinned:z.boolean().optional(),role_pinned:z.boolean().optional(),fork_inherits:z.boolean().optional(),provenance_verified:z.boolean().optional()}).strict();
const hookSchema={client:z.enum(['codex','claude']),event:z.record(z.string(),z.unknown())};
const content=(result:Record<string,unknown>):CallToolResult=>({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});

export function createServer({env=process.env}:{env?:NodeJS.ProcessEnv}={}) {
 const {router,mode,modelInfo,credentialStatus,disabledClients}=runtime(env);
 const observations=new RoutingObservations();
 const contexts=new SpawnContexts();
 const retries=new ContextRetries(router,env.APTLY_HOOK_POLICY_PATH);
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
  credential_status:credentialStatus,
  automatic_hook:{status:loadAutomaticHookPolicy(env.APTLY_HOOK_POLICY_PATH).reason,mode:loadAutomaticHookPolicy(env.APTLY_HOOK_POLICY_PATH).policy?.mode??'disabled',host_settings_verified:false,context_tool:'prepare_spawn_context',context_scope:'this_process_exact_event_5_minutes',context_retry_tool:'retry_spawn_recommendation',context_retry_limit:1,observation_tool:'get_spawn_routing_observation',observation_scope:'this_process_recent_calls',execution_observation:'not_supported'},
 }));
 server.registerTool('get_spawn_routing_observation',{
  description:'Look up one exact spawn event in this MCP process (128 calls, 10 minutes). No provider call. Missing records do not prove bypass; argument updates never prove native child execution.',
  annotations:{...annotations,openWorldHint:false},inputSchema:hookSchema
 },async({client,event})=>content(observations.lookup(client,event)));
 server.registerTool('prepare_spawn_context',{
  description:'Register a bounded untrusted description for an exact upcoming spawn event in this MCP process for five minutes. Requires enabled automatic policy. No provider call, file fetching, execution or permissions. The caller must know the real session/call IDs and exact original invocation; invented IDs do not connect to native Hooks.',
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  inputSchema:{...hookSchema,description:z.string().max(4000)}
 },async({client,event,description},extra)=>{
  const policy=loadAutomaticHookPolicy(env.APTLY_HOOK_POLICY_PATH);
  if(!policy.policy?.enabled)return content({status:'rejected',reason:policy.reason});
  if(extra.signal.aborted)return content({status:'rejected',reason:'context_cancelled'});
  return content(contexts.register(client,event,description,router.policy.max_summary_bytes));
 });
 server.registerTool('cancel_spawn_context',{
  description:'Revoke one exact registered spawn context in this process. Does not cancel native execution or undo a provider request.',
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},inputSchema:hookSchema
 },async({client,event})=>content(contexts.cancel(client,event)));
 server.registerTool('recommend_agent',{
  description:'Recommend an allowlisted profile for a supplied task only; never inspects host settings, spawns, or authorizes an agent. Optional constraints describe caller-declared choices to preserve; omitted flags are not claims about current host settings. Decisions mode may incur a bounded classification request.',annotations,
  inputSchema:{request_id:z.string().min(1).max(96),client:z.enum(['codex','claude']),task:taskSchema,eligible_profile_ids:z.array(z.string()).min(1).max(20).optional(),constraints:constraintsSchema.optional()}
 },async input=>content({...await router.advise(input),provider:mode}));
 server.registerTool('retry_spawn_recommendation',{
  description:'Supply one bounded task description after an Aptly Hook returns needs_context and a retry_id. Use the same MCP process within five minutes; no native call IDs are needed. May make one paid classification; duplicate input reuses its request identity, changed input conflicts. Never spawns or changes history. If still needs_context/unavailable, stop; do not create another ID. A blocked spawn_application remains advisory.',
  annotations,inputSchema:{retry_id:z.string().regex(/^[a-f0-9]{64}$/),description:z.string().max(4000)}
 },async({retry_id,description},extra)=>content(await retries.retry(retry_id,description,extra.signal)));
 server.registerTool('get_routing_precedence',{
  description:'Explain preserved choices and unknown effective setting sources. Never classifies, reads a transcript, or changes permissions.',annotations:{...annotations,openWorldHint:false},inputSchema:hookSchema
 },async({client,event})=>{
  const {precedence,loaded,config}=evidence(client,event);
  return content({...precedence,evidence_status:loaded.reason,configuration_status:config.error??'ok',application:'advisory_only'});
 });
 server.registerTool('route_spawn_hook',{
  description:'Native PreToolUse preflight for supported spawns. Installed policy evaluates unspecified defaults, including inherited calls; application preserves explicit choices, roles, resume and history. Incompatible history yields advice without rewriting. The host executes; optional task never supplies policy.',annotations,
  inputSchema:{...hookSchema,task:taskSchema.optional()}
 },async ({client,event,task},extra)=>{
  observations.begin(client,event);
  if(env.APTLY_HOOK_POLICY_PATH!==undefined){
   const result=await automaticHook({client,event,router,policyPath:env.APTLY_HOOK_POLICY_PATH,signal:extra.signal,context:()=>contexts.lookup(client,event),onObservation:value=>observations.record(value),onNeedsContext:(seed,current)=>retries.register(seed,current)});
   observations.record(result.observation);
   return {content:[{type:'text',text:JSON.stringify(result.output)}]};
  }
  const input=hookInput({client,event,policy:router.policy});
  if(!input){observations.record({...initialHookObservation(client,event),status:'preserved',reason:'invalid_event'});return {content:[{type:'text',text:'{}'}]};}
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
  observations.record({...initialHookObservation(client,event),status:output.hookSpecificOutput?'arguments_updated':'preserved',
   reason:output.hookSpecificOutput?'legacy_arguments_updated':recommendation.status==='recommended'?'legacy_application_blocked':recommendation.reason,
   classification:recommendation.cached?'cache_hit':typeof recommendation.latency_ms==='number'?'provider_requested':'local_outcome',
   recommendation:recommendation.status==='recommended'?'produced':'not_produced',
   application:output.hookSpecificOutput?'arguments_updated':recommendation.status==='recommended'?'blocked':'not_attempted',
   ...(recommendation.profile_id?{profile_id:recommendation.profile_id}:{}),request_id:input.request_id});
  return {content:[{type:'text',text:JSON.stringify(output)}]};
 });
 return server;
}
export async function serve(options?:{env?:NodeJS.ProcessEnv}){const server=createServer(options);await server.connect(new StdioServerTransport());return server;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await serve();}catch{process.stderr.write('aptly: server_configuration_error\n');process.exitCode=1;}
}
