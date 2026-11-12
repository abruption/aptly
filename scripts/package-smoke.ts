// Test the installed archive outside the checkout, with lifecycle scripts enabled
// but Aptly host setup explicitly disabled. No real host or paid provider is used.
import assert from 'node:assert/strict';
import {systemAliasAllowed} from '../src/files.ts';
import { auditDocumentation, auditGuideContent, collectDocumentation } from './docs-check.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync, lstatSync, readlinkSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

// npm supplies its actual JavaScript entry point, including on Windows.
// Do not pass .cmd shims to execFileSync or construct a shell command string.
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && isAbsolute(npmCli) && basename(npmCli) === 'npm-cli.js',
  'Run this check with npm run test:package');
assert.ok(statSync(npmCli).isFile());
const root = mkdtempSync(join(tmpdir(), 'codex-package smoke-'));
const prefix = join(root, 'installed');
const home = join(root, 'home');
// Deliberately exclude inherited provider keys, host config and NODE_PATH/options.
const networkEnv = Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
const windowsEnv = process.platform === 'win32' ? Object.fromEntries(['SystemRoot','ComSpec','TEMP','TMP'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : [])) : {};
const env = { ...networkEnv, ...windowsEnv, HOME:home, USERPROFILE:home, PATH: process.env.PATH, APTLY_SKIP_SETUP: '1', CI: 'true',
  ROUTER_PROVIDER: 'fixture', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
  npm_config_cache: join(root, 'cache'), npm_config_userconfig: join(root, 'npmrc'),
  npm_config_globalconfig: join(root, 'global-npmrc') };
const run = (command: string, args: string[], cwd: string): string => execFileSync(command, args,
  { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
try {
  mkdirSync(prefix);
  mkdirSync(home,{mode:0o700});
  writeFileSync(env.npm_config_userconfig, 'registry=https://registry.npmjs.org/\n');
  writeFileSync(env.npm_config_globalconfig, '');
  const metadata = JSON.parse(readFileSync('package.json', 'utf8'));
  const packed = JSON.parse(run(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', root], process.cwd()));
  const archive = resolve(root, packed[0].filename);
  assert.equal(archive, join(root, `aptly-${metadata.version}.tgz`));
  run(process.execPath, [npmCli, 'install', '--prefix', prefix, '--no-audit', '--no-fund', '--ignore-scripts=false', archive], prefix);
  const cli = join(prefix, 'node_modules', '.bin', process.platform === 'win32' ? 'aptly.cmd' : 'aptly');
  // POSIX launchers are executable; Windows .cmd wrappers require a shell.
  // Check the generated Windows shim and run its declared JS target via Node.
  if (process.platform === 'win32') assert.ok(statSync(cli).isFile());
  else assert.equal(run(cli, ['--version'], prefix).trim(), metadata.version);
  const installedMetadata = JSON.parse(readFileSync(join(prefix, 'node_modules', 'aptly', 'package.json'), 'utf8'));
  assert.equal(installedMetadata.bin.aptly, 'dist/bin/aptly.js');
  const installedRoot = join(prefix,'node_modules','aptly');
  const installedDocs = collectDocumentation(installedRoot);
  const legacyAnchors = JSON.parse(readFileSync(join(process.cwd(),'test-support','guide-legacy-anchors.json'),'utf8'));
  const documentationErrors = [...auditDocumentation({files:installedDocs,packageFiles:packed[0].files.map((file:{path:string})=>file.path),legacyAnchors}), ...auditGuideContent(installedDocs)];
  assert.deepEqual(documentationErrors, [], 'Installed archive documentation links, anchors and language examples');
  const installedCli = join(prefix, 'node_modules', 'aptly', 'dist', 'bin', 'aptly.js');
  assert.equal(run(process.execPath, ['--no-experimental-strip-types', installedCli, '--version'], prefix).trim(), metadata.version);
  assert.ok(run(process.execPath, [installedCli, 'budget', '--help'], prefix).includes('budget status'));
  // Exercise compiled read queries with a fresh HOME; never inspect the operator's account.
  for(const args of [['stats'],['set','transmission','--show'],['doctor']]){
    const unsupported=args[0]==='stats'&&process.platform==='win32';
    const result=spawnSync(process.execPath,['--no-experimental-strip-types',installedCli,...args],{cwd:prefix,env,encoding:'utf8',timeout:15000});
    assert.equal(result.status,unsupported?1:0,result.stderr);assert.equal(result.stderr,'');
    const view=JSON.parse(result.stdout);assert.equal(view.status,unsupported?'partial':'complete');assert.equal(view.clients.length,2);
  }
  assert.deepEqual(readdirSync(home),[],'Read queries must not create host state');
  // Stable runtime is POSIX opt-in. Never weaken filesystem trust for a test.
  let safeStableHome=process.platform!=='win32';
  if(safeStableHome)for(let path=home;;path=dirname(path)){
    let stat=lstatSync(path);
    if(stat.isSymbolicLink()){
      if(!systemAliasAllowed(path,stat,readlinkSync(path))){safeStableHome=false;break;}
      stat=statSync(path);
    }
    const stickyRoot=stat.isDirectory()&&stat.uid===0&&!!(stat.mode&0o1000);
    if((stat.uid!==0&&stat.uid!==process.getuid?.())||((stat.mode&0o022)&&!stickyRoot)){safeStableHome=false;break;}
    if(dirname(path)===path)break;
  }
  if(safeStableHome){
    const stablePrefix=join(root,'stable-global');mkdirSync(stablePrefix,{mode:0o700});
    run(process.execPath,[npmCli,'install','--global','--prefix',stablePrefix,'--ignore-scripts','--no-audit','--no-fund',archive],prefix);
    const stablePackage=join(stablePrefix,'lib/node_modules/aptly'),stableCli=join(stablePackage,'dist/bin/aptly.js');
    const oldNodeRoot=join(home,'old-node'),oldNode=join(oldNodeRoot,'bin/node'),nextNode=join(home,'.nvm/versions/node','v'+process.versions.node,'bin/node');
    mkdirSync(dirname(oldNode),{recursive:true,mode:0o700});mkdirSync(dirname(nextNode),{recursive:true,mode:0o700});
    copyFileSync(process.execPath,oldNode);chmodSync(oldNode,0o700);copyFileSync(process.execPath,nextNode);chmodSync(nextNode,0o700);
    assert.equal(run(oldNode,['--version'],prefix).trim(),'v'+process.versions.node);
    const directSetup=JSON.parse(run(oldNode,[stableCli,'setup','--client','codex','--transmission','none'],prefix));assert.equal(directSetup.status,'complete');
    const collection=JSON.parse(run(oldNode,[stableCli,'stats','enable','--client','codex'],prefix));assert.equal(collection.status,'complete');
    const preview=JSON.parse(run(oldNode,[stableCli,'setup','--client','codex','--migrate-launcher','--launcher','stable','--dry-run'],prefix));assert.equal(preview.status,'complete');
    assert.ok(!readdirSync(home).includes('.local'),'dry-run must not materialize a runtime');
    const setup=JSON.parse(run(oldNode,[stableCli,'setup','--client','codex','--migrate-launcher','--launcher','stable'],prefix));assert.equal(setup.status,'complete');
    writeFileSync(join(prefix,'stable-smoke.mjs'),`
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {parse} from 'smol-toml';
import {DatabaseSync} from 'node:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const source=process.argv[2],expectedVersion=process.argv[3],oldNode=process.argv[4];
const entry=parse(readFileSync(join(homedir(),'.codex/config.toml'),'utf8')).mcp_servers.aptly;
assert.deepEqual(entry.args,['serve']);assert.ok(!entry.command.startsWith(source));
rmSync(source,{recursive:true});rmSync(oldNode,{recursive:true});
const client=new Client({name:'installed-stable-runtime-smoke',version:'1'});
const transport=new StdioClientTransport({command:entry.command,args:entry.args,env:{...entry.env,PATH:'',ROUTER_PROVIDER:'fixture',NODE_OPTIONS:'--unsupported-injection-fixture'},stderr:'pipe'});
let stderr='';transport.stderr?.on('data',c=>stderr+=c);
try{await client.connect(transport);const r=await client.callTool({name:'get_routing_capabilities',arguments:{}});assert.notEqual(r.isError,true);assert.equal(r.structuredContent.runtime_diagnostics.version,expectedVersion);assert.equal(r.structuredContent.provider,'fixture');}finally{await client.close();}
assert.equal(stderr,'');
const hooks=JSON.parse(readFileSync(join(homedir(),'.codex/hooks.json'),'utf8')).hooks;
const command=hooks.SubagentStart[0].hooks[0].command;assert.ok(command.includes(entry.command));assert.ok(!command.includes(source));assert.ok(!command.includes(oldNode));
const policy=JSON.parse(readFileSync(entry.env.APTLY_HOOK_POLICY_PATH,'utf8')),database=join(policy.state_directory,'stats.sqlite');
const count=()=>{const db=new DatabaseSync(database,{readOnly:true});try{return db.prepare('SELECT count(*) AS n FROM children').get().n;}finally{db.close();}};
const before=count();
const observe=spawnSync('/bin/sh',['-c',command],{input:JSON.stringify({hook_event_name:'SubagentStart',session_id:'fixture-parent',agent_id:'fixture-child'}),env:{HOME:homedir(),PATH:'',NODE_OPTIONS:'--unsupported-injection-fixture'},encoding:'utf8',timeout:5000});
assert.equal(observe.status,0);assert.equal(observe.stdout,'');assert.equal(observe.stderr,'');assert.equal(count(),before+1);
console.log('Stable smoke: a qualified fallback served MCP and the registered shell observer recorded one fixture event; manager-specific selection is not inferred.');
`);
    run(process.execPath,['--no-experimental-strip-types',join(prefix,'stable-smoke.mjs'),stablePackage,metadata.version,oldNodeRoot],prefix);
    console.log('Installed tarball: stable generation MCP/observer survived original Node-copy and global package removal with empty PATH; paid calls: 0.');
  }else console.log('Stable runtime executable smoke skipped: unsupported platform or writable temporary-root ancestry; trust was not relaxed.');
  // Resolve all imports from the installed prefix, not this source tree.
  writeFileSync(join(prefix, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { createServer } from 'aptly';
import * as provenance from 'aptly/provenance';
import * as inspect from 'aptly/inspect';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
assert.equal(typeof createServer, 'function');
assert.ok(Object.keys(provenance).length > 0);
assert.ok(Object.keys(inspect).length > 0);
const client = new Client({name:'installed-package-smoke',version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,
  args:['--no-experimental-strip-types', process.argv[2], 'serve'],
  env:{ROUTER_PROVIDER:'fixture',OPENAI_API_KEY:'',APTLY_SKIP_SETUP:'1'},stderr:'pipe'});
let stderr = '';
transport.stderr?.on('data', chunk => stderr += chunk);
try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map(tool => tool.name);
  assert.ok(names.includes('recommend_agent'));
  const capabilities = (await client.callTool({name:'get_routing_capabilities',arguments:{}})).structuredContent;
  assert.equal(capabilities.runtime_diagnostics.version, '${metadata.version}');
  assert.equal(capabilities.runtime_diagnostics.context_retries.remaining,128);
  assert.equal(capabilities.budget_configuration.limits.max_daily_calls,200);
  assert.equal(capabilities.budget_configuration.limits.max_total_calls,0);
  assert.equal(capabilities.budget_configuration.limits.max_estimated_usd,0);
  assert.equal(capabilities.budget_configuration.limits.estimated_call_usd,0.002);
  const args = {request_id:'installed-smoke',client:'codex',task:{
    summary:'Sort the synthetic numbers 3, 1, 2.',operation:'analysis',context_sufficient:true}};
  const first = (await client.callTool({name:'recommend_agent',arguments:args})).structuredContent;
  assert.equal(first.status,'recommended'); assert.equal(first.provider,'fixture');
  assert.equal(first.profile_id,'codex-simple');
  const cached = (await client.callTool({name:'recommend_agent',arguments:args})).structuredContent;
  assert.equal(cached.cached,true);
} finally { await client.close(); }
assert.equal(stderr,'');
`);
  run(process.execPath, ['--no-experimental-strip-types', join(prefix, 'smoke.mjs'), installedCli], prefix);
  console.log('Installed tarball: documentation navigation and contents passed.');
  console.log('Installed tarball: CLI/query status, compiled exports, fixture MCP and cache passed; paid calls: 0.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
