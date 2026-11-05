import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, chmodSync, symlinkSync, readdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { setupHosts, removeSetup } from '../src/setup.ts';
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
