import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync, writeFileSync, readFileSync } from 'node:fs';
import { createTestTemp } from '../test-support/temp.ts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultPolicy } from '../src/core.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fakeKey = 'sk-fixture-only-not-a-real-secret';
const event = (id = 'synthetic-call') => ({
  hook_event_name: 'PreToolUse', tool_name: 'spawn_agent', tool_use_id: id, session_id: 'synthetic-session',
  tool_input: { task_name: 'synthetic_sum', message: 'SYNTHETIC BODY: add 17 and 25', fork_turns: 'none', sandbox: 'read-only' },
});
const request = (id = 'synthetic-request') => ({
  request_id: id, client: 'codex',
  task: { summary: 'Sort the supplied synthetic integers 3, 1, 2.', operation: 'analysis', context_sufficient: true },
  eligible_profile_ids: ['codex-routine', 'codex-deep'],
  constraints: { provenance_verified: true, model_pinned: false, effort_pinned: false, role_pinned: false, fork_inherits: false },
});

const temporary = t => createTestTemp(t, 'codex-server-test-');

async function withServer(env, run) {
  const client = new Client({ name: 'synthetic-server-integration', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [resolve(project, 'test-support/poc-server.ts')], cwd: project,
    env: { OPENAI_API_KEY: fakeKey, ...env }, stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr.on('data', data => { stderr += data.toString(); });
  let pid;
  try {
    await client.connect(transport); pid = transport.pid;
    assert.ok(pid > 0);
    await run(client);
  } finally {
    await client.close();
    assert.equal(transport.pid, null, 'MCP child must be reaped after disconnect');
    if (pid) assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
    assert.equal(stderr.includes(fakeKey), false, 'stderr must not disclose even the fixture sentinel');
    assert.equal(stderr, '', 'fixture MCP server should have no raw diagnostic output');
  }
}

const call = async (client, name, args = {}) => {
  const response = await client.callTool({ name, arguments: args });
  assert.notEqual(response.isError, true);
  assert.equal(JSON.stringify(response).includes(fakeKey), false);
  return response.structuredContent ?? JSON.parse(response.content[0].text);
};
const route = (client, ev = event()) => call(client, 'route_spawn_hook', { client: 'codex', event: ev });

test('actual stdio MCP: default fixture catalog, recommendation, cache and conservative Hook', { timeout: 15000 }, async () => {
  await withServer({}, async client => {
    const list = await client.listTools();
    for (const name of ['get_routing_capabilities', 'recommend_agent', 'route_spawn_hook']) assert.ok(list.tools.some(tool => tool.name === name));
    const cap = await call(client, 'get_routing_capabilities');
    assert.equal(cap.provider, 'fixture'); assert.equal(cap.application, 'advisory_only');
    assert.equal(cap.storage, 'in_memory_fixture_only');
    const rec = await call(client, 'recommend_agent', request());
    assert.equal(rec.status, 'recommended'); assert.equal(rec.profile_id, 'codex-routine');
    assert.equal(rec.provider, 'fixture'); assert.equal(rec.application, 'advisory_only');
    assert.equal((await call(client, 'recommend_agent', request())).cached, true);
    assert.deepEqual(await route(client), {});
  });
});

test('actual stdio MCP: manifest and apply controls remain conservative unless all opt-ins match', { timeout: 30000 }, async t => {
  const dir = temporary(t);
  const manifest = resolve(dir, 'manifest.json'), malformed = resolve(dir, 'malformed.json');
  writeFileSync(manifest, JSON.stringify({ cases: { synthetic_sum: { summary: 'Compute 17 + 25. Return only the number.' } } }), { mode: 0o600 });
  writeFileSync(malformed, '{invalid json', { mode: 0o600 });
  const cases = [
    { name: 'no manifest or flags', env: {} },
    { name: 'apply only', env: { ROUTER_POC_APPLY: '1' } },
    { name: 'verified only', env: { ROUTER_POC_VERIFIED: '1' } },
    { name: 'manifest only', env: { ROUTER_POC_MANIFEST: manifest } },
    { name: 'manifest and apply without verified', env: { ROUTER_POC_MANIFEST: manifest, ROUTER_POC_APPLY: '1' } },
    { name: 'manifest and verified shadow', env: { ROUTER_POC_MANIFEST: manifest, ROUTER_POC_VERIFIED: '1' } },
    { name: 'flags without manifest', env: { ROUTER_POC_VERIFIED: '1', ROUTER_POC_APPLY: '1' } },
    { name: 'malformed manifest', env: { ROUTER_POC_MANIFEST: malformed, ROUTER_POC_VERIFIED: '1', ROUTER_POC_APPLY: '1' } },
    { name: 'unknown case', env: { ROUTER_POC_MANIFEST: manifest, ROUTER_POC_VERIFIED: '1', ROUTER_POC_APPLY: '1' }, unknown: true },
  ];
  for (const sample of cases) await t.test(sample.name, async () => {
    await withServer(sample.env, async client => {
      const ev = event(); if (sample.unknown) ev.tool_input.task_name = 'unregistered_case';
      assert.deepEqual(await route(client, ev), {});
    });
  });
});

test('actual stdio MCP: explicit synthetic manifest applies catalog model fields and preserves pins', { timeout: 15000 }, async t => {
  const dir = temporary(t), manifest = resolve(dir, 'manifest.json'), ledger = resolve(dir, 'ledger.json');
  writeFileSync(manifest, JSON.stringify({ cases: { synthetic_sum: { summary: 'Compute 17 + 25. Return only the number.' } } }), { mode: 0o600 });
  await withServer({ ROUTER_POC_MANIFEST: manifest, ROUTER_POC_VERIFIED: '1', ROUTER_POC_APPLY: '1', ROUTER_LEDGER_PATH: ledger }, async client => {
    const ev = event(); const before = structuredClone(ev);
    const output = await route(client, ev);
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    const expectedProfile = defaultPolicy.profiles.find(p => p.id === 'codex-routine');
    assert.deepEqual(output.hookSpecificOutput.updatedInput, { ...before.tool_input, model: expectedProfile.model, reasoning_effort: expectedProfile.reasoning_effort });
    assert.deepEqual(ev, before);
    for (const [index, patch] of [{ model: 'gpt-6-astra' }, { reasoning_effort: 'high' }, { agent_type: 'reviewer' }, { fork_turns: 'all' }].entries()) {
      const pinned = event(`pin-${index}`); Object.assign(pinned.tool_input, patch);
      assert.deepEqual(await route(client, pinned), {});
    }
  });
  assert.equal(statSync(ledger).mode & 0o777, 0o600);
  const stored = readFileSync(ledger, 'utf8');
  assert.equal(stored.includes(fakeKey), false); assert.equal(stored.includes('Compute 17 + 25'), false);
});

test('actual stdio MCP: fixture cache cannot masquerade as a Decisions result', { timeout: 15000 }, async t => {
  const dir = temporary(t), ledger = resolve(dir, 'ledger.json'), input = request('shared-provider-request');
  await withServer({ ROUTER_LEDGER_PATH: ledger }, async client => {
    assert.equal((await call(client, 'recommend_agent', input)).status, 'recommended');
  });
  const before = readFileSync(ledger, 'utf8');
  // No real or fixture key is provided in Decisions mode. Even if conflict detection
  // regresses, decisionsProvider fails unauthorized locally before fetch can run.
  await withServer({ ROUTER_PROVIDER: 'decisions', OPENAI_API_KEY: '', ROUTER_LEDGER_PATH: ledger }, async client => {
    const result = await call(client, 'recommend_agent', input);
    assert.equal(result.reason, 'request_conflict'); assert.equal(result.status, 'unavailable');
    assert.equal(result.provider, 'decisions'); assert.equal(result.cached, undefined);
  });
  assert.equal(readFileSync(ledger, 'utf8'), before);
});
