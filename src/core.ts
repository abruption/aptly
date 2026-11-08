import { createHash, randomUUID } from 'node:crypto';
import { openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync, chmodSync } from 'node:fs';
import { isRecord, errorCode } from './types.ts';
import { builtInProfiles, resolveCatalog, isSupportedProfile } from './catalog.ts';
import { acquireLedgerLock } from './ledger-lock.ts';
import { defaultBudgetLimits } from './budget.ts';
import type { BudgetLimits } from './budget.ts';
import type { LedgerLock } from './ledger-lock.ts';
const defaultCatalog = resolveCatalog({});
import type { BudgetLimit, Client, Profile, RoutingInput, RoutingPolicy, RoutingProvider, RoutingResult, RoutingStatus, UnknownRecord, Usage } from './types.ts';

export const defaultPolicy: Readonly<RoutingPolicy> = Object.freeze<RoutingPolicy>({
  version: 'aptly-v010', catalog_version: defaultCatalog.version, max_summary_bytes: 4000,
  max_concurrency: 1, max_daily_calls:defaultBudgetLimits.max_daily_calls, max_total_calls:defaultBudgetLimits.max_total_calls,
  estimated_call_usd:defaultBudgetLimits.estimated_call_usd, max_estimated_usd:defaultBudgetLimits.max_estimated_usd, timeout_ms: 10000,
  profiles: Object.freeze(builtInProfiles().map(profile=>Object.freeze(profile))),
  profile_descriptions: Object.freeze(defaultCatalog.descriptions),
});
interface LedgerRecord { digest: string; state: 'complete' | 'unknown'; result?: RoutingResult; }
interface LedgerState { version: 1; calls: number; estimated_usd: number; days: Record<string, number>; requests: Record<string, LedgerRecord>; }
interface RouterOptions { policy?: RoutingPolicy; provider?: RoutingProvider; ledgerPath?: string; budgetConfigurable?: boolean; }
type Metadata = Pick<RoutingResult, 'latency_ms' | 'confidence' | 'usage'>;
const clone = <T>(value: T): T => structuredClone(value);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const digest = (value: unknown): string => {
  const serialized = JSON.stringify(canonical(value));
  if (serialized === undefined) throw new Error('invalid_digest');
  return createHash('sha256').update(serialized).digest('hex');
};
const empty = (): LedgerState => ({ version: 1, calls: 0, estimated_usd: 0, days: {}, requests: {} });
const own = (obj: object, key: PropertyKey): boolean => Object.hasOwn(obj, key);
const keysOnly = (obj: unknown, allowed: readonly string[]): obj is UnknownRecord => isRecord(obj) && Object.keys(obj).every(k => allowed.includes(k));
const safeInt = (n: unknown, max = 1e9): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
const safeVersion = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value);
const usageOf = (usage: unknown): Usage => {
  if (!keysOnly(usage, ['input_tokens', 'output_tokens', 'total_tokens'])) throw new Error('invalid_usage');
  const { input_tokens, output_tokens, total_tokens } = usage;
  if (!safeInt(input_tokens) || !safeInt(output_tokens) || !safeInt(total_tokens) || total_tokens !== input_tokens + output_tokens) throw new Error('invalid_usage');
  return { input_tokens, output_tokens, total_tokens };
};
// Runtime eligibility stays within the current finite catalog; archival compatibility below does not expand it.
const supportedProfile = (p: UnknownRecord | Profile): boolean => isSupportedProfile(p);
// Storage compatibility only. These retired tuples may be read from an old
// ledger, but do not enter the runtime catalog or grant Hook execution rights.
const legacyStoredProfiles: readonly Profile[] = [
  {id:'codex-routine',client:'codex',model:'gpt-6.1-sol',reasoning_effort:'low'},
  {id:'codex-deep',client:'codex',model:'gpt-6-astra',reasoning_effort:'high'},
  {id:'claude-routine',client:'claude',model:'haiku'},
  {id:'claude-deep',client:'claude',model:'sonnet'},
];
function isStoredProfile(value: unknown): value is Profile {
  if (isSupportedProfile(value)) return true;
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length) return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return legacyStoredProfiles.some(profile=>{
    const expected=Object.entries(profile);
    return Object.keys(descriptors).length===expected.length && expected.every(([key,field])=>
      own(descriptors,key)&&own(descriptors[key],'value')&&descriptors[key].enumerable&&descriptors[key].value===field);
  });
}
const outcomeReasons: Record<RoutingStatus, readonly string[]> = {
  recommended: ['allowed_profile'],
  keep_current: ['preserved_constraints', 'unsupported_profile', 'invalid_response', 'invalid_choice', 'provider_abstained', 'no_candidates'],
  needs_context: ['insufficient_context', 'provider_needs_context'],
  unavailable: ['budget_exhausted'],
};
const isClient = (value: unknown): value is Client => value === 'codex' || value === 'claude';
const preservedFields = ['model_pinned', 'effort_pinned', 'role_pinned', 'fork_inherits'] as const;

export class Router {
  policy: RoutingPolicy;
  provider: RoutingProvider;
  ledgerPath: string | undefined;
  state: LedgerState;
  active: number;
  private budgetConfigurable: boolean;
  private heldLedgerLock: LedgerLock | undefined;
  constructor({ policy = defaultPolicy, provider, ledgerPath, budgetConfigurable = policy === defaultPolicy }: RouterOptions = {}) {
    this.budgetConfigurable = budgetConfigurable;
    this.policy = clone(policy);
    const integerCaps = { max_summary_bytes: 64000, max_concurrency: 16, max_daily_calls: 100000, max_total_calls: 1000000, timeout_ms: 60000 } as const;
    if (!safeVersion(policy.version) || !safeVersion(policy.catalog_version)) throw new Error('invalid_policy');
    for (const k of Object.keys(integerCaps) as (keyof typeof integerCaps)[]) {
      if (!safeInt(this.policy[k], integerCaps[k]) || (this.policy[k] === 0 && k !== 'max_daily_calls' && k !== 'max_total_calls')) throw new Error('invalid_policy');
    }
    for (const k of ['estimated_call_usd', 'max_estimated_usd'] as const) if (!Number.isFinite(policy[k]) || (policy[k] < 0 || (k === 'estimated_call_usd' && policy[k] === 0)) || policy[k] > 100) throw new Error('invalid_policy');
    if (typeof provider !== 'function') throw new Error('invalid_provider');
    if (!Array.isArray(policy.profiles) || policy.profiles.length > 20 || policy.profiles.some(p => !p || typeof p !== 'object') || new Set(policy.profiles.map(p => p.id)).size !== policy.profiles.length) throw new Error('invalid_policy');
    for (const p of policy.profiles) {
      if (!keysOnly(p, ['id', 'client', 'model', 'reasoning_effort']) || typeof p.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(p.id) || !supportedProfile(p) || (p.client === 'claude' && own(p, 'reasoning_effort'))) throw new Error('invalid_policy');
    }
    if (policy.profile_descriptions !== undefined && (!isRecord(policy.profile_descriptions) || Object.entries(policy.profile_descriptions).some(([id,value]) => !/^[a-z0-9-]{1,64}$/.test(id) || typeof value!=='string' || !value.trim() || Buffer.byteLength(value)>2400))) throw new Error('invalid_policy');
    this.provider = provider; this.ledgerPath = ledgerPath; this.state = empty(); this.active = 0;
  }
  /** Stable legacy-default projection for runtime budget knobs only. Custom library policies retain their full identity. */
  semanticPolicy(): RoutingPolicy {
    return this.budgetConfigurable ? { ...clone(this.policy), max_daily_calls:20, max_total_calls:50, estimated_call_usd:0.01, max_estimated_usd:0.5 } : clone(this.policy);
  }
  private budgetSnapshot(utc_day=new Date().toISOString().slice(0,10)) {
    const limits:BudgetLimits={max_daily_calls:this.policy.max_daily_calls,max_total_calls:this.policy.max_total_calls,max_estimated_usd:this.policy.max_estimated_usd,estimated_call_usd:this.policy.estimated_call_usd};
    const daily_calls=this.state.days[utc_day]??0;
    const exhausted_by:BudgetLimit[]=[];
    if(limits.max_daily_calls>0&&daily_calls>=limits.max_daily_calls)exhausted_by.push('max_daily_calls');
    if(limits.max_total_calls>0&&this.state.calls>=limits.max_total_calls)exhausted_by.push('max_total_calls');
    if(limits.max_estimated_usd>0&&this.state.estimated_usd+limits.estimated_call_usd>limits.max_estimated_usd+1e-12)exhausted_by.push('max_estimated_usd');
    return {limits,usage:{daily_calls,total_calls:this.state.calls,estimated_usd:this.state.estimated_usd},
      remaining:{daily_calls:limits.max_daily_calls===0?null:Math.max(0,limits.max_daily_calls-daily_calls),
        total_calls:limits.max_total_calls===0?null:Math.max(0,limits.max_total_calls-this.state.calls),
        estimated_usd:limits.max_estimated_usd===0?null:Math.max(0,limits.max_estimated_usd-this.state.estimated_usd)},
      utc_day,timezone:'UTC' as const,local_estimate:true as const,
      exhausted_by};
  }
  /** No provider, secret lookup, reservation or file creation. Existing ledgers use their existing gate. */
  budgetStatus() {
    if(this.active)throw Object.assign(new Error('ledger_locked'),{code:'ledger_locked'});
    if(!this.ledgerPath)return this.budgetSnapshot();
    try{lstatSync(this.ledgerPath);}catch(error){if(errorCode(error)==='ENOENT'){this.state=empty();return this.budgetSnapshot();}throw error;}
    const lock=acquireLedgerLock(this.ledgerPath,{initialize:false});
    this.heldLedgerLock=lock;
    try{this.load({readOnly:true});return this.budgetSnapshot();}
    finally{this.heldLedgerLock=undefined;lock.release();}
  }
  capabilities() {
    return { policy_version: this.policy.version, catalog_version: this.policy.catalog_version,
      profiles: clone(this.policy.profiles), profile_descriptions:clone(this.policy.profile_descriptions??{}), application: 'advisory_only' as const,
      storage: this.ledgerPath ? 'persistent_metadata' : 'in_memory_fixture_only',
      cost_guard: 'local_estimate_not_billing_cap', limits: Object.fromEntries(Object.entries(this.policy).filter(([k]) => k.startsWith('max_') || ['estimated_call_usd', 'timeout_ms'].includes(k))) };
  }
  result(status: RoutingStatus, reason: string, extra: Partial<RoutingResult> = {}): RoutingResult {
    return { status, reason, application: 'advisory_only', policy_version: this.policy.version, catalog_version: this.policy.catalog_version, ...extra };
  }
  validateOutcome(result: unknown): asserts result is RoutingResult {
    if (!keysOnly(result, ['status', 'reason', 'application', 'policy_version', 'catalog_version', 'profile_id', 'profile', 'usage', 'latency_ms', 'confidence']) ||
      typeof result.status !== 'string' || !own(outcomeReasons, result.status) || typeof result.reason !== 'string' || !outcomeReasons[result.status as RoutingStatus].includes(result.reason) || result.application !== 'advisory_only' ||
      !safeVersion(result.policy_version) || !safeVersion(result.catalog_version) ||
      (own(result, 'latency_ms') && (typeof result.latency_ms !== 'number' || !Number.isFinite(result.latency_ms) || result.latency_ms < 0 || result.latency_ms > 3600000)) ||
      (own(result, 'confidence') && (typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1))) throw new Error('invalid_outcome');
    if (own(result, 'usage')) usageOf(result.usage);
    if (result.status === 'recommended') {
      // Validate archival shape/known provenance without requiring membership
      // in today's selected subset. Eligibility is checked again before reuse.
      if (!isStoredProfile(result.profile) || result.profile_id !== result.profile.id) throw new Error('invalid_outcome');
    } else if (own(result, 'profile') || own(result, 'profile_id')) throw new Error('invalid_outcome');
  }
  load({readOnly=false}:{readOnly?:boolean}={}): void {
    if (!this.ledgerPath) return;
    this.heldLedgerLock?.assertHeld();
    try {
      const stat = lstatSync(this.ledgerPath);
      if (!stat.isFile() || stat.isSymbolicLink() || (readOnly && process.platform!=='win32' && ((stat.mode&0o077)!==0 || (process.getuid && stat.uid!==process.getuid())))) throw new Error('unsafe_ledger');
      if(!readOnly)chmodSync(this.ledgerPath, 0o600);
      const state: unknown = JSON.parse(readFileSync(this.ledgerPath, 'utf8'));
      if (!keysOnly(state, ['version', 'calls', 'estimated_usd', 'days', 'requests']) || state.version !== 1 || !safeInt(state.calls) || typeof state.estimated_usd !== 'number' || !Number.isFinite(state.estimated_usd) || state.estimated_usd < 0 ||
        !isRecord(state.days) || !isRecord(state.requests)) throw new Error('invalid_ledger');
      const days = state.days;
      if (Object.entries(days).some(([day, calls]) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || !safeInt(calls))) throw new Error('invalid_ledger');
      const validatedDays = days as Record<string, number>;
      if (Object.values(validatedDays).reduce((a, b) => a + b, 0) !== state.calls) throw new Error('invalid_ledger');
      for (const [id, record] of Object.entries(state.requests)) {
        if (!/^[A-Za-z0-9_-]{1,96}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || !keysOnly(record, ['digest', 'state', 'result']) || typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/.test(record.digest) || (record.state !== 'complete' && record.state !== 'unknown')) throw new Error('invalid_ledger');
        if (record.state === 'complete') this.validateOutcome(record.result);
        else if (own(record, 'result')) throw new Error('invalid_ledger');
      }
      // All records, counters and outcomes were validated above; no parsed
      // JSON shape is trusted at the file boundary before those checks.
      this.state = state as unknown as LedgerState;
    } catch (e) { if (errorCode(e) !== 'ENOENT') throw e; }
  }
  save(): void {
    if (!this.ledgerPath) return;
    this.heldLedgerLock?.assertHeld();
    const tmp = `${this.ledgerPath}.write-${randomUUID()}`;
    let fd: number | undefined;
    try {
      fd = openSync(tmp, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify(this.state)); closeSync(fd); fd = undefined;
      this.heldLedgerLock?.assertHeld();
      renameSync(tmp, this.ledgerPath);
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(tmp); } catch (e) { if (errorCode(e) !== 'ENOENT') throw e; }
    }
  }
  /** Strict native-routing path: preserves existing host-evidence and digest semantics. */
  async recommend(input: unknown): Promise<RoutingResult> {
    return this.route(input, 'hook');
  }
  /** Independent task advice. Omitted constraints mean no caller-declared pins,
   * not verified host settings. A legacy provenance flag grants no authority. */
  async advise(input: unknown): Promise<RoutingResult> {
    const invalid = (): RoutingResult => this.result('unavailable', 'invalid_input');
    if (!keysOnly(input, ['request_id', 'client', 'task', 'eligible_profile_ids', 'constraints']) || !isClient(input.client)) return invalid();
    const constraints = own(input, 'constraints') ? input.constraints : {};
    if (!keysOnly(constraints, [...preservedFields, 'provenance_verified']) || Object.values(constraints).some(value => typeof value !== 'boolean')) return invalid();
    const declared = Object.fromEntries(preservedFields.map(key => [key, constraints[key] ?? false]));
    return this.route({ ...input,
      eligible_profile_ids: own(input, 'eligible_profile_ids') ? input.eligible_profile_ids : this.policy.profiles.filter(profile => profile.client === input.client).map(profile => profile.id),
      constraints: declared,
    }, 'advisory');
  }
  private async route(input: unknown, kind: 'hook'|'advisory'): Promise<RoutingResult> {
    const invalid = (): RoutingResult => this.result('unavailable', 'invalid_input');
    if (!keysOnly(input, ['request_id', 'client', 'task', 'eligible_profile_ids', 'constraints']) ||
      typeof input.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(input.request_id) || !isClient(input.client) ||
      ['__proto__', 'constructor', 'prototype'].includes(input.request_id) ||
      !keysOnly(input.task, ['summary', 'operation', 'context_sufficient']) || typeof input.task.summary !== 'string' ||
      !input.task.summary.trim() || Buffer.byteLength(input.task.summary) > this.policy.max_summary_bytes ||
      typeof input.task.operation !== 'string' || !['read_only', 'write', 'review', 'analysis'].includes(input.task.operation) || typeof input.task.context_sufficient !== 'boolean' ||
      !Array.isArray(input.eligible_profile_ids) || (!input.eligible_profile_ids.length && this.policy.profiles.some(p=>p.client===input.client)) || input.eligible_profile_ids.length > 20 ||
      input.eligible_profile_ids.some((id: unknown) => typeof id !== 'string') || new Set(input.eligible_profile_ids).size !== input.eligible_profile_ids.length ||
      !keysOnly(input.constraints, ['model_pinned', 'effort_pinned', 'role_pinned', 'fork_inherits', 'provenance_verified']) ||
      Object.values(input.constraints).some(v => typeof v !== 'boolean')) return invalid();
    if (/\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}/i.test(input.task.summary)) return this.result('keep_current', 'sensitive_input');
    const req = clone(input) as unknown as RoutingInput;
    const profiles = this.policy.profiles.filter(p => p.client === req.client && req.eligible_profile_ids.includes(p.id));
    if (!profiles.length && !req.eligible_profile_ids.length) return this.result('keep_current','no_candidates');
    if (profiles.length !== req.eligible_profile_ids.length) return this.result('keep_current', 'unsupported_profile');
    // Keep historical strict-path hashes unchanged. Advice has a separate digest
    // namespace within the SAME request ledger, so cross-purpose ID reuse cannot
    // reuse results or automatically retry a previously uncertain paid request.
    const hash = kind === 'hook' ? digest({ input: req, policy: this.semanticPolicy() }) : digest({ kind: 'advisory-v1', input: req, policy: this.semanticPolicy() });
    if (this.active >= this.policy.max_concurrency) return this.result('unavailable', 'concurrency_limit');
    let lock: LedgerLock | undefined;
    if (this.ledgerPath) {
      try { lock = acquireLedgerLock(this.ledgerPath); }
      catch (error) { return this.result('unavailable', errorCode(error) === 'ledger_locked' ? 'ledger_locked' : 'ledger_error'); }
    }
    this.heldLedgerLock = lock;
    this.active++;
    try {
      this.load();
      const previous = own(this.state.requests, req.request_id) ? this.state.requests[req.request_id] : undefined;
      if (previous) {
        if (previous.digest !== hash) return this.result('unavailable', 'request_conflict');
        if (previous.state !== 'complete') return this.result('unavailable', 'outcome_unknown');
        this.validateOutcome(previous.result);
        if (previous.result.policy_version !== this.policy.version || previous.result.catalog_version !== this.policy.catalog_version ||
          (previous.result.status === 'recommended' && !profiles.some(p => p.id === previous.result?.profile_id && digest(p) === digest(previous.result?.profile)))) return this.result('unavailable', 'ledger_error');
        if (!(previous.result.status === 'unavailable' && previous.result.reason === 'budget_exhausted')) return { ...clone(previous.result), cached: true };
        // A verified historical local denial did not reserve or dispatch a call.
        // Only this known completion can proceed again under the same ID.
      }
      const complete = (result: RoutingResult): RoutingResult => {
        this.state.requests[req.request_id] = { digest: hash, state: 'complete', result };
        this.save(); return clone(result);
      };
      if ((kind === 'hook' && req.constraints.provenance_verified !== true) || preservedFields.some(k => req.constraints[k] !== false)) return complete(this.result('keep_current', 'preserved_constraints'));
      if (!req.task.context_sufficient) return complete(this.result('needs_context', 'insufficient_context'));
      // Known local failures precede reservation. Do not cache them: correcting
      // configuration must allow the same ID to be tried without ledger edits.
      // Never infer this from a transport exception (including HTTP 401/403).
      try { this.provider.preflight?.(); }
      catch (e) { return this.result('unavailable', errorCode(e) === 'unauthorized' ? 'unauthorized' : 'provider_error'); }
      const day = new Date().toISOString().slice(0, 10);
      const exhausted=this.budgetSnapshot(day).exhausted_by;
      if (exhausted.length) return this.result('unavailable', 'budget_exhausted', {budget_limit:exhausted[0]});
      this.state.calls++; this.state.days[day] = (this.state.days[day] ?? 0) + 1;
      this.state.estimated_usd += this.policy.estimated_call_usd;
      this.state.requests[req.request_id] = { digest: hash, state: 'unknown' };
      this.save();
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; const started = performance.now();
      const latency = (): number => Math.round((performance.now() - started) * 1000) / 1000;
      try {
        const response: unknown = await Promise.race([
          Promise.resolve().then(() => this.provider({ input: clone(req), profiles: clone(profiles), signal: controller.signal })),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('timeout'), { code: 'timeout' })); }, this.policy.timeout_ms); }),
        ]);
        if (!isRecord(response) || typeof response.choice !== 'string' || (own(response, 'confidence') && (typeof response.confidence !== 'number' || !Number.isFinite(response.confidence) || response.confidence < 0 || response.confidence > 1))) return complete(this.result('keep_current', 'invalid_response', { latency_ms: latency() }));
        const metadata: Metadata = { latency_ms: latency() };
        if (typeof response.confidence === 'number') metadata.confidence = response.confidence;
        if (own(response, 'usage')) {
          try { metadata.usage = usageOf(response.usage); }
          catch { return complete(this.result('keep_current', 'invalid_response', { latency_ms: latency() })); }
        }
        if (response.choice === 'keep_current') return complete(this.result('keep_current', 'provider_abstained', metadata));
        if (response.choice === 'needs_context') return complete(this.result('needs_context', 'provider_needs_context', metadata));
        const profile = profiles.find(p => p.id === response.choice);
        if (!profile) return complete(this.result('keep_current', 'invalid_choice', metadata));
        return complete(this.result('recommended', 'allowed_profile', { profile_id: profile.id, profile: clone(profile), ...metadata }));
      } catch (e) {
        // A failed transport can have consumed a paid call. Preserve its unknown marker.
        const allowed = ['timeout', 'refused', 'truncated', 'invalid_json', 'unauthorized', 'rate_limited', 'network', 'ledger_error'];
        const code = errorCode(e);
        return this.result('unavailable', code !== undefined && allowed.includes(code) ? code : 'provider_error', { latency_ms: latency() });
      } finally { clearTimeout(timer); }
    } catch { return this.result('unavailable', 'ledger_error'); }
    finally {
      this.active--;
      this.heldLedgerLock = undefined;
      if (lock !== undefined) { try { lock.release(); } catch { /* Never unlink a persistent OS-owned gate. */ } }
    }
  }
}
