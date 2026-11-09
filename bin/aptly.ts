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
import { budgetErrorDetails } from '../src/budget.ts';
import { checkSetup, setupHosts, removeSetup, setDefaults, setEnvironment, configurableEnvironmentKeys, migrateLauncher, setTransmission, showTransmission, showBudgetStatus } from '../src/setup.ts';
import { readEnvironmentValue, readTransmissionChoice } from '../src/cli-input.ts';
import { prepareApiKey } from '../src/credential-setup.ts';
import { updateGlobalInstallation } from '../src/update.ts';
import { updateNotification } from '../src/update-notifier.ts';
import { resolveCliHelp } from '../src/cli-help.ts';
const [command='serve',...args]=process.argv.slice(2);
const output=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
let helpHandled=false;
try {
 const help=resolveCliHelp(process.argv.slice(2),{environmentKeys:['OPENAI_API_KEY',...configurableEnvironmentKeys]});
 if(help){
  helpHandled=true;
  if(help.kind==='error'){process.stderr.write('aptly: '+help.code+' (use --help)\n');process.exitCode=2;}
  else process.stdout.write(help.text);
 } else if(command==='update'){
  if(args.length)throw new Error('update_invalid_options');
   const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../':'../../',import.meta.url));
   const result=updateGlobalInstallation({packageRoot});output(result);if(result.status==='error')process.exitCode=1;
 } else if(command==='budget'){
  if(args[0]!=='status')throw new Error('budget_invalid_options');
   let clients:('codex'|'claude')[]=['codex','claude'];
   if(args.length!==1){if(args.length!==3||args[1]!=='--client'||!['codex','claude','all'].includes(args[2]))throw new Error('budget_invalid_options');clients=args[2]==='all'?['codex','claude']:[args[2] as 'codex'|'claude'];}
   const result=showBudgetStatus({clients});output(result);if(result.status==='partial')process.exitCode=1;
 } else if(command==='--version') process.stdout.write(VERSION+'\n');
 else if(command==='report'){
  const options={format:'both',outputDir:'reports'};const seen=new Set();
  for(let i=0;i<args.length;i++){const flag=args[i];if(!['--format','--output-dir'].includes(flag)||seen.has(flag)||!args[i+1]||args[i+1].startsWith('--'))throw Object.assign(new Error('report_invalid_options'),{code:'report_invalid_options'});seen.add(flag);options[flag==='--format'?'format':'outputDir']=args[++i];}
  if(!['md','json','both'].includes(options.format))throw Object.assign(new Error('report_invalid_options'),{code:'report_invalid_options'});
  output(exportDiagnosticReport({diagnostic:collectDiagnostics(),...options}));
 }
 else if(command==='set'){
  if(args[0]==='transmission'){
   const scope=args[1];if(!['none','description','excerpt','--show'].includes(scope))throw new Error('set_invalid_options');
    let clients:('codex'|'claude')[]=['codex','claude'];
    if(args.length!==2){if(args.length!==4||args[2]!=='--client'||!['codex','claude','all'].includes(args[3]))throw new Error('set_invalid_options');clients=args[3]==='all'?['codex','claude']:[args[3] as 'codex'|'claude'];}
    const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../':'../../',import.meta.url));
    const result=scope==='--show'?showTransmission({clients}):setTransmission(scope as 'none'|'description'|'excerpt',{clients,packageRoot});output(result);if('status' in result&&result.status==='partial')process.exitCode=1;
  }
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
    let result=action==='default'?setDefaults({clients,packageRoot}):key==='OPENAI_API_KEY'?credential!.apply(value):setEnvironment(key!,value,{clients,packageRoot});
    if(action==='default'&&result.status==='complete'&&process.stdin.isTTY&&process.stdout.isTTY){
      const pending=result.clients.filter(client=>client.transmission==='unselected').map(client=>client.client);
      if(pending.length){const scope=await readTransmissionChoice();const selected=setTransmission(scope,{clients:pending,packageRoot,selectUnselectedOnly:true});result={status:selected.status,clients:result.clients.map(client=>selected.clients.find(item=>item.client===client.client)??client)};}
    }
    output(result);if(result.status==='partial')process.exitCode=1;
   }finally{value='';}
  }
 }
 else if(['setup','remove'].includes(command)){
  let clients:('codex'|'claude')[]=['codex','claude'];let mode:'defaults'|'advisory'|undefined;let transmission:'none'|'description'|'excerpt'|undefined;let automatic=false;let check=false;let migrate=false;let dryRun=false;let includeExisting=false;const seen=new Set<string>();
   for(let i=0;i<args.length;i++){
    const flag=args[i];if(seen.has(flag))throw new Error('setup_invalid_options');seen.add(flag);
    if(flag==='--check'&&command==='setup'){check=true;continue;}
    if(flag==='--migrate-launcher'&&command==='setup'){migrate=true;continue;}
    if(flag==='--include-existing'&&command==='setup'){includeExisting=true;continue;}
    if(flag==='--dry-run'&&command==='setup'){dryRun=true;continue;}
    if(flag==='--automatic'&&command==='setup'){automatic=true;continue;}
    const value=args[++i];
    if(flag==='--client'&&['codex','claude','all'].includes(value))clients=value==='all'?['codex','claude']:[value as 'codex'|'claude'];
    else if(flag==='--transmission'&&command==='setup'&&['none','description','excerpt'].includes(value))transmission=value as 'none'|'description'|'excerpt';
    else if(flag==='--mode'&&command==='setup'&&['defaults','advisory'].includes(value))mode=value as 'defaults'|'advisory';
    else throw new Error('setup_invalid_options');
   }
   const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../':'../../',import.meta.url));
   if((check && [...seen].some(flag=>!['--check','--client'].includes(flag)))||(migrate&&(clients.length!==1||automatic||seen.has('--mode')||seen.has('--transmission')))||((dryRun||includeExisting)&&!migrate))throw new Error('setup_invalid_options');
   const result=check?checkSetup({clients,packageRoot}):migrate?migrateLauncher({clients,packageRoot},dryRun,includeExisting):command==='setup'?setupHosts({clients,mode,automatic,packageRoot,transmission}):removeSetup({clients});output(result);
   if(result.status==='partial'&&!automatic)process.exitCode=1;
 }
 else if(command==='serve'&&args.length===0)await serve();
 else if((command==='capabilities'||command==='catalog')&&args.length===0){const {router,mode,modelInfo,credentialStatus,disabledClients}=runtime();output({...router.capabilities(),provider:mode,credential_status:credentialStatus,model_information:{status:modelInfo.status,account_access_verified:false},disabled_clients:disabledClients});}
 else if(command==='catalog'&&args.length===3&&args[0]==='refresh'&&args[1]==='--output'){const snapshot=await fetchModelInfo();saveModelInfo(args[2],snapshot);output({status:'refreshed',facts:snapshot.facts.length,sources:snapshot.sources,account_access_verified:false});}
 else if(command==='recommend'&&args.length===0){
  const raw=readFileSync(0,'utf8');if(Buffer.byteLength(raw)>16384)throw new Error('input_too_large');
  const {router,mode}=runtime();output({...await router.advise(JSON.parse(raw)),provider:mode});
 }else if(command==='inspect'&&args.length===2&&['codex','claude'].includes(args[0])){
  const raw=readFileSync(args[1],'utf8');if(Buffer.byteLength(raw)>65536)throw new Error('input_too_large');
  const inventory=JSON.parse(raw);output(explainSettings({...inventory,client:args[0]}));
 }else if(command==='config'&&args.length===1&&['codex','claude'].includes(args[0])){
  const node=process.execPath,server=fileURLToPath(new URL(`../src/server${import.meta.url.endsWith('.ts')?'.ts':'.js'}`,import.meta.url));
  if(args[0]==='claude')output({mcpServers:{'aptly':{command:node,args:[server],env:{ROUTER_PROVIDER:'fixture'}}}});
  else process.stdout.write('[mcp_servers.aptly]\ncommand = '+JSON.stringify(node)+'\nargs = ['+JSON.stringify(server)+']\nenv_vars = ["OPENAI_API_KEY", "ROUTER_PROVIDER", "ROUTER_LEDGER_PATH", "ROUTER_CONFIG_PATH", "APTLY_CLAUDE_MODELS", "APTLY_CODEX_MODELS", "CLAUDE_MODELS", "CODEX_MODELS", "APTLY_MODEL_INFO_PATH", "APTLY_MAX_DAILY_CALLS", "APTLY_MAX_TOTAL_CALLS", "APTLY_MAX_ESTIMATED_USD", "APTLY_ESTIMATED_CALL_USD"]\n');
 }else{process.stderr.write('aptly: invalid_command (use --help)\n');process.exitCode=2;}
}catch(error){
 const codes=['report_invalid_options','report_invalid_diagnostic','report_invalid_format','report_already_exists','report_output_unavailable'];
 const caughtCode=errorCode(error);
 const safeConfigurationCodes=['catalog_configuration_invalid','catalog_configuration_conflict','catalog_environment_typo','catalog_facts_invalid','model_info_fetch_failed','model_info_unavailable','model_info_invalid','model_info_output_unavailable','model_info_path_invalid','model_info_refresh_failed','model_info_options_invalid','model_info_too_large','model_info_timeout','model_info_parse_failed','model_info_save_failed'];
 const message=error instanceof Error?error.message:undefined;
 const budgetCode=[caughtCode,message].find(value=>typeof value==='string'&&['invalid_budget_configuration','budget_invalid_options'].includes(value));
 const configCode=[caughtCode,message].find(value=>typeof value==='string'&&safeConfigurationCodes.includes(value));
 const setCodes=['set_environment_key_unsupported','set_invalid_options','set_value_too_large','set_interactive_input_required','set_input_cancelled'];
 const code=command==='update'?(message==='update_invalid_options'?message:'update_failed'):command==='set'?(setCodes.includes(message??'')?message:'set_failed'):command==='report'?(caughtCode&&codes.includes(caughtCode)?caughtCode:'report_failed'):budgetCode??configCode??'operation_failed';
 const budgetDetails=budgetErrorDetails(error);
 process.stderr.write('aptly: '+code+(budgetDetails.invalid_budget_keys?.length?' ['+budgetDetails.invalid_budget_keys.join(', ')+']':'')+(budgetDetails.budget_error?' ('+budgetDetails.budget_error+')':'')+'\n');process.exitCode=1;
}
finally {
 if(!process.exitCode&&!helpHandled){
  try {
   const hint=await updateNotification({command,args,env:process.env,stdinIsTTY:!!process.stdin.isTTY,stderrIsTTY:!!process.stderr.isTTY,stdoutIsTTY:!!process.stdout.isTTY,currentVersion:VERSION});
   if(hint)process.stderr.write(hint+'\n');
  } catch { /* Optional update hints cannot fail a successful command. */ }
 }
}
