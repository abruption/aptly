// Test the installed archive outside the checkout, with lifecycle scripts enabled
// but Aptly host setup explicitly disabled. No real host or paid provider is used.
import assert from 'node:assert/strict';
import { auditDocumentation, auditGuideContent, collectDocumentation } from './docs-check.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';

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
