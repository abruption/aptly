// Fixture-only diagnostics. Never imported by the product or shipped in npm.
import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { performance } from 'node:perf_hooks';

const phases = ['connect', 'capabilities', 'validation', 'cleanup'] as const;
type Phase = typeof phases[number];
const signals = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGPIPE', 'SIGQUIT', 'SIGTRAP'] as const;
const elapsed = ['lt_1s', '1_2s', '2_3s', '3_10s', 'ge_10s'] as const;
const errors = ['connection_closed', 'request_timeout', 'assertion', 'other'] as const;
const stderrClasses = ['empty', 'stable_runtime_unavailable', 'server_configuration_error', 'other', 'truncated'] as const;
const stderrSizes = ['0', '1_256', '257_4096', 'over_4096'] as const;
const observations = ['before_cleanup', 'during_cleanup', 'unavailable'] as const;
const spawnErrors = ['ENOENT', 'EACCES', 'other'] as const;
const oneOf = (values: readonly string[], value: unknown): value is string => typeof value === 'string' && values.includes(value);
const exitCode = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
type ChildStatus = { exit_code: number | null; signal: string | null; spawn_error: string | null };

function childStatus(file: string): ChildStatus | null {
  let fd: number | undefined;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 512) return null;
    const data = Buffer.alloc(513), size = readSync(fd, data, 0, data.length, 0);
    if (size > 512) return null;
    const value = JSON.parse(data.subarray(0, size).toString('utf8'));
    if (!value || Object.keys(value).sort().join(',') !== 'exit_code,signal,spawn_error' ||
      !(value.exit_code === null || exitCode(value.exit_code)) ||
      !(value.signal === null || oneOf(signals, value.signal)) ||
      !(value.spawn_error === null || oneOf(spawnErrors, value.spawn_error))) return null;
    return value;
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

export class StableSmokeDiagnostics {
  phase: Phase = 'connect';
  private readonly started = performance.now();
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  private stored = 0;
  private failure: { phase: Phase; elapsed: string; error: string } | undefined;
  private before: ChildStatus | null = null;
  private after: ChildStatus | null = null;
  private cleanupFinished = false;
  private readonly statusPath: string;
  constructor(statusPath: string) { this.statusPath = statusPath; }
  captureStderr(chunk: Buffer | string) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.bytes = Math.min(4097, this.bytes + value.length);
    const remaining = 4096 - this.stored;
    if (remaining > 0) { const kept = Buffer.from(value.subarray(0, remaining)); this.chunks.push(kept); this.stored += kept.length; }
  }
  fail(error: unknown) {
    if (this.failure) return;
    const code = error && typeof error === 'object' ? (error as {code?:unknown}).code : undefined;
    const milliseconds = performance.now() - this.started;
    this.failure = { phase: this.phase, elapsed: milliseconds < 1000 ? 'lt_1s' : milliseconds < 2000 ? '1_2s' : milliseconds < 3000 ? '2_3s' : milliseconds < 10000 ? '3_10s' : 'ge_10s',
      error: code === -32000 ? 'connection_closed' : code === -32001 ? 'request_timeout' : code === 'ERR_ASSERTION' ? 'assertion' : 'other' };
    if (!this.cleanupFinished) this.before = childStatus(this.statusPath);
  }
  finishCleanup(error?: unknown) {
    this.cleanupFinished = true;
    if (error !== undefined) { this.phase = 'cleanup'; this.fail(error); }
    this.after = childStatus(this.statusPath);
  }
  report() {
    const value = Buffer.concat(this.chunks).toString('utf8');
    const stderrClass = this.bytes === 0 ? 'empty' : this.bytes > 4096 ? 'truncated' : value === 'aptly: stable_runtime_unavailable\n' ? 'stable_runtime_unavailable' : value === 'aptly: server_configuration_error\n' ? 'server_configuration_error' : 'other';
    const status = this.before ?? this.after;
    return { kind: 'aptly-stable-smoke', phase: this.failure?.phase ?? this.phase, elapsed_bucket: this.failure?.elapsed ?? 'lt_1s', error_class: this.failure?.error ?? 'other',
      stderr_class: stderrClass, stderr_size: this.bytes === 0 ? '0' : this.bytes <= 256 ? '1_256' : this.bytes <= 4096 ? '257_4096' : 'over_4096',
      child_exit: status?.exit_code ?? null, child_signal: status?.signal ?? null, spawn_error: status?.spawn_error ?? null,
      exit_observation: this.before ? 'before_cleanup' : this.after ? 'during_cleanup' : 'unavailable' };
  }
}

// An owned process wrapper supplies exit/signal evidence without SDK internals.
// Inherited descriptors preserve the actual launcher's MCP bytes and EOF behavior.
export const stableSmokeWrapperSource = String.raw`
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [record, command, ...args] = process.argv.slice(2);
let spawnError = null;
const child = spawn(command, args, {stdio:'inherit', env:{...process.env,NODE_OPTIONS:'--unsupported-injection-fixture'}});
for (const signal of ['SIGTERM','SIGINT','SIGHUP']) process.on(signal,()=>{child.kill(signal);});
child.once('error',error=>{spawnError=['ENOENT','EACCES'].includes(error.code)?error.code:'other';});
child.once('close',(code,signal)=>{
  const value={exit_code:Number.isInteger(code)&&code>=0&&code<=255?code:null,signal,spawn_error:spawnError};
  try {writeFileSync(record,JSON.stringify(value),{mode:0o600,flag:'wx'});} catch {process.exitCode=1;return;}
  process.exitCode=value.exit_code??1;
});
`;

/** The outer runner prints only the finite diagnostic schema, never raw child output. */
export function formatSmokeRunnerFailure(result: {status:number|null;signal:string|null;stderr:string|Buffer|null}): string {
  const text = result.stderr?.toString() ?? '';
  if (Buffer.byteLength(text) <= 4096) {
    const line = text.split('\n').find(line => line.startsWith('APTLY_STABLE_SMOKE_DIAGNOSTIC '));
    if (line) try {
      const value = JSON.parse(line.slice('APTLY_STABLE_SMOKE_DIAGNOSTIC '.length));
      const expected = ['kind','phase','elapsed_bucket','error_class','stderr_class','stderr_size','child_exit','child_signal','spawn_error','exit_observation'];
      if (value && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value,key)) && value.kind === 'aptly-stable-smoke' &&
        oneOf(phases,value.phase) && oneOf(elapsed,value.elapsed_bucket) && oneOf(errors,value.error_class) && oneOf(stderrClasses,value.stderr_class) && oneOf(stderrSizes,value.stderr_size) &&
        (value.child_exit === null || exitCode(value.child_exit)) && (value.child_signal === null || oneOf(signals,value.child_signal)) &&
        (value.spawn_error === null || oneOf(spawnErrors,value.spawn_error)) && oneOf(observations,value.exit_observation)) return JSON.stringify(value);
    } catch { /* Untrusted fixture text is deliberately discarded. */ }
  }
  return JSON.stringify({kind:'aptly-stable-smoke-runner',runner_exit:exitCode(result.status)?result.status:null,runner_signal:oneOf(signals,result.signal)?result.signal:null,diagnostic:'unavailable'});
}
