/** Explicit operator-installed Hook policy. This does not certify host settings. */
import { createHash } from 'node:crypto';
import { closeSync, openSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { Router } from './core.ts';
import { hasSufficientTaskText } from './context-sufficiency.ts';
import { assertPrivateStatePath, readRegularFile } from './files.ts';
import { hookInput, hookOutput, validatedHookProfile, profilePreservesChoices, effortKeys } from './hook.ts';
import type { HookOutput } from './hook.ts';
import { digestToolInput } from './provenance.ts';
import type { Client, RoutingPolicy, UnknownRecord } from './types.ts';

interface AutoPolicyBase {
  kind: 'aptly-auto-hook';
  mode: 'defaults' | 'advisory';
  issuer: 'operator_installation';
  enabled: boolean;
  state_directory: string;
}
export type Transmission = 'none' | 'description' | 'excerpt' | 'unselected';
export type AutoPolicy = AutoPolicyBase & ({schema_version: 1} | {schema_version: 2; transmission: Transmission});
export function effectiveTransmission(policy: AutoPolicy): Transmission {
  return policy.schema_version === 1 ? 'excerpt' : policy.transmission;
}
export interface AutomaticHookObservation {
  status: 'arguments_updated' | 'advisory' | 'preserved' | 'pending' | 'awaiting_context' | 'blocked';
  preflight: 'observed';
  correlation_id?: string;
  classification: 'unknown' | 'evaluating' | 'not_requested' | 'provider_requested' | 'cache_hit' | 'local_outcome';
  recommendation: 'not_produced' | 'produced';
  application: 'not_attempted' | 'blocked' | 'arguments_updated';
  execution: 'not_observed';
  constraint_provenance: 'unknown';
  reason: string;
  profile_id?: string;
  request_id?: string;
  retry_id?: string;
  context_retry?: {
    outcome?: {status:string;reason:string;classification:string;recommendation:'produced'|'not_produced';application:'blocked'|'not_attempted';request_id:string;profile_id?:string};
    last_attempt:{status:string;reason:string};
  };
  fresh_delegation?:{outcome?:{preparation_id:string;profile_id:string};last_attempt:{status:string;reason:string};execution:'not_observed'};
}
export interface ContextRetrySeed {
  request_id: string;
  client: Client;
  eligible_profile_ids: string[];
  policy_fingerprint: string;
  application_blocked?: string;
  fill_model?: boolean;
  fill_effort?: boolean;
  fresh_eligible?: boolean;
}
export interface AutomaticHookResult {
  output: HookOutput | { hookSpecificOutput: { hookEventName: 'PreToolUse'; additionalContext: string; permissionDecision?: 'deny'; permissionDecisionReason?: string } };
  observation: AutomaticHookObservation;
}
export interface AutomaticHookOptions {
  client: unknown;
  event: unknown;
  router: Router;
  /** Internal configuration only: callers read APTLY_HOOK_POLICY_PATH, never MCP arguments. */
  policyPath?: unknown;
  /** Internal process-local handoff; never accepted as native policy/provenance. */
  context?: () => { summary?: string; fingerprint?: string; reason?: string } | undefined;
  signal?: AbortSignal;
  /** Internal diagnostics callback; never supplied through native tool arguments. */
  onObservation?: (observation: AutomaticHookObservation) => void;
  /** Internal bounded recovery issuer; never supplied by native arguments. */
  onNeedsContext?: (seed: ContextRetrySeed, current:()=>string|undefined) => { retry_id?: string; reason?: string };
  onBlockedAdvice?: (seed: ContextRetrySeed, current:()=>string|undefined) => { retry_id?: string; reason?: string };
  /** A caller may revoke the pending event; absence does not certify native dispatch. */
  stillCurrent?: () => boolean | Promise<boolean>;
}
const own = (object: object, key: string): boolean => Object.hasOwn(object, key);
const plain = (value: unknown): value is UnknownRecord => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeText = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && Buffer.byteLength(value) <= max;
const sensitive = (value: string): boolean => /\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}/i.test(value);
const policyKeys = ['schema_version', 'kind', 'mode', 'issuer', 'enabled', 'state_directory'];

export function loadAutomaticHookPolicy(path: unknown): { policy: AutoPolicy | null; reason: string; fingerprint?: string } {
  if (path === undefined) return { policy: null, reason: 'automatic_policy_missing' };
  try {
    assertPrivateStatePath(path);
    const value: unknown = JSON.parse(readRegularFile(path, { privateFile: true, maxBytes: 4096 }).toString('utf8'));
    if (!plain(value)) throw new Error('invalid_policy');
    const keys = value.schema_version === 2 ? [...policyKeys, 'transmission'] : policyKeys;
    if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)) ||
      ![1,2].includes(value.schema_version as number) || (value.schema_version === 2 && !['none','description','excerpt','unselected'].includes(value.transmission as string)) || value.kind !== 'aptly-auto-hook' || (typeof value.mode !== 'string' || !['defaults', 'advisory'].includes(value.mode)) ||
      value.issuer !== 'operator_installation' || typeof value.enabled !== 'boolean' ||
      typeof value.state_directory !== 'string' || !isAbsolute(value.state_directory)) throw new Error('invalid_policy');
    // Validate an existing private state directory, without creating a path from untrusted event data.
    assertPrivateStatePath(join(value.state_directory, '.aptly-state-check'));
    const policy = Object.fromEntries(keys.map(key => [key, value[key]])) as unknown as AutoPolicy;
    return { policy, fingerprint: hash(policy), reason: policy.enabled ? 'automatic_policy_enabled' : 'automatic_policy_disabled' };
  } catch { return { policy: null, reason: 'automatic_policy_invalid' }; }
}

interface NativeCall { client: Client; event: UnknownRecord; input: UnknownRecord; callKey: string; digest: string; payloadDigest: string; }
function readCall(client: unknown, event: unknown): NativeCall | null {
  try {
    if ((client !== 'codex' && client !== 'claude') || !plain(event) || event.hook_event_name !== 'PreToolUse' ||
      !safeText(event.session_id, 256) || !safeText(event.tool_use_id ?? event.tool_call_id, 512) ||
      !(client === 'codex' ? ['spawn_agent', 'collaborationspawn_agent', 'Agent'] : ['Agent']).includes(String(event.tool_name)) ||
      Buffer.byteLength(JSON.stringify(event)) > 65536) return null;
    const digest = digestToolInput({ client, event });
    if (!digest) return null;
    let input = event.tool_input;
    if (typeof input === 'string') {
      if (client !== 'claude' || Buffer.byteLength(input) > 16384) return null;
      input = JSON.parse(input);
    }
    if (!plain(input)) return null;
    return { client, event, input, digest,
      payloadDigest: hash([digest, event.tool_name, event.cwd ?? null, event.turn_id ?? null, event.turnId ?? null]),
      callKey: hash(['aptly-auto-hook-call-v1', client, event.session_id, event.tool_use_id ?? event.tool_call_id]) };
  } catch { return null; }
}
function preservation(call: NativeCall): string | null {
  const input = call.input;
  if (['resume', 'resume_agent', 'agent_id'].some(key => own(input, key))) return 'resumed_agent';
  if (['role', 'agent_type'].some(key => own(input, key)) ||
    (call.client === 'claude' && input.subagent_type !== 'general-purpose') ||
    (call.client === 'codex' && own(input,'subagent_type'))) return 'fixed_role';
  return null;
}
/** History semantics are checked at application, not used to suppress task advice. */
function applicationConstraint(call: NativeCall): string | null {
  if (['fork_context','fork','fork_session','inherit_history'].some(key=>own(call.input,key))) return 'history_semantics_unverified';
  if (call.client==='codex' && call.input.fork_turns!=='none') return 'inherited_context_application_unverified';
  if (call.client==='claude' && own(call.input,'fork_turns')) return 'history_semantics_unverified';
  // Only reasoning_effort has an application contract for native Codex spawns.
  if (effortKeys.some(key=>key!=='reasoning_effort'&&own(call.input,key))) return 'effort_argument_unsupported';
  return null;
}
export function automaticCallIdentity(client: unknown, event: unknown): {key:string;id:string} | undefined {
  const call=readCall(client,event);
  return call?{key:call.callKey,id:hash(['aptly-observation-v1',call.callKey,call.payloadDigest])}:undefined;
}
export function automaticCallId(client: unknown,event: unknown): string | undefined {
  const call=readCall(client,event);
  return call?hash(['aptly-observation-v1',call.callKey,call.payloadDigest]):undefined;
}
export function initialHookObservation(client:unknown,event:unknown):AutomaticHookObservation {
  const id=automaticCallId(client,event);
  return {status:'pending',reason:'preflight_pending',preflight:'observed',...(id?{correlation_id:id}:{}),
    classification:'not_requested',recommendation:'not_produced',application:'not_attempted',execution:'not_observed',constraint_provenance:'unknown'};
}
function catalogFingerprint(policy: RoutingPolicy): string {
  return hash([policy.version, policy.catalog_version, policy.provider_id ?? null, policy.profiles, policy.profile_descriptions ?? {}]);
}
function boundedSummary(call: NativeCall, maxBytes: number): { summary?: string; reason?: string } {
  const label = call.input[call.client === 'codex' ? 'task_name' : 'description'];
  const body = call.input[call.client === 'codex' ? 'message' : 'prompt'];
  if (typeof body !== 'string' || !body.trim()) return { reason: 'insufficient_context' };
  // Check the entire bounded native body before clipping, so truncation cannot hide a key.
  if (sensitive(body) || (typeof label === 'string' && sensitive(label))) return { reason: 'sensitive_input' };
  // Some Codex transports expose an opaque message to PreToolUse. Never decode
  // it or forward it to the provider: a sufficiently descriptive visible name
  // is a separate, explicitly labelled source of task advice only.
  if (call.client === 'codex' && /^gAAAA[A-Za-z0-9_-]{75,}={0,2}$/.test(body)) {
    if (!safeText(label, 512) || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(label)) return { reason: 'insufficient_context' };
    const words = label.split('_');
    // Short labels need a concrete action, scope and object, not word padding.
    // This is advice from the label alone, never authorization to perform it.
    const concreteShortName = /^(?:cleanup|remove|prune)_merged_(?:worktrees|branches)$/.test(label) ||
      /^(?:review|fix|test)_(?:failing|broken|flaky)_(?:tests|builds)$/.test(label);
    if (!concreteShortName && (Buffer.byteLength(label) < 24 || words.length < 6 || words.filter(word => /^[a-z]{2,}$/.test(word)).length < 3)) return { reason: 'insufficient_context' };
    const summary = `Task summary from visible task_name only; opaque message not inspected: ${words.join(' ')}`;
    if (Buffer.byteLength(summary) > Math.min(4000, maxBytes)) return { reason: 'insufficient_context' };
    return { summary };
  }
  const first = body.trim().split(/\r?\n\s*\r?\n/, 1)[0];
  if (!hasSufficientTaskText(first) || (typeof label === 'string' && first.trim() === label.trim())) return { reason: 'insufficient_context' };
  const prefix = safeText(label, 512) ? `Task: ${label.trim()}\n` : '';
  const budget = Math.min(4000, maxBytes) - Buffer.byteLength(prefix);
  if (budget < 64) return { reason: 'insufficient_context' };
  // Clip by Unicode code point; never emit invalid UTF-8 at a byte boundary.
  let clipped = '', bytes = 0;
  for (const point of first) { const size = Buffer.byteLength(point); if (bytes + size > budget) break; clipped += point; bytes += size; }
  return { summary: prefix + clipped };
}
function bindCall(call: NativeCall, policy: AutoPolicy, policyFingerprint: string, catalog: string, contextDigest?: string): { request_id?: string; reason?: string } {
  const binding = { ...(contextDigest ? {context_digest:contextDigest} : {}), schema_version: 1, input_digest: call.digest, payload_digest: call.payloadDigest, policy_fingerprint: policyFingerprint, catalog_fingerprint: catalog,
    request_id: hash(['aptly-auto-hook-v1', call.callKey, call.payloadDigest, policyFingerprint, catalog, ...(contextDigest?[contextDigest]:[])]) };
  const path = join(policy.state_directory, `hook-call-${call.callKey}.json`);
  let fd: number | undefined;
  try {
    assertPrivateStatePath(path);
    try { fd = openSync(path, 'wx', 0o600); }
    catch (error) {
      if (!plain(error) && !(error instanceof Error)) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const previous: unknown = JSON.parse(readRegularFile(path, { privateFile: true, maxBytes: 2048 }).toString('utf8'));
      if (!plain(previous) || Object.keys(previous).length !== Object.keys(binding).length ||
        Object.entries(binding).some(([key, value]) => previous[key] !== value)) return { reason: 'call_conflict' };
      return { request_id: binding.request_id };
    }
    // Immutable metadata is persisted before a potentially paid classification. A partial
    // write fails closed on the next invocation rather than issuing a replacement ID.
    writeFileSync(fd, JSON.stringify(binding));
    return { request_id: binding.request_id };
  } catch { return { reason: 'automatic_state_unavailable' }; }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Operator default selection only. No provenance_verified/evidence_verified host claim. */
export async function automaticHook({ client, event, router, policyPath, signal, context, stillCurrent, onObservation, onNeedsContext, onBlockedAdvice }: AutomaticHookOptions): Promise<AutomaticHookResult> {
  const observation=initialHookObservation(client,event);
  let activeMode:'defaults'|'advisory'|undefined;
  const preserve = (reason: string, request_id?: string): AutomaticHookResult => {
    const result:AutomaticHookResult={output:{},observation:{...observation,status:'preserved',reason,...(request_id?{request_id}:{})}};
    if(!activeMode||signal?.aborted||reason==='call_cancelled')return result;
    // Respect an operator revocation rather than blocking under a disabled policy.
    const currentPolicy=loadAutomaticHookPolicy(policyPath).policy;
    if(!currentPolicy?.enabled)return result;
    if(['none','unselected'].includes(effectiveTransmission(currentPolicy))) {
      result.output={hookSpecificOutput:{hookEventName:'PreToolUse',additionalContext:`Aptly automatic routing is inactive (${effectiveTransmission(currentPolicy)}). Original arguments are preserved.`}};
      return result;
    }
    const message=`Aptly could not select compatible subagent defaults (${reason}). Original arguments and execution constraints are preserved; no child execution is observed. Report this outcome. Do not repeat an uncertain paid request with a new ID or change history, explicit choices, roles or permissions to bypass this result.`;
    result.output={hookSpecificOutput:{hookEventName:'PreToolUse',additionalContext:message,
      ...(currentPolicy.mode==='defaults'?{permissionDecision:'deny',permissionDecisionReason:message}:{})}};
    result.observation.status=currentPolicy.mode==='defaults'?'blocked':'preserved';
    return result;
  };
  try {
    const loaded = loadAutomaticHookPolicy(policyPath);
    if (!loaded.policy || !loaded.policy.enabled || !loaded.fingerprint) return preserve(loaded.reason);
    if (['none','unselected'].includes(effectiveTransmission(loaded.policy))) {
      activeMode=loaded.policy.mode;
      return preserve(`transmission_${effectiveTransmission(loaded.policy)}`);
    }
    const call = readCall(client, event);
    if (!call) return preserve('invalid_event');
    const pinned = preservation(call);
    if (pinned) return preserve(pinned);
    const hasModel=own(call.input,'model'),hasEffort=effortKeys.some(key=>own(call.input,key));
    if (hasModel && (hasEffort || call.client==='claude')) return preserve('explicit_model');
    const profiles=router.policy.profiles.filter(profile=>profile.client===call.client&&profilePreservesChoices(call.input,profile));
    if(!profiles.length)return preserve(hasModel?'explicit_model':hasEffort?'explicit_effort':'no_candidates');
    // Synthetic fixture output must never select a native child's defaults.
    if (loaded.policy.mode === 'defaults' && router.policy.provider_id !== 'decisions') return preserve('synthetic_provider');
    activeMode=loaded.policy.mode;
    const freshEligible=loaded.policy.mode==='defaults'&&call.client==='codex'&&(call.input.fork_turns===undefined||call.input.fork_turns==='all')&&Object.keys(call.input).every(key=>['task_name','message','fork_turns','model','reasoning_effort'].includes(key));
    const reference=(request_id:string,issue:NonNullable<AutomaticHookOptions['onNeedsContext']>)=>{
      const expectedContext=context?.();
      return issue({request_id,client:call.client,eligible_profile_ids:profiles.map(profile=>profile.id),
        policy_fingerprint:loaded.fingerprint!,application_blocked:applicationConstraint(call)??undefined,
        fill_model:!hasModel,fill_effort:!hasEffort,
        ...(freshEligible?{fresh_eligible:true}:{})},()=>{
          const latest=context?.();
          if(latest?.reason)return latest.reason;
          if(latest?.fingerprint!==expectedContext?.fingerprint)return 'context_changed';
          const latestCall=readCall(client,event);
          return latestCall?.payloadDigest===call.payloadDigest?undefined:'call_changed';
        });
    };
    const needsContext = (reason: string, request_id: string): AutomaticHookResult => {
      if (!onNeedsContext) return preserve(reason, request_id);
      if(signal?.aborted)return preserve('call_cancelled',request_id);
      const currentPolicy=loadAutomaticHookPolicy(policyPath);
      if(!currentPolicy.policy?.enabled||currentPolicy.fingerprint!==loaded.fingerprint)return preserve('automatic_policy_changed',request_id);
      const recovery=reference(request_id,onNeedsContext);
      const instruction=recovery.retry_id
        ? `Call Aptly retry_spawn_recommendation with retry_id "${recovery.retry_id}" and a short description of task purpose, scope, expected output and complexity. Use context you already have; ask the user only for genuinely missing information. One supplementation is allowed. Do not decode the opaque body or invent native call IDs. A recommendation is advice only: preserve all explicit user choices, roles, permissions and required history. Never rewrite the ORIGINAL invocation in place or resubmit it with changed history semantics to apply advice. If application is blocked, report that limitation. ${freshEligible?'A separate NEW invocation for the SAME independent task is supported ONLY through prepare_fresh_delegation if a later response offers it, under all of that response\'s conditions; do not invent a direct fresh call. This protocol does not change the original invocation or grant permissions.':'Do not create a fresh child to bypass this constraint.'} Do not spawn while the retry still needs context or is unavailable.`
        : `Context recovery is unavailable (${recovery.reason??'context_retry_unavailable'}). Report the limitation; do not repeat the spawn unchanged.`;
      const feedback=`Aptly needs additional task context (${reason}). ${instruction}`;
      return {output:{hookSpecificOutput:{hookEventName:'PreToolUse',additionalContext:feedback,
        ...(loaded.policy!.mode==='defaults'?{permissionDecision:'deny' as const,permissionDecisionReason:feedback}:{})}},
        observation:{...observation,status:'awaiting_context',reason,request_id,...(recovery.retry_id?{retry_id:recovery.retry_id}:{})}};
    };
    const supplied = context?.();
    if (supplied?.reason) return preserve(supplied.reason);
    const summary = supplied?.summary ? supplied : effectiveTransmission(loaded.policy)==='description'
      ? {reason:'insufficient_context'} : boundedSummary(call, router.policy.max_summary_bytes);
    if (Buffer.byteLength(summary.summary ?? '') > Math.min(4000,router.policy.max_summary_bytes)) return preserve('insufficient_context');
    if (!summary.summary) {
      if(summary.reason!=='insufficient_context'||!onNeedsContext)return preserve(summary.reason??'insufficient_context');
      if(signal?.aborted||(stillCurrent&&await stillCurrent()!==true))return preserve('call_cancelled');
      const currentPolicy=loadAutomaticHookPolicy(policyPath),currentCall=readCall(client,event),currentContext=context?.();
      if(!currentPolicy.policy?.enabled||currentPolicy.fingerprint!==loaded.fingerprint)return preserve('automatic_policy_changed');
      if(!currentCall||currentCall.callKey!==call.callKey||currentCall.payloadDigest!==call.payloadDigest)return preserve('call_changed');
      if(currentContext?.reason||currentContext?.fingerprint!==supplied?.fingerprint)return preserve(currentContext?.reason??'context_changed');
      const legacyId=hookInput({client,event,policy:router.policy})?.request_id??hash([call.client,call.event.session_id,call.event.tool_use_id??call.event.tool_call_id]);
      try{router.load();}catch{return preserve('ledger_error');}
      if(own(router.state.requests,legacyId))return preserve('legacy_request_exists',legacyId);
      // Reserve the same immutable native-call binding without making a paid request.
      const bound=bindCall(call,loaded.policy,loaded.fingerprint,catalogFingerprint(router.policy),supplied?.fingerprint);
      return bound.request_id?needsContext('insufficient_context',bound.request_id):preserve(bound.reason??'automatic_state_unavailable');
    }
    if (signal?.aborted || (stillCurrent && await stillCurrent() !== true)) return preserve('call_cancelled');
    // Installing an operator policy must not bypass a historical strict-path
    // unknown/complete record for this same native call with a new paid ID.
    const beforePaid = readCall(client, event), policyBeforePaid = loadAutomaticHookPolicy(policyPath);
    if (!beforePaid || beforePaid.callKey !== call.callKey || beforePaid.payloadDigest !== call.payloadDigest) return preserve('call_changed');
    if (!policyBeforePaid.policy?.enabled || policyBeforePaid.fingerprint !== loaded.fingerprint) return preserve('automatic_policy_changed');
    const legacyId = hookInput({ client, event, policy: router.policy })?.request_id ??
      hash([call.client, call.event.session_id, call.event.tool_use_id ?? call.event.tool_call_id]);
    try { router.load(); } catch { return preserve('ledger_error'); }
    if (own(router.state.requests, legacyId)) return preserve('legacy_request_exists', legacyId);
    const contextBeforePaid=context?.();
    if (contextBeforePaid?.reason || contextBeforePaid?.fingerprint!==supplied?.fingerprint) return preserve(contextBeforePaid?.reason??'context_changed');
    const catalog = catalogFingerprint(router.policy);
    const bound = bindCall(call, loaded.policy, loaded.fingerprint, catalog, supplied?.fingerprint);
    if (!bound.request_id) return preserve(bound.reason ?? 'automatic_state_unavailable');
    const request_id = bound.request_id;
    const snapshot = structuredClone(call.event);
    observation.classification='evaluating';
    observation.request_id=request_id;
    try { onObservation?.({...observation}); } catch { /* Diagnostics do not change routing. */ }
    // These flags describe selection of the remaining defaults only. Explicit
    // values constrain the candidate tuples; history is rechecked before application.
    const recommendation = await router.advise({ request_id, client: call.client,
      task: { summary: summary.summary, operation: 'analysis', context_sufficient: true },
      eligible_profile_ids: profiles.map(profile=>profile.id),
      constraints: { model_pinned: false, effort_pinned: false, role_pinned: false, fork_inherits: false },
    });
    observation.classification=recommendation.cached?'cache_hit':typeof recommendation.latency_ms==='number'?'provider_requested':'local_outcome';
    const profile=validatedHookProfile(client,recommendation,router.policy);
    if(profile&&profiles.some(candidate=>candidate.id===profile.id)){observation.recommendation='produced';observation.profile_id=profile.id;observation.application='blocked';}
    if (signal?.aborted || (stillCurrent && await stillCurrent() !== true)) return preserve('call_cancelled', request_id);
    const currentContext=context?.();
    if (currentContext?.reason || currentContext?.fingerprint!==supplied?.fingerprint) return preserve(currentContext?.reason??'context_changed',request_id);
    const current = readCall(client, event), policyNow = loadAutomaticHookPolicy(policyPath);
    if (!current || current.callKey !== call.callKey || current.digest !== call.digest || current.payloadDigest !== call.payloadDigest) return preserve('call_changed', request_id);
    if (!policyNow.policy?.enabled || policyNow.fingerprint !== loaded.fingerprint) return preserve('automatic_policy_changed', request_id);
    if (catalogFingerprint(router.policy) !== catalog) return preserve('catalog_changed', request_id);
    // The existing narrow catalog/tuple validator is reused. This local flag is an
    // operator-policy decision, never a claim about complete host-setting evidence.
    if (!profile || observation.recommendation!=='produced') {
      if(recommendation.status==='needs_context')return needsContext(recommendation.reason,request_id);
      const allowed = ['preserved_constraints', 'unsupported_profile', 'invalid_response', 'invalid_choice', 'provider_abstained', 'no_candidates', 'insufficient_context',
        'provider_needs_context', 'budget_exhausted', 'concurrency_limit', 'ledger_locked', 'request_conflict', 'outcome_unknown', 'ledger_error', 'timeout', 'refused',
        'truncated', 'invalid_json', 'unauthorized', 'rate_limited', 'network', 'provider_error', 'sensitive_input', 'invalid_input'];
      return preserve(allowed.includes(recommendation.reason) ? recommendation.reason : 'recommendation_unavailable', request_id);
    }
    const blocked=applicationConstraint(call);
    if(blocked){
      const kept=preserve(blocked,request_id);
      const next=blocked==='effort_argument_unsupported'?'The caller must review the native reasoning_effort argument spelling; Aptly never rewrites an explicit choice.':'Inherited model/effort updates are not verified for this host. Verify the host version and native contract before enabling them; task arguments cannot certify support. Aptly never changes history automatically.';
      const fresh=blocked==='inherited_context_application_unverified'&&onBlockedAdvice?reference(request_id,onBlockedAdvice):undefined;
      if(fresh?.retry_id)kept.observation.retry_id=fresh.retry_id;
      const continuation=fresh?.retry_id?` Only after the host reports this tool call blocked, if the task is independently declared, inherited history is not required by the user, and complete standalone instructions are available, prepare a SEPARATE fresh delegation with prepare_fresh_delegation using retry_id \"${fresh.retry_id}\". Never do this for required or unknown history, or unknown original execution.`:' Do not create a fresh child merely to apply the recommendation.';
      const message=`Aptly recommends ${profile.id}, but application is blocked (${blocked}). Original history and arguments are preserved; no child execution is observed. ${next} ${activeMode==='defaults'?'Report this constraint and stop this ORIGINAL spawn.':'The host may still execute this original call under advisory policy; do not submit an additional call solely to apply the recommendation.'} Do not discard required history merely to apply the recommendation.${continuation}`;
      kept.output={hookSpecificOutput:{hookEventName:'PreToolUse',additionalContext:message,
        ...(activeMode==='defaults'?{permissionDecision:'deny',permissionDecisionReason:message}:{})}};
      kept.observation.status=activeMode==='defaults'?'blocked':'preserved';
      return kept;
    }
    const candidate = hookOutput({ client, event: snapshot, recommendation, mode: 'apply', compatibilityVerified: true, policy: router.policy,fillUnspecified:true });
    if(!candidate.hookSpecificOutput)return preserve('application_unsupported',request_id);
    if (loaded.policy.mode === 'advisory') return { output: { hookSpecificOutput: { hookEventName: 'PreToolUse',
      additionalContext: `Aptly suggests ${profile.model}${profile.reasoning_effort ? ` with ${profile.reasoning_effort} reasoning effort` : ''} for this task (${profile.id}). This is task advice; the host retains execution and permission decisions.` } },
      observation: { ...observation, status: 'advisory', application:'not_attempted', reason: 'operator_policy_advice', profile_id: profile.id, request_id } };
    return { output: candidate, observation: { ...observation, status: 'arguments_updated', application:'arguments_updated', reason: 'operator_policy_defaults', profile_id: profile.id, request_id } };
  } catch { if(observation.classification==='evaluating')observation.classification='unknown';return preserve('automatic_hook_unavailable'); }
}
