import { randomUUID } from 'node:crypto';
import { VERSION } from './version.ts';
import { loadConfiguration,loadHostContext } from './config.ts';
import { assertPrivateStatePath } from './files.ts';
import type { Diagnostic,DiagnosticCheck,DiagnosticCheckId,DiagnosticStatus,DiagnosticSummary } from './report.ts';

export interface DiagnosticOptions {env?:unknown;node?:unknown;platform?:unknown;arch?:unknown;now?:Date;reportId?:string;}

const platforms=new Set(['aix','darwin','freebsd','linux','openbsd','sunos','win32','android']);
const architectures=new Set(['arm','arm64','ia32','loong64','mips','mipsel','ppc','ppc64','riscv64','s390','s390x','x64']);
const envValue=(env: unknown,name: string): string|undefined=>{
 try{if(env===null||(typeof env!=='object'&&typeof env!=='function'))return undefined;const descriptor=Object.getOwnPropertyDescriptor(env,name);return descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'?descriptor.value:undefined;}
 catch{return undefined;}
};

/** Read-only local checks. No hosts are started and no API authentication probe is made. */
export function collectDiagnostics({env=process.env,node=process.versions.node,platform=process.platform,arch=process.arch,now=new Date(),reportId=randomUUID()}:DiagnosticOptions={}): Diagnostic {
 const checks:DiagnosticCheck[]=[];
 const add=(id:DiagnosticCheckId,status:DiagnosticStatus,code:string):void=>{checks.push({id,status,code});};
 const version=typeof node==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(node)?node:'0.0.0';
 add('node_runtime',Number(version.split('.')[0])>=24?'ok':'error',Number(version.split('.')[0])>=24?'node_supported':'node_unsupported');
 const rawProvider=envValue(env,'ROUTER_PROVIDER');
 const provider=rawProvider===undefined?'fixture':rawProvider;
 add('classification_provider',['fixture','decisions'].includes(provider)?'ok':'error',provider==='fixture'?'provider_fixture':provider==='decisions'?'provider_decisions':'provider_invalid');
 if(provider==='fixture')add('api_key','ok','key_not_required');
 else{
  const key=envValue(env,'OPENAI_API_KEY');const present=typeof key==='string'&&key.trim().length>0;
  add('api_key',present?'unknown':'error',present?'key_present_unverified':'key_missing');
 }
 const ledger=envValue(env,'ROUTER_LEDGER_PATH');
 if(!ledger)add('ledger_location',provider==='decisions'?'error':'unknown','ledger_not_configured');
 else{
  try{assertPrivateStatePath(ledger);add('ledger_location','ok','ledger_private_location_ready');}
  catch{add('ledger_location','error','ledger_location_unavailable');}
 }
 // Configuration and evidence contents are interpreted locally; never copied
 // into the report. Paths, values, session identities and digests stay private.
 const configuredPath=envValue(env,'ROUTER_CONFIG_PATH');
 const config=loadConfiguration({ROUTER_CONFIG_PATH:configuredPath});
 if(config.error)add('operator_configuration','error',config.error==='configuration_invalid'?'configuration_invalid':'configuration_unavailable');
 else add('operator_configuration','ok',configuredPath?'configuration_valid':'configuration_default_shadow');
 if(!config.context_path)add('host_evidence','unknown','host_evidence_not_configured');
 else{
  const loaded=loadHostContext(config.context_path);
  const code=loaded.reason==='host_evidence_loaded'?'host_evidence_loaded_unverified':loaded.reason==='context_sources_changed'?'host_evidence_changed':'host_evidence_unavailable';
  add('host_evidence',code==='host_evidence_loaded_unverified'?'unknown':'warning',code);
 }
 add('host_cli_versions','unknown','host_cli_not_probed');
 const summary:DiagnosticSummary={ok:0,warning:0,error:0,unknown:0};for(const check of checks)summary[check.status]++;
 return {schema_version:1,report_id:reportId,generated_at:now.toISOString(),tool:{name:'aptly',version:VERSION},
  environment:{node:version,platform:typeof platform==='string'&&platforms.has(platform)?platform:'unknown',arch:typeof arch==='string'&&architectures.has(arch)?arch:'unknown'},checks,summary,
  privacy:{task_text:false,paths:false,environment_values:false,credentials:false,raw_errors:false},network_requests:0,paid_calls:0};
}
