// Probe-only JSONL transport. Never imported by the product MCP server.
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export const probeMethods = Object.freeze(['initialize', 'config/read'] as const);
const fail = (code: string) => new Error(code);

export class CodexProbeRpc {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private buffer = '';
  private bytes = 0;
  private stderrBytes = 0;
  private closed = false;
  readonly sentMethods: string[] = [];

  constructor(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number }) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.bytes += Buffer.byteLength(chunk);
      if (this.bytes > 8 * 1024 * 1024) return this.abort('probe_output_limit');
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
        if (Buffer.byteLength(line) > 1024 * 1024) return this.abort('probe_output_limit');
        if (!line.trim()) continue;
        let value: any;
        try { value = JSON.parse(line); } catch { return this.abort('probe_protocol_error'); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) return this.abort('probe_protocol_error');
        // Unsolicited server requests (including credential refresh) are never serviced.
        if (typeof value.method === 'string') {
          if (Object.hasOwn(value, 'id')) this.child.stdin.write(JSON.stringify({ id: value.id, error: { code: -32601, message: 'unsupported_probe_method' } }) + '\n');
          continue;
        }
        const entry = this.pending.get(value.id);
        if (!entry) continue;
        clearTimeout(entry.timer); this.pending.delete(value.id);
        if (Object.hasOwn(value, 'error')) entry.reject(fail('probe_rpc_error'));
        else if (Object.hasOwn(value, 'result')) entry.resolve(value.result);
        else entry.reject(fail('probe_protocol_error'));
      }
      if (Buffer.byteLength(this.buffer) > 1024 * 1024) this.abort('probe_output_limit');
    });
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBytes += chunk.length;
      if (this.stderrBytes > 1024 * 1024) this.abort('probe_output_limit');
    });
    this.child.on('error', () => this.abort('probe_process_error'));
    this.child.stdin.on('error', () => this.abort('probe_process_error'));
    this.child.on('close', () => this.abort('probe_process_closed'));
  }
  private timeoutMs: number;
  private abort(code: string) {
    this.closed = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(fail(code)); }
    this.pending.clear();
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL');
  }
  request(method: string, params: unknown): Promise<unknown> {
    if (!(probeMethods as readonly string[]).includes(method)) return Promise.reject(fail('probe_method_forbidden'));
    if (this.closed) return Promise.reject(fail('probe_process_closed'));
    const id = ++this.sequence;
    this.sentMethods.push(method);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.abort('probe_timeout'), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  initialized() {
    if (this.closed) throw fail('probe_process_closed');
    this.child.stdin.write('{"method":"initialized"}\n');
  }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const closed = new Promise<void>(resolve => this.child.once('close', () => resolve()));
    this.abort('probe_closed');
    await closed;
  }
}
