import test from 'node:test';
import assert from 'node:assert/strict';
import { hookInput, hookOutput } from '../src/hook.ts';
import { defaultPolicy } from '../src/core.ts';

const event = client => ({
  hook_event_name: 'PreToolUse', tool_name: client === 'codex' ? 'spawn_agent' : 'Agent',
  tool_use_id: 'call-123', session_id: 'synthetic-session',
  tool_input: client === 'codex' ? {
    task_name: 'synthetic_task', message: 'PRIVATE BODY must never become classification input',
    fork_turns: 'none', sandbox: 'read-only', cwd: '/synthetic',
  } : {
    description: 'Synthetic summary', prompt: 'PRIVATE BODY must never become classification input',
    subagent_type: 'general-purpose', run_in_background: false, cwd: '/synthetic',
  },
});
const recommended = client => {
  const profile = defaultPolicy.profiles.find(p => p.client === client);
  return { status: 'recommended', policy_version: defaultPolicy.version,
    catalog_version: defaultPolicy.catalog_version, profile_id: profile.id, profile: structuredClone(profile) };
};
const apply = (client, ev = event(client), recommendation = recommended(client), extra = {}) =>
  hookOutput({ client, event: ev, recommendation, mode: 'apply', compatibilityVerified: true, ...extra });

for (const client of ['codex', 'claude']) {
  test(`${client}: minimal input excludes private task body and configuration provenance`, () => {
    const ev = event(client); ev.transcript_path = '/never/read/this';
    const before = structuredClone(ev);
    const result = hookInput({ client, event: ev });
    assert.equal(result.client, client);
    assert.equal(result.constraints.provenance_verified, false);
    assert.equal(result.task.context_sufficient, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE BODY|never\/read|sandbox|cwd/);
    assert.deepEqual(ev, before);
    assert.equal(result.request_id, hookInput({ client, event: ev }).request_id);
    assert.notEqual(result.request_id, hookInput({ client, event: { ...ev, tool_use_id: 'different' } }).request_id);
  });
  test(`${client}: shadow and unverified compatibility never grant permission`, () => {
    assert.deepEqual(hookOutput({ client, event: event(client), recommendation: recommended(client) }), {});
    assert.deepEqual(apply(client, undefined, undefined, { compatibilityVerified: false }), {});
    assert.deepEqual(apply(client, undefined, undefined, { mode: 'invalid' }), {});
  });
  test(`${client}: verified opt-in rewrites only catalog model fields`, () => {
    const ev = event(client), before = structuredClone(ev);
    const result = apply(client, ev).hookSpecificOutput;
    assert.equal(result.hookEventName, 'PreToolUse');
    if (client === 'codex') assert.equal(result.permissionDecision, 'allow');
    else {
      assert.equal(Object.hasOwn(result, 'permissionDecision'), false);
      assert.equal(Object.hasOwn(result, 'permissionDecisionReason'), false);
      assert.deepEqual(Object.keys(result).sort(), ['hookEventName', 'updatedInput']);
    }
    const actual = result.updatedInput;
    assert.equal(actual.model, recommended(client).profile.model);
    delete actual.model;
    if (client === 'codex') { assert.equal(actual.reasoning_effort, recommended(client).profile.reasoning_effort); delete actual.reasoning_effort; }
    else assert.equal(Object.hasOwn(actual, 'effort'), false);
    assert.deepEqual(actual, before.tool_input);
    assert.deepEqual(ev, before);
  });
  test(`${client}: explicit model or either effort spelling is preserved`, () => {
    for (const key of ['model', 'effort', 'reasoning_effort', 'model_reasoning_effort']) {
      const ev = event(client); ev.tool_input[key] = 'explicit';
      assert.deepEqual(apply(client, ev), {});
    }
  });
  test(`${client}: provider errors, arbitrary model, foreign profile and catalog drift are ignored`, () => {
    for (const recommendation of [null, {}, { status: 'unavailable' },
      { ...recommended(client), profile_id: 'unknown' },
      { ...recommended(client), profile_id: recommended(client === 'codex' ? 'claude' : 'codex').profile_id },
      { ...recommended(client), policy_version: 'other' },
      { ...recommended(client), catalog_version: 'other' },
      { ...recommended(client), model: 'arbitrary-model' },
      { ...recommended(client), profile: { ...recommended(client).profile, model: 'arbitrary-model' } },
      { ...recommended(client), profile: { ...recommended(client).profile, command: 'execute' } },
    ]) assert.deepEqual(apply(client, event(client), recommendation), {});
  });
  test(`${client}: malformed, unrelated and uncorrelated events are ignored`, () => {
    for (const ev of [null, {}, { ...event(client), hook_event_name: 'SubagentStart' },
      { ...event(client), tool_name: 'Bash' }, { ...event(client), tool_input: null },
      { ...event(client), tool_use_id: '' }, { ...event(client), tool_input: [] }]) {
      assert.equal(hookInput({ client, event: ev }), null);
      assert.deepEqual(apply(client, ev), {});
    }
    const ev = event(client); delete ev.tool_use_id; ev.tool_call_id = 'fallback-id';
    assert.ok(hookInput({ client, event: ev }));
  });
}
test('Codex inherits omitted/all fork and preserves explicit role or legacy fork arguments', () => {
  for (const patch of [{ fork_turns: 'all' }, { fork_turns: undefined },
    { agent_type: 'reviewer' }, { role: 'reviewer' }, { fork_context: false }]) {
    const ev = event('codex'); Object.assign(ev.tool_input, patch);
    assert.deepEqual(apply('codex', ev), {});
  }
});
test('Claude fork and fixed specialized roles are preserved', () => {
  for (const subagent_type of ['fork', 'Explore', 'Plan', 'custom', undefined]) {
    const ev = event('claude'); ev.tool_input.subagent_type = subagent_type;
    assert.deepEqual(apply('claude', ev), {});
  }
});
test('API bodies are never used to fill missing labels', () => {
  for (const client of ['codex', 'claude']) {
    const ev = event(client); delete ev.tool_input[client === 'codex' ? 'task_name' : 'description'];
    assert.equal(hookInput({ client, event: ev }), null);
  }
});
test('invalid clients never produce a routing or permission request', () => {
  assert.equal(hookInput({ client: 'other', event: event('codex') }), null);
  assert.deepEqual(apply('other', event('codex'), recommended('codex')), {});
});
test('Claude JSON-string transport normalizes without mutating or exposing the body', () => {
  const ev = event('claude');
  const original = structuredClone(ev.tool_input);
  ev.tool_input = JSON.stringify(original);
  const before = structuredClone(ev);
  const result = hookInput({ client: 'claude', event: ev });
  assert.deepEqual(result, hookInput({ client: 'claude', event: { ...ev, tool_input: original } }));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE BODY/);
  assert.deepEqual(apply('claude', ev).hookSpecificOutput.updatedInput, { ...original, model: 'haiku' });
  assert.deepEqual(ev, before);
});
test('Claude JSON-string transport rejects malformed JSON and non-object JSON', () => {
  for (const tool_input of ['{invalid', '', 'null', '[]', '[{}]', 'true', '0', '"string"']) {
    const ev = { ...event('claude'), tool_input };
    assert.equal(hookInput({ client: 'claude', event: ev }), null);
    assert.deepEqual(apply('claude', ev), {});
  }
});
test('Claude JSON-string transport applies a 16384-byte inclusive bound', () => {
  const input = event('claude').tool_input;
  input.prompt = '';
  const overhead = Buffer.byteLength(JSON.stringify(input));
  input.prompt = 'x'.repeat(16384 - overhead);
  const exact = JSON.stringify(input);
  assert.equal(Buffer.byteLength(exact), 16384);
  assert.ok(hookInput({ client: 'claude', event: { ...event('claude'), tool_input: exact } }));
  for (const suffix of ['x', '한']) {
    const tool_input = JSON.stringify({ ...input, prompt: input.prompt + suffix });
    const ev = { ...event('claude'), tool_input };
    assert.equal(hookInput({ client: 'claude', event: ev }), null);
    assert.deepEqual(apply('claude', ev), {});
  }
});
test('Claude JSON-string explicit pins and specialized roles still preserve the original call', () => {
  for (const patch of [{ model: 'sonnet' }, { effort: 'high' }, { subagent_type: 'fork' }, { subagent_type: 'custom' }]) {
    const tool_input = JSON.stringify({ ...event('claude').tool_input, ...patch });
    assert.deepEqual(apply('claude', { ...event('claude'), tool_input }), {});
  }
});
test('Codex rejects string tool_input instead of silently accepting a foreign transport contract', () => {
  const ev = event('codex'); ev.tool_input = JSON.stringify(ev.tool_input);
  assert.equal(hookInput({ client: 'codex', event: ev }), null);
  assert.deepEqual(apply('codex', ev), {});
});
test('Codex 0.166.0 V2 observed namespace spelling is accepted precisely', () => {
  const ev=event('codex');ev.tool_name='collaborationspawn_agent';
  assert.equal(hookInput({client:'codex',event:ev}).client,'codex');
  assert.equal(apply('codex',ev).hookSpecificOutput.updatedInput.model,recommended('codex').profile.model);
  for(const name of ['collaboration_spawn_agent','collaboration.spawn_agent','other_spawn_agent']){
    ev.tool_name=name;assert.equal(hookInput({client:'codex',event:ev}),null);
  }
});
test('the final independent Hook apply check preserves resumed calls',()=>{
 for(const client of ['codex','claude'])for(const key of ['resume','resume_agent','agent_id']){
  const ev=event(client);ev.tool_input[key]='';assert.deepEqual(apply(client,ev),{});
 }
});
