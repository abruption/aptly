import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'smol-toml';
import { createTestTemp } from '../test-support/temp.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePackage = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const compiledAvailable = existsSync(join(projectRoot, 'dist', 'bin', 'aptly.js')) && existsSync(join(projectRoot, 'dist', 'src', 'setup.js'));
const compiledOnly = { skip: compiledAvailable ? false : 'Run npm run build to enable compiled npm lifecycle integration checks.' };

function installation(t, overrides = {}) {
  const root = createTestTemp(t, 'codex-install-lifecycle-'), home = join(root, 'home'), packageRoot = join(root, 'prefix', 'node_modules', 'aptly');
  mkdirSync(home, { mode: 0o700 }); mkdirSync(join(home, '.codex')); mkdirSync(join(home, '.claude'));
  mkdirSync(packageRoot, { recursive: true });
  cpSync(join(projectRoot, 'dist'), join(packageRoot, 'dist'), { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), JSON.stringify(sourcePackage));
  // Resolve the already-installed dependency set without npm, registry access, or lifecycle recursion.
  symlinkSync(join(projectRoot, 'node_modules'), join(packageRoot, 'node_modules'), 'dir');
  const env = { HOME: home, USERPROFILE: home, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, ROUTER_PROVIDER: 'fixture', ...overrides };
  return { home, packageRoot, env };
}
function lifecycle(fixture) {
  const child = spawnSync(sourcePackage.scripts.postinstall, { cwd: fixture.packageRoot, env: fixture.env, shell: '/bin/sh', encoding: 'utf8', timeout: 15000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, 'Compiled postinstall must exit successfully.');
  const result=JSON.parse(child.stdout);
  const pending=result.status==='complete'&&result.clients.some(client=>client.transmission_review==='required');
  assert.equal(child.stderr,pending?'Aptly transmission review pending. Run aptly set transmission --review in the intended host environment. No transmission choice was made by installation.\n':'');
  return result;
}
const load = path => JSON.parse(readFileSync(path, 'utf8'));

// These integration checks are optional in source-only checkouts; unit tests cover setup without a build.
test('compiled npm lifecycle registers the installed node_modules package and reruns idempotently', compiledOnly, t => {
  const fixture = installation(t);
  const first = lifecycle(fixture);
  assert.equal(first.status, 'complete'); assert.deepEqual(first.clients.map(c => c.status), ['configured', 'configured']);
  assert.equal(first.clients[0].requires_hook_review, true);
  const codexPath = join(fixture.home, '.codex', 'config.toml'), claudePath = join(fixture.home, '.claude.json');
  const codexText = readFileSync(codexPath, 'utf8'), claudeText = readFileSync(claudePath, 'utf8');
  const codex = parse(codexText), claude = JSON.parse(claudeText);
  for (const server of [codex.mcp_servers.aptly, claude.mcpServers.aptly]) {
    assert.equal(server.command, process.execPath);
    assert.deepEqual(server.args, [join(fixture.packageRoot, 'dist', 'src', 'server.js')]);
    assert.equal(existsSync(server.args[0]), true);
  }
  for (const [dir, file] of [['.codex', 'hooks.json'], ['.claude', 'settings.json']]) {
    const hooks = load(join(fixture.home, dir, file)).hooks.PreToolUse;
    assert.equal(hooks.length, 1); assert.equal(hooks[0].hooks[0].tool, 'route_spawn_hook');
    assert.equal(load(join(fixture.home, dir, 'aptly', 'auto-policy.json')).mode, 'defaults');
    assert.equal(load(join(fixture.home, dir, 'aptly', 'auto-policy.json')).transmission, 'unselected');
    assert.equal(existsSync(join(fixture.home,dir,'aptly','transmission-review.json')),false);
  }
  const again = lifecycle(fixture);
  assert.deepEqual(again.clients.map(c => c.status), ['unchanged', 'unchanged']);
  assert.equal(readFileSync(codexPath, 'utf8'), codexText); assert.equal(readFileSync(claudePath, 'utf8'), claudeText);
  for (const [dir, file] of [['.codex', 'hooks.json'], ['.claude', 'settings.json']]) assert.equal(load(join(fixture.home, dir, file)).hooks.PreToolUse.length, 1);
});

test('compiled npm lifecycle skips CI and explicit opt-out before any host settings writes', compiledOnly, t => {
  for (const override of [{ CI: 'true' }, { APTLY_SKIP_SETUP: '1' }]) {
    const fixture = installation(t, override), output = lifecycle(fixture);
    assert.equal(output.status, 'skipped'); assert.deepEqual(output.clients.map(c => c.status), ['skipped', 'skipped']);
    assert.deepEqual(readdirSync(join(fixture.home, '.codex')), []); assert.deepEqual(readdirSync(join(fixture.home, '.claude')), []);
    assert.equal(existsSync(join(fixture.home, '.claude.json')), false);
  }
});

test('npm lifecycle source-checkout guard exits cleanly without compiled output', t => {
  const root = createTestTemp(t, 'codex-install-lifecycle-'), home = join(root, 'home'), packageRoot = join(root, 'package');
  mkdirSync(home); mkdirSync(packageRoot);
  const child = spawnSync(sourcePackage.scripts.postinstall, { cwd: packageRoot, env: { HOME: home, USERPROFILE: home, PATH: `${dirname(process.execPath)}:/usr/bin:/bin` }, shell: '/bin/sh', encoding: 'utf8', timeout: 15000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0); assert.equal(child.stdout, ''); assert.equal(child.stderr, '');
  assert.deepEqual(readdirSync(home), []); assert.deepEqual(readdirSync(packageRoot), []);
});
