import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { observeConfig, summarizeConfigProbe } from '../test-support/codex-host-probe.ts';
import { CodexProbeRpc } from '../test-support/codex-probe-rpc.ts';
import { createTestTemp } from '../test-support/temp.ts';

function fixture(model = 'aptly-fixture-a', effort = 'low', type = 'user', version = 'v1') {
  const metadata = () => ({ name: { type, file: '/synthetic/private/config.toml' }, version });
  return {
    config: { model, model_reasoning_effort: effort, unrelated_secret: 'synthetic-private-value' },
    origins: { model: metadata(), model_reasoning_effort: metadata() },
    layers: [{ name: { type, file: '/synthetic/private/config.toml' }, version, config: { private: 'synthetic-private-value' } }],
  };
}
const changed = () => fixture('aptly-fixture-b', 'high', 'user', 'v2');
const override = () => fixture('aptly-fixture-override', 'medium', 'sessionFlags', 'v3');

test('config probe summarizes observed fixtures without certifying a native session or exposing raw data', () => {
  const baseline = fixture();
  const result = summarizeConfigProbe(baseline, structuredClone(baseline), changed(), override());
  assert.deepEqual(result.isolated_config, {
    baseline_matches_fixture: true, repeat_stable: true, file_change_observed: true, file_origin_versions_changed: true,
    baseline_model_origin: 'user', baseline_effort_origin: 'user', cli_override_observed: true,
    override_model_origin: 'sessionFlags', override_effort_origin: 'sessionFlags',
  });
  assert.equal(result.application, 'shadow'); assert.equal(result.evidence_verified, false);
  assert.deepEqual(result.native_session, { all_effective_sources_verified: false, complete_change_feed_verified: false, atomic_spawn_recheck_verified: false });
  assert.equal(result.model_turns_started, 0); assert.equal(result.native_agents_spawned, 0);
  const serialized = JSON.stringify(result);
  for (const raw of ['/synthetic/private', 'synthetic-private-value', 'aptly-fixture-a', 'aptly-fixture-b', 'aptly-fixture-override', observeConfig(baseline).fingerprint]) {
    assert.equal(serialized.includes(raw), false);
  }
});

test('missing and malformed config origins remain incomplete and cannot imply stable or changed evidence', () => {
  for (const bad of [null, [], {}, { config: fixture().config }, { config: fixture().config, origins: [] }]) {
    const observation = observeConfig(bad);
    assert.equal(observation.complete, false); assert.equal(observation.fingerprint, null);
  }
  for (const mutate of [
    value => { delete value.origins.model; },
    value => { value.origins.model.name.type = 'unreviewed-origin'; },
    value => { value.origins.model.name = null; },
    value => { value.origins.model.version = ''; },
    value => { value.origins.model.version = null; },
    value => { value.origins.model_reasoning_effort = null; },
    value => { value.config.model = null; },
    value => { value.config.model_reasoning_effort = null; },
  ]) {
    const value = fixture(); mutate(value);
    assert.equal(observeConfig(value).complete, false); assert.equal(observeConfig(value).fingerprint, null);
    const result = summarizeConfigProbe(value, value, changed(), override());
    assert.equal(result.isolated_config.repeat_stable, false);
    assert.equal(result.isolated_config.file_change_observed, false);
    assert.equal(result.evidence_verified, false);
  }
});

test('comparison observes layer version changes even when model and effort are unchanged', () => {
  const baseline = observeConfig(fixture()), same = observeConfig(fixture()), revision = observeConfig(fixture('aptly-fixture-a', 'low', 'user', 'v2'));
  assert.equal(baseline.fingerprint, same.fingerprint);
  assert.notEqual(baseline.fingerprint, revision.fingerprint);
  const result = summarizeConfigProbe(fixture(), fixture('aptly-fixture-a', 'low', 'user', 'v2'), changed(), override());
  assert.equal(result.isolated_config.repeat_stable, false);
  assert.equal(result.native_session.atomic_spawn_recheck_verified, false);
});

function fakeRpc(t, mode = 'normal', timeoutMs = 1000) {
  const cwd = createTestTemp(t, 'codex-probe-rpc-test-'), log = join(cwd, 'received.jsonl');
  const source = `
    const { createInterface } = require('node:readline');
    const { appendFileSync } = require('node:fs');
    const log = process.argv[1], mode = process.argv[2];
    const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
    let pending;
    createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line); appendFileSync(log, line + '\\n');
      if (request.id === 'auth-probe') {
        send({ id: pending, result: { auth_rejected: request.error?.code === -32601, response: request.error?.message } }); return;
      }
      if (request.method === 'initialized') return;
      if (request.method === 'initialize') { send({ id: request.id, result: { initialized: true } }); return; }
      if (mode === 'error') {
        process.stderr.write('synthetic-private-error-value');
        send({ id: request.id, error: { code: -32000, message: 'synthetic-private-error-value', data: { path: '/synthetic/private/config.toml' } } }); return;
      }
      if (mode === 'malformed') { process.stdout.write('{broken-json\\n'); return; }
      if (mode === 'stdout-flood') { process.stdout.write('x'.repeat(1024 * 1024 + 128)); return; }
      if (mode === 'stderr-flood') { process.stderr.write('x'.repeat(1024 * 1024 + 128)); return; }
      if (mode === 'foreign') {
        send({ id: request.id + 1000, result: { foreign: true } });
        send({ id: request.id - 1, result: { late: true } });
        send({ id: request.id, result: { matched: true } }); return;
      }
      if (mode === 'timeout') return;
      if (mode === 'exit') { process.exit(7); }
      if (mode === 'auth') {
        pending = request.id;
        send({ id: 'auth-probe', method: 'account/chatgptAuthTokens/refresh', params: { reason: 'synthetic' } }); return;
      }
      send({ id: request.id, result: { config: { model: 'synthetic' }, seen: request.method } });
    });
  `;
  const rpc = new CodexProbeRpc(process.execPath, ['-e', source, log, mode], { cwd, env: { PATH: process.env.PATH }, timeoutMs });
  return { rpc, received: () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) };
}

const safeError = code => error => error instanceof Error && error.message === code && !String(error).includes('synthetic-private');

test('probe JSONL transport sends only allowed initialization and config reads', { timeout: 5000 }, async t => {
  const { rpc, received } = fakeRpc(t);
  try {
    assert.deepEqual(await rpc.request('initialize', {}), { initialized: true });
    rpc.initialized();
    const result = await rpc.request('config/read', { cwd: '/synthetic/workspace', includeLayers: true });
    assert.equal(result.seen, 'config/read');
    assert.deepEqual(rpc.sentMethods, ['initialize', 'config/read']);
    assert.deepEqual(received().map(entry => entry.method), ['initialize', 'initialized', 'config/read']);
  } finally { await rpc.close(); }
});

test('forbidden model execution and config writes are rejected before sending to the process', { timeout: 5000 }, async t => {
  const { rpc, received } = fakeRpc(t);
  try {
    await rpc.request('initialize', {});
    for (const method of ['turn/start', 'thread/start', 'thread/resume', 'config/value/write', 'config/batchWrite', 'account/read', 'mcpServer/tool/call']) {
      await assert.rejects(rpc.request(method, {}), safeError('probe_method_forbidden'));
    }
    await rpc.request('config/read', {});
    assert.deepEqual(rpc.sentMethods, ['initialize', 'config/read']);
    assert.deepEqual(received().map(entry => entry.method), ['initialize', 'config/read']);
  } finally { await rpc.close(); }
});

for (const [mode, code] of [['error', 'probe_rpc_error'], ['malformed', 'probe_protocol_error'], ['timeout', 'probe_timeout'], ['exit', 'probe_process_closed']]) {
  test(`probe ${mode} produces a fixed error and closes without hanging`, { timeout: 5000 }, async t => {
    const { rpc } = fakeRpc(t, mode, 300);
    try {
      await assert.rejects(rpc.request('config/read', {}), safeError(code));
    } finally { await rpc.close(); }
    await assert.rejects(rpc.request('config/read', {}), safeError('probe_process_closed'));
  });
}

test('unsolicited credential refresh is declined with a fixed error and receives no credentials', { timeout: 5000 }, async t => {
  const { rpc, received } = fakeRpc(t, 'auth');
  try {
    const result = await rpc.request('config/read', {});
    assert.deepEqual(result, { auth_rejected: true, response: 'unsupported_probe_method' });
    const response = received().find(entry => entry.id === 'auth-probe');
    assert.deepEqual(response, { id: 'auth-probe', error: { code: -32601, message: 'unsupported_probe_method' } });
    assert.deepEqual(rpc.sentMethods, ['config/read']);
  } finally { await rpc.close(); }
});

for (const mode of ['stdout-flood', 'stderr-flood']) {
  test(`probe ${mode} is bounded and closes without exposing the output`, { timeout: 5000 }, async t => {
    const { rpc } = fakeRpc(t, mode);
    try {
      await assert.rejects(rpc.request('config/read', {}), safeError('probe_output_limit'));
    } finally { await rpc.close(); }
    await assert.rejects(rpc.request('config/read', {}), safeError('probe_process_closed'));
  });
}

test('foreign and completed response IDs cannot satisfy a later pending config read', { timeout: 5000 }, async t => {
  const { rpc } = fakeRpc(t, 'foreign');
  try {
    await rpc.request('initialize', {});
    assert.deepEqual(await rpc.request('config/read', {}), { matched: true });
    assert.deepEqual(await rpc.request('config/read', {}), { matched: true });
    assert.deepEqual(rpc.sentMethods, ['initialize', 'config/read', 'config/read']);
  } finally { await rpc.close(); }
});
