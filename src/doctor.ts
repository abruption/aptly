/** Read-only local observations, deliberately separate from legacy report schema v1. */
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parse } from 'smol-toml';
import { resolveHostPaths } from './host-paths.ts';
import { QuerySnapshot } from './query-snapshot.ts';
import { queryAutomaticHookPolicy, effectiveTransmission } from './automatic-hook.ts';
import { validateLedgerState } from './core.ts';
import { isRecord } from './types.ts';
import { VERSION } from './version.ts';
import { CODEX_HOME_POLICY_SOURCE } from './policy-source.ts';
import type { Client } from './types.ts';

export const DOCTOR_LEDGER_SCAN_LIMIT=4*1024*1024;
const unknown='unknown' as const;
function fail(code:string):never {throw new Error(code);}
const version=(value:unknown)=>typeof value==='string'&&/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(value)?value:null;
const json=(bytes:Buffer)=>{const value:unknown=JSON.parse(bytes.toString('utf8'));if(!isRecord(value))fail('invalid_configuration');return value as Record<string,unknown>;};
const observationCode=(error:unknown)=>error instanceof Error&&error.message==='concurrent_configuration_change'?'changed_during_observation':error instanceof Error&&['invalid_ledger','invalid_outcome','invalid_usage'].includes(error.message)?'invalid_ledger':error instanceof Error&&['invalid_configuration','invalid_policy','invalid_policy_binding','missing_hook_registration','invalid_ledger_binding'].includes(error.message)?error.message:'configuration_observation_failed';

/** No lock, load, state initialization, provider or filesystem mutation. */
export function observeDoctorLedger(path:string,snapshot:QuerySnapshot) {
 const bytes=snapshot.size(path,{privateFile:true,singleLink:true});
 const base={bytes,scan_limit_bytes:DOCTOR_LEDGER_SCAN_LIMIT,write_timing:'not_measured',counts:null};
 if(bytes===null)return {...base,status:'absent',history:unknown};
 if(bytes>DOCTOR_LEDGER_SCAN_LIMIT)return {...base,status:'scan_skipped_size_limit',history:unknown};
 const state:unknown=JSON.parse(snapshot.read(path,{privateFile:true,singleLink:true,maxBytes:DOCTOR_LEDGER_SCAN_LIMIT})!.toString('utf8'));
 validateLedgerState(state);
 const records=Object.values(state.requests);
 return {...base,status:'validated_bounded_snapshot',counts:{total:records.length,complete:records.filter(r=>r.state==='complete').length,unknown:records.filter(r=>r.state==='unknown').length}};
}
function standardEntry(entry:Record<string,unknown>):entry is Record<string,unknown>&{args:[string]} {
 return entry.command===process.execPath&&Array.isArray(entry.args)&&entry.args.length===1&&typeof entry.args[0]==='string'&&isAbsolute(entry.args[0])&&/(?:^|[\\/])(?:dist[\\/]src[\\/]server\.js|src[\\/]server\.ts)$/.test(entry.args[0])&&!Object.hasOwn(entry,'url');
}
function packageObservation(entry:Record<string,unknown>&{args:[string]},snapshot:QuerySnapshot) {
 const server=entry.args[0],root=server.endsWith('.ts')?dirname(dirname(server)):dirname(dirname(dirname(server)));
 // Check file kind/identity only; never execute this file or recursively follow its imports.
 if(!snapshot.track(server))return {status:'target_missing',version:null};
 const bytes=snapshot.read(join(root,'package.json'),{maxBytes:65536});
 if(!bytes)return {status:'metadata_absent',version:null};
 const meta=json(bytes),v=version(meta.version);
 if(meta.name!=='aptly')return {status:'unrecognized_package',version:null};
 return {status:v?'observed_numeric_release':'unsupported_version_metadata',version:v};
}
function hookObservation(bytes:Buffer|null) {
 if(!bytes)return 'absent';
 const config=json(bytes);
 if(config.hooks!==undefined&&!isRecord(config.hooks))fail('invalid_configuration');
 const pre=isRecord(config.hooks)?config.hooks.PreToolUse:undefined;
 if(pre===undefined)return 'absent';
 if(!Array.isArray(pre))fail('invalid_configuration');
 return pre.some(item=>isRecord(item)&&Array.isArray(item.hooks)&&item.hooks.some(h=>isRecord(h)&&h.type==='mcp_tool'&&h.server==='aptly'&&h.tool==='route_spawn_hook'))?'static_registration_present':'not_observed';
}
export interface DoctorOptions {home?:string;env?:NodeJS.ProcessEnv;clients?:Client[]}
export function collectDoctor(options:DoctorOptions={}) {
 const env=options.env??process.env;
 const clients=(options.clients??['codex','claude']).map(client=>{
  const snapshot=new QuerySnapshot(),started=performance.now();
  const base={client,selected_home_source:(client==='codex'?env.CODEX_HOME:env.CLAUDE_CONFIG_DIR)?'override':'default',connected_mcp_version:unknown,hook_trust:unknown,hook_execution:unknown,restart_required:unknown,retry_ticket_usage:unknown,credential_validity:unknown};
  try{
   const paths=resolveHostPaths(options,client),bytes=snapshot.read(paths.mcpPath,{maxBytes:256*1024});
   const config=bytes?(client==='codex'?parse(bytes.toString('utf8')):json(bytes)):{};
   const servers=config[client==='codex'?'mcp_servers':'mcpServers'];
   if(servers!==undefined&&!isRecord(servers))fail('invalid_configuration');
   const entry=isRecord(servers)?servers.aptly:undefined;
   if(entry===undefined){if(snapshot.read(join(paths.privateDir,'setup-ownership.json'),{privateFile:true,maxBytes:65536}))fail('invalid_configuration');snapshot.verify();return {...base,status:'complete',registration:'unconfigured'};}
   if(!isRecord(entry)||(entry.env!==undefined&&(!isRecord(entry.env)||Object.values(entry.env).some(v=>typeof v!=='string'))))fail('invalid_configuration');
   if(entry.env_vars!==undefined&&(!Array.isArray(entry.env_vars)||entry.env_vars.length>256||entry.env_vars.some(v=>typeof v!=='string')))fail('invalid_configuration');
   const settings=isRecord(entry.env)?entry.env:{},forwarded=Array.isArray(entry.env_vars)?entry.env_vars:[];
   const permitted=(key:string)=>client==='claude'||forwarded.includes(key);
   // A permitted passthrough is a future host binding, not evidence from this terminal.
   const setting=(key:string)=>Object.hasOwn(settings,key)?settings[key]:undefined;
   const candidate=standardEntry(entry),target=candidate?packageObservation(entry,snapshot):{status:'custom_or_remote_launcher',version:null};
   const standard=candidate&&['observed_numeric_release','unsupported_version_metadata'].includes(target.status);
   if(target.status==='target_missing')fail('invalid_configuration');
   const raw=setting('APTLY_HOOK_POLICY_PATH');
   let source='unconfigured',policyStatus='unconfigured',transmission:unknown=null;
   if(!standard){source=raw===CODEX_HOME_POLICY_SOURCE?'codex_home':raw!==undefined?'fixed':'unconfigured';policyStatus='custom_launcher_unobserved';}
   else if(raw!==undefined){
    if(typeof raw!=='string')fail('invalid_policy_binding');
    let policyPath:string;
    if(raw===CODEX_HOME_POLICY_SOURCE){
     source='codex_home';
     if(standard&&(client!=='codex'||Object.hasOwn(settings,'CODEX_HOME')||!forwarded.includes('CODEX_HOME')))fail('invalid_policy_binding');
     policyPath=join(paths.dir,'aptly','auto-policy.json');
    }else {source='fixed';if(!isAbsolute(raw as string))fail('invalid_policy_binding');policyPath=resolve(raw as string);}
    const loaded=queryAutomaticHookPolicy(policyPath,snapshot);
    if(loaded.availability!=='valid'||!loaded.policy)fail('invalid_policy');
    policyStatus=loaded.policy.enabled?'enabled':'disabled';transmission=effectiveTransmission(loaded.policy);
   }else if(permitted('APTLY_HOOK_POLICY_PATH')){source='runtime_value_unobserved';policyStatus='runtime_value_unobserved';}
   const hook=hookObservation(snapshot.read(paths.hooksPath,{maxBytes:256*1024}));
   if(standard&&policyStatus==='enabled'&&hook!=='static_registration_present')fail('missing_hook_registration');
   const ledgerPath=setting('ROUTER_LEDGER_PATH');
   let ledger:Record<string,unknown>={status:'runtime_value_unobserved',counts:null,write_timing:'not_measured'};
   if(standard&&ledgerPath!==undefined){
    if(typeof ledgerPath!=='string'||!isAbsolute(ledgerPath))fail('invalid_ledger_binding');
    try{ledger=observeDoctorLedger(ledgerPath,snapshot);}catch(error){if(error instanceof SyntaxError)fail('invalid_ledger');throw error;}
   }else if(!standard)ledger={status:'custom_launcher_unobserved',counts:null,write_timing:'not_measured'};
   else if(!permitted('ROUTER_LEDGER_PATH')){
    if(setting('ROUTER_PROVIDER')==='decisions')fail('invalid_ledger_binding');
    ledger={status:'not_declared',counts:null,write_timing:'not_measured'};
   }
   snapshot.verify();
   return {...base,status:'complete',registration:standard?'standard_node_registration':'custom_or_remote_launcher',registered_package:target,policy:{source_kind:source,status:policyStatus,transmission},hook_registration:hook,credential_reference:settings.APTLY_SECRET_BACKEND==='os'?'os_reference':Object.hasOwn(settings,'OPENAI_API_KEY')?'inline_environment_present':permitted('OPENAI_API_KEY')?'runtime_environment_permitted':'not_declared',ledger:{...ledger,diagnostic_scan_ms:Math.max(0,performance.now()-started),timing_scope:'full_client_observation_and_rechecks'}};
  }catch(error){
   // A changed observation takes precedence over a parse/validation failure.
   try{snapshot.verify();}catch(changed){if(changed instanceof Error&&changed.message==='concurrent_configuration_change')error=changed;}
   return {...base,status:'partial',code:observationCode(error)};
  }
 });
 return {kind:'aptly-doctor',schema_version:1,status:clients.some(c=>c.status==='partial')?'partial':'complete',cli_version:VERSION,scope:'local_configuration_snapshot',readiness:'not_certified',clients};
}
