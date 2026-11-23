/** Opt-in synthetic benchmark: node test-support/ledger-scale-benchmark.ts */
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {fork, type ChildProcess} from 'node:child_process';
import {lstatSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Router, defaultPolicy, validateLedgerState} from '../src/core.ts';
import {createTestTemp, temporaryRoot} from './temp.ts';
import {ledgerRequest} from './ledger-child.ts';

const policy = {...defaultPolicy, timeout_ms: 10000};
const path = fileURLToPath(import.meta.url);
const mockResult = {choice: 'codex-routine', confidence: 1};
const elapsed = (start: number) => Math.round((performance.now() - start) * 1000) / 1000;

// This worker accepts only paths created by its parent; no runtime configuration is loaded.
async function worker() {
  if (!process.connected || !process.send) throw new Error('worker_requires_ipc');
  const root = resolve(process.argv[3] ?? '');
  const token = process.argv[6];
  const expectedParent = realpathSync(temporaryRoot().root);
  const stat = lstatSync(root);
  if (dirname(root) !== expectedParent || realpathSync(root) !== root || !/^codex-ledger-benchmark-[A-Za-z0-9]+$/.test(basename(root)) ||
      !stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))) ||
      Date.now() - stat.mtimeMs > 300000 || !/^[0-9a-f-]{36}$/.test(token ?? '')) throw new Error('invalid_worker_directory');
  const marker = join(root, 'owner-token');
  const markerStat = lstatSync(marker);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || (process.platform !== 'win32' && ((markerStat.mode & 0o077) !== 0 || (process.getuid && markerStat.uid !== process.getuid()))) ||
      readFileSync(marker, 'utf8') !== token) throw new Error('invalid_worker_directory');
  const ledgerPath = join(root, 'gate.json');
  const id = process.argv[4];
  if (!['gate-first', 'gate-second'].includes(id)) throw new Error('invalid_worker_id');
  const hold = process.argv[5] === 'hold';
  const provider = async () => {
    process.send?.({type: 'provider_enter'});
    if (hold) await new Promise<void>((resolve, reject) => {
      const clean = () => { process.off('message', onMessage); process.off('disconnect', onDisconnect); };
      const onDisconnect = () => { clean(); reject(new Error('parent_disconnected')); };
      const onMessage = (message: unknown) => {
        if (message && typeof message === 'object' && (message as {type?: string}).type === 'release') {
          clean(); resolve();
        }
      };
      process.on('message', onMessage);
      process.once('disconnect', onDisconnect);
      if (!process.connected) onDisconnect();
    });
    return mockResult;
  };
  const result = await new Router({ledgerPath, policy, provider}).recommend(ledgerRequest(id));
  if (process.connected) process.send?.({type: 'result', result}, () => { if (process.connected) process.disconnect(); });
}

interface Message {type: string; result?: {status: string; reason: string}}
function child(root: string, token: string, id: string, hold: boolean) {
  const proc = fork(path, ['--worker', root, id, hold ? 'hold' : 'run', token], {
    env: {POC_TEST_TMP_ROOT: temporaryRoot().root, SystemRoot: process.env.SystemRoot},
    execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const messages: Message[] = [];
  let wake: (() => void) | undefined;
  let providerCalls = 0;
  let processError = false;
  proc.on('error', () => { processError = true; wake?.(); });
  proc.on('message', (message: Message) => { if (message.type === 'provider_enter') providerCalls++; messages.push(message); wake?.(); });
  const next = async (type: string): Promise<Message> => {
    const deadline = Date.now() + 10000;
    for (;;) {
      const index = messages.findIndex(message => message.type === type);
      if (index >= 0) return messages.splice(index, 1)[0];
      if (processError || proc.exitCode !== null || proc.signalCode !== null) throw new Error(`worker_exited_before_${type}`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`worker_timeout_${type}`);
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); proc.off('exit', done); wake = undefined; resolve(); };
        const timer = setTimeout(done, remaining);
        wake = done;
        proc.once('exit', done);
      });
    }
  };
  return {proc, next, providerCalls: () => providerCalls};
}

async function main() {
  let cleanup = () => {};
  const root = createTestTemp({after(fn: () => void) { cleanup = fn; }}, 'codex-ledger-benchmark-');
  const children: ChildProcess[] = [];
  let localProviderCalls = 0;
  try {
    const results = [];
    for (const count of [100, 1000, 10000]) {
      const ledgerPath = join(root, `ledger-${count}.json`);
      const provider = async () => { localProviderCalls++; return mockResult; };
      const router = new Router({ledgerPath, policy, provider});
      const sample = ledgerRequest('sample');
      sample.constraints.model_pinned = true;
      assert.equal((await router.recommend(sample)).reason, 'preserved_constraints');
      const state = JSON.parse(readFileSync(ledgerPath, 'utf8'));
      const record = state.requests.sample;
      state.requests = {};
      for (let i = 0; i < count; i++) {
        const id = `synthetic-${i}`;
        state.requests[id] = {...record, digest: createHash('sha256').update(id).digest('hex')};
      }
      validateLedgerState(state);
      writeFileSync(ledgerPath, JSON.stringify(state), {mode: 0o600});
      const bytes = statSync(ledgerPath).size;
      let started = performance.now();
      const snapshot = router.budgetStatus();
      const readValidationMs = elapsed(started);
      assert.equal(snapshot.usage.total_calls, 0);
      assert.equal(Object.keys(router.state.requests).length, count);
      started = performance.now();
      const result = await router.recommend(ledgerRequest(`transaction-${count}`));
      const transactionMs = elapsed(started);
      assert.equal(result.status, 'recommended');
      const saved: unknown = JSON.parse(readFileSync(ledgerPath, 'utf8'));
      validateLedgerState(saved);
      assert.equal(Object.keys(saved.requests).length, count + 1);
      assert.equal(saved.calls, 1);
      results.push({synthetic_local_outcomes: count, bytes, read_validation_ms: readValidationMs, full_transaction_ms: transactionMs});
    }
    assert.equal(localProviderCalls, 3);
    const gatePath = join(root, 'gate.json');
    const token = randomUUID();
    writeFileSync(join(root, 'owner-token'), token, {mode: 0o600, flag: 'wx'});
    const first = child(root, token, 'gate-first', true); children.push(first.proc);
    await first.next('provider_enter');
    let started = performance.now();
    const second = child(root, token, 'gate-second', false); children.push(second.proc);
    const locked = await second.next('result');
    const lockedMs = elapsed(started);
    assert.equal(locked.result?.reason, 'ledger_locked');
    assert.equal(second.providerCalls(), 0);
    first.proc.send({type: 'release'});
    assert.equal((await first.next('result')).result?.status, 'recommended');
    started = performance.now();
    const retry = child(root, token, 'gate-second', false); children.push(retry.proc);
    await retry.next('provider_enter');
    assert.equal((await retry.next('result')).result?.status, 'recommended');
    const retryMs = elapsed(started);
    assert.equal(first.providerCalls(), 1);
    assert.equal(retry.providerCalls(), 1);
    const gate: unknown = JSON.parse(readFileSync(gatePath, 'utf8'));
    validateLedgerState(gate);
    assert.equal(gate.calls, 2);
    assert.equal(Object.keys(gate.requests).length, 2);
    console.log(JSON.stringify({technique: 'One Router-generated local preserved-constraints outcome cloned with synthetic IDs and digests; no replay of seeded IDs.', paid_calls: 0, mock_provider_calls: localProviderCalls + 2, results, gate: {scenario: 'two processes; first holds provider until release, second observes ledger_locked, then retries', locked_including_process_start_ms: lockedMs, retry_including_process_start_ms: retryMs}, timing: 'observational single samples, not a performance guarantee'}, null, 2));
  } finally {
    for (const proc of children) if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
    await Promise.all(children.map(proc => proc.exitCode !== null || proc.signalCode !== null ? Promise.resolve() : new Promise<void>(resolve => { proc.once('exit', () => resolve()); setTimeout(resolve, 2000).unref(); })));
    cleanup();
  }
}

if (process.argv[2] === '--worker') await worker();
else if (resolve(process.argv[1] ?? '') === path) await main();
