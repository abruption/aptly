// Windows-only, human-approved validation. The preflight never starts a model turn.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, release, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const [mode, packageRoot, codex, reportFile] = process.argv.slice(2);
const mvp = mode === '--run';
if (process.platform !== 'win32' || ![mode, packageRoot, codex, reportFile].every(Boolean) ||
    (!mvp && mode !== '--preflight') || ![packageRoot,codex,reportFile].every(isAbsolute)) {
  console.error('Usage on Windows: node windows-live-codex.mjs --preflight|--run ABS_APTLY_PACKAGE_ROOT ABS_CODEX_EXE ABS_NEW_REPORT_JSON');
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
assert.equal(pkg.name,'aptly');
assert.equal(pkg.version,'0.1.19');
assert(existsSync(codex));
const product = join(packageRoot,'dist','src','server.js');
assert(existsSync(product));
const { protectNewWindowsPrivateDirectory } = await import(pathToFileURL(join(packageRoot,'dist','src','windows-private.js')));
const report = {
  mode: mvp ? 'live' : 'preflight', aptly: pkg.version, node: process.version, arch: process.arch,
  os_release: release(), checked: [], decisions_reservations: 0, completed_decisions_outcomes: 0, children: []
};
const safeWrite = (p,x,flag='w') => writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag});
safeWrite(reportFile,report,'wx'); // a repeat must be a separately authorized trial
const tmp = mkdtempSync(join(tmpdir(),'codex-aptly-live-'));
const policy = join(tmp,'policy.json'), ledger = join(tmp,'ledger.json');
let proc, failure, startLookup;
const home = resolve(process.env.CODEX_HOME || join(homedir(),'.codex'));
const { parse } = createRequire(join(packageRoot,'package.json'))('smol-toml');
const marker = 'APTLY_WINDOWS_MVP_' + randomUUID().replaceAll('-','');
const task = 'sort_supplied_numbers_in_ascending_order_only';
const model = 'gpt-6-luna', effort = 'max';

function unpack(result) {
  if(result?.isError) throw Error('mcp_capabilities_error');
  return result?.structuredContent ?? JSON.parse(result?.content?.[0]?.text ?? 'null');
}
function check(v, code) { if(!v) throw Error(code); }
function diagnostic(value) {
  const text=String(value??'');
  return [
    [/timed out|timeout/i,'timeout'],
    [/stdio|connection closed/i,'stdio_or_exit'],
    [/handshake|initialize/i,'handshake'],
    [/access is denied|permission denied/i,'access_denied'],
  ].filter(([pattern])=>pattern.test(text)).map(([,tag])=>tag);
}
function openHost(settings) {
  const env={...process.env};
  for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ROUTER_LEDGER_PATH','ROUTER_PROVIDER','APTLY_MODEL_INFO_PATH']) delete env[key];
  proc=spawn(codex,['app-server',...Object.entries(settings).flatMap(([k,v])=>['-c',k+'='+JSON.stringify(v)])],{
    cwd:tmp,env,stdio:['pipe','pipe','pipe'],
  });
  proc.stderr.resume();
  const requests=new Map();
  const observed=new Set();
  let sequence=0, onTurn=()=>{}, parent, turnStarts=0;
  const send = v => { if(proc.stdin.writable) proc.stdin.write(JSON.stringify(v)+'\n'); };
  const failAll = () => {
    for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('codex_process_unavailable'));}
    requests.clear();
    onTurn('app_server_closed');
  };
  proc.on('exit',failAll);
  proc.on('error',failAll);
  proc.stdin.on('error',()=>{});
  const lines=createInterface({input:proc.stdout});
  lines.on('line',line=>{
    let v;
    try {v=JSON.parse(line);}catch{return;}
    if(v.method&&v.id!==undefined){
      send({id:v.id,error:{code:-32601,message:'No interactive approvals in this validation'}});
      return;
    }
    const p=requests.get(v.id);
    if(p){
      requests.delete(v.id);clearTimeout(p.timer);
      if(v.error) p.reject(Error('codex_rpc_'+p.tag+'_failed'));
      else p.resolve(v.result);
      return;
    }
    const a=v.params;
    if(v.method==='mcpServer/startupStatus/updated'&&a?.name==='aptly'){
      diagnostic(a.error).forEach(x=>observed.add(x));
      report.codex_handshake_diagnostics=[...observed];
    }
    if(v.method==='hook/completed'&&a?.threadId===parent&&a.run?.eventName==='preToolUse'&&a.run.handlerType==='mcpTool'){
      report.native_hook_completion_events=(report.native_hook_completion_events??0)+1;
    }
    if(v.method==='item/started'&&a?.threadId===parent&&a.item?.type==='collabAgentToolCall'&&
        /spawn/i.test(String(a.item.tool))&&++turnStarts>1) onTurn('unexpected_second_spawn');
    if(v.method==='turn/completed'&&a?.threadId===parent) onTurn(a.turn?.status??'unknown');
  });
  const rpc=(method,params,ms=55000)=>new Promise((resolve,reject)=>{
    const id=++sequence,tag=method.replaceAll('/','_');
    const timer=setTimeout(()=>{requests.delete(id);reject(Error('codex_rpc_'+tag+'_timeout'));},ms);
    requests.set(id,{resolve,reject,timer,tag});
    send({id,method,params});
  });
  return {rpc,send,
    bindParent(id){parent=id;},
    waitTurn(){return new Promise(resolve=>{onTurn=resolve;});},
  };
}
function readRollout(file, parent) {
  const text=readFileSync(file,'utf8');
  check(Buffer.byteLength(text)<=2_000_000,'unexpected_rollout_size');
  const contexts=[],natives=[];
  let linked=false, completed=false, markerReturned=false, tokens=0;
  for(const line of text.split('\n')){
    if(!line)continue;
    let e;try {e=JSON.parse(line);}catch{continue;}
    const p=e.payload;
    if(e.type==='session_meta') linked=p?.source?.subagent?.thread_spawn?.parent_thread_id===parent;
    if(e.type==='turn_context') contexts.push({model:p?.model,effort:p?.effort??p?.reasoning_effort});
    if(e.type==='event_msg'&&p?.type==='task_complete')completed=true;
    if(e.type==='event_msg'&&p?.type==='token_count')tokens=Math.max(tokens,p.info?.total_token_usage?.output_tokens??0);
    if((e.type==='event_msg'&&p?.type==='agent_message')||
       (e.type==='response_item'&&p?.type==='message'&&p.role==='assistant')) markerReturned ||= JSON.stringify(p).includes(marker);
    if(e.type==='response_item'&&p?.type==='function_call'&&p.name==='spawn_agent'){
      try {
        const a=JSON.parse(p.arguments);
        natives.push({task_exact:a.task_name===task,fork:a.fork_turns==='none',
          omitted_model:!Object.hasOwn(a,'model'),omitted_effort:!Object.hasOwn(a,'reasoning_effort')});
      }catch{}
    }
  }
  return {linked,completed,markerReturned,tokens,contexts,natives};
}
try {
  const login = spawnSync(codex,['login','status'],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
  check(login.status===0 && /logged in using ChatGPT/i.test((login.stdout??'')+'\n'+(login.stderr??'')),'interactive_codex_login_missing');
  report.codex=execFileSync(codex,['--version'],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
  report.checked.push('codex_chatgpt_login_available');
  protectNewWindowsPrivateDirectory(tmp,{timeoutMs:30000});
  safeWrite(policy,{schema_version:2,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',
    enabled:true,state_directory:tmp,transmission:'excerpt'},'wx');
  const hostConfig = join(home,'config.toml');
  const mcp = existsSync(hostConfig) ? parse(readFileSync(hostConfig,'utf8')).mcp_servers ?? {} : {};
  check(mcp.aptly,'aptly_registration_missing');
  const config={
    'mcp_servers.aptly.command':process.execPath,
    'mcp_servers.aptly.args':[product],
    'mcp_servers.aptly.startup_timeout_sec':45,
    'agents.max_threads':1,'agents.max_depth':1,
  };
  // Do not attach unrelated user-configured MCP tools to the synthetic thread.
  for(const name of Object.keys(mcp)){
    if(name!=='aptly'){
      check(/^[A-Za-z0-9_-]+$/.test(name),'unexpected_mcp_name_in_profile');
      config['mcp_servers.'+name+'.enabled']=false;
    }
  }
  for(const [k,v] of Object.entries({
    ROUTER_PROVIDER:'decisions',APTLY_HOOK_POLICY_PATH:policy,ROUTER_LEDGER_PATH:ledger,
    APTLY_SECRET_BACKEND:'os',APTLY_SECRET_CLIENT:'codex',
    APTLY_MAX_DAILY_CALLS:'1',APTLY_MAX_TOTAL_CALLS:'1',
    APTLY_CODEX_MODELS:JSON.stringify([model]),APTLY_CLAUDE_MODELS:'[]',
  }))config['mcp_servers.aptly.env.'+k]=v;
  const {rpc,send,bindParent,waitTurn}=openHost(config);
  await rpc('initialize',{clientInfo:{name:'aptly-windows-live-mvp',version:'1'},capabilities:{experimentalApi:true}});
  send({method:'initialized'});
  const {thread}=await rpc('thread/start',{cwd:tmp,model:'gpt-6.2-sol',approvalPolicy:'never',sandbox:'read-only'});
  bindParent(thread.id);
  const {data}=await rpc('mcpServerStatus/list',{threadId:thread.id,serverName:'aptly',detail:'toolsAndAuthOnly'});
  const server=data.find(s=>s.name==='aptly');
  report.codex_mcp=server?.runtimeStatus??'unknown';
  if(server?.toolsError)report.codex_catalog_diagnostics=diagnostic(server.toolsError);
  check(server?.runtimeStatus==='connected'&&Object.hasOwn(server.tools??{},'get_routing_capabilities'),'codex_decisions_mcp_not_connected');
  report.checked.push('codex_decisions_mcp_connected');
  const cap=unpack(await rpc('mcpServer/tool/call',{threadId:thread.id,server:'aptly',tool:'get_routing_capabilities',arguments:{}}));
  report.credential_status=cap?.credential_status??'unknown';
  check(cap?.provider==='decisions'&&cap.credential_status==='os_store','credential_manager_key_not_loaded');
  report.checked.push('credential_manager_key_loaded');
  const listed=await rpc('hooks/list',{threadId:thread.id});
  report.hooks=listed.data.flatMap(s=>s.hooks??[]).filter(h=>h.server==='aptly'&&h.tool==='route_spawn_hook'&&h.eventName==='preToolUse').map(h=>({enabled:h.enabled,trust:h.trustStatus}));
  check(report.hooks.some(h=>h.enabled&&h.trust==='trusted'),'aptly_hook_review_required');
  report.checked.push('aptly_hook_enabled_and_trusted');
  if(mvp){
    startLookup=Date.now();
    const result=waitTurn();
    let timer;
    try{
      await rpc('turn/start',{threadId:thread.id,effort:'low',input:[{type:'text',text:
        'Run a bounded test and delegate the synthetic work once using native spawn_agent. Use task_name '+task+
        ' and fork_turns none. Omit model, reasoning_effort, role, and all other optional fields. Send the child this task: '+
        'Sort the supplied values [3, 1, 2] and return [1, 2, 3] plus the exact marker '+marker+
        '. Do not use tools, files or network, or spawn another agent. Wait for the child to finish. If blocked, stop without retrying or specifying model or effort. Do not use any MCP calls manually or change settings.'}]});
      report.parent_turn=await Promise.race([result,new Promise(done=>{timer=setTimeout(()=>done('timeout'),150000);})]);
      check(report.parent_turn==='completed','parent_turn_incomplete');
    }finally{if(timer)clearTimeout(timer);}
    const db=new DatabaseSync(join(home,'state_5.sqlite'),{readOnly:true});
    try{
      const p=db.prepare('SELECT rollout_path FROM threads WHERE id=?').get(thread.id);
      check(p?.rollout_path,'parent_rollout_unavailable');
      report.original_spawns=readRollout(p.rollout_path,thread.id).natives;
      const rows=db.prepare('SELECT id, rollout_path FROM threads WHERE cwd=? AND created_at>=?').all(tmp,Math.floor(startLookup/1000)-5);
      for(const item of rows){
        if(item.id===thread.id||!item.rollout_path)continue;
        const c=readRollout(item.rollout_path,thread.id);
        if(c.linked)report.children.push({contexts:c.contexts,completed:c.completed,marker_returned:c.markerReturned,output_tokens:c.tokens});
      }
    }finally{db.close();}
  }
} catch(e) {
  failure=e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'windows_live_validation_failed';
} finally {
  if(proc){
    const exited=new Promise(r=>proc.once('close',r));
    proc.stdin.end();
    if(proc.exitCode===null&&proc.signalCode===null){proc.kill();await Promise.race([exited,new Promise(r=>setTimeout(r,3000))]);}
  }
  if(existsSync(ledger)){
    const state=JSON.parse(readFileSync(ledger,'utf8'));
    const records=Object.values(state.requests);
    report.decisions_reservations=state.calls;
    report.completed_decisions_outcomes=records.filter(x=>x.state==='complete'&&typeof x.result?.latency_ms==='number').length;
    report.ledger_outcomes=records.map(x=>({state:x.state,status:x.result?.status,reason:x.result?.reason,
      profile_id:x.result?.profile_id,model:x.result?.profile?.model,effort:x.result?.profile?.reasoning_effort,
      confidence:x.result?.confidence,usage:x.result?.usage}));
  }
  if(mvp&&!failure){
    const original=report.original_spawns?.[0], child=report.children[0], chosen=report.ledger_outcomes?.find(r=>r.status==='recommended');
    if(report.decisions_reservations!==1||report.completed_decisions_outcomes!==1||chosen?.profile_id!=='codex-simple'||chosen.model!==model||chosen.effort!==effort||
       report.original_spawns?.length!==1||!original.task_exact||!original.fork||!original.omitted_model||!original.omitted_effort||
       report.children.length!==1||!child.completed||!child.marker_returned||child.output_tokens<=0||
       !child.contexts.some(c=>c.model===model&&c.effort===effort))failure='native_application_not_verified';
  }
  if(!mvp&&report.decisions_reservations!==0)failure='unexpected_preflight_dispatch';
  rmSync(tmp,{recursive:true,force:true,maxRetries:3});
  report.passed=!failure;
  report.failure=failure;
  report.temporary_state_cleaned=true;
  safeWrite(reportFile,report);
  console.log(JSON.stringify(report));
  if(failure)process.exitCode=1;
}
