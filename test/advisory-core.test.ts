import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Router, defaultPolicy } from '../src/core.ts';
import { createTestTemp } from '../test-support/temp.ts';

const advice = (id = 'advice-1', client = 'codex') => ({ request_id: id, client,
  task: { summary: 'Sort the supplied list [3,1,2] and return [1,2,3].', operation: 'analysis', context_sufficient: true } });
const constraints = () => ({ model_pinned: false, effort_pinned: false, role_pinned: false, fork_inherits: false });
const strict = (id = 'advice-1') => ({ ...advice(id), eligible_profile_ids: ['codex-routine', 'codex-deep'], constraints: { ...constraints(), provenance_verified: true } });
const router = (provider = async ({ input }) => ({ choice: `${input.client}-routine` }), extra = {}) => new Router({ provider, ...extra });

test('independent advice needs no host proof or candidate boilerplate and grants no application', async () => {
  let calls = 0, seen;
  const r = router(async args => { calls++; seen = args; return { choice: 'codex-routine' }; });
  const input = advice(), before = structuredClone(input);
  const result = await r.advise(input);
  assert.equal(result.status, 'recommended'); assert.equal(result.application, 'advisory_only');
  assert.deepEqual(seen.profiles.map(p => p.id), defaultPolicy.profiles.filter(p => p.client === 'codex').map(p => p.id));
  assert.deepEqual(seen.input.constraints, constraints());
  assert.equal(Object.hasOwn(seen.input.constraints, 'provenance_verified'), false);
  assert.deepEqual(input, before); assert.equal(calls, 1);
  assert.equal((await r.advise({ ...input, constraints: constraints(), eligible_profile_ids: defaultPolicy.profiles.filter(p => p.client === 'codex').map(p => p.id) })).cached, true);
  assert.equal(calls, 1);
});

test('advice client defaults remain catalog bounded and Claude receives no effort field', async () => {
  const result = await router().advise(advice('claude-1', 'claude'));
  assert.equal(result.profile_id, 'claude-routine'); assert.equal('reasoning_effort' in result.profile, false);
  let calls = 0; const r = router(async () => { calls++; return { choice: 'codex-routine' }; });
  assert.equal((await r.advise({ ...advice(), eligible_profile_ids: ['claude-routine'] })).reason, 'unsupported_profile');
  assert.equal((await r.advise({ ...advice('other'), eligible_profile_ids: ['not-a-profile'] })).reason, 'unsupported_profile');
  assert.equal(calls, 0);
});

test('each declared advisory pin preserves selection before any provider call', async () => {
  let calls = 0; const r = router(async () => { calls++; });
  for (const key of Object.keys(constraints())) {
    const result = await r.advise({ ...advice(key), constraints: { [key]: true } });
    assert.equal(result.reason, 'preserved_constraints'); assert.equal(result.application, 'advisory_only');
  }
  assert.equal(calls, 0);
});

test('legacy provenance flag is validated but ignored for independent advice and its cache', async () => {
  let calls = 0; const r = router(async () => { calls++; return { choice: 'codex-routine' }; });
  for (const value of [true, false]) {
    const result = await r.advise({ ...advice(), constraints: { provenance_verified: value } });
    assert.equal(result.status, 'recommended');
  }
  assert.equal((await r.advise(advice())).cached, true); assert.equal(calls, 1);
  const pinned = await r.advise({ ...advice('pinned'), constraints: { provenance_verified: true, model_pinned: true } });
  assert.equal(pinned.reason, 'preserved_constraints'); assert.equal(calls, 1);
});

test('malformed optional constraints and candidate fields are invalid instead of silently defaulted', async () => {
  let calls = 0; const r = router(async () => { calls++; });
  for (const value of [null, [], 'none', false, { model_pinned: null }, { model_pinned: 'false' },
    { provenance_verified: 'true' }, { provenance_verified: null }, { unknown: false }]) {
    assert.equal((await r.advise({ ...advice(), constraints: value })).reason, 'invalid_input');
  }
  for (const value of [undefined, null, [], 'codex-routine', ['codex-routine', 'codex-routine']]) {
    assert.equal((await r.advise({ ...advice(), eligible_profile_ids: value })).reason, 'invalid_input');
  }
  for (const input of [null, [], { ...advice(), client: 'other' }, { ...advice(), kind: 'hook' }, { ...advice(), purpose: 'hook' }]) {
    assert.equal((await r.advise(input)).reason, 'invalid_input');
  }
  assert.equal(calls, 0);
});

test('advisory context, task size, and sensitive-input guards remain effective', async () => {
  let calls = 0; const r = router(async () => { calls++; });
  assert.equal((await r.advise({ ...advice(), task: { ...advice().task, context_sufficient: false } })).status, 'needs_context');
  assert.equal((await r.advise({ ...advice('size'), task: { ...advice().task, summary: 'x'.repeat(4001) } })).reason, 'invalid_input');
  assert.equal((await r.advise({ ...advice('secret'), task: { ...advice().task, summary: ['sk', 'proj', 'synthetic-private-sentinel'].join('-') } })).reason, 'sensitive_input');
  assert.equal(calls, 0);
});

test('strict native recommendation still preserves missing or unverified evidence', async () => {
  let calls = 0; const r = router(async () => { calls++; return { choice: 'codex-routine' }; });
  assert.equal((await r.recommend({ ...strict('missing-proof'), constraints: constraints() })).reason, 'preserved_constraints');
  assert.equal((await r.recommend({ ...strict('false-proof'), constraints: { ...constraints(), provenance_verified: false } })).reason, 'preserved_constraints');
  assert.equal((await r.recommend({ ...strict('missing-pin'), constraints: { provenance_verified: true } })).reason, 'preserved_constraints');
  assert.equal((await r.recommend(advice('missing-fields'))).reason, 'invalid_input');
  assert.equal(calls, 0);
});

test('strict persisted request hashes retain their previous canonical input-policy contract', async t => {
  const ledgerPath = join(createTestTemp(t, 'codex-advice-digest-'), 'ledger.json'), input = strict('legacy');
  await router(undefined, { ledgerPath }).recommend(input);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const oldHash = createHash('sha256').update(JSON.stringify(canonical({ input, policy: defaultPolicy }))).digest('hex');
  assert.equal(JSON.parse(readFileSync(ledgerPath, 'utf8')).requests.legacy.digest, oldHash);
  let calls = 0; const restarted = router(async () => { calls++; }, { ledgerPath });
  assert.equal((await restarted.recommend(input)).cached, true); assert.equal(calls, 0);
});

for (const firstKind of ['advise', 'recommend']) {
  test(`persistent completed ${firstKind} request cannot be reused across purposes`, async t => {
    const ledgerPath = join(createTestTemp(t, 'codex-advice-complete-'), 'ledger.json');
    let calls = 0; const provider = async () => { calls++; return { choice: 'codex-routine' }; };
    const first = router(provider, { ledgerPath }), firstInput = firstKind === 'advise' ? advice() : strict();
    assert.equal((await first[firstKind](firstInput)).status, 'recommended');
    const restarted = router(provider, { ledgerPath }), otherKind = firstKind === 'advise' ? 'recommend' : 'advise';
    const otherInput = otherKind === 'advise' ? advice() : strict();
    assert.equal((await restarted[otherKind](otherInput)).reason, 'request_conflict');
    assert.equal((await restarted[firstKind](firstInput)).cached, true); assert.equal(calls, 1);
  });
  test(`persistent unknown ${firstKind} request cannot be retried by changing purpose`, async t => {
    const ledgerPath = join(createTestTemp(t, 'codex-advice-unknown-'), 'ledger.json');
    let calls = 0; const provider = async () => { calls++; throw Object.assign(new Error('synthetic-private-provider-error'), { code: 'network' }); };
    const first = router(provider, { ledgerPath }), firstInput = firstKind === 'advise' ? advice() : strict();
    assert.equal((await first[firstKind](firstInput)).reason, 'network');
    const restarted = router(provider, { ledgerPath }), otherKind = firstKind === 'advise' ? 'recommend' : 'advise';
    assert.equal((await restarted[otherKind](otherKind === 'advise' ? advice() : strict())).reason, 'request_conflict');
    assert.equal((await restarted[firstKind](firstInput)).reason, 'outcome_unknown'); assert.equal(calls, 1);
  });
}
