import { isAbsolute } from 'node:path';
import { budgetEnvironmentDefaults } from './budget.ts';

type Option = true | 'path' | readonly string[];
interface Entry { usage:string; description:string; options?:Record<string,Option>; positional?:readonly ('client'|'environment'|'scope'|'file')[]; }
export type HelpResult = {kind:'help';text:string}|{kind:'error';code:'invalid_help_options'};
const client=['codex','claude','all'] as const;
const scope=['none','description','excerpt'] as const;
const entries:Record<string,Entry>={
 '':{usage:'aptly <command> [options]',description:'Aptly — subagent profile recommendations\n\nCommands:\n  serve                 Start the stdio MCP server.\n  capabilities          Print catalog and local limits without an API call.\n  catalog [refresh]     Inspect the catalog or refresh official model descriptions.\n  recommend             Read task JSON from stdin and return advice.\n  inspect CLIENT FILE   Inspect an explicit settings inventory.\n  config CLIENT         Print an MCP registration fragment.\n  set default           Fill missing settings; select transmission scope interactively.\n  set env ENV_KEY       Set a supported environment value.\n  set transmission      Select or show Decisions API transmission scope.\n  budget status         Inspect local budget limits and usage.\n  setup                 Register MCP and PreToolUse Hooks.\n  remove                Remove unchanged Aptly-owned registration.\n  update                Update a verified global npm installation.\n  report                Write redacted local diagnostic attachments.\n\nGlobal options:\n  --help, -h            Show help without executing a command.\n  --version             Print the package version.\n\nUse aptly COMMAND --help or aptly help COMMAND for details.',options:{'--version':true}},
 serve:{usage:'aptly serve',description:'Start the stdio MCP server (default: fixture/shadow).\nDecisions mode requires ROUTER_PROVIDER=decisions, an absolute private ROUTER_LEDGER_PATH and a configured API key. Use aptly set env OPENAI_API_KEY for OS credential storage. Never put keys in request JSON or command arguments.'},
 capabilities:{usage:'aptly capabilities',description:'Print the active catalog, local limits and configuration metadata. No classification API call. Reads runtime configuration and credential availability; help does neither.'},
 catalog:{usage:'aptly catalog\n       aptly catalog refresh --output ABS_PATH',description:'Print the active catalog without classification. Refresh is a separate explicit network operation; use aptly catalog refresh --help.'},
 'catalog refresh':{usage:'aptly catalog refresh --output ABS_PATH',description:'Fetch official model descriptions into a private cache. --output must be an absolute path in a private directory. No model-account availability is certified. Set APTLY_MODEL_INFO_PATH and restart MCP to use the cache.',options:{'--output':'path'}},
 recommend:{usage:'aptly recommend < request.json',description:'Read request JSON from stdin. Required: request_id, client (codex|claude), task {summary, operation, context_sufficient}.\nOptional: eligible_profile_ids and caller-declared constraints. Results are advisory_only; no host settings are inspected or changed. Permissions and history remain with the host. Decisions mode may make a paid classification.\nExamples: examples/recommend.codex.json and examples/recommend.claude.json.'},
 inspect:{usage:'aptly inspect codex|claude FILE',description:'Read an explicit JSON settings inventory and explain precedence. Does not discover the running host or call an API.',positional:['client','file']},
 config:{usage:'aptly config codex|claude',description:'Print a registration fragment only. Does not edit host configuration or classify. Preserve existing launchers and merge settings as described in the guide.',positional:['client']},
 set:{usage:'aptly set default [--client codex|claude|all]\n       aptly set env ENV_KEY [--client codex|claude|all] [--stdin | --check]\n       aptly set transmission none|description|excerpt [--client codex|claude|all]\n       aptly set transmission --show [--client codex|claude|all]',description:'Set operator-controlled defaults, environment values or transmission scope. Use the subcommand help for input, preservation and restart details.'},
 'set default':{usage:'aptly set default [--client codex|claude|all]',description:'Fill missing MCP environment defaults for both clients by default. Preserve existing values, inherited budget bindings and launchers. Does not reset budget usage or caches. Interactive runs ask only for unselected transmission scope (Enter: none); noninteractive runs do not opt in. Restart MCP after changes.',options:{'--client':client}},
 'set env':{usage:'aptly set env ENV_KEY [--client codex|claude|all] [--stdin | --check]',description:'Set a supported value using hidden input; --stdin explicitly reads standard input. --client defaults to all. --check is only for OPENAI_API_KEY and checks registration without reading/storing a key.\nOPENAI_API_KEY uses OS credential storage; host files contain references only. Values are never accepted as command arguments. Existing launchers are preserved. Restart MCP after changes.\nBudget defaults: '+Object.entries(budgetEnvironmentDefaults).map(([key,value])=>key+'='+value).join(', ')+'. Only literal 0 disables a ceiling; the per-call rate stays positive.\nSupported environment keys: $ENV_KEYS',options:{'--client':client,'--stdin':true,'--check':true},positional:['environment']},
 'set transmission':{usage:'aptly set transmission none|description|excerpt [--client codex|claude|all]\n       aptly set transmission --show [--client codex|claude|all]',description:'Control automatic task-data transmission to OpenAI Decisions, not developer telemetry. none disables automatic transmission; description permits caller-provided descriptions only; excerpt permits native excerpts. Direct recommendations remain separate explicit requests. --show reads redacted registration state. Restart MCP after changes.',options:{'--client':client,'--show':true},positional:['scope']},
 budget:{usage:'aptly budget status [--client codex|claude|all]',description:'Inspect local per-ledger budget limits and reserved usage. No reset/refill command is provided.'},
 'budget status':{usage:'aptly budget status [--client codex|claude|all]',description:'Read registered host budget settings and ledger metadata; defaults to both clients. No credentials, provider calls, configuration writes or ledger/gate initialization.\nLiteral 0 ceilings display Unlimited; reservations are not OpenAI billing. This is a registration/permitted-environment snapshot, not verification of running custom launchers. An existing gate is held briefly and can be busy.',options:{'--client':client}},
 setup:{usage:'aptly setup [--client codex|claude|all] [--mode defaults|advisory] [--transmission none|description|excerpt] [--automatic]\n       aptly setup --client codex|claude --migrate-launcher [--include-existing] [--dry-run]',description:'Register MCP and PreToolUse Hooks while preserving unrelated settings and existing launchers. Omitted --mode preserves an existing mode; a new policy defaults to defaults. New transmission remains unselected unless explicitly chosen.\n--automatic skips CI, APTLY_SKIP_SETUP=1 and absent host directories.\n--migrate-launcher reviews a single owned standard launcher; --include-existing explicitly includes an eligible preserved registration. --dry-run validates migration without writing. Do not combine migration with --automatic, --mode or --transmission. --include-existing and --dry-run require --migrate-launcher.\nNo keys are stored. Restart the host/MCP; Codex requires native /hooks trust review.',options:{'--client':client,'--mode':['defaults','advisory'],'--transmission':scope,'--automatic':true,'--migrate-launcher':true,'--include-existing':true,'--dry-run':true}},
 remove:{usage:'aptly remove [--client codex|claude|all]',description:'Remove only unchanged Aptly-owned registration for both clients by default. Preserve modified/user-owned entries, keys and ledger history. Restart host/MCP after removal.',options:{'--client':client}},
 update:{usage:'aptly update',description:'Update this verified global npm installation within the same prefix. Stop other hosts/MCP/CLI writers first. Local/source/unverified installations are rejected. Lifecycle setup is not run: run aptly setup and restart hosts afterward. Existing launchers and keys are preserved.'},
 report:{usage:'aptly report [--format md|json|both] [--output-dir DIR]',description:'Write redacted local diagnostic attachments. Default format: both; directory: reports. No uploads or classification API probes. Review attachments before sharing.',options:{'--format':['md','json','both'],'--output-dir':'path'}},
};
const helpFlag=(value:string)=>value==='--help'||value==='-h';
/** Pure help dispatch. Required positional arguments may be omitted; supplied values/options are validated. */
export function resolveCliHelp(argv:readonly string[],{environmentKeys=[]}:{environmentKeys?:readonly string[]}={}):HelpResult|undefined {
 const prefixed=argv[0]==='help';
 if(!prefixed&&!argv.some(helpFlag))return undefined;
 const tokens=prefixed?argv.slice(1):[...argv],clean=tokens.filter(token=>!helpFlag(token));
 let path='',count=0;
 if(clean.length&&clean[0]!=='--version'){
  if(!clean[0]||clean[0].includes(' ')||!Object.hasOwn(entries,clean[0]))return {kind:'error',code:'invalid_help_options'};
  path=clean[0];count=1;
  if(['set','catalog','budget'].includes(path)&&clean[1]&&Object.hasOwn(entries,path+' '+clean[1])){path+=' '+clean[1];count=2;}
 }
 const spec=entries[path],tail:string[]=[];
 for(const token of tokens){if(count){if(!helpFlag(token))count--;continue;}tail.push(token);}
 const seen=new Set<string>(),values=new Map<string,string>(),positionals:string[]=[],options=spec.options??{};
 for(let i=0;i<tail.length;i++){
  const token=tail[i];if(helpFlag(token))continue;
  const filePosition=spec.positional?.[positionals.length]==='file';
  if(token.startsWith('-')&&!filePosition){
   if(!Object.hasOwn(options,token)||seen.has(token))return {kind:'error',code:'invalid_help_options'};
   if(path==='set transmission'&&token==='--show'&&(seen.size||positionals.length))return {kind:'error',code:'invalid_help_options'};
   seen.add(token);const type=options[token];if(type===true)continue;
   const value=tail[++i];if(!value||helpFlag(value)||(type==='path'?value.startsWith('--'):value.startsWith('-'))||(type!=='path'&&!type.includes(value)))return {kind:'error',code:'invalid_help_options'};
   values.set(token,value);
   if(path==='catalog refresh'&&token==='--output'&&!isAbsolute(value))return {kind:'error',code:'invalid_help_options'};
  }else {if(!token||seen.size)return {kind:'error',code:'invalid_help_options'};positionals.push(token);}
 }
 if(positionals.length>(spec.positional?.length??0))return {kind:'error',code:'invalid_help_options'};
 for(let i=0;i<positionals.length;i++){
  const type=spec.positional![i],value=positionals[i];
  if(type==='client'&&!['codex','claude'].includes(value)||type==='scope'&&!scope.includes(value as typeof scope[number])||type==='environment'&&!environmentKeys.includes(value))return {kind:'error',code:'invalid_help_options'};
 }
 if(path==='set env'&&seen.has('--check')&&(seen.has('--stdin')||(positionals[0]!==undefined&&positionals[0]!=='OPENAI_API_KEY')))return {kind:'error',code:'invalid_help_options'};
 if(path==='set transmission'&&seen.has('--show')&&positionals.length)return {kind:'error',code:'invalid_help_options'};
 if(path==='setup'){
  const migrate=seen.has('--migrate-launcher');
  if((seen.has('--dry-run')||seen.has('--include-existing'))&&!migrate)return {kind:'error',code:'invalid_help_options'};
  if(migrate&&(seen.has('--automatic')||seen.has('--mode')||seen.has('--transmission')||values.get('--client')==='all'))return {kind:'error',code:'invalid_help_options'};
 }
 const text='Usage: '+spec.usage+'\n\n'+spec.description.replace('$ENV_KEYS',environmentKeys.join(', '))+'\n\nHelp: --help, -h, or aptly help'+(path?' '+path:'')+'\n';
 return {kind:'help',text};
}
