// Explicit runner-only PoC. No provider requests or model turns.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { release } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
const prefix = process.env.APTLY_WINDOWS_POC_PREFIX;
assert(prefix && process.env.RUNNER_TEMP);
const installed = join(prefix, 'node_modules');
const root = join(installed, 'aptly');
const cli = join(root, 'dist', 'bin', 'aptly.js');
assert(existsSync(cli));
const require = createRequire(join(root, 'package.json'));
const { parse } = require('smol-toml');
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')));
const { loadSecret, deleteSecret } = await import(pathToFileURL(join(root, 'dist', 'src', 'secret-store.js')));
const temp = mkdtempSync(join(process.env.RUNNER_TEMP, 'aptly-host-poc-'));
const home = join(temp, '한글 User Home');
const project = join(temp, 'Aptly Test Project');
const codexHome = join(home, '.codex');
mkdirSync(codexHome, { recursive: true });
mkdirSync(project);
const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: codexHome,
  DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  APTLY_NO_UPDATE_NOTIFIER: '1' };
for (const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CONFIG_DIR','ROUTER_PROVIDER',
  'ROUTER_LEDGER_PATH','APTLY_SECRET_BACKEND','APTLY_SECRET_CLIENT','APTLY_MODEL_INFO_PATH']) delete env[key];
const synthetic = 'sk-synthetic-poc-' + randomUUID();
const hosts = ['codex', 'claude'];
const account = client => ({ account: client + ':OPENAI_API_KEY' });
const report = { os_release: release(), arch: process.arch, node: process.version, aptly: '0.1.19', completed: [],
  host_models_run: 0, decisions_requests: 0 };
const record = phase => {report.completed.push(phase); console.log(JSON.stringify({ phase, result: 'passed' }));};
const options = { cwd: project, env, encoding: 'utf8', timeout: 90000, stdio: ['pipe','pipe','pipe'] };
function run(command, args, input) {
  return execFileSync(command, args, { ...options, input }).trim();
}
function invoke(args, input, expectedPartial = false) {
  let out;
  try { out = run(process.execPath, [cli, ...args], input); }
  catch (e) {
    if (e.status !== 1 || !e.stdout) throw Error('aptly_cli_unavailable');
    out = e.stdout;
  }
  const result = JSON.parse(out);
  if (result.status !== (expectedPartial ? 'partial' : 'complete')) {
    console.log(JSON.stringify({ command: args.slice(0, 2), status: result.status, codes: result.clients?.map(c => c.codes) }));
    throw Error('aptly_cli_status_mismatch');
  }
  return result;
}
function readRegistration(client) {
  const file = client === 'codex' ? join(codexHome, 'config.toml') : join(home, '.claude.json');
  if (!existsSync(file)) return { file, text: '', data: undefined };
  const text = readFileSync(file, 'utf8');
  return { file, text, data: client === 'codex' ? parse(text).mcp_servers?.aptly : JSON.parse(text).mcpServers?.aptly };
}
function executable(scope, packageName, name) {
  const top = join(installed, scope);
  const bin = readdirSync(top, { recursive: true, withFileTypes: true }).find(entry =>
    entry.name === name && entry.isFile() && entry.parentPath.split(/[\\/]/).includes(packageName));
  assert(bin, 'native_client_binary_missing');
  return join(bin.parentPath, bin.name);
}
async function sdkProbe(entry, host) {
  const transport = new StdioClientTransport({ command: entry.command, args: entry.args,
    cwd: project, env: { ...env, ...entry.env }, stderr: 'pipe' });
  const mcp = new Client({ name: 'aptly-windows-host-probe', version: '1' });
  try {
    await mcp.connect(transport, {timeout: 20000});
    assert.equal(mcp.getServerVersion()?.version, '0.1.19');
    const {tools} = await mcp.listTools({}, {timeout: 15000});
    assert(tools.some(tool => tool.name === 'route_spawn_hook'));
    const result = await mcp.callTool({name: 'get_routing_capabilities', arguments: {}}, undefined, {timeout: 20000});
    assert.notEqual(result.isError,true);
    const status = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.equal(status.provider, 'decisions');
    assert.equal(status.credential_status, 'os_store');
    assert.equal(status.automatic_hook.transmission, 'none');
    assert(status.profiles.some(p => p.id === 'codex-deep-high'));
    record(host + '_registered_mcp_stdio_and_os_credential');
  } finally {
    await mcp.close();
  }
}
function classifyDiagnostic(value) {
  const text = String(value ?? '');
  return [
    [/timed out|timeout/i,'timeout'], [/stdio|process exit|connection closed/i,'stdio_or_exit'],
    [/file not found|os error 2|0x80070002/i,'not_found'],
    [/access is denied|permission denied|os error 5/i,'access_denied'],
    [/unsafe_(?:ledger|directory|path)|private_file_permissions/i,'private_path'],
    [/power(shell| shell)|credential/i,'powershell_or_credential'],
    [/sandbox/i,'sandbox'], [/handshake|initialize/i,'handshake'],
  ].flatMap(([pattern,label])=>pattern.test(text)?[label]:[]);
}
async function codexProbe(binary, seconds) {
  const extra = seconds ? ['-c','mcp_servers.aptly.startup_timeout_sec='+seconds] : [];
  const host = spawn(binary, ['app-server',...extra], { ...options, stdio: ['pipe','pipe','pipe'] });
  const diagnostics = new Set();
  const started = Date.now();
  host.stderr.on('data',chunk=>classifyDiagnostic(chunk.toString()).forEach(tag=>diagnostics.add(tag)));
  let seq = 0;
  const requests = new Map();
  function send(v) { host.stdin.write(JSON.stringify(v) + '\n'); }
  function rpc(method, params) {
    return new Promise((resolve,reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {requests.delete(id);reject(Error('codex_rpc_timeout_'+method.replaceAll('/','_')));}, (seconds ?? 15)*1000+15000);
      requests.set(id,{resolve,reject,timer});
      send({id,method,params});
    });
  }
  host.on('error',()=>{for(const p of requests.values())p.reject(Error('codex_app_server_start_failed'));});
  host.stdin.on('error',()=>{});
  const lines=createInterface({input:host.stdout});
  lines.on('line',s => {
    let v;
    try {v=JSON.parse(s);} catch {return;}
    if (v.id !== undefined && v.method) {
      send({id:v.id,error:{code:-32601,message:'No interactive approvals in this PoC'}});
      return;
    }
    if(v.method==='mcpServer/startupStatus/updated'&&v.params?.name==='aptly'){
      classifyDiagnostic(v.params.error).forEach(tag=>diagnostics.add(tag));
    }
    const pending=requests.get(v.id);
    if (!pending) return;
    requests.delete(v.id);
    clearTimeout(pending.timer);
    if (v.error) pending.reject(Error('codex_rpc_error_'+v.error.code));
    else pending.resolve(v.result);
  });
  try {
    await rpc('initialize', {clientInfo:{name:'aptly-windows-poc',version:'1'},capabilities:{experimentalApi:true}});
    send({method:'initialized'});
    const {thread} = await rpc('thread/start', {cwd:project,ephemeral:true,approvalPolicy:'never',sandbox:'read-only'});
    const {data} = await rpc('mcpServerStatus/list',{threadId:thread.id,serverName:'aptly',detail:'toolsAndAuthOnly'});
    const server = data.find(item=>item.name==='aptly');
    assert(server,'codex_native_mcp_missing');
    if (server.runtimeStatus !== 'connected') {
      classifyDiagnostic(server.toolsError).forEach(tag=>diagnostics.add(tag));
    }
    assert.equal(server.runtimeStatus,'connected','codex_native_mcp_not_connected');
    assert(Object.hasOwn(server.tools,'route_spawn_hook'));
    assert(Object.hasOwn(server.tools,'get_routing_capabilities'));
    record(seconds?'codex_native_host_connected_with_extended_timeout':'codex_native_host_connected');
  } finally {
    console.log(JSON.stringify({phase:'codex_native_mcp_diagnostics',timeout_override_sec:seconds??null,elapsed_ms:Date.now()-started,categories:[...diagnostics]}));
    for (const p of requests.values()) clearTimeout(p.timer);
    lines.close();
    host.stdin.end();
    const closed = new Promise(resolve=>host.once('close',resolve));
    if(host.exitCode===null && host.signalCode===null) {
      host.kill();
      await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,3000))]);
    }
  }
}
let failure;
try {
  for (const client of hosts) assert.equal(loadSecret(account(client)), null, 'preexisting_credential_present');
  const empty = invoke(['set','default']);
  assert.equal(empty.clients.length,2);
  record('installed_cli_set_default');
  invoke(['set','transmission','none']);
  const credential = invoke(['set','env','OPENAI_API_KEY','--stdin'], synthetic+'\n');
  assert(credential.clients.every(c=>c.codes.includes('credential_stored_in_os')));
  record('synthetic_key_registered');
  for (const client of hosts) {
    const registration = readRegistration(client);
    const e = registration.data;
    assert(e && e.args[0] === join(root,'dist','src','server.js'));
    assert(!registration.text.includes(synthetic));
    assert(!e.env.OPENAI_API_KEY);
    assert.equal(e.env.APTLY_SECRET_CLIENT,client);
    assert.equal(loadSecret(account(client)),synthetic);
    await sdkProbe(e,client);
  }
  assert(invoke(['stats','--client','codex'],undefined,true).clients.some(c=>c.status==='statistics_platform_unsupported'||c.codes?.includes('statistics_platform_unsupported')));
  assert(invoke(['setup','--client','codex','--migrate-launcher','--launcher','stable','--dry-run'],undefined,true).clients.some(c=>c.codes?.includes('stable_launcher_platform_unsupported')));
  record('unsupported_features_reported');
  // Claude's top-level launcher is a placeholder until its postinstall runs.
  // Resolve the official platform package directly so lifecycle scripts stay disabled.
  for (const [host,scope,platformPackage,name] of [
    ['codex','@openai','codex-win32-x64','codex.exe'],
    ['claude','@anthropic-ai','claude-code-win32-x64','claude.exe'],
  ]) {
    try {
      const binary = executable(scope,platformPackage,name);
      report[host+'_version']=run(binary,['--version']);
      if (host==='codex') {
        const cfg=JSON.parse(run(binary,['mcp','get','aptly','--json']));
        assert.equal(cfg.name,'aptly');
        record('codex_registration_visible_to_cli');
        try { await codexProbe(binary); }
        catch {
          report.codex_default_connection='failed';
          // Separate startup only. No authentication, model turn or request retry.
          await codexProbe(binary,45);
          report.codex_extended_connection='connected';
        }
      } else {
        const list=run(binary,['mcp','list']);
        assert(/(?:^|\n)aptly:.*connected/im.test(list),'claude_native_mcp_not_connected');
        record('claude_native_host_connected');
      }
    } catch (err) {
      const error=err instanceof Error && /^[a-z_0-9]+$/.test(err.message) ? err.message : 'native_host_probe_failed';
      console.log(JSON.stringify({host,result:'failed',error,exit_status:err.status??null}));
      report[host+'_error']=error;
      failure=error;
    }
  }
  const removed=invoke(['remove']);
  assert.equal(removed.clients.length,2);
  for(const client of hosts) assert.equal(readRegistration(client).data,undefined);
  record('owned_registrations_removed');
} catch (err) {
  failure=err instanceof Error && /^[a-z_0-9]+$/.test(err.message) ? err.message : 'windows_poc_assertion_failed';
} finally {
  for (const client of hosts) {
    if (loadSecret(account(client)) === synthetic) deleteSecret(account(client));
    assert.notEqual(loadSecret(account(client)),synthetic,'synthetic_credential_cleanup_failed');
  }
  rmSync(temp,{recursive:true,force:true,maxRetries:3});
  report.result=failure?'partial':'passed';
  if(failure)report.error=failure;
  report.synthetic_credentials_cleaned=true;
  console.log(JSON.stringify(report));
}
if(failure)process.exitCode=1;
