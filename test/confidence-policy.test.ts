import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, defaultPolicy } from '../src/core.ts';
import { decisionsProvider } from '../src/provider.ts';
import { automaticHook } from '../src/automatic-hook.ts';
import { createTestTemp } from '../test-support/temp.ts';

const request = (id = 'confidence') => ({ request_id: id, client: 'codex', task: { summary: 'Review the supplied synthetic module for a missing guard.', operation: 'review', context_sufficient: true }, eligible_profile_ids: ['codex-routine'], constraints: { provenance_verified: true, model_pinned: false, effort_pinned: false, role_pinned: false, fork_inherits: false } });
const providerArgs = { input: request(), profiles: defaultPolicy.profiles.filter(p => p.id === 'codex-routine'), signal: new AbortController().signal };

test('Decisions requires confidence even though generic Router metadata is optional', async () => {
  const provider = decisionsProvider({ key: 'synthetic', fetchImpl: async () => Response.json({ answers: [{ type: 'choice', name: 'profile', choice: 'codex-routine' }] }) });
  await assert.rejects(() => provider(providerArgs), e => e.code === 'invalid_json');
  const result = await new Router({ provider: async () => ({ choice: 'codex-routine' }) }).recommend(request());
  assert.equal(result.status, 'recommended');
  assert.equal(result.profile_id, 'codex-routine');
  assert.equal(Object.hasOwn(result, 'confidence'), false);
});

for (const confidence of [0, 0.16, 1]) {
  test(`confidence ${confidence} remains metadata for an allowed profile`, async () => {
    const provider = decisionsProvider({ key: 'synthetic', fetchImpl: async () => Response.json({ answers: [{ type: 'choice', name: 'profile', choice: 'codex-routine', confidence }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }) });
    const result = await new Router({ provider }).recommend(request());
    assert.equal(result.status, 'recommended');
    assert.equal(result.reason, 'allowed_profile');
    assert.equal(result.profile_id, 'codex-routine');
    assert.equal(result.confidence, confidence);
  });
}

test('explicit provider abstention and request for context stay distinct at zero confidence', async () => {
  for (const [choice, status, reason] of [['keep_current', 'keep_current', 'provider_abstained'], ['needs_context', 'needs_context', 'provider_needs_context']]) {
    const result = await new Router({ provider: async () => ({ choice, confidence: 0 }) }).recommend(request());
    assert.equal(result.status, status); assert.equal(result.reason, reason); assert.equal(result.confidence, 0);
    assert.equal(Object.hasOwn(result, 'profile_id'), false);
  }
});

test('saved zero-confidence recommendation survives restart; unknown request is not retried', async t => {
  const dir = createTestTemp(t, 'codex-confidence-');
  const ledgerPath = join(dir, 'ledger.json'); let calls = 0;
  const provider = async () => { calls++; return { choice: 'codex-routine', confidence: 0 }; };
  const first = await new Router({ provider, ledgerPath }).recommend(request('saved'));
  const cached = await new Router({ provider, ledgerPath }).recommend(request('saved'));
  assert.equal(first.confidence, 0); assert.equal(cached.confidence, 0);
  assert.equal(cached.cached, true); assert.equal(cached.profile_id, first.profile_id); assert.equal(calls, 1);
  const failing = async () => { calls++; throw Object.assign(new Error('synthetic'), { code: 'network' }); };
  assert.equal((await new Router({ provider: failing, ledgerPath }).recommend(request('unknown'))).reason, 'network');
  assert.equal((await new Router({ provider, ledgerPath }).recommend(request('unknown'))).reason, 'outcome_unknown');
  assert.equal(calls, 2);
});

const event = client => ({ hook_event_name: 'PreToolUse', tool_name: client === 'codex' ? 'collaborationspawn_agent' : 'Agent', tool_use_id: 'synthetic-call', session_id: 'synthetic-session', tool_input: client === 'codex' ? { task_name: 'Sort values', message: 'Sort the supplied numbers [3, 1, 2] in ascending order.', fork_turns: 'none' } : { description: 'Sort values', prompt: 'Sort the supplied numbers [3, 1, 2] in ascending order.', subagent_type: 'general-purpose' } });
function hookFixture(t, mode, confidence) {
  const dir = createTestTemp(t, 'codex-confidence-hook-'), state = join(dir, 'state'), policyPath = join(dir, 'policy.json');
  mkdirSync(state, { mode: 0o700 });
  writeFileSync(policyPath, JSON.stringify({ schema_version: 1, kind: 'aptly-auto-hook', mode, issuer: 'operator_installation', enabled: true, state_directory: state }), { mode: 0o600 });
  let calls = 0;
  const router = new Router({ policy: { ...defaultPolicy, provider_id: 'decisions' }, ledgerPath: join(state, 'ledger.json'), provider: async ({ profiles }) => { calls++; return { choice: profiles[0].id, confidence }; } });
  return { run: (client, ev = event(client)) => automaticHook({ client, event: ev, router, policyPath }), calls: () => calls };
}
for (const client of ['codex', 'claude']) for (const confidence of [0, 0.16]) for (const mode of ['defaults', 'advisory']) {
  test(`${client} ${mode} accepts confidence ${confidence} while preserving explicit selections`, async t => {
    const f = hookFixture(t, mode, confidence), ev = event(client), before = structuredClone(ev);
    const result = await f.run(client, ev);
    assert.equal(result.observation.status, mode === 'defaults' ? 'arguments_updated' : 'advisory');
    if (mode === 'defaults') {
      const profile = defaultPolicy.profiles.find(p => p.client === client);
      assert.equal(result.output.hookSpecificOutput.updatedInput.model, profile.model);
      if (client === 'codex') assert.equal(result.output.hookSpecificOutput.updatedInput.reasoning_effort, profile.reasoning_effort);
    } else {
      assert.match(result.output.hookSpecificOutput.additionalContext, /Aptly suggests/);
      assert.equal(Object.hasOwn(result.output.hookSpecificOutput, 'updatedInput'), false);
    }
    assert.deepEqual(ev, before);
    assert.equal((await f.run(client, ev)).observation.classification, 'cache_hit'); assert.equal(f.calls(), 1);
    const pinned = event(client); pinned.tool_use_id = 'explicit'; pinned.tool_input.model = 'explicit-model';
    if (client === 'codex') pinned.tool_input.reasoning_effort = 'high'; else pinned.tool_input.effort = 'high';
    const pinnedBefore = structuredClone(pinned), preserved = await f.run(client, pinned);
    assert.equal(preserved.observation.status, 'preserved'); assert.deepEqual(preserved.output, {});
    assert.deepEqual(pinned, pinnedBefore); assert.equal(f.calls(), 1);
  });
}
