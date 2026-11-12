import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createTestTemp } from '../test-support/temp.ts';

const cli = resolve('bin/aptly.ts');
const paths = [
  ['serve'], ['capabilities'], ['catalog'], ['catalog', 'refresh'],
  ['recommend'], ['inspect'], ['config'], ['set'], ['set', 'default'],
  ['set', 'env'], ['set', 'transmission'], ['budget'], ['budget', 'status'],
  ['setup'], ['remove'], ['update'], ['doctor'], ['report'],
];

function fixture(t) {
  const dir = createTestTemp(t, 'codex-cli-help-');
  const env = {
    PATH: process.env.PATH, HOME: dir, USERPROFILE: dir,
    CODEX_HOME: join(dir, 'codex'), CLAUDE_CONFIG_DIR: join(dir, 'claude'),
    CI: 'true', ROUTER_PROVIDER: 'fixture',
    ROUTER_LEDGER_PATH: join(dir, 'ledger.json'),
    APTLY_MODEL_INFO_PATH: join(dir, 'model-info.json'),
  };
  return {
    dir, env,
    run: args => spawnSync(process.execPath, [cli, ...args], {
      cwd: dir, env, encoding: 'utf8', timeout: 10000,
    }),
    assertUntouched: () => assert.deepEqual(readdirSync(dir), []),
  };
}

function assertHelp(result, args) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  assert.match(result.stdout, /usage|commands/i, args.join(' '));
  assert.equal(result.stderr, '', args.join(' '));
}

test('root and every documented command path provide help without creating state', { timeout: 120000 }, t => {
  const f = fixture(t);
  for (const args of [['--help'], ['-h'], ['help']]) assertHelp(f.run(args), args);
  for (const path of paths) {
    for (const args of [[...path, '--help'], [...path, '-h'], ['help', ...path]]) {
      assertHelp(f.run(args), args);
    }
  }
  f.assertUntouched();
});

test('help accepts valid options and optional known environment keys without performing commands', { timeout: 30000 }, t => {
  const f = fixture(t);
  for (const args of [
    ['--version','--help'], ['--help','--version'],
    ['set','transmission','--help','--show','--client','codex'],
    ['set','transmission','--review','--client','codex','--help'],
    ['inspect','codex','-','--help'], ['report','--output-dir','-','--help'],
    ['setup', '--client', 'codex', '--mode', 'advisory', '--help'],
    ['setup', '--migrate-launcher', '--client', 'codex', '--dry-run', '--help'],
    ['catalog', 'refresh', '--output', '/nonexistent/path', '--help'],
    ['inspect', 'codex', '/nonexistent/path', '--help'],
    ['inspect', 'codex', '-inv.json', '--help'],
    ['report', '--output-dir', '-out', '--help'],
    ['set', 'env', 'OPENAI_API_KEY', '--client', 'codex', '--stdin', '--help'],
    ['set', 'env', 'APTLY_CODEX_MODELS', '--help'],
    ['budget', 'status', '--client', 'codex', '-h'],
  ]) assertHelp(f.run(args), args);
  f.assertUntouched();
});

test('invalid paths and arguments remain errors even when help is requested', { timeout: 30000 }, t => {
  const f = fixture(t);
  for (const args of [
    ['set','transmission','--show','--review','--help'], ['set','transmission','excerpt','--review','--help'],
    ['unknown', '--help'], ['set env', '--help'], ['catalog refresh', '--output', '/x', '-h'], ['help', 'budget status'], ['help', 'catalog refresh'], ['--version','setup','--help'], ['help', 'unknown'], ['help', 'catalog', 'unknown'],
    ['setup', '--unknown', '--help'], ['setup', '--client', 'invalid', '--help'],
    ['setup', '--client', 'codex', '--client', 'claude', '--help'],
    ['setup', '--dry-run', '--help'], ['setup', '--include-existing', '--help'],
    ['setup', '--migrate-launcher', '--client', 'all', '--help'],
    ['setup', '--migrate-launcher', '--automatic', '--help'],
    ['setup', '--migrate-launcher', '--mode', 'advisory', '--help'],
    ['setup', '--migrate-launcher', '--transmission', 'none', '--help'],
    ['catalog', 'refresh', '--output', '--help'], ['report', '--output-dir', '-h'],
    ['inspect', 'codex', 'file', 'extra', '--help'],
    ['set', 'env', 'PATH', '--help'], ['help', 'set', 'env', 'PATH'],
    ['set', 'env', 'OPENAI_API_KEY', '--stdin', '--check', '--help'],
    ['set', 'env', 'APTLY_CODEX_MODELS', '--check', '--help'],
    ['set', 'transmission', 'none', '--show', '--help'],
    ['set', 'transmission', '--client', 'codex', 'none', '--help'],
    ['set', 'transmission', '--client', 'codex', '--show', '-h'],
    ['set', 'env', '--client', 'codex', 'OPENAI_API_KEY', '--help'],
    ['set', 'env', '--stdin', 'APTLY_CODEX_MODELS', '--help'],
    ['', '--help'], ['inspect', 'codex', '', '--help'],
  ]) {
    const result = f.run(args);
    assert.ifError(result.error);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stderr, 'aptly: invalid_help_options (use --help)\n', args.join(' '));
    assert.equal(result.stdout, '', args.join(' '));
  }
  f.assertUntouched();
});

test('stdin help exits without waiting for input', { timeout: 10000 }, async t => {
  const f = fixture(t);
  const child = spawn(process.execPath, [cli, 'set', 'env', 'OPENAI_API_KEY', '--stdin', '--help'], {
    cwd: f.dir, env: f.env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => stdout += chunk);
  child.stderr.on('data', chunk => stderr += chunk);
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  assert.equal(code, 0, stderr);
  assert.match(stdout, /usage|commands/i);
  assert.equal(stderr, '');
  f.assertUntouched();
});


test('policy source setup help validates explicit Codex-only migration without writing', t => {
  const f=fixture(t);
  for(const args of [
    ['setup','--client','codex','--policy-source','codex-home','--help'],
    ['setup','--client','codex','--policy-source','codex-home','--dry-run','--help'],
  ]) { const result=f.run(args);assertHelp(result,args);assert.match(result.stdout,/CODEX_HOME/); }
  for(const tail of [
    ['--policy-source','codex-home'],
    ['--client','claude','--policy-source','codex-home'],
    ['--client','codex','--policy-source','other'],
    ['--client','codex','--policy-source','codex-home','--automatic'],
    ['--client','codex','--policy-source','codex-home','--transmission','excerpt'],
    ['--client','codex','--policy-source','codex-home','--migrate-launcher'],
  ]) {
    const result=f.run(['setup',...tail,'--help']);assert.equal(result.status,2);assert.equal(result.stdout,'');
    const execution=f.run(['setup',...tail]);assert.equal(execution.status,1);assert.match(execution.stderr,/setup_invalid_options/);
  }
  f.assertUntouched();
});
