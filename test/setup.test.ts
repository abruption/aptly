import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, chmodSync, symlinkSync, readdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { setupHosts, removeSetup, setDefaults, setEnvironment, setCredentialReference, migrateLauncher, configurableEnvironmentKeys } from '../src/setup.ts';
import { createTestTemp } from '../test-support/temp.ts';
const save = (path, value) => writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
const load = path => JSON.parse(readFileSync(path, 'utf8'));
const fixture = t => { const home = createTestTemp(t, 'codex-setup-test-'); return { home, env: {}, packageRoot: join(home, 'npm', 'aptly') }; };
const result = (value, client) => value.clients.find(c => c.client === client);

test('explicit setup registers both hosts with private policy, no trust bypass or copied credential', t => {
  const options = fixture(t); options.env = { ROUTER_PROVIDER: 'fixture', OPENAI_API_KEY: 'never-copy-this-value' };
  const installed = setupHosts(options);
  assert.equal(installed.status, 'complete');
  assert.equal(result(installed, 'codex').requires_hook_review, true);
  const codex = parse(readFileSync(join(options.home, '.codex', 'config.toml'), 'utf8'));
  const claude = load(join(options.home, '.claude.json'));
  for (const server of [codex.mcp_servers.aptly, claude.mcpServers.aptly]) {
    assert.equal(server.command, process.execPath);
    assert.deepEqual(server.args, [join(options.packageRoot, 'dist', 'src', 'server.js')]);
    assert.equal(server.env.ROUTER_PROVIDER, 'fixture');
    assert.equal(server.env.OPENAI_API_KEY, undefined);
  }
  assert.deepEqual(codex.mcp_servers.aptly.env_vars, ['OPENAI_API_KEY']);
  for (const name of ['.codex', '.claude']) {
    const dir = join(options.home, name), privateDir = join(dir, 'aptly'), policyPath = join(privateDir, 'auto-policy.json');
    assert.deepEqual(load(policyPath), { schema_version: 1, kind: 'aptly-auto-hook', mode: 'defaults', issuer: 'operator_installation', enabled: true, state_directory: join(privateDir, 'state') });
    for (const p of [privateDir, join(privateDir, 'state')]) assert.equal(statSync(p).mode & 0o777, 0o700);
    assert.equal(statSync(policyPath).mode & 0o777, 0o600);
    assert.equal(statSync(join(privateDir, 'setup-ownership.json')).mode & 0o777, 0o600);
    const hooks = load(join(dir, name === '.codex' ? 'hooks.json' : 'settings.json'));
    assert.equal(hooks.hooks.PreToolUse.length, 1);
    const entry = hooks.hooks.PreToolUse[0], hook = entry.hooks[0];
    assert.equal(entry.matcher, name === '.codex' ? '^(spawn_agent|collaborationspawn_agent|Agent)$' : '^Agent$');
    assert.deepEqual({ type: hook.type, server: hook.server, tool: hook.tool, timeout: hook.timeout }, { type: 'mcp_tool', server: 'aptly', tool: 'route_spawn_hook', timeout: 20 });
    assert.equal(hook.input.event.tool_input, '${tool_input}');
    const owned = readFileSync(join(privateDir, 'setup-ownership.json'), 'utf8');
    assert.doesNotMatch(owned, /never-copy-this-value|trusted_hash|disable.*trust/);
  }
  assert.deepEqual(setupHosts(options).clients.map(c => c.status), ['unchanged', 'unchanged']);
});

test('existing launchers, secrets, unknown settings, hooks and TOML comments are preserved', t => {
  const options = fixture(t), codexDir = join(options.home, '.codex'), claudeDir = join(options.home, '.claude');
  mkdirSync(codexDir); mkdirSync(claudeDir);
  const original = '# user comment\nmodel = "keep-model"\n[features]\nhooks = true\n[mcp_servers.aptly]\ncommand = "/credential-launcher"\nargs = ["--user"]\n[mcp_servers.aptly.env]\nSECRET = "existing-secret"\n[mcp_servers.other]\ncommand = "other"\n';
  save(join(codexDir, 'config.toml'), original);
  save(join(codexDir, 'hooks.json'), { unknown: 12, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }], PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo check' }] }] } });
  save(join(options.home, '.claude.json'), { oauthAccount: { opaque: 'preserve' }, mcpServers: { aptly: { command: '/credential-launcher', args: ['--claude'], env: { SECRET: 'existing-secret' }, unknown: 42 }, unrelated: { command: 'other' } } });
  save(join(claudeDir, 'settings.json'), { permissions: { deny: ['Bash(rm *)'] }, unknown: { a: 1 }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo safe' }] }] } });
  assert.equal(setupHosts(options).status, 'complete');
  const text = readFileSync(join(codexDir, 'config.toml'), 'utf8');
  assert.ok(text.startsWith(original.slice(0, original.indexOf('[mcp_servers.other]'))));
  assert.ok(text.includes('[mcp_servers.other]\ncommand = "other"\n'));
  const server = parse(text).mcp_servers.aptly;
  assert.equal(server.command, '/credential-launcher'); assert.deepEqual(server.args, ['--user']); assert.equal(server.env.SECRET, 'existing-secret');
  const claude = load(join(options.home, '.claude.json'));
  assert.deepEqual(claude.oauthAccount, { opaque: 'preserve' }); assert.equal(claude.mcpServers.aptly.unknown, 42);
  assert.equal(claude.mcpServers.aptly.command, '/credential-launcher'); assert.equal(claude.mcpServers.aptly.env.SECRET, 'existing-secret');
  assert.deepEqual(load(join(claudeDir, 'settings.json')).permissions, { deny: ['Bash(rm *)'] });
  assert.equal(load(join(codexDir, 'hooks.json')).unknown, 12);
  for (const dir of [codexDir, claudeDir]) assert.doesNotMatch(readFileSync(join(dir, 'aptly', 'setup-ownership.json'), 'utf8'), /existing-secret|oauthAccount|credential-launcher/);
  assert.equal(removeSetup(options).status, 'complete');
  assert.deepEqual(parse(readFileSync(join(codexDir, 'config.toml'), 'utf8')), parse(original));
  assert.equal(load(join(options.home, '.claude.json')).mcpServers.aptly.env.APTLY_HOOK_POLICY_PATH, undefined);
  assert.equal(load(join(codexDir, 'hooks.json')).hooks.PreToolUse.length, 1);
});

test('automatic install skips CI, opt-out and absent host homes without creating directories', t => {
  for (const env of [{ CI: 'true' }, { APTLY_SKIP_SETUP: '1' }, {}]) {
    const options = { ...fixture(t), automatic: true, env };
    assert.equal(setupHosts(options).status, 'skipped'); assert.deepEqual(readdirSync(options.home), []);
  }
  const options = { ...fixture(t), automatic: true };
  mkdirSync(join(options.home, '.codex'));
  const installed = setupHosts(options);
  assert.equal(result(installed, 'codex').status, 'configured'); assert.equal(result(installed, 'claude').status, 'skipped');
  assert.equal(existsSync(join(options.home, '.claude')), false);
});

test('custom configuration roots follow each host contract and advisory mode is explicit', t => {
  const options = fixture(t), codex = join(options.home, 'codex-custom'), claude = join(options.home, 'claude-custom');
  options.env = { CODEX_HOME: codex, CLAUDE_CONFIG_DIR: claude, ROUTER_PROVIDER: 'decisions' };
  assert.equal(setupHosts({ ...options, mode: 'advisory' }).status, 'complete');
  assert.equal(existsSync(join(claude, '.claude.json')), true); assert.equal(existsSync(join(options.home, '.claude.json')), false);
  assert.equal(load(join(codex, 'aptly', 'auto-policy.json')).mode, 'advisory');
  assert.equal(load(join(claude, '.claude.json')).mcpServers.aptly.env.ROUTER_PROVIDER, 'decisions');
  assert.equal(removeSetup(options).status, 'complete');
});

test('invalid or conflicting configuration fails the whole affected host before any writes', t => {
  for (const [file, value, code] of [
    ['config.toml', 'not = [valid', 'invalid_toml'],
    ['hooks.json', '{bad', 'invalid_json'],
    ['config.toml', '[mcp_servers.aptly]\ncommand="keep"\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH="/elsewhere"\n', 'mcp_environment_conflict'],
    ['config.toml', 'mcp_servers = { aptly = { command = "keep", env = { SOME = "value" } } }\n', 'unsupported_toml_layout'],
  ]) {
    const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'); mkdirSync(dir); save(join(dir, file), value);
    const installed = setupHosts(options);
    assert.equal(installed.status, 'partial');
    assert.equal(installed.clients[0].codes[0], code);
    assert.equal(readFileSync(join(dir, file), 'utf8'), value); assert.equal(existsSync(join(dir, 'aptly')), false);
    assert.deepEqual(readdirSync(dir), [file]);
  }
});

test('unowned existing routing hook and relative overrides refuse without modifying settings', t => {
  const options = { ...fixture(t), clients: ['claude'] }, dir = join(options.home, '.claude'); mkdirSync(dir);
  const initial = { hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'mcp_tool', server: 'aptly', tool: 'route_spawn_hook' }] }] } };
  save(join(dir, 'settings.json'), initial);
  assert.equal(setupHosts(options).clients[0].codes[0], 'existing_routing_hook_conflict');
  assert.deepEqual(load(join(dir, 'settings.json')), initial); assert.equal(existsSync(join(options.home, '.claude.json')), false);
  assert.equal(setupHosts({ ...options, env: { CLAUDE_CONFIG_DIR: 'relative' } }).clients[0].codes[0], 'relative_configuration_directory');
});

test('setup refuses symlinks, world-readable policy files and unsafe private directories', t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'); mkdirSync(dir);
  const elsewhere = join(options.home, 'unrelated'); save(elsewhere, '{}'); symlinkSync(elsewhere, join(dir, 'hooks.json'));
  assert.equal(setupHosts(options).clients[0].codes[0], 'unsafe_symlink'); assert.equal(readFileSync(elsewhere, 'utf8'), '{}');
  const safe = { ...fixture(t), clients: ['codex'] }; setupHosts(safe);
  const policy = join(safe.home, '.codex', 'aptly', 'auto-policy.json'); chmodSync(policy, 0o644);
  assert.equal(setupHosts(safe).clients[0].codes[0], 'private_file_permissions');
  chmodSync(policy, 0o600); chmodSync(join(safe.home, '.codex', 'aptly'), 0o755);
  // A changed policy will require writes, and an unsafe parent must stop them.
  const manifest = join(safe.home, '.codex', 'aptly', 'setup-ownership.json');
  const before = readFileSync(manifest, 'utf8');
  assert.equal(removeSetup(safe).clients[0].codes[0], 'private_directory_permissions');
  assert.equal(existsSync(policy), true); assert.ok(before.length > 0);
});

test('safe removal deletes only exact owned hook/MCP and refuses later user changes', t => {
  const options = { ...fixture(t), clients: ['claude'] }; setupHosts(options);
  const mcpPath = join(options.home, '.claude.json'), mcp = load(mcpPath); mcp.mcpServers.aptly.command = '/user-replaced'; save(mcpPath, mcp);
  assert.equal(removeSetup(options).clients[0].codes[0], 'managed_mcp_changed');
  assert.equal(load(mcpPath).mcpServers.aptly.command, '/user-replaced');
  assert.equal(load(join(options.home, '.claude', 'settings.json')).hooks.PreToolUse.length, 1);
  assert.equal(existsSync(join(options.home, '.claude', 'aptly', 'auto-policy.json')), true);
  const clean = { ...fixture(t), clients: ['codex'] }; setupHosts(clean);
  assert.equal(removeSetup(clean).clients[0].status, 'removed');
  assert.equal(parse(readFileSync(join(clean.home, '.codex', 'config.toml'), 'utf8')).mcp_servers?.aptly, undefined);
  assert.equal(removeSetup(clean).clients[0].codes[0], 'no_owned_setup');
});

test('commit failure rolls back only unchanged owned writes and removes atomic staging files', t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'); mkdirSync(dir);
  const source = '# untouched\nmodel = "keep"\n'; save(join(dir, 'config.toml'), source);
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => { if (String(to).endsWith('hooks.json')) throw new Error('simulated failure with secret'); return rename(from, to); };
    syncBuiltinESMExports();
    const installed = setupHosts(options);
    assert.deepEqual(installed.clients[0].codes, ['configuration_io_error']);
    assert.equal(readFileSync(join(dir, 'config.toml'), 'utf8'), source);
    assert.deepEqual(readdirSync(dir), ['config.toml']);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('a newly created config is removed when a later hook write fails', t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml');
  mkdirSync(dir); save(join(dir, 'unrelated'), 'preserve');
  const rename = fs.renameSync; let committed = false;
  try {
    fs.renameSync = (from, to) => {
      if (String(to).endsWith('hooks.json')) { assert.equal(committed, true); assert.equal(existsSync(config), true); throw new Error('synthetic hook failure'); }
      const result = rename(from, to); if (to === config) committed = true; return result;
    };
    syncBuiltinESMExports();
    assert.deepEqual(setupHosts(options).clients[0].codes, ['configuration_io_error']);
    assert.equal(existsSync(config), false);
    assert.deepEqual(readdirSync(dir), ['unrelated']);
    assert.equal(readFileSync(join(dir, 'unrelated'), 'utf8'), 'preserve');
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('rollback preserves another writer replacing a newly created config', t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml');
  mkdirSync(dir); const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (String(to).endsWith('hooks.json')) { assert.equal(existsSync(config), true); save(config, 'model = "concurrent"\n'); throw new Error('synthetic hook failure'); }
      return rename(from, to);
    };
    syncBuiltinESMExports();
    assert.deepEqual(setupHosts(options).clients[0].codes, ['configuration_io_error', 'rollback_concurrent_change']);
    assert.equal(readFileSync(config, 'utf8'), 'model = "concurrent"\n');
    assert.deepEqual(readdirSync(dir), ['config.toml']);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('POSIX permissions are prepared before replacement, including the former target chmod failure', { skip: process.platform === 'win32' }, t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml');
  mkdirSync(dir); save(config, 'model = "synthetic-original"\n'); chmodSync(config, 0o644);
  const chmod = fs.chmodSync; let targetCalls = 0, stageCalls = 0;
  try {
    fs.chmodSync = (path, mode) => { if (path === config) { targetCalls++; throw new Error('synthetic target chmod failure'); } if (String(path).includes('.aptly-stage-')) stageCalls++; return chmod(path, mode); };
    syncBuiltinESMExports();
    assert.equal(setupHosts(options).status, 'complete');
    assert.equal(targetCalls, 0); assert.ok(stageCalls > 0);
    assert.equal(statSync(config).mode & 0o777, 0o644);
  } finally { fs.chmodSync = chmod; syncBuiltinESMExports(); }
});

test('POSIX stage permission failure leaves the original content and mode intact', { skip: process.platform === 'win32' }, t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml'), source = 'model = "original"\n';
  mkdirSync(dir); save(config, source); chmodSync(config, 0o644);
  const chmod = fs.chmodSync;
  try {
    fs.chmodSync = (path, mode) => { if (String(path).includes('.aptly-stage-')) throw new Error('synthetic chmod failure'); return chmod(path, mode); };
    syncBuiltinESMExports();
    assert.deepEqual(setupHosts(options).clients[0].codes, ['configuration_io_error']);
    assert.equal(readFileSync(config, 'utf8'), source); assert.equal(statSync(config).mode & 0o777, 0o644);
    assert.deepEqual(readdirSync(dir), ['config.toml']);
  } finally { fs.chmodSync = chmod; syncBuiltinESMExports(); }
});

for (const operation of ['setup', 'defaults', 'environment', 'migration', 'removal']) test(`${operation} rolls back a committed file with its POSIX mode after a later write fails`, { skip: process.platform === 'win32' }, t => {
  const options = { ...fixture(t), clients: ['codex'], env: { ROUTER_PROVIDER: 'fixture' } }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml');
  mkdirSync(dir); save(config, 'model = "original"\n');
  if (operation !== 'setup') assert.equal(setupHosts(options).status, 'complete');
  chmodSync(config, 0o644); const before = readFileSync(config, 'utf8');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => { if (String(to).endsWith(operation === 'setup' || operation === 'removal' ? 'hooks.json' : 'setup-ownership.json')) throw new Error('synthetic later failure'); return rename(from, to); };
    syncBuiltinESMExports();
    const outcome = operation === 'setup' ? setupHosts(options) : operation === 'defaults' ? setDefaults(options) : operation === 'environment' ? setEnvironment('ROUTER_PROVIDER', 'decisions', options) : operation === 'migration' ? migrateLauncher({ ...options, packageRoot: resolve('.') }) : removeSetup(options);
    assert.deepEqual(outcome.clients[0].codes, ['configuration_io_error']);
    assert.equal(readFileSync(config, 'utf8'), before); assert.equal(statSync(config).mode & 0o777, 0o644);
    assert.equal(readdirSync(dir).some(name => name.startsWith('.aptly-stage-')), false);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('rollback reports an I/O failure separately from a concurrent change', t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml');
  mkdirSync(dir); save(config, 'model = "before"\n'); const rename = fs.renameSync; let configWrites = 0;
  try {
    fs.renameSync = (from, to) => { if (to === config && ++configWrites === 2) throw new Error('synthetic rollback failure'); if (String(to).endsWith('hooks.json')) throw new Error('synthetic commit failure'); return rename(from, to); };
    syncBuiltinESMExports();
    assert.deepEqual(setupHosts(options).clients[0].codes, ['configuration_io_error', 'rollback_failed']);
    assert.match(readFileSync(config, 'utf8'), /mcp_servers\.aptly/);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('rollback does not overwrite another writer changing only permissions', { skip: process.platform === 'win32' }, t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'), config = join(dir, 'config.toml');
  mkdirSync(dir); save(config, 'model = "before"\n'); const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => { if (String(to).endsWith('hooks.json')) { chmodSync(config, 0o644); throw new Error('synthetic commit failure'); } return rename(from, to); };
    syncBuiltinESMExports();
    assert.deepEqual(setupHosts(options).clients[0].codes, ['configuration_io_error', 'rollback_concurrent_change']);
    assert.equal(statSync(config).mode & 0o777, 0o644); assert.match(readFileSync(config, 'utf8'), /mcp_servers\.aptly/);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});

test('rollback leaves another writer change intact and reports sanitized conflict', t => {
  const options = { ...fixture(t), clients: ['codex'] }, dir = join(options.home, '.codex'); mkdirSync(dir);
  save(join(dir, 'config.toml'), 'model="before"\n');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (String(to).endsWith('hooks.json')) { save(join(dir, 'config.toml'), 'model="concurrent"\n'); throw new Error('private detail'); }
      return rename(from, to);
    };
    syncBuiltinESMExports();
    const installed = setupHosts(options);
    assert.deepEqual(installed.clients[0].codes, ['configuration_io_error', 'rollback_concurrent_change']);
    assert.equal(readFileSync(join(dir, 'config.toml'), 'utf8'), 'model="concurrent"\n');
    assert.equal(readdirSync(dir).some(name => name.startsWith('.aptly-stage')), false);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
});


test('an existing custom ledger path remains operator-owned and is never copied to receipts', t => {
  const options = { ...fixture(t), clients: ['claude'] }, dir = join(options.home, '.claude'); mkdirSync(dir);
  save(join(options.home, '.claude.json'), { mcpServers: { aptly: { command: '/launcher', env: { ROUTER_LEDGER_PATH: '/operator/existing-ledger.json' } } } });
  assert.equal(setupHosts(options).status, 'complete');
  assert.equal(load(join(options.home, '.claude.json')).mcpServers.aptly.env.ROUTER_LEDGER_PATH, '/operator/existing-ledger.json');
  assert.doesNotMatch(readFileSync(join(dir, 'aptly', 'setup-ownership.json'), 'utf8'), /operator\/existing-ledger/);
  assert.equal(removeSetup(options).status, 'complete');
  assert.deepEqual(load(join(options.home, '.claude.json')).mcpServers.aptly.env, { ROUTER_LEDGER_PATH: '/operator/existing-ledger.json' });
});

test('new MCP entries use decisions by default without reading or storing key values', t => {
  const options = { ...fixture(t), clients: ['codex'] };
  assert.equal(setupHosts(options).status, 'complete');
  const config = parse(readFileSync(join(options.home, '.codex', 'config.toml'), 'utf8'));
  assert.equal(config.mcp_servers.aptly.env.ROUTER_PROVIDER, 'decisions');
  assert.deepEqual(Object.keys(config.mcp_servers.aptly.env).sort(), ['APTLY_HOOK_POLICY_PATH', 'ROUTER_LEDGER_PATH', 'ROUTER_PROVIDER']);
});


test('removal preserves an identical policy that already belonged to the operator', t => {
  const options = { ...fixture(t), clients: ['claude'] }, dir = join(options.home, '.claude'), privateDir = join(dir, 'aptly'), state = join(privateDir, 'state');
  mkdirSync(dir); mkdirSync(privateDir, { mode: 0o700 }); mkdirSync(state, { mode: 0o700 });
  const policy = { schema_version: 1, kind: 'aptly-auto-hook', mode: 'defaults', issuer: 'operator_installation', enabled: true, state_directory: state };
  save(join(privateDir, 'auto-policy.json'), policy);
  assert.equal(setupHosts(options).status, 'complete');
  assert.equal(removeSetup(options).status, 'complete');
  assert.deepEqual(load(join(privateDir, 'auto-policy.json')), policy);
});

const servers = options => [
  parse(readFileSync(join(options.home,'.codex/config.toml'),'utf8')).mcp_servers.aptly,
  load(join(options.home,'.claude.json')).mcpServers.aptly,
];
test('set default creates both full registrations, fills public defaults and stays removable', t => {
  const options=fixture(t);
  assert.equal(setDefaults(options).status,'complete');
  for(const entry of servers(options)) {
    assert.equal(entry.env.ROUTER_PROVIDER,'decisions');
    assert.deepEqual(JSON.parse(entry.env.APTLY_CLAUDE_MODELS),['haiku','sonnet','opus']);
    assert.deepEqual(JSON.parse(entry.env.APTLY_CODEX_MODELS),['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol']);
  }
  assert.deepEqual(setDefaults(options).clients.map(c=>c.status),['unchanged','unchanged']);
  assert.equal(removeSetup(options).status,'complete');
});
test('set default preserves custom candidates, provider, command, environment whitelist and aliases', t => {
  const options=fixture(t);mkdirSync(join(options.home,'.codex'));mkdirSync(join(options.home,'.claude'));
  save(join(options.home,'.codex/config.toml'),'# user comment\n[mcp_servers.aptly]\ncommand="custom-launcher"\nargs=[]\nenv_vars=["SSH_AUTH_SOCK"]\n[mcp_servers.aptly.env]\nROUTER_PROVIDER="fixture"\nCLAUDE_MODELS=\'["opus"]\'\nAPTLY_CODEX_MODELS=\'["gpt-6.1-sol"]\'\n');
  save(join(options.home,'.claude.json'),{mcpServers:{aptly:{command:'custom-launcher',args:[],env:{ROUTER_PROVIDER:'fixture',CLAUDE_MODELS:'["opus"]',APTLY_CODEX_MODELS:'["gpt-6.1-sol"]'}}}});
  assert.equal(setDefaults(options).status,'complete');
  for(const entry of servers(options)) {assert.equal(entry.command,'custom-launcher');assert.equal(entry.env.ROUTER_PROVIDER,'fixture');assert.equal(entry.env.CLAUDE_MODELS,'["opus"]');assert.equal(entry.env.APTLY_CLAUDE_MODELS,undefined);assert.equal(entry.env.APTLY_CODEX_MODELS,'["gpt-6.1-sol"]');}
  assert.deepEqual(servers(options)[0].env_vars,['SSH_AUTH_SOCK']);
  assert.match(readFileSync(join(options.home,'.codex/config.toml'),'utf8'),/^# user comment/);
  assert.equal(removeSetup(options).status,'complete');
});
test('set env updates an owned registration and its removal receipt without copying secrets', t => {
  const options=fixture(t);setupHosts(options);
  assert.equal(setEnvironment('APTLY_CODEX_MODELS','["gpt-6.1-sol"]',options).status,'complete');
  assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',options).status,'complete');
  for(const entry of servers(options)){assert.equal(entry.env.APTLY_CODEX_MODELS,'["gpt-6.1-sol"]');assert.equal(entry.env.ROUTER_PROVIDER,'fixture');}
  assert.deepEqual(setEnvironment('ROUTER_PROVIDER','fixture',options).clients.map(c=>c.status),['unchanged','unchanged']);
  assert.equal(removeSetup(options).status,'complete');
});
test('environment edits on operator-owned MCP preserve custom values and keep new values removable', t => {
  const options={...fixture(t),clients:['codex']};mkdirSync(join(options.home,'.codex'));
  const file=join(options.home,'.codex/config.toml');save(file,'# keep\n[mcp_servers.aptly]\ncommand="credential-launcher"\nargs=[]\n[mcp_servers.aptly.env]\nROUTER_PROVIDER = \'fixture\' # user choice\nOPENAI_API_KEY="synthetic-secret-value"\n');
  assert.equal(setEnvironment('ROUTER_PROVIDER','decisions',options).status,'complete');
  assert.equal(setEnvironment('APTLY_CLAUDE_MODELS','[]',options).status,'complete');
  const receipt=readFileSync(join(options.home,'.codex/aptly/setup-ownership.json'),'utf8');
  assert.doesNotMatch(receipt,/synthetic-secret-value|credential-launcher/);
  assert.equal(removeSetup(options).status,'complete');
  const env=parse(readFileSync(file,'utf8')).mcp_servers.aptly.env;
  assert.equal(env.ROUTER_PROVIDER,'decisions');assert.equal(env.APTLY_CLAUDE_MODELS,undefined);assert.equal(env.OPENAI_API_KEY,'synthetic-secret-value');
});
test('invalid, sensitive, unsupported and conflicting environment input causes no writes', t => {
  const options=fixture(t);
  for(const [key,value] of [['OPENAI_API_KEY','synthetic'],['NODE_OPTIONS','--import=other'],['ROUTER_PROVIDER','unexpected'],['APTLY_CODEX_MODELS','["foreign"]'],['APTLY_CODEX_MODELS','["gpt-6-luna","gpt-6-luna"]'],['APTLY_CLAUDE_MODELS','sk-abcdefghijklmno'],['APTLY_CLAUDE_MODELS',''],['APTLY_MODEL_INFO_PATH','relative']]) {
    assert.equal(setEnvironment(key,value,options).status,'partial');assert.deepEqual(readdirSync(options.home),[]);
  }
  assert.equal(configurableEnvironmentKeys.includes('OPENAI_API_KEY'),false);
  assert.equal(setDefaults(options).status,'complete');
  const before=readFileSync(join(options.home,'.codex/config.toml'),'utf8');
  assert.equal(setEnvironment('CLAUDE_MODELS','["sonnet"]',options).status,'partial');
  assert.equal(readFileSync(join(options.home,'.codex/config.toml'),'utf8'),before);
});
test('one invalid host prevents other-host environment writes; symlinks and altered receipts remain protected', t => {
  const options=fixture(t);setDefaults(options);
  const codexFile=join(options.home,'.codex/config.toml'),claudeFile=join(options.home,'.claude.json');
  const before=readFileSync(codexFile,'utf8');save(claudeFile,'invalid json');
  assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',options).status,'partial');
  assert.equal(readFileSync(codexFile,'utf8'),before);
  const other={...fixture(t),clients:['codex']};mkdirSync(join(other.home,'.codex'));const elsewhere=join(other.home,'elsewhere');save(elsewhere,'');symlinkSync(elsewhere,join(other.home,'.codex/config.toml'));
  assert.equal(setDefaults(other).clients[0].codes[0],'unsafe_symlink');assert.equal(readFileSync(elsewhere,'utf8'),'');
});

test('set commands preserve an existing advisory policy instead of enabling automatic application', t => {
 const options=fixture(t);setupHosts({...options,mode:'advisory'});
 assert.equal(setDefaults(options).status,'complete');
 assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',options).status,'complete');
 for(const name of ['.codex','.claude'])assert.equal(load(join(options.home,name,'aptly/auto-policy.json')).mode,'advisory');
 assert.equal(removeSetup(options).status,'complete');
});

test('credential references use distinct host accounts, contain no key value and remain removable', t => {
 const options=fixture(t);credentialRuntime(options.packageRoot);
 assert.equal(setCredentialReference(options).status,'complete');
 for(const [index,client] of ['codex','claude'].entries()){
  const env=servers(options)[index].env;
  assert.equal(env.APTLY_SECRET_BACKEND,'os');assert.equal(env.APTLY_SECRET_CLIENT,client);
  assert.equal(env.OPENAI_API_KEY,undefined);
 }
 assert.deepEqual(setCredentialReference(options).clients.map(c=>c.status),['unchanged','unchanged']);
 assert.equal(removeSetup(options).status,'complete');
 assert.equal(configurableEnvironmentKeys.includes('APTLY_SECRET_BACKEND'),false);
 assert.equal(configurableEnvironmentKeys.includes('APTLY_SECRET_CLIENT'),false);
});
function credentialRuntime(root, source = false, markers = true) {
 const dir = join(root,source?'src':'dist/src');mkdirSync(dir,{recursive:true});
 const extension = source?'ts':'js';
 save(join(dir,'server.'+extension),"import {runtime} from './runtime."+extension+"';\n");
 save(join(dir,'runtime.'+extension),markers?'// APTLY_SECRET_BACKEND APTLY_SECRET_CLIENT':'// old runtime');
}
test('credential source selection refuses custom launchers without changing either host or receipts', t => {
 const options=fixture(t);mkdirSync(join(options.home,'.codex'));mkdirSync(join(options.home,'.claude'));
 const codex=join(options.home,'.codex/config.toml'),claude=join(options.home,'.claude.json');
 save(codex,'[mcp_servers.aptly]\ncommand="credential-launcher"\nargs=[]\nenv_vars=["SSH_AUTH_SOCK"]\n[mcp_servers.aptly.env]\nOPENAI_API_KEY="synthetic-preexisting-key"\n');
 save(claude,{mcpServers:{aptly:{command:'other-launcher',env:{APTLY_SECRET_BACKEND:'os',APTLY_SECRET_CLIENT:'claude'}}}});
 const beforeCodex=readFileSync(codex,'utf8'),beforeClaude=readFileSync(claude,'utf8');
 assert.equal(setCredentialReference({...options,clients:['codex']}).clients[0].codes[0],'credential_launcher_unverified');
 assert.equal(readFileSync(codex,'utf8'),beforeCodex);assert.equal(readFileSync(claude,'utf8'),beforeClaude);
 assert.equal(existsSync(join(options.home,'.codex/aptly/setup-ownership.json')),false);
});
test('credential references reject old or redirected runtimes and support only the current standard source entry', t => {
 const old={...fixture(t),clients:['codex']};credentialRuntime(old.packageRoot,false,false);
 assert.equal(setCredentialReference(old).clients[0].codes[0],'credential_launcher_unverified');
 assert.equal(existsSync(join(old.home,'.codex/config.toml')),false);
 const linked={...fixture(t),clients:['codex']};credentialRuntime(linked.packageRoot);
 const runtime=join(linked.packageRoot,'dist/src/runtime.js'),other=join(linked.home,'other-runtime.js');
 fs.renameSync(runtime,other);symlinkSync(other,runtime);
 assert.equal(setCredentialReference(linked).clients[0].codes[0],'credential_launcher_unverified');
 const source={...fixture(t),clients:['codex']};credentialRuntime(source.packageRoot,true);
 mkdirSync(join(source.home,'.codex'));
 save(join(source.home,'.codex/config.toml'),'[mcp_servers.aptly]\ncommand='+JSON.stringify(process.execPath)+'\nargs=['+JSON.stringify(join(source.packageRoot,'src/server.ts'))+']\nenv_vars=["SSH_AUTH_SOCK"]\n[mcp_servers.aptly.env]\nOPENAI_API_KEY="synthetic-preexisting-key"\n');
 assert.equal(setCredentialReference(source).status,'complete');
 const codex=parse(readFileSync(join(source.home,'.codex/config.toml'),'utf8')).mcp_servers.aptly;
 assert.deepEqual(codex.env_vars,['SSH_AUTH_SOCK']);assert.equal(codex.env.OPENAI_API_KEY,'synthetic-preexisting-key');assert.equal(codex.env.APTLY_SECRET_CLIENT,'codex');
 assert.doesNotMatch(readFileSync(join(source.home,'.codex/aptly/setup-ownership.json'),'utf8'),/synthetic-preexisting-key/);
 assert.equal(removeSetup(source).status,'complete');
 const after=parse(readFileSync(join(source.home,'.codex/config.toml'),'utf8')).mcp_servers.aptly.env;
 assert.equal(after.APTLY_SECRET_CLIENT,undefined);assert.equal(after.OPENAI_API_KEY,'synthetic-preexisting-key');
});

test('Windows setup protects only newly made directories, checks ACLs and keeps receipts removable', async t => {
  const childProcess = (await import('node:child_process')).default;
  const originalExec = childProcess.execFileSync, platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const options = fixture(t), calls = [];
  for (const name of ['.codex', '.claude']) mkdirSync(join(options.home, name), {mode:0o755});
  childProcess.execFileSync = (_executable, _args, execution) => { calls.push(JSON.parse(execution.input)); return 'private'; };
  Object.defineProperty(process, 'platform', {value:'win32'}); syncBuiltinESMExports();
  try {
    assert.equal(setDefaults(options).status,'complete');
    for (const name of ['.codex', '.claude']) {
      const dir=join(options.home,name), privateDir=join(dir,'aptly');
      assert.equal(calls.some(call => call.path===dir),false,'existing host directory ACL must stay untouched');
      assert.ok(calls.some(call => call.path===privateDir && call.action==='protect-new-directory'));
      assert.ok(calls.some(call => call.path===join(privateDir,'state') && call.action==='protect-new-directory'));
      chmodSync(privateDir,0o777); // Windows ignores POSIX bits and actually inspects the ACL.
    }
    calls.length=0;
    assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',options).status,'complete');
    assert.ok(calls.some(call => call.path?.endsWith('setup-ownership.json') && call.action==='assert-private'));
    assert.equal(calls.some(call => call.action==='protect-new-directory'),false);
    assert.equal(removeSetup(options).status,'complete');
  } finally { childProcess.execFileSync=originalExec; Object.defineProperty(process,'platform',platform); syncBuiltinESMExports(); }
});

test('Windows insecure existing ACLs are refused without repair or raw diagnostics', async t => {
  const childProcess = (await import('node:child_process')).default;
  const originalExec = childProcess.execFileSync, platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const options = fixture(t); assert.equal(setDefaults(options).status,'complete');
  const path=join(options.home,'.codex','aptly','setup-ownership.json'), before=readFileSync(path,'utf8'), calls=[];
  childProcess.execFileSync = (_executable, _args, execution) => { const request=JSON.parse(execution.input); calls.push(request); if(request.path===path)throw new Error('raw-private-acl-details'); return 'private'; };
  Object.defineProperty(process,'platform',{value:'win32'}); syncBuiltinESMExports();
  try {
    const outcome=setEnvironment('ROUTER_PROVIDER','fixture',options);
    assert.equal(outcome.status,'partial');
    assert.deepEqual(result(outcome,'codex').codes,['private_file_permissions']);
    assert.equal(JSON.stringify(outcome).includes('raw-private'),false);
    assert.equal(calls.some(call => call.action==='protect-new-directory'),false);
    assert.equal(readFileSync(path,'utf8'),before);
  } finally { childProcess.execFileSync=originalExec; Object.defineProperty(process,'platform',platform); syncBuiltinESMExports(); }
});

test('Windows replacements preserve existing DACL before staging any content and fail closed', async t => {
  const childProcess = (await import('node:child_process')).default;
  const originalExec = childProcess.execFileSync, platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const options = {...fixture(t), clients:['codex']};
  assert.equal(setDefaults(options).status,'complete');
  const configPath=join(options.home,'.codex','config.toml'), original=readFileSync(configPath,'utf8');
  let reject=false; const copies=[];
  childProcess.execFileSync = (_exe,_args,execution) => {
    const request=JSON.parse(execution.input);
    if(request.source) {
      assert.equal(readFileSync(request.target,'utf8'),'','permissions must be set before any existing content is staged');
      assert.equal(readFileSync(request.source,'utf8').length>0,true);
      copies.push(request);
      if(reject) throw new Error('raw-acl-copy-error');
    }
    return 'private';
  };
  Object.defineProperty(process,'platform',{value:'win32'});syncBuiltinESMExports();
  try {
    assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',options).status,'complete');
    assert.ok(copies.some(call=>call.source===configPath));
    const changed=readFileSync(configPath,'utf8');assert.notEqual(changed,original);
    const receiptPath=join(options.home,'.codex','aptly','setup-ownership.json'), receipt=readFileSync(receiptPath,'utf8');
    reject=true;
    const outcome=setEnvironment('ROUTER_PROVIDER','decisions',options);
    assert.equal(outcome.status,'partial');assert.deepEqual(result(outcome,'codex').codes,['private_file_permissions']);
    assert.equal(readFileSync(configPath,'utf8'),changed);
    assert.equal(readFileSync(receiptPath,'utf8'),receipt);
    assert.equal(readdirSync(join(options.home,'.codex')).some(name=>name.startsWith('.aptly-stage-')),false);
  } finally {childProcess.execFileSync=originalExec;Object.defineProperty(process,'platform',platform);syncBuiltinESMExports();}
});
