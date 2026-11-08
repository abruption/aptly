import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { automaticHook, loadAutomaticHookPolicy } from '../src/automatic-hook.ts';
import { SpawnContexts } from '../src/spawn-context.ts';
import { Router, defaultPolicy } from '../src/core.ts';
import { hookInput } from '../src/hook.ts';
import { createTestTemp } from '../test-support/temp.ts';

const event = client => ({ hook_event_name: 'PreToolUse', tool_name: client === 'codex' ? 'collaborationspawn_agent' : 'Agent',
  tool_use_id: 'synthetic-call', session_id: 'synthetic-session',
  tool_input: client === 'codex' ? { task_name: 'Sort values', message: 'Sort the supplied numbers [3, 1, 2] in ascending order.', fork_turns: 'none', sandbox: 'read-only' } :
    { description: 'Sort values', prompt: 'Sort the supplied numbers [3, 1, 2] in ascending order.', subagent_type: 'general-purpose', run_in_background: false } });
function fixture(t, options = {}) {
  const dir = createTestTemp(t, 'codex-automatic-hook-');
  const path = join(dir, 'policy.json');
  const state = join(dir, 'state'); mkdirSync(state, { mode: 0o700 });
  const policy = { schema_version: 1, kind: 'aptly-auto-hook', mode: 'defaults', issuer: 'operator_installation', enabled: true, state_directory: state, ...options.policy };
  const write = value => writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); write(policy);
  const calls = [];
  // Injection exercises the Decisions policy path without network or paid calls.
  const router = new Router({ policy: { ...defaultPolicy, provider_id: 'decisions', ...options.routerPolicy }, ledgerPath: join(state, 'ledger.json'), provider: async args => {
    calls.push(args); return options.provider ? options.provider(args) : { choice: args.profiles[0].id };
  } });
  return { dir, path, state, policy, write, calls, router,
    run: (client = 'codex', ev = event(client), extra = {}) => automaticHook({ client, event: ev, router, policyPath: path, ...extra }) };
}
for (const client of ['codex', 'claude']) {
  test(`${client}: explicit operator policy selects exact catalog defaults and preserves other arguments`, async t => {
    const f = fixture(t), ev = event(client), before = structuredClone(ev);
    const result = await f.run(client, ev);
    assert.equal(result.observation.status, 'arguments_updated');
    const output = result.output.hookSpecificOutput;
    const profile = defaultPolicy.profiles.find(profile => profile.client === client);
    assert.equal(output.updatedInput.model, profile.model);
    const expected = { ...before.tool_input, model: profile.model, ...(client === 'codex' ? { reasoning_effort: profile.reasoning_effort } : {}) };
    assert.deepEqual(output.updatedInput, expected);
    assert.deepEqual(ev, before);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].input.task.context_sufficient, true);
    assert.match(f.calls[0].input.task.summary, /Sort the supplied numbers/);
    assert.equal(Object.hasOwn(f.calls[0].input.constraints, 'provenance_verified'), false);
    assert.doesNotMatch(JSON.stringify(result.observation), /Sort|synthetic|sandbox/);
    const repeated = await f.run(client, ev);
    assert.equal(repeated.observation.request_id, result.observation.request_id);
    assert.equal(f.calls.length, 1);
    const binding = readdirSync(f.state).find(name => name.startsWith('hook-call-'));
    assert.doesNotMatch(readFileSync(join(f.state, binding), 'utf8'), /Sort|synthetic|sandbox|message|prompt/);
  });
  test(`${client}: advisory mode emits model-visible advice without input or permission decision`, async t => {
    const f = fixture(t, { policy: { mode: 'advisory' } });
    const result = await f.run(client);
    assert.equal(result.observation.status, 'advisory');
    assert.match(result.output.hookSpecificOutput.additionalContext, /Aptly suggests/);
    assert.deepEqual(Object.keys(result.output.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName']);
  });
  test(`${client}: all explicit model/effort/resume/role pins preserve without classification`, async t => {
    const f = fixture(t);
    for (const key of ['model', 'effort', 'reasoning_effort', 'model_reasoning_effort', 'resume', 'resume_agent', 'agent_id', 'role', 'agent_type']) {
      for (const value of [null, '', false, 'explicit']) {
        const ev = event(client); ev.tool_input[key] = value;
        const result = await f.run(client, ev);
        assert.deepEqual(result.output, {}); assert.equal(result.observation.status, 'preserved');
      }
    }
    assert.equal(f.calls.length, 0);
  });
  test(`${client}: missing actual body, label-only task and sensitive body never spend`, async t => {
    const f = fixture(t);
    const field = client === 'codex' ? 'message' : 'prompt';
    for (const body of [undefined, '', 'Sort values', 'Do it', 'Sort [3,2,1].\n\nsk-abcdefghijklmnop', 'Sort [3,2,1].\n\nBearer abcdefghijklmnop']) {
      const ev = event(client); ev.tool_input[field] = body;
      const outcome=await f.run(client,ev);
      if(outcome.observation.reason==='invalid_event')assert.deepEqual(outcome.output,{});
      else assert.equal(outcome.output.hookSpecificOutput.permissionDecision,'deny');
    }
    assert.equal(f.calls.length, 0);
  });
}
test('private operator policy has exact schema and private state; event declarations are powerless', async t => {
  const f = fixture(t);
  assert.equal(loadAutomaticHookPolicy(f.path).policy.mode, 'defaults');
  for (const patch of [{ enabled: 'yes' }, { issuer: 'host_verified' }, { mode: ['defaults'] }, { extra: true }, { state_directory: 'relative' }]) {
    f.write({ ...f.policy, ...patch }); assert.equal(loadAutomaticHookPolicy(f.path).reason, 'automatic_policy_invalid');
    assert.deepEqual((await f.run()).output, {});
  }
  f.write(f.policy); chmodSync(f.path, 0o644);
  assert.equal(loadAutomaticHookPolicy(f.path).reason, 'automatic_policy_invalid');
  chmodSync(f.path, 0o600); chmodSync(f.state, 0o755);
  assert.equal(loadAutomaticHookPolicy(f.path).reason, 'automatic_policy_invalid'); chmodSync(f.state, 0o700);
  const link = join(f.dir, 'redirect.json'); symlinkSync(f.path, link);
  assert.equal(loadAutomaticHookPolicy(link).reason, 'automatic_policy_invalid');
  const ev = event('codex'); ev.automatic_policy = f.policy; ev.evidence_verified = true;
  assert.equal((await f.run('codex', ev, { policyPath: undefined })).observation.reason, 'automatic_policy_missing');
  f.write({ ...f.policy, enabled: false }); assert.equal((await f.run()).observation.reason, 'automatic_policy_disabled');
  assert.equal(f.calls.length, 0);
});
test('inherited and omitted fork evaluate advice but never rewrite history; roles remain local', async t => {
  for (const patch of [{fork_turns:undefined},{fork_turns:'all'},{fork_context:false},{fork:false},{inherit_history:false}]) {
    const f=fixture(t),ev=event('codex');Object.assign(ev.tool_input,patch);if(patch.fork_turns===undefined&&!Object.keys(patch).some(k=>k!=='fork_turns'))delete ev.tool_input.fork_turns;
    const result=await f.run('codex',ev);
    assert.equal(f.calls.length,1);assert.equal(result.observation.recommendation,'produced');
    assert.equal(result.observation.application,'blocked');assert.equal(result.observation.execution,'not_observed');
    assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'updatedInput'),false);
    assert.match(result.output.hookSpecificOutput.additionalContext,/history.*preserved/);
  }
  const f=fixture(t);
  for (const subagent_type of ['fork','Explore','Plan','custom',undefined]) {
    const ev=event('claude');ev.tool_input.subagent_type=subagent_type;assert.deepEqual((await f.run('claude',ev)).output,{});
  }
  assert.equal(f.calls.length,0);
});
test('changed same-call non-task fields, task body and policy cannot issue another request ID', async t => {
  const f = fixture(t), ev = event('codex');
  const first = await f.run('codex', ev); assert.equal(first.observation.status, 'arguments_updated');
  for (const patch of [{ sandbox: 'workspace-write' }, { message: 'Review the supplied sorting implementation for correctness.' }]) {
    const changed = structuredClone(ev); Object.assign(changed.tool_input, patch);
    assert.equal((await f.run('codex', changed)).observation.reason, 'call_conflict');
  }
  for (const patch of [{ tool_name: 'spawn_agent' }, { cwd: '/changed-cwd' }, { turn_id: 'changed-turn' }]) {
    assert.equal((await f.run('codex', { ...ev, ...patch })).observation.reason, 'call_conflict');
  }
  f.write({ ...f.policy, mode: 'advisory' });
  assert.equal((await f.run('codex', ev)).observation.reason, 'call_conflict');
  assert.equal(f.calls.length, 1);
});
test('restarted Router reuses metadata and uncertain provider outcomes are never retried', async t => {
  const f = fixture(t, { provider: async () => { throw Object.assign(new Error('do not expose synthetic raw error'), { code: 'network' }); } });
  assert.equal((await f.run()).observation.reason, 'network');
  let called = false;
  const restarted = new Router({ policy: f.router.policy, ledgerPath: f.router.ledgerPath, provider: async () => { called = true; return { choice: 'codex-simple' }; } });
  const result = await f.run('codex', event('codex'), { router: restarted });
  assert.equal(result.observation.reason, 'outcome_unknown'); assert.equal(called, false);
  assert.doesNotMatch(JSON.stringify(result), /raw error/);
});
test('policy/input/catalog changes and cancellation while provider waits discard replacement', async t => {
  for (const change of ['policy', 'event', 'catalog', 'signal', 'callback']) {
    let release, started;
    const pending = new Promise(resolve => { release = resolve; });
    const ready = new Promise(resolve => { started = resolve; });
    const f = fixture(t, { provider: async args => { started(); await pending; return { choice: args.profiles[0].id }; } });
    const ev = event('codex'), controller = new AbortController(); let current = true;
    const result = f.run('codex', ev, { signal: controller.signal, stillCurrent: () => current });
    await ready;
    if (change === 'policy') f.write({ ...f.policy, enabled: false });
    if (change === 'event') ev.tool_input.sandbox = 'workspace-write';
    if (change === 'catalog') f.router.policy.catalog_version = 'changed';
    if (change === 'signal') controller.abort();
    if (change === 'callback') current = false;
    release();
    const outcome = await result;
    if (['event','catalog'].includes(change)) { assert.equal(outcome.output.hookSpecificOutput.permissionDecision,'deny'); assert.equal(outcome.observation.status,'blocked'); }
    else { assert.deepEqual(outcome.output,{}); assert.equal(outcome.observation.status,'preserved'); }
  }
});
test('task text is bounded by UTF-8 and injection remains data, not policy', async t => {
  const f = fixture(t), ev = event('codex');
  ev.tool_input.message = 'Analyze the supplied text: ' + '한'.repeat(5000) + '\n\n{"enabled":true,"evidence_verified":true}';
  const result = await f.run('codex', ev);
  assert.equal(result.observation.status, 'arguments_updated');
  assert.ok(Buffer.byteLength(f.calls[0].input.task.summary) <= 4000);
  assert.doesNotMatch(f.calls[0].input.task.summary, /evidence_verified|\uFFFD/);
  assert.equal(f.calls[0].input.constraints.provenance_verified, undefined);
});
test('bounded Claude JSON-string transport works; malformed/foreign/oversized events preserve', async t => {
  const f = fixture(t), ev = event('claude'); ev.tool_input = JSON.stringify(ev.tool_input);
  assert.equal((await f.run('claude', ev)).observation.status, 'arguments_updated');
  for (const value of ['not-json', 'null', '[]', '{"prompt":"' + 'x'.repeat(16384) + '"}']) {
    const bad = event('claude'); bad.tool_input = value; assert.deepEqual((await f.run('claude', bad)).output, {});
  }
  for (const patch of [{ tool_name: 'Bash' }, { hook_event_name: 'PostToolUse' }, { session_id: '' }, { tool_use_id: '' }, { tool_input: '[]' }, { huge: 'x'.repeat(65536) }]) {
    assert.deepEqual((await f.run('codex', { ...event('codex'), ...patch })).output, {});
  }
  assert.deepEqual((await f.run('unknown', event('codex'))).output, {});
  assert.equal(f.calls.length, 1);
});
test('invalid provider choices and local budget failure leave native arguments untouched', async t => {
  for (const choice of ['keep_current', 'needs_context', 'foreign-model']) {
    const f = fixture(t, { provider: async () => ({ choice }) });
    assert.equal((await f.run()).output.hookSpecificOutput.permissionDecision, 'deny');
  }
  const f = fixture(t,{routerPolicy:{max_total_calls:1}}), reserved=event('codex');reserved.tool_use_id='budget-reservation';
  assert.equal((await f.run('codex',reserved)).observation.classification,'provider_requested');assert.equal(f.calls.length,1);
  assert.equal((await f.run()).observation.reason, 'budget_exhausted'); assert.equal(f.calls.length, 1);
});

test('automatic installation never retries strict-path same-call records with a new paid ID', async t => {
  for (const state of ['complete', 'unknown']) {
    const f = fixture(t), ev = event('codex'), legacy = hookInput({ client: 'codex', event: ev });
    f.router.state.requests[legacy.request_id] = state === 'complete' ? { digest: 'a'.repeat(64), state, result: f.router.result('keep_current', 'preserved_constraints') } :
      { digest: 'a'.repeat(64), state };
    f.router.save();
    const result = await f.run('codex', ev);
    assert.equal(result.observation.reason, 'legacy_request_exists'); assert.equal(f.calls.length, 0);
    assert.deepEqual(readdirSync(f.state), ['ledger.json']);
  }
});

test('an awaited currentness callback cannot hide revoked policy or input changes', async t => {
  for (const timing of ['before', 'after']) {
    const f = fixture(t); let count = 0;
    const result = await f.run('codex', event('codex'), { stillCurrent: async () => {
      count++;
      if ((timing === 'before' && count === 1) || (timing === 'after' && count === 2)) f.write({ ...f.policy, enabled: false });
      return true;
    } });
    assert.equal(result.observation.reason, 'automatic_policy_changed');
    assert.deepEqual(result.output, {}); assert.equal(f.calls.length, timing === 'before' ? 0 : 1);
  }
});

test('synthetic/unknown providers never rewrite native defaults or invoke classification', async t => {
  for (const provider_id of ['fixture', undefined, 'unknown']) {
    const f = fixture(t, { routerPolicy: { provider_id } });
    const result = await f.run();
    assert.deepEqual(result.output, {});
    assert.equal(result.observation.reason, 'synthetic_provider');
    assert.equal(f.calls.length, 0);
    assert.deepEqual(readdirSync(f.state), []);
  }
  const f = fixture(t, { routerPolicy: { provider_id: 'fixture' }, policy: { mode: 'advisory' } });
  const result = await f.run();
  assert.equal(result.observation.status, 'advisory');
  assert.equal(Object.hasOwn(result.output.hookSpecificOutput, 'updatedInput'), false);
});

test('Codex opaque message uses only a descriptive visible task name, without decoding or forwarding ciphertext', async t => {
  const f = fixture(t), ev = event('codex');
  const ciphertext = 'gAAAAA' + 'A'.repeat(96) + '==';
  ev.tool_input.message = ciphertext;
  ev.tool_input.task_name = 'sort_supplied_numbers_3_1_2_ascending_without_tools';
  const result = await f.run('codex', ev);
  assert.equal(result.observation.status, 'arguments_updated');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].input.task.summary, 'Task summary from visible task_name only; opaque message not inspected: sort supplied numbers 3 1 2 ascending without tools');
  assert.equal(f.calls[0].input.task.context_sufficient, true);
  assert.doesNotMatch(JSON.stringify(f.calls), /gAAAA/);
  assert.equal(result.output.hookSpecificOutput.updatedInput.message, ciphertext);
  assert.equal(result.output.hookSpecificOutput.updatedInput.task_name, ev.tool_input.task_name);
  const repeated = await f.run('codex', ev);
  assert.equal(repeated.observation.request_id, result.observation.request_id);
  assert.equal(f.calls.length, 1);
});

test('opaque task-name fallback rejects vague, malformed, non-Codex and unbounded sources without spending', async t => {
  const f = fixture(t), ciphertext = 'gAAAAA' + 'A'.repeat(96) + '==';
  const name = 'sort_supplied_numbers_3_1_2_ascending_without_tools';
  for (const label of ['native_auto_app', 'cleanup_all_things', 'cleanup_merged', 'cleanup_merged_worktrees_now', 'review_failing_secrets', 'sort_values', 'a_b_c_12345678901234567890_1_2', 'sort_supplied_numbers_1_2',
    '_'+name, name+'_', name.replace('_', '__'), name.replace('sort', 'Sort'), name.replace('sort', '정렬'), name.replace('_', ' '),
    name + '_x'.repeat(256), 'sort_supplied_numbers_sk-abcdefghijklmnop_ascending_without_tools']) {
    const ev = event('codex'); ev.tool_input.message = ciphertext; ev.tool_input.task_name = label;
    const outcome=await f.run('codex',ev);
    if(outcome.observation.reason==='invalid_event')assert.deepEqual(outcome.output,{});
    else assert.equal(outcome.output.hookSpecificOutput.permissionDecision,'deny');
  }
  for (const body of [undefined, '', 'Do it', 'gAAAAA'+'A'.repeat(20), 'gAAAAA'+'A'.repeat(96)+'!', ciphertext+'\n']) {
    const ev = event('codex'); ev.tool_input.task_name = name; ev.tool_input.message = body;
    const outcome=await f.run('codex',ev);
    if(outcome.observation.reason==='invalid_event')assert.deepEqual(outcome.output,{});
    else assert.equal(outcome.output.hookSpecificOutput.permissionDecision,'deny');
  }
  const claude = event('claude'); claude.tool_input.description = name; claude.tool_input.prompt = ciphertext;
  assert.equal((await f.run('claude', claude)).output.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(f.calls.length, 0);
  const bounded = fixture(t, { routerPolicy: { max_summary_bytes: 80 } });
  const ev = event('codex'); ev.tool_input.task_name = name; ev.tool_input.message = ciphertext;
  assert.equal((await bounded.run('codex', ev)).observation.reason, 'insufficient_context');
  assert.equal(bounded.calls.length, 0);
});

test('partial Codex selections filter tuples and fill only the unspecified field',async t=>{
 for(const pin of ['model','reasoning_effort']){
  const f=fixture(t),ev=event('codex'),profile=defaultPolicy.profiles.find(p=>p.id==='codex-routine');ev.tool_input[pin]=profile[pin];
  const result=await f.run('codex',ev);assert.equal(result.observation.status,'arguments_updated');
  assert.deepEqual(f.calls[0].profiles.map(p=>p.id),[profile.id]);
  assert.equal(result.output.hookSpecificOutput.updatedInput[pin],ev.tool_input[pin]);
  assert.equal(result.output.hookSpecificOutput.updatedInput.model,profile.model);
  assert.equal(result.output.hookSpecificOutput.updatedInput.reasoning_effort,profile.reasoning_effort);
  const repeated=await f.run('codex',ev);assert.equal(repeated.observation.classification,'cache_hit');assert.equal(f.calls.length,1);
 }
});
test('both pins, unmatched halves and unsupported Claude effort preserve without spending',async t=>{
 for(const [client,patch] of [['codex',{model:'gpt-6.1-terra',reasoning_effort:'high'}],['codex',{model:'foreign'}],['codex',{reasoning_effort:'foreign'}],['claude',{model:'sonnet'}],['claude',{effort:'high'}]]){
  const f=fixture(t),ev=event(client);Object.assign(ev.tool_input,patch);const before=structuredClone(ev);
  const result=await f.run(client,ev);assert.equal(result.observation.status,'preserved');assert.equal(result.observation.classification,'not_requested');assert.deepEqual(result.output,{});assert.deepEqual(ev,before);assert.equal(f.calls.length,0);
 }
});
test('a constrained provider cannot select outside the matching profile subset',async t=>{
 const f=fixture(t,{provider:async()=>({choice:'codex-deep'})}),ev=event('codex');ev.tool_input.model=defaultPolicy.profiles.find(p=>p.id==='codex-simple').model;
 const result=await f.run('codex',ev);assert.equal(result.observation.reason,'invalid_choice');assert.equal(result.observation.application,'not_attempted');assert.equal(result.output.hookSpecificOutput.permissionDecision,'deny');
});
test('inherited calls retain cache, budget, cancellation, unknown and same-call conflict protections',async t=>{
 const inherited=()=>{const ev=event('codex');ev.tool_input.fork_turns='all';return ev;};
 const f=fixture(t);const ev=inherited();const first=await f.run('codex',ev);assert.equal(first.observation.classification,'provider_requested');
 assert.equal((await f.run('codex',ev)).observation.classification,'cache_hit');assert.equal(f.calls.length,1);
 const changed=structuredClone(ev);changed.tool_input.fork_turns='none';assert.equal((await f.run('codex',changed)).observation.reason,'call_conflict');assert.equal(f.calls.length,1);
 const budget=fixture(t,{routerPolicy:{max_total_calls:1}}),reserved=inherited();reserved.tool_use_id='budget-reservation';
 assert.equal((await budget.run('codex',reserved)).observation.classification,'provider_requested');assert.equal(budget.calls.length,1);
 assert.equal((await budget.run('codex',inherited())).observation.reason,'budget_exhausted');assert.equal(budget.calls.length,1);
 const cancelled=fixture(t),controller=new AbortController();controller.abort();assert.equal((await cancelled.run('codex',inherited(),{signal:controller.signal})).observation.reason,'call_cancelled');assert.equal(cancelled.calls.length,0);
 const unknown=fixture(t,{provider:async()=>{throw Object.assign(Error('synthetic'),{code:'network'});}});
 assert.equal((await unknown.run('codex',inherited())).observation.reason,'network');assert.equal((await unknown.run('codex',inherited())).observation.reason,'outcome_unknown');assert.equal(unknown.calls.length,1);
});
test('inherited concurrent calls use one bounded provider request and never imply execution',async t=>{
 let release,ready;const waiting=new Promise(r=>release=r),started=new Promise(r=>ready=r);
 const f=fixture(t,{provider:async a=>{ready();await waiting;return {choice:a.profiles[0].id};}}),ev=event('codex');ev.tool_input.fork_turns='all';
 const one=f.run('codex',ev);await started;const two=await f.run('codex',ev);assert.ok(['concurrency_limit','ledger_locked'].includes(two.observation.reason));release();
 const result=await one;assert.equal(result.observation.execution,'not_observed');assert.equal(result.observation.application,'blocked');assert.equal(f.calls.length,1);
});

test('inherited missing credentials stay local; pending cancellation keeps recommendation distinct from application',async t=>{
 const ev=event('codex');ev.tool_input.fork_turns='all';
 const missing=fixture(t);missing.router.provider.preflight=()=>{throw Object.assign(Error('synthetic'),{code:'unauthorized'});};
 const unauthorized=await missing.run('codex',ev);assert.equal(unauthorized.observation.reason,'unauthorized');assert.equal(unauthorized.observation.classification,'local_outcome');assert.equal(missing.calls.length,0);assert.equal(missing.router.state.calls,0);
 let release,ready;const waiting=new Promise(r=>release=r),started=new Promise(r=>ready=r),seen=[];
 const f=fixture(t,{provider:async a=>{ready();await waiting;return {choice:a.profiles[0].id};}}),controller=new AbortController();
 const pending=f.run('codex',ev,{signal:controller.signal,onObservation:o=>seen.push(o)});await started;
 assert.equal(seen[0].status,'pending');assert.equal(seen[0].classification,'evaluating');assert.equal(seen[0].execution,'not_observed');
 controller.abort();release();const result=await pending;assert.equal(result.observation.reason,'call_cancelled');assert.equal(result.observation.recommendation,'produced');assert.equal(result.observation.application,'blocked');assert.deepEqual(result.output,{});
});

test('short concrete opaque task names reach advice with inherited or omitted history, without rewriting it', async t => {
 for (const fork of ['all', undefined]) {
  const f = fixture(t), ev = event('codex');
  ev.tool_input.task_name = 'cleanup_merged_worktrees';
  ev.tool_input.message = 'gAAAAA' + 'A'.repeat(96) + '==';
  if (fork) ev.tool_input.fork_turns = fork; else delete ev.tool_input.fork_turns;
  const before = structuredClone(ev);
  const result = await f.run('codex', ev);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].input.task.summary, 'Task summary from visible task_name only; opaque message not inspected: cleanup merged worktrees');
  assert.equal(result.observation.classification, 'provider_requested');
  assert.equal(result.observation.recommendation, 'produced');
  assert.equal(result.observation.application, 'blocked');
  assert.equal(result.observation.reason, 'inherited_context_application_unverified');
  assert.equal(result.observation.execution, 'not_observed');
  assert.equal(Object.hasOwn(result.output.hookSpecificOutput, 'updatedInput'), false);
  assert.match(result.output.hookSpecificOutput.additionalContext, /not verified for this host/);
  assert.deepEqual(ev, before);
  assert.doesNotMatch(JSON.stringify(f.calls), /gAAAA/);
  await f.run('codex', ev);
  assert.equal(f.calls.length, 1);
 }
});
test('short opaque names still obey summary byte limits', async t => {
 const f = fixture(t, { routerPolicy: { max_summary_bytes: 80 } }), ev = event('codex');
 ev.tool_input.task_name = 'cleanup_merged_worktrees';
 ev.tool_input.message = 'gAAAAA' + 'A'.repeat(96);
 assert.equal((await f.run('codex', ev)).observation.reason, 'insufficient_context');
 assert.equal(f.calls.length, 0);
});

const description61='Inspect three synthetic merged branches and their worktrees. Report a proposed cleanup list; do not delete files or run commands. Expected output is a short table; no repository contents are needed.';
function contextEvent61() { const ev=event('codex');ev.tool_input.task_name='cleanup_merged_worktrees';ev.tool_input.message='gAAAAA'+'A'.repeat(96);ev.tool_input.fork_turns='all';return ev; }
test('explicit context is bound, minimal, cached, and cannot upgrade history application',async t=>{
 const f=fixture(t),ev=contextEvent61(),contexts=new SpawnContexts();
 assert.equal(contexts.register('codex',ev,description61,4000).status,'registered');
 const extra={context:()=>contexts.lookup('codex',ev)};
 const first=await f.run('codex',ev,extra),second=await f.run('codex',ev,extra);
 assert.equal(f.calls.length,1);assert.equal(second.observation.classification,'cache_hit');
 assert.match(f.calls[0].input.task.summary,/Inspect three synthetic/);
 assert.doesNotMatch(JSON.stringify(f.calls),/gAAAA|cleanup_merged_worktrees|sandbox/);
 assert.equal(first.observation.reason,'inherited_context_application_unverified');
 assert.equal(Object.hasOwn(first.output.hookSpecificOutput,'updatedInput'),false);
 assert.equal((await f.run('codex',ev)).observation.reason,'call_conflict');
 assert.equal(f.calls.length,1);
});
test('context cannot replace a previous paid label outcome or conceal unknown outcome',async t=>{
 for(const unknown of [false,true]){
  const f=fixture(t,{provider:async()=>{if(unknown)throw Object.assign(new Error('synthetic'),{code:'network'});return {choice:'needs_context'};}}),ev=contextEvent61();
  const first=await f.run('codex',ev);assert.equal(first.observation.reason,unknown?'network':'provider_needs_context');assert.equal(f.calls.length,1);
  const contexts=new SpawnContexts();contexts.register('codex',ev,description61,4000);
  const next=await f.run('codex',ev,{context:()=>contexts.lookup('codex',ev)});
  assert.equal(next.observation.reason,'call_conflict');assert.equal(f.calls.length,1);
  assert.ok(first.observation.request_id);
 }
});
test('explicit context still permits provider needs_context and respects opt-out and cancellation',async t=>{
 const f=fixture(t,{provider:async()=>({choice:'needs_context'})}),ev=contextEvent61(),contexts=new SpawnContexts();
 contexts.register('codex',ev,description61,4000);
 const extra={context:()=>contexts.lookup('codex',ev)};
 assert.equal((await f.run('codex',ev,extra)).observation.reason,'provider_needs_context');
 assert.equal((await f.run('codex',ev,extra)).observation.reason,'provider_needs_context');assert.equal(f.calls.length,1);
 f.write({...f.policy,enabled:false});
 assert.equal((await f.run('codex',ev,extra)).observation.reason,'automatic_policy_disabled');assert.equal(f.calls.length,1);
 const other=fixture(t),abort=new AbortController();abort.abort();
 assert.equal((await other.run('codex',ev,{...extra,signal:abort.signal})).observation.reason,'call_cancelled');
 assert.equal(other.calls.length,0);
});
test('revocation or expiry while provider is pending suppresses output without hiding paid accounting',async t=>{
 for(const expire of [false,true]){
  let now=0,release,ready;const gate=new Promise(r=>release=r),started=new Promise(r=>ready=r);
  const f=fixture(t,{provider:async a=>{ready();await gate;return {choice:a.profiles[0].id};}}),ev=contextEvent61(),contexts=new SpawnContexts(()=>now);
  contexts.register('codex',ev,description61,4000);
  const run=f.run('codex',ev,{context:()=>contexts.lookup('codex',ev)});
  await started;if(expire)now=300000;else contexts.cancel('codex',ev);release();
  const result=await run;
  assert.equal(result.observation.reason,expire?'context_expired':'context_cancelled');assert.equal(result.output.hookSpecificOutput.permissionDecision,'deny');
  assert.equal(result.observation.classification,'provider_requested');assert.equal(f.calls.length,1);
  await f.run('codex',ev,{context:()=>contexts.lookup('codex',ev)});assert.equal(f.calls.length,1);
 }
});

test('context-bound unknown outcomes and budgets never issue a replacement request',async t=>{
 for(const limited of [false,true]){
  const f=fixture(t,{routerPolicy:limited?{max_total_calls:1}:undefined,provider:async()=>{throw Object.assign(new Error('synthetic'),{code:'network'});}}),ev=contextEvent61(),contexts=new SpawnContexts();
  if(limited){const reserved=event('codex');reserved.tool_use_id='budget-reservation';assert.equal((await f.run('codex',reserved)).observation.reason,'network');assert.equal(f.calls.length,1);}
  const priorCalls=f.calls.length;
  contexts.register('codex',ev,description61,4000);const extra={context:()=>contexts.lookup('codex',ev)};
  const first=await f.run('codex',ev,extra),second=await f.run('codex',ev,extra);
  assert.equal(first.observation.reason,limited?'budget_exhausted':'network');
  assert.equal(second.observation.reason,limited?'budget_exhausted':'outcome_unknown');
  assert.equal(f.calls.length,priorCalls+(limited?0:1));
  assert.equal(first.observation.request_id,second.observation.request_id);
 }
});
test('concurrent context calls classify once; changed event context is rejected before spending',async t=>{
 const f=fixture(t),ev=contextEvent61(),contexts=new SpawnContexts();contexts.register('codex',ev,description61,4000);
 await Promise.all([f.run('codex',ev,{context:()=>contexts.lookup('codex',ev)}),f.run('codex',ev,{context:()=>contexts.lookup('codex',ev)})]);
 assert.equal(f.calls.length,1);
 const changed=structuredClone(ev);changed.tool_input.message+='A';
 assert.equal((await f.run('codex',changed,{context:()=>contexts.lookup('codex',changed)})).observation.reason,'context_mismatch');
 assert.equal(f.calls.length,1);
});

test('local task screening supports descriptive multilingual text and rejects padded vagueness', async t => {
 const {descriptiveTasks, vagueTasks} = await import('../test-support/language-context.ts');
 for (const text of descriptiveTasks) {
  const f = fixture(t), ev = event('codex'); ev.tool_input.message = text;
  const result = await f.run('codex', ev);
  assert.equal(result.observation.status, 'arguments_updated'); assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].input.task.summary.includes(text));
 }
 for (const text of vagueTasks) {
  const f = fixture(t), ev = event('codex'); ev.tool_input.message = text;
  assert.equal((await f.run('codex', ev)).observation.reason, 'insufficient_context'); assert.equal(f.calls.length, 0);
 }
});
