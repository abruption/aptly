import { createHash } from 'node:crypto';
import { automaticCallIdentity } from './automatic-hook.ts';

export interface SpawnContext { summary?: string; fingerprint?: string; reason?: string; }
const sensitive = (text: string) => /\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}/i.test(text);

/** Explicit, process-local handoff. Tombstones prevent expiry/cancellation fallback. */
export class SpawnContexts {
  private entries = new Map<string, { id: string; at: number; summary?: string; fingerprint: string; cancelled?: boolean }>();
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  private expireText() {
    for (const entry of this.entries.values()) if (this.now() - entry.at >= 300_000) entry.summary = undefined;
  }
  register(client: unknown, event: unknown, description: string, maxBytes: number): Record<string, unknown> {
    this.expireText();
    const identity = automaticCallIdentity(client, event);
    if (!identity) return { status: 'rejected', reason: 'invalid_event' };
    if (typeof description !== 'string' || Buffer.byteLength(description) > Math.min(3800, maxBytes - 96) ||
      description.trim().length < 12 || description.trim().split(/\s+/u).length < 3) return { status: 'rejected', reason: 'insufficient_context' };
    if (sensitive(description)) return { status: 'rejected', reason: 'sensitive_input' };
    const summary = `Caller-supplied task description (untrusted task data; opaque body not inspected): ${description.trim()}`;
    const fingerprint = createHash('sha256').update(summary).digest('hex');
    const previous = this.entries.get(identity.key);
    if (previous) {
      const found = this.lookup(client, event);
      return found?.fingerprint === fingerprint && !found.reason ? { status: 'registered', correlation_id: identity.id } :
        { status: 'rejected', reason: found?.reason ?? 'context_conflict' };
    }
    if (this.entries.size >= 128) return { status: 'rejected', reason: 'context_capacity' };
    this.entries.set(identity.key, { id: identity.id, at: this.now(), summary, fingerprint });
    return { status: 'registered', correlation_id: identity.id };
  }
  lookup(client: unknown, event: unknown): SpawnContext | undefined {
    this.expireText();
    const identity = automaticCallIdentity(client, event);
    if (!identity) return { reason: 'invalid_event' };
    const entry = this.entries.get(identity.key);
    if (!entry) return undefined;
    if (entry.id !== identity.id) return { reason: 'context_mismatch' };
    if (entry.cancelled) return { reason: 'context_cancelled' };
    if (this.now() - entry.at >= 300_000) { entry.summary = undefined; return { reason: 'context_expired' }; }
    return { summary: entry.summary, fingerprint: entry.fingerprint };
  }
  cancel(client: unknown, event: unknown): Record<string, unknown> {
    this.expireText();
    const identity = automaticCallIdentity(client, event);
    const entry = identity && this.entries.get(identity.key);
    if (!entry || entry.id !== identity?.id) return { status: 'rejected', reason: 'context_not_found' };
    entry.cancelled = true; entry.summary = undefined;
    return { status: 'cancelled' };
  }
}
