// Pure, conservative interpretation of host-provided setting evidence.
// This module never reads files, environment variables or transcripts. Current
// tool input is hashed locally for call binding, never returned or sent anywhere.
import { createHash } from 'node:crypto';
import type { Client, UnknownRecord, JsonValue, RoutingConstraints } from './types.ts';

export type EvidenceState = 'unset' | 'pinned' | 'unknown';
export interface EvidenceField { state: EvidenceState; source: string; }
export interface EvidenceFields { model: EvidenceField; effort: EvidenceField; }
export interface EvidenceLayer { source: string; model: EvidenceState; effort: EvidenceState; }
export interface HostContext { schema_version: 1; client: Client; client_version: string; session_id: string; cwd: string; issued_at: string | number; expires_at: string | number; layers: EvidenceLayer[]; environment: Record<string, 'unset' | 'set' | 'unknown'>; host_extensions: 'none' | 'present' | 'unknown'; evidence_verified: boolean; tool_use_id: string; tool_input_sha256: string; }
export interface ProvenanceOptions { client?: unknown; event?: unknown; context?: unknown; now?: number; }
export interface ProvenanceResult { status: 'eligible' | 'preserve' | 'unknown'; reason: string; fields: EvidenceFields; constraints: Required<RoutingConstraints>; }
interface Requirement { versions: readonly string[]; layers: readonly string[]; environment: readonly string[]; }
const isClient = (value: unknown): value is Client => value === 'codex' || value === 'claude';
// `context` must be supplied by a trusted local collector. The same object from
// an MCP tool argument or an LLM response is NOT evidence and must not be passed
// here as verified. `evidence_verified` is an internal trust-boundary marker,
// not a request to collect additional data or to widen host permissions.

const own = (value: object, key: PropertyKey) => Object.hasOwn(value, key);
const plain = (value: unknown): value is UnknownRecord => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const only = (value: unknown, keys: readonly string[]): value is UnknownRecord => plain(value) && Object.keys(value).every(key => keys.includes(key));
const states = ['unset', 'pinned', 'unknown'];
const freeze = <T extends object>(value: T): T => { Object.freeze(value); for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item); return value; };

export const provenanceRequirements: Readonly<Record<Client, Requirement>> = freeze({
  codex: {
    versions: ['0.166.0'],
    layers: ['invocation', 'role', 'subagent_defaults', 'profile', 'project', 'user', 'system', 'managed'],
    // These names are conservative blockers, not claims that Codex supports a
    // particular undocumented environment override. Missing coverage is unknown.
    environment: ['CODEX_MODEL', 'CODEX_REASONING_EFFORT'],
  },
  claude: {
    versions: ['2.1.314'],
    layers: ['invocation', 'agent', 'session', 'settings_flag', 'local', 'project', 'user', 'managed'],
    environment: ['CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'CLAUDE_CODE_EFFORT_LEVEL',
      'ANTHROPIC_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_MAX_EFFORT_LEVEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL'],
  },
});
const layerPriority: Record<Client, string[]> = {
  codex: ['managed', 'role', 'invocation', 'subagent_defaults', 'project', 'profile', 'user', 'system'],
  claude: ['managed', 'invocation', 'agent', 'session', 'settings_flag', 'local', 'project', 'user'],
};
const field = (state: EvidenceState = 'unknown', source = 'unknown'): EvidenceField => ({ state, source });
const emptyConstraints = (): Required<RoutingConstraints> => ({ model_pinned: false, effort_pinned: false, role_pinned: false, fork_inherits: false, provenance_verified: false });
const result = (status: ProvenanceResult['status'], reason: string, fields: EvidenceFields, constraints: Required<RoutingConstraints>): ProvenanceResult => ({ status, reason, fields, constraints });
const timestamp = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) ? value :
  typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ? Date.parse(value) : NaN;
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= max;

function readEvent(client: unknown, event: unknown): UnknownRecord | null {
  if (!isClient(client) || !plain(event) || event.hook_event_name !== 'PreToolUse' ||
      !(client === 'codex' ? ['spawn_agent', 'collaborationspawn_agent', 'Agent'] : ['Agent']).includes(typeof event.tool_name === 'string' ? event.tool_name : '')) return null;
  const id = event.tool_use_id ?? event.tool_call_id;
  if (!boundedText(id, 512)) return null;
  let input = event.tool_input;
  if (typeof input === 'string') {
    if (client !== 'claude' || Buffer.byteLength(input) > 16384) return null;
    try { input = JSON.parse(input); } catch { return null; }
  }
  return plain(input) ? input : null;
}

function canonicalInput(value: unknown, parents: Set<object> = new Set(), depth = 0): JsonValue {
  if (depth > 64) throw new Error('invalid_input_digest');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!plain(value) && !Array.isArray(value)) throw new Error('invalid_input_digest');
  if (parents.has(value) || Object.getOwnPropertySymbols(value).length) throw new Error('invalid_input_digest');
  parents.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new Error('invalid_input_digest');
      return Array.from(value, item => canonicalInput(item, parents, depth + 1));
    }
    return Object.fromEntries(Object.keys(value).sort().map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value')) throw new Error('invalid_input_digest');
      return [key, canonicalInput(descriptor.value, parents, depth + 1)];
    }));
  } finally { parents.delete(value); }
}

/** Stable digest of this native call's normalized JSON input, never its text. */
export function digestToolInput({ client, event }: Pick<ProvenanceOptions, 'client' | 'event'> = {}): string | null {
  try {
    const input = readEvent(client, event);
    if (!input) return null;
    return createHash('sha256').update(JSON.stringify(canonicalInput(input))).digest('hex');
  } catch { return null; }
}

function eventConstraints(client: Client, input: UnknownRecord): Required<RoutingConstraints> {
  return {
    model_pinned: own(input, 'model'),
    effort_pinned: ['effort', 'reasoning_effort', 'model_reasoning_effort'].some(key => own(input, key)),
    role_pinned: client === 'codex' ? own(input, 'role') || own(input, 'agent_type') : input.subagent_type !== 'general-purpose',
    fork_inherits: client === 'codex' ? input.fork_turns !== 'none' || own(input, 'fork_context') : input.subagent_type === 'fork',
    provenance_verified: false,
  };
}

function nativeFields(constraints: Required<RoutingConstraints>): EvidenceFields {
  if (constraints.fork_inherits) return { model: field('pinned', 'fork'), effort: field('pinned', 'fork') };
  if (constraints.role_pinned) return { model: field('pinned', 'role'), effort: field('pinned', 'role') };
  return {
    model: constraints.model_pinned ? field('pinned', 'invocation') : field(),
    effort: constraints.effort_pinned ? field('pinned', 'invocation') : field(),
  };
}
function nativeReason(constraints: Required<RoutingConstraints>): string | null {
  if (constraints.fork_inherits) return 'inherited_fork';
  if (constraints.role_pinned) return 'fixed_role';
  if (constraints.model_pinned) return 'explicit_model';
  if (constraints.effort_pinned) return 'explicit_effort';
  return null;
}

function contextProblem(client: Client, event: UnknownRecord, context: unknown, now: number): string | null {
  if (context === undefined || context === null) return 'context_missing';
  if (!only(context, ['schema_version', 'client', 'client_version', 'session_id', 'cwd', 'issued_at', 'expires_at',
    'layers', 'environment', 'host_extensions', 'evidence_verified', 'tool_use_id', 'tool_input_sha256']) || context.schema_version !== 1 || context.client !== client) return 'context_invalid';
  if (context.evidence_verified !== true) return 'context_unverified';
  if ((typeof context.client_version !== 'string' || !provenanceRequirements[client].versions.includes(context.client_version))) return 'version_unsupported';
  if (!boundedText(event.session_id, 256) || !boundedText(event.cwd, 4096) ||
      !boundedText(context.session_id, 256) || !boundedText(context.cwd, 4096) ||
      event.session_id !== context.session_id || event.cwd !== context.cwd ||
      !boundedText(context.tool_use_id, 512) || context.tool_use_id !== (event.tool_use_id ?? event.tool_call_id) ||
      typeof context.tool_input_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(context.tool_input_sha256) ||
      context.tool_input_sha256 !== digestToolInput({ client, event })) return 'context_binding_mismatch';
  const issued = timestamp(context.issued_at), expires = timestamp(context.expires_at);
  if (!Number.isSafeInteger(now) || !Number.isFinite(issued) || !Number.isFinite(expires) ||
      expires <= issued || expires - issued > 3600000 || issued > now + 5000) return 'context_time_invalid';
  if (now >= expires) return 'context_expired';
  if ((typeof context.host_extensions !== 'string' || !['none', 'present', 'unknown'].includes(context.host_extensions))) return 'context_invalid';
  const expected = provenanceRequirements[client].layers;
  if (!Array.isArray(context.layers) || context.layers.length !== expected.length) return 'layers_incomplete';
  const found = new Set<string>();
  for (const layer of context.layers as unknown[]) {
    if (!only(layer, ['source', 'model', 'effort']) || (typeof layer.source !== 'string' || !expected.includes(layer.source)) || found.has(layer.source) ||
        (typeof layer.model !== 'string' || !states.includes(layer.model)) || (typeof layer.effort !== 'string' || !states.includes(layer.effort))) return 'layers_invalid';
    found.add(layer.source);
  }
  const envNames = provenanceRequirements[client].environment;
  const environment = context.environment;
  if (!only(environment, envNames) || envNames.some(name => !own(environment, name) ||
      typeof environment[name] !== 'string' || !['unset', 'set', 'unknown'].includes(environment[name] as string))) return 'environment_incomplete';
  return null;
}

function resolveField(client: Client, name: 'model' | 'effort', context: HostContext, constraints: Required<RoutingConstraints>): EvidenceField {
  const bySource = Object.fromEntries(context.layers.map(layer => [layer.source, layer]));
  const env = context.environment;
  const modelEnv = client === 'codex' ? ['CODEX_MODEL'] :
    ['CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'ANTHROPIC_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL'];
  const effortEnv = client === 'codex' ? ['CODEX_REASONING_EFFORT'] :
    ['CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_CODE_MAX_EFFORT_LEVEL'];
  const relevant = name === 'model' ? modelEnv : effortEnv;
  const nativePin = (name === 'model' ? constraints.model_pinned : constraints.effort_pinned);
  // `source` reports the highest-priority proven blocking source, never an
  // effective model value. An unobservable higher source still makes the
  // overall provenance unknown if no proven pin already requires preservation.
  if (bySource.managed[name] === 'pinned') return field('pinned', 'managed');
  if ((name === 'effort' && relevant.some(key => env[key] === 'set')) ||
      // Only presence is recorded; even a FORCE value of '0' conservatively
      // blocks routing rather than interpreting a value that is not in evidence.
      (client === 'claude' && name === 'model' && env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE === 'set')) return field('pinned', 'environment');
  for (const source of layerPriority[client].filter(source => source !== 'managed')) {
    if (source === 'invocation' && nativePin) return field('pinned', 'invocation');
    if (bySource[source][name] === 'pinned') return field('pinned', source);
  }
  if (relevant.some(key => env[key] === 'set')) return field('pinned', 'environment');
  if (context.layers.some(layer => layer[name] === 'unknown') || relevant.some(key => env[key] === 'unknown')) return field();
  return field('unset', 'none');
}

/**
 * Explain whether the current call may be routed without replacing a known
 * choice. Only a trusted collector can supply `context`; event/task fields do
 * not establish settings coverage. Every unsupported or incomplete case keeps
 * provenance false. The caller must additionally verify task context and apply
 * compatibility; eligible is not execution authorization. A snapshot is bound to
 * one call ID and its exact normalized tool input, not a reusable session-wide
 * assertion. The host integration must check current runtime sources when it
 * issues each snapshot (including settings changed through runtime commands).
 */
export function resolveProvenance({ client, event, context, now = Date.now() }: ProvenanceOptions = {}): ProvenanceResult {
  let constraints = emptyConstraints();
  let fields = { model: field(), effort: field() };
  try {
    const input = readEvent(client, event);
    if (!input) return result('unknown', 'invalid_event', fields, constraints);
    // readEvent has validated these two boundary values.
    const knownClient = client as Client;
    const knownEvent = event as UnknownRecord;
    constraints = eventConstraints(knownClient, input);
    fields = nativeFields(constraints);
    const resumed = ['resume', 'resume_agent', 'agent_id'].some(key => own(input, key));
    if (resumed) {
      constraints.role_pinned = true;
      fields = { model: field('pinned', 'resume'), effort: field('pinned', 'resume') };
    }
    const native = resumed ? 'resumed_agent' : nativeReason(constraints);
    const problem = contextProblem(knownClient, knownEvent, context, now);
    if (problem) return result(native ? 'preserve' : 'unknown', native ?? problem, fields, constraints);
    const knownContext = context as HostContext;
    if (!constraints.role_pinned && !constraints.fork_inherits) {
      fields = {
        model: resolveField(knownClient, 'model', knownContext, constraints),
        effort: resolveField(knownClient, 'effort', knownContext, constraints),
      };
    }
    constraints.model_pinned ||= fields.model.state === 'pinned';
    constraints.effort_pinned ||= fields.effort.state === 'pinned';
    if (native) return result('preserve', native, fields, constraints);
    if (constraints.model_pinned || constraints.effort_pinned) {
      const env = Object.values(fields).some(value => value.state === 'pinned' && value.source === 'environment');
      return result('preserve', env ? 'environment_pinned' : 'settings_pinned', fields, constraints);
    }
    if (knownContext.host_extensions !== 'none') return result('unknown', 'host_extensions_unknown', fields, constraints);
    if (Object.values(fields).some(value => value.state === 'unknown')) return result('unknown', 'context_unknown', fields, constraints);
    constraints.provenance_verified = true;
    return result('eligible', 'eligible', fields, constraints);
  } catch {
    // No parse error, input, local path, setting value or task body escapes.
    return result('unknown', 'context_invalid', { model: field(), effort: field() }, emptyConstraints());
  }
}
