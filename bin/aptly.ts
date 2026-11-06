#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../src/server.ts';
import { runtime } from '../src/runtime.ts';
import { explainSettings } from '../src/inspect.ts';
import { VERSION } from '../src/version.ts';
import { collectDiagnostics } from '../src/diagnostics.ts';
import { exportDiagnosticReport } from '../src/report.ts';
import { fetchModelInfo,saveModelInfo } from '../src/model-info.ts';
import { errorCode } from '../src/types.ts';
import { setupHosts, removeSetup, setDefaults, setEnvironment, configurableEnvironmentKeys, migrateLauncher } from '../src/setup.ts';
import { readEnvironmentValue } from '../src/cli-input.ts';
import { prepareApiKey } from '../src/credential-setup.ts';
import { updateGlobalInstallation } from '../src/update.ts';
const [command='serve',...args]=process.argv.slice(2);
const output=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
try {
 if(['--help','-h','help'].includes(command)) {
  process.stdout.write('Aptly (preview)\n\nCommands:\n  serve                 Start the stdio MCP server (default: fixture/shadow).\n  capabilities          Print the active catalog; no API call.\n  catalog               Print the active catalog; no API call.\n  catalog refresh --output ABS_PATH  Fetch official model descriptions to a private cache.\n  recommend             Recommend for a task JSON on stdin; no host evidence required.\n  inspect CLIENT FILE   Inspect an explicit JSON settings inventory; no API call.\n  config CLIENT         Print an MCP registration fragment; does not edit settings.\n  set default           Add missing default MCP environment settings.\n  set env ENV_KEY       Prompt for an MCP environment value.\n  setup                 Register MCP and automatic PreToolUse Hooks.\n  remove                Remove only unchanged Aptly-owned registration.\n  update                Update this verified global npm installation.\n  report                Write redacted local diagnostic attachments (default: md + json).\n    --format md|json|both  Select report formats.\n    --output-dir DIR      Private output directory (default: reports).\n  --version             Print the package version.\n\nUse aptly set env OPENAI_API_KEY for OS storage, or pass it through the MCP environment.\nPaid mode additionally requires\nROUTER_PROVIDER=decisions and an absolute ROUTER_LEDGER_PATH in a private directory.\nROUTER_CONFIG_PATH is an optional private operator configuration file.\n');
 } else if(command==='update'){
  if(args.length===1&&args[0]==='--help')process.stdout.write('Usage: aptly update\nRequires a verified global npm installation. Stop other hosts/MCP/CLI writers first.\nUpdates the same npm prefix without lifecycle setup. Run aptly setup and restart hosts afterward; existing launchers are preserved.\n');
  else {
   if(args.length)throw new Error('update_invalid_options');
   const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../':'../../',import.meta.url));
   const result=updateGlobalInstallation({packageRoot});output(result);if(result.status==='error')process.exitCode=1;
  }
 } else if(command==='--version') process.stdout.write(VERSION+'\n');
 else if(command==='report'&&args.length===1&&args[0]==='--help'){
  process.stdout.write('Usage: aptly report [--format md|json|both] [--output-dir DIR]\nDefault: both formats in a private reports directory. No uploads or API probes.\n');
 }
 else if(command==='report'){
  const options={format:'both',outputDir:'reports'};const seen=new Set();
  for(let i=0;i<args.length;i++){const flag=args[i];if(!['--format','--output-dir'].includes(flag)||seen.has(flag)||!args[i+1]||args[i+1].startsWith('--'))throw Object.assign(new Error('report_invalid_options'),{code:'report_invalid_options'});seen.add(flag);options[flag==='--format'?'format':'outputDir']=args[++i];}
  if(!['md','json','both'].includes(options.format))throw Object.assign(new Error('report_invalid_options'),{code:'report_invalid_options'});
  output(exportDiagnosticReport({diagnostic:collectDiagnostics(),...options}));
 }
 else if(command==='set'){
  if(args.length===1&&args[0]==='--help')process.stdout.write('Usage: aptly set default [--client codex|claude|all]\n       aptly set env ENV_KEY [--client codex|claude|all] [--stdin | --check]\n--check diagnoses OPENAI_API_KEY registration without reading or storing a key.\nValues are entered interactively with hidden input; --stdin explicitly reads a value from standard input. Existing defaults and launchers are preserved. OPENAI_API_KEY is stored in the OS credential store; host files contain references only. Restart MCP after changes.\n');
  else {
   const action=args[0];let key:string|undefined;let start=1;
   if(action==='env'){key=args[1];start=2;if(!key||(key!=='OPENAI_API_KEY'&&!configurableEnvironmentKeys.includes(key)))throw new Error('set_environment_key_unsupported');}
   else if(action!=='default')throw new Error('set_invalid_options');
   let clients:('codex'|'claude')[]=['codex','claude'];let fromStdin=false;let checkOnly=false;const seen=new Set<string>();
   for(let i=start;i<args.length;i++){const flag=args[i];if(seen.has(flag))throw new Error('set_invalid_options');seen.add(flag);if(flag==='--check'&&action==='env'&&key==='OPENAI_API_KEY'){checkOnly=true;continue;}if(flag==='--stdin'&&action==='env'){fromStdin=true;continue;}if(flag==='--client'&&['codex','claude','all'].includes(args[i+1])){const v=args[++i];clients=v==='all'?['codex','claude']:[v as 'codex'|'claude'];}else throw new Error('set_invalid_options');}
   const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../':'../../',import.meta.url));
   if(checkOnly&&fromStdin)throw new Error('set_invalid_options');
   const credential=key==='OPENAI_API_KEY'?prepareApiKey({clients,packageRoot}):undefined;
   let value='';
   if(credential&&(checkOnly||credential.result.status==='partial')){output(credential.result);if(credential.result.status==='partial')process.exitCode=1;}
   else try{
    if(action==='env')value=await readEnvironmentValue({key:key!,fromStdin});
    const result=action==='default'?setDefaults({clients,packageRoot}):key==='OPENAI_API_KEY'?credential!.apply(value):setEnvironment(key!,value,{clients,packageRoot});output(result);if(result.status==='partial')process.exitCode=1;
   }finally{value='';}
  }
 }
 else if(['setup','remove'].includes(command)){
  if(args.length===1&&args[0]==='--help')process.stdout.write('Usage: aptly setup [--client codex|claude|all] [--mode defaults|advisory] [--automatic]\n       aptly setup --client codex|claude --migrate-launcher [--dry-run]\n       aptly remove [--client codex|claude|all]\nSetup merges MCP and PreToolUse registration. Codex requires native /hooks trust review.\nAutomatic setup skips CI, APTLY_SKIP_SETUP=1, and absent host directories. No keys are stored.\n');
  else {
   let clients:('codex'|'claude')[]=['codex','claude'];let mode:'defaults'|'advisory'='defaults';let automatic=false;let migrate=false;let dryRun=false;const seen=new Set<string>();
   for(let i=0;i<args.length;i++){
    const flag=args[i];if(seen.has(flag))throw new Error('setup_invalid_options');seen.add(flag);
    if(flag==='--migrate-launcher'&&command==='setup'){migrate=true;continue;}
    if(flag==='--dry-run'&&command==='setup'){dryRun=true;continue;}
    if(flag==='--automatic'&&command==='setup'){automatic=true;continue;}
    const value=args[++i];
    if(flag==='--client'&&['codex','claude','all'].includes(value))clients=value==='all'?['codex','claude']:[value as 'codex'|'claude'];
    else if(flag==='--mode'&&command==='setup'&&['defaults','advisory'].includes(value))mode=value as 'defaults'|'advisory';
    else throw new Error('setup_invalid_options');
   }
   const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../':'../../',import.meta.url));
   if((migrate&&(clients.length!==1||automatic||seen.has('--mode')))||(dryRun&&!migrate))throw new Error('setup_invalid_options');
   const result=migrate?migrateLauncher({clients,packageRoot},dryRun):command==='setup'?setupHosts({clients,mode,automatic,packageRoot}):removeSetup({clients});output(result);
   if(result.status==='partial'&&!automatic)process.exitCode=1;
  }
 }
 else if(command==='serve'&&args.length===0)await serve();
 else if((command==='capabilities'||command==='catalog')&&args.length===0){const {router,mode,modelInfo,credentialStatus,disabledClients}=runtime();output({...router.capabilities(),provider:mode,credential_status:credentialStatus,model_information:{status:modelInfo.status,account_access_verified:false},disabled_clients:disabledClients});}
 else if(command==='catalog'&&args.length===3&&args[0]==='refresh'&&args[1]==='--output'){const snapshot=await fetchModelInfo();saveModelInfo(args[2],snapshot);output({status:'refreshed',facts:snapshot.facts.length,sources:snapshot.sources,account_access_verified:false});}
 else if(command==='catalog'&&args.length===1&&args[0]==='--help'){process.stdout.write('Usage: aptly catalog\n       aptly catalog refresh --output /absolute/private/model-info.json\nSet APTLY_MODEL_INFO_PATH to load the cache at server startup. No account access is certified.\n');}
 else if(command==='recommend'&&args.length===1&&args[0]==='--help'){
  process.stdout.write('Usage: aptly recommend < request.json\nRequired: request_id, client (codex|claude), task {summary, operation, context_sufficient}.\nOptional: eligible_profile_ids (defaults to client catalog), constraints (declared pins only).\nRecommendations are advisory_only; no host settings are inspected or changed.\nSee examples/recommend.codex.json and examples/recommend.claude.json.\n');
 }
 else if(command==='recommend'&&args.length===0){
  const raw=readFileSync(0,'utf8');if(Buffer.byteLength(raw)>16384)throw new Error('input_too_large');
  const {router,mode}=runtime();output({...await router.advise(JSON.parse(raw)),provider:mode});
 }else if(command==='inspect'&&args.length===2&&['codex','claude'].includes(args[0])){
  const raw=readFileSync(args[1],'utf8');if(Buffer.byteLength(raw)>65536)throw new Error('input_too_large');
  const inventory=JSON.parse(raw);output(explainSettings({...inventory,client:args[0]}));
 }else if(command==='config'&&args.length===1&&['codex','claude'].includes(args[0])){
  const node=process.execPath,server=fileURLToPath(new URL(`../src/server${import.meta.url.endsWith('.ts')?'.ts':'.js'}`,import.meta.url));
  if(args[0]==='claude')output({mcpServers:{'aptly':{command:node,args:[server],env:{ROUTER_PROVIDER:'fixture'}}}});
  else process.stdout.write('[mcp_servers.aptly]\ncommand = '+JSON.stringify(node)+'\nargs = ['+JSON.stringify(server)+']\nenv_vars = ["OPENAI_API_KEY", "ROUTER_PROVIDER", "ROUTER_LEDGER_PATH", "ROUTER_CONFIG_PATH", "APTLY_CLAUDE_MODELS", "APTLY_CODEX_MODELS", "CLAUDE_MODELS", "CODEX_MODELS", "APTLY_MODEL_INFO_PATH"]\n');
 }else{process.stderr.write('aptly: invalid_command (use --help)\n');process.exitCode=2;}
}catch(error){
 const codes=['report_invalid_options','report_invalid_diagnostic','report_invalid_format','report_already_exists','report_output_unavailable'];
 const caughtCode=errorCode(error);
 const safeConfigurationCodes=['catalog_configuration_invalid','catalog_configuration_conflict','catalog_environment_typo','catalog_facts_invalid','model_info_fetch_failed','model_info_unavailable','model_info_invalid','model_info_output_unavailable','model_info_path_invalid','model_info_refresh_failed','model_info_options_invalid','model_info_too_large','model_info_timeout','model_info_parse_failed','model_info_save_failed'];
 const message=error instanceof Error?error.message:undefined;
 const configCode=[caughtCode,message].find(value=>typeof value==='string'&&safeConfigurationCodes.includes(value));
 const setCodes=['set_environment_key_unsupported','set_invalid_options','set_value_too_large','set_interactive_input_required','set_input_cancelled'];
 const code=command==='update'?(message==='update_invalid_options'?message:'update_failed'):command==='set'?(setCodes.includes(message??'')?message:'set_failed'):command==='report'?(caughtCode&&codes.includes(caughtCode)?caughtCode:'report_failed'):configCode??'operation_failed';
 process.stderr.write('aptly: '+code+'\n');process.exitCode=1;
}
