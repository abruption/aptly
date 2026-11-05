import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceDispatchHost } from '../test-support/host-dispatch-contract.ts';
import { provenanceRequirements } from '../src/provenance.ts';
import { defaultPolicy } from '../src/core.ts';

const resolver = () => ({
  client_version: provenanceRequirements.codex.versions[0],
  layers: provenanceRequirements.codex.layers.map(source => ({ source, model: 'unset', effort: 'unset' })),
  environment: Object.fromEntries(provenanceRequirements.codex.environment.map(name => [name, 'unset'])),
  host_extensions: 'none',
});
const event = (call = 'fixture-call') => ({
  session_id: 'fixture-session', cwd: '/synthetic-workspace', turn_id: 'fixture-turn', tool_use_id: call,
  hook_event_name: 'PreToolUse', tool_name: 'collaborationspawn_agent',
  tool_input: { task_name: 'fixture task', message: 'synthetic-private-task-body', fork_turns: 'none', sandbox: 'read-only' },
});
const recommendation = () => {
  const profile = defaultPolicy.profiles.find(value => value.id === 'codex-routine');
  return { status: 'recommended', policy_version: defaultPolicy.version, catalog_version: defaultPolicy.catalog_version,
    profile_id: profile.id, profile: structuredClone(profile) };
};
function setup(options = {}) {
  let now = 1_800_000_000_000;
  const host = new ReferenceDispatchHost(resolver(), { now: () => now, ...options });
  const ev = event(), ticket = host.captureSpawnSnapshot(ev), reply = { ...ticket, recommendation: recommendation() };
  return { host, ev, ticket, reply, time: value => { now = value; }, advance: delta => { now += delta; } };
}
const never = () => assert.fail('unsafe fixture enqueue');
const preserve = (s, reply = s.reply, ev = s.ev) => assert.equal(s.host.compareAndEnqueue(reply, ev, () => 'allow', never).state, 'preserve');

test('fixture dispatch applies only catalog model fields once and retains original native task and security arguments', () => {
  const s = setup(), before = structuredClone(s.ev); let calls = 0, queued;
  const enqueue = input => { calls++; queued = input; return 'accepted'; };
  assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', enqueue), { state: 'enqueued', reason: 'enqueued' });
  assert.equal(calls, 1); assert.equal(queued.model, recommendation().profile.model); assert.equal(queued.reasoning_effort, recommendation().profile.reasoning_effort);
  delete queued.model; delete queued.reasoning_effort;
  assert.deepEqual(queued, before.tool_input); assert.deepEqual(s.ev, before);
  assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', enqueue), { state: 'enqueued', reason: 'enqueued' });
  assert.equal(calls, 1); assert.deepEqual(s.host.getDispatchResult(s.ticket.ticket), { state: 'enqueued', reason: 'enqueued' });
  const copy = s.host.getDispatchResult(s.ticket.ticket); copy.state = 'unknown';
  assert.equal(s.host.getDispatchResult(s.ticket.ticket).state, 'enqueued');
});

test('capture deduplicates one call and refuses conflicting payload, cwd or tool under that identity', () => {
  const s = setup();
  assert.deepEqual(s.host.captureSpawnSnapshot(s.ev), s.ticket);
  for (const mutate of [ev => { ev.tool_input.message = 'changed'; }, ev => { ev.cwd = '/another-workspace'; }, ev => { ev.tool_name = 'spawn_agent'; }]) {
    const changed = structuredClone(s.ev); mutate(changed);
    assert.throws(() => s.host.captureSpawnSnapshot(changed), /fixture_call_conflict/);
  }
  s.ticket.input_digest = 'changed-external-copy';
  assert.notEqual(s.host.captureSpawnSnapshot(s.ev).input_digest, s.ticket.input_digest);
});

test('final session cwd turn call tool and input binding must all match the original captured call', () => {
  for (const mutate of [
    ev => { ev.session_id = 'foreign-session'; }, ev => { ev.cwd = '/foreign-workspace'; },
    ev => { ev.turn_id = 'foreign-turn'; }, ev => { ev.tool_use_id = 'foreign-call'; },
    ev => { ev.tool_name = 'spawn_agent'; }, ev => { ev.tool_input.message = 'changed-after-other-hook'; },
  ]) {
    const s = setup(), finalEvent = structuredClone(s.ev); mutate(finalEvent); preserve(s, s.reply, finalEvent);
    assert.equal(s.host.getDispatchResult(s.ticket.ticket).reason, 'call_changed');
  }
});

test('foreign ticket epoch revision digest or expiry cannot enqueue a captured call', () => {
  for (const change of [
    { ticket: 'foreign-ticket' }, { epoch: 'foreign-epoch' }, { resolver_revision: 99 },
    { input_digest: 'foreign-digest' }, { expires_at: 1_800_000_020_000 },
  ]) { const s = setup(); preserve(s, { ...s.reply, ...change }); }
});

test('any resolver mutation including ABA or same-value update invalidates the pending revision', () => {
  for (const transitions of [[resolver()], [{ ...resolver(), host_extensions: 'present' }, resolver()]]) {
    const s = setup(); for (const next of transitions) s.host.updateResolver(next);
    preserve(s); assert.equal(s.host.getDispatchResult(s.ticket.ticket).reason, 'revision_changed');
  }
});

test('incomplete sources settings pins environment changes and unknown extensions preserve settings', () => {
  for (const mutate of [
    value => { value.layers.pop(); }, value => { value.layers[0].model = 'unknown'; },
    value => { value.layers[0].effort = 'pinned'; }, value => { value.environment.CODEX_MODEL = 'set'; },
    value => { delete value.environment.CODEX_MODEL; }, value => { value.host_extensions = 'present'; },
    value => { value.host_extensions = 'unknown'; }, value => { value.client_version = 'unsupported'; },
  ]) {
    const state = resolver(); mutate(state);
    const host = new ReferenceDispatchHost(state), ev = event(), ticket = host.captureSpawnSnapshot(ev);
    assert.equal(host.compareAndEnqueue({ ...ticket, recommendation: recommendation() }, ev, () => 'allow', never).state, 'preserve');
  }
});

test('native model effort role fork and resume selections are preserved', () => {
  for (const change of [{ model: 'selected' }, { effort: 'high' }, { reasoning_effort: 'high' }, { model_reasoning_effort: null },
    { role: 'custom' }, { agent_type: 'custom' }, { fork_turns: 'all' }, { fork_context: false }, { resume: 'child' }, { agent_id: null }]) {
    const host = new ReferenceDispatchHost(resolver()), ev = event(); Object.assign(ev.tool_input, change);
    const ticket = host.captureSpawnSnapshot(ev);
    assert.equal(host.compareAndEnqueue({ ...ticket, recommendation: recommendation() }, ev, () => 'allow', never).state, 'preserve');
  }
});

test('cancelled or expired tickets remain terminal and are not replaced with a new capture', () => {
  const cancelled = setup(); assert.deepEqual(cancelled.host.cancelTicket(cancelled.ticket.ticket), { state: 'cancelled', reason: 'cancelled' });
  assert.equal(cancelled.host.compareAndEnqueue(cancelled.reply, cancelled.ev, () => 'allow', never).state, 'cancelled');
  assert.deepEqual(cancelled.host.captureSpawnSnapshot(cancelled.ev), cancelled.ticket);
  const expired = setup(); expired.advance(10_000); preserve(expired);
  assert.equal(expired.host.getDispatchResult(expired.ticket.ticket).reason, 'expired');
  assert.deepEqual(expired.host.captureSpawnSnapshot(expired.ev), expired.ticket);
});

test('other security decisions dominate valid recommendations and require no queue action', () => {
  for (const security of ['deny', 'ask']) {
    const s = setup(); const answer = s.host.compareAndEnqueue(s.reply, s.ev, () => security, never);
    assert.equal(answer.state, security === 'deny' ? 'denied' : 'preserve'); assert.equal(answer.reason, 'security_not_allowed');
    assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', never), answer);
  }
});

test('provider model injection profile changes policy mismatch and catalog mismatch never reach queue', () => {
  for (const mutate of [
    value => { value.profile_id = 'unlisted'; }, value => { value.policy_version = 'foreign'; },
    value => { value.catalog_version = 'foreign'; }, value => { value.model = 'injected'; },
    value => { value.reasoning_effort = 'injected'; }, value => { value.profile.model = 'injected'; },
    value => { value.profile.command = 'injected'; }, value => { value.status = 'unavailable'; },
  ]) {
    const s = setup(); mutate(s.reply.recommendation); preserve(s);
    assert.equal(s.host.getDispatchResult(s.ticket.ticket).reason, 'recommendation_invalid');
  }
});

test('queue exceptions and explicitly uncertain acceptance never retry or expose raw errors', () => {
  for (const mode of ['throw', 'unknown']) {
    const s = setup(); let attempts = 0;
    const queue = () => { attempts++; if (mode === 'throw') throw new Error('synthetic-private-queue-error'); return 'unknown'; };
    const answer = s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', queue);
    assert.deepEqual(answer, { state: 'unknown', reason: 'enqueue_unknown' });
    assert.equal(JSON.stringify(answer).includes('synthetic-private'), false);
    assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', queue), answer); assert.equal(attempts, 1);
    assert.deepEqual(s.host.cancelTicket(s.ticket.ticket), answer);
  }
});

test('synchronous dispatch serializes resolver mutation restart capture and reentrant duplicate queue attempts', () => {
  const s = setup(); let attempts = 0;
  const result = s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', () => {
    attempts++;
    assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', never), { state: 'unknown', reason: 'enqueue_unknown' });
    assert.throws(() => s.host.updateResolver(resolver()), /fixture_dispatch_locked/);
    assert.throws(() => s.host.restart(), /fixture_dispatch_locked/);
    assert.throws(() => s.host.captureSpawnSnapshot(event('second-call')), /fixture_dispatch_locked/);
    return 'accepted';
  });
  assert.equal(result.state, 'enqueued'); assert.equal(attempts, 1);
});

test('simulated restart invalidates pending work while retaining completed and uncertain dispatch ledger', () => {
  const s = setup(), completedEvent = event('completed-call'), done = s.host.captureSpawnSnapshot(completedEvent);
  let attempts = 0;
  assert.equal(s.host.compareAndEnqueue({ ...done, recommendation: recommendation() }, completedEvent, () => 'allow', () => { attempts++; return 'accepted'; }).state, 'enqueued');
  s.host.restart();
  assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', never), { state: 'unknown', reason: 'restart_unknown' });
  assert.deepEqual(s.host.captureSpawnSnapshot(s.ev), s.ticket);
  assert.equal(s.host.compareAndEnqueue({ ...done, recommendation: recommendation() }, completedEvent, () => 'allow', never).state, 'enqueued');
  assert.equal(attempts, 1);
  const fresh = s.host.captureSpawnSnapshot(event('new-call'));
  assert.notEqual(fresh.epoch, s.ticket.epoch);
});

test('capacity exhaustion retains prior ledger entries rather than evicting replay protection', () => {
  const s = setup({ capacity: 1 });
  assert.throws(() => s.host.captureSpawnSnapshot(event('another-call')), /fixture_capacity_exhausted/);
  assert.deepEqual(s.host.captureSpawnSnapshot(s.ev), s.ticket);
  s.host.cancelTicket(s.ticket.ticket);
  assert.throws(() => s.host.captureSpawnSnapshot(event('another-call')), /fixture_capacity_exhausted/);
  assert.equal(s.host.getDispatchResult(s.ticket.ticket).state, 'cancelled');
});

test('clock rollback cannot extend ticket lifetime or authorize dispatch', () => {
  const s = setup(); s.advance(-1); preserve(s);
  assert.equal(s.host.getDispatchResult(s.ticket.ticket).reason, 'clock_invalid');
  assert.throws(() => s.host.captureSpawnSnapshot(event('new-call')), /fixture_clock_invalid/);
});

test('final security authorization sees the catalog candidate and cannot mutate the queued input through its copy', () => {
  const s = setup(), original = structuredClone(s.ev); let authorized = false;
  const answer = s.host.compareAndEnqueue(s.reply, s.ev, candidate => {
    assert.equal(candidate.model, recommendation().profile.model); assert.equal(candidate.reasoning_effort, recommendation().profile.reasoning_effort);
    assert.equal(candidate.message, original.tool_input.message); assert.equal(candidate.sandbox, original.tool_input.sandbox);
    candidate.sandbox = 'changed-only-in-authorizer-copy'; candidate.model = 'changed-only-in-authorizer-copy';
    authorized = true; return 'allow';
  }, candidate => {
    assert.equal(authorized, true); assert.equal(candidate.model, recommendation().profile.model);
    assert.equal(candidate.sandbox, original.tool_input.sandbox); return 'accepted';
  });
  assert.equal(answer.state, 'enqueued'); assert.deepEqual(s.ev, original);
});

test('authorization failure or an asynchronous authorization result never reaches synchronous queue', () => {
  for (const authorize of [() => { throw new Error('synthetic-private-authorization-error'); }, () => Promise.resolve('allow')]) {
    const s = setup(); const answer = s.host.compareAndEnqueue(s.reply, s.ev, authorize, never);
    assert.equal(answer.state, 'preserve'); assert.equal(JSON.stringify(answer).includes('synthetic-private'), false);
    assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', never), answer);
  }
});

test('authorization lock refuses cancellation or reentrant dispatch without silently changing ticket state', () => {
  const s = setup(); const secondEvent = event('second-call'), second = s.host.captureSpawnSnapshot(secondEvent);
  let calls = 0;
  const answer = s.host.compareAndEnqueue(s.reply, s.ev, () => {
    assert.deepEqual(s.host.cancelTicket(s.ticket.ticket), { state: 'preserve', reason: 'dispatch_busy' });
    assert.equal(s.host.getDispatchResult(s.ticket.ticket), null);
    assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', never), { state: 'preserve', reason: 'dispatch_busy' });
    assert.deepEqual(s.host.compareAndEnqueue({ ...second, recommendation: recommendation() }, secondEvent, () => 'allow', never), { state: 'preserve', reason: 'dispatch_busy' });
    assert.throws(() => s.host.updateResolver(resolver()), /fixture_dispatch_locked/);
    return 'allow';
  }, () => { calls++; return 'accepted'; });
  assert.equal(answer.state, 'enqueued'); assert.equal(calls, 1);
  assert.equal(s.host.compareAndEnqueue({ ...second, recommendation: recommendation() }, secondEvent, () => 'allow', () => { calls++; return 'accepted'; }).state, 'enqueued');
  assert.equal(calls, 2);
});

test('authorization cannot outlive ticket expiry before the queue commit', () => {
  const s = setup();
  const answer = s.host.compareAndEnqueue(s.reply, s.ev, () => { s.advance(10_000); return 'allow'; }, never);
  assert.deepEqual(answer, { state: 'preserve', reason: 'expired' });
  assert.deepEqual(s.host.compareAndEnqueue(s.reply, s.ev, () => 'allow', never), answer);
});

test('clock rollback inside authorization invalidates the final queue check', () => {
  const s = setup();
  const answer = s.host.compareAndEnqueue(s.reply, s.ev, () => { s.advance(-1); return 'allow'; }, never);
  assert.deepEqual(answer, { state: 'preserve', reason: 'clock_invalid' });
});
