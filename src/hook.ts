import { createHash } from 'node:crypto';
import { defaultPolicy } from './core.ts';
import { isSupportedProfile } from './catalog.ts';
import type { Client, UnknownRecord, RoutingConstraints, RoutingInput, Profile, RoutingPolicy } from './types.ts';
export interface HookOptions { client?: unknown; event?: unknown; recommendation?: unknown; mode?: string; compatibilityVerified?: boolean; policy?: RoutingPolicy; }
export interface HookOutput { hookSpecificOutput?: { hookEventName: 'PreToolUse'; permissionDecision?: 'allow'; updatedInput: UnknownRecord; }; }
interface Target { client: Client; event: UnknownRecord; input: UnknownRecord; id: string; }

const own = (value: object, key: PropertyKey) => Object.hasOwn(value, key);
const object = (value: unknown): value is UnknownRecord => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

function target(client: unknown, event: unknown): Target | null {
  if ((client !== 'codex' && client !== 'claude') || !object(event) ||
      event.hook_event_name !== 'PreToolUse') return null;
  if (!(client === 'codex' ? ['spawn_agent', 'collaborationspawn_agent', 'Agent'] : ['Agent']).includes(typeof event.tool_name === 'string' ? event.tool_name : '')) return null;
  const id = event.tool_use_id ?? event.tool_call_id;
  if (typeof id !== 'string' || !id.trim() || id.length > 512) return null;
  let input = event.tool_input;
  // Claude 2.1.314 expands an object placeholder as a JSON string, while
  // Codex preserves its JSON type. Decode this bounded transport form only
  // for Claude; neither input nor parse errors are logged or returned.
  if (typeof input === 'string') {
    if (client !== 'claude' || Buffer.byteLength(input) > 16384) return null;
    try { input = JSON.parse(input); } catch { return null; }
  }
  if (!object(input)) return null;
  return { client, event, input, id };
}

function constraints(client: Client, input: UnknownRecord): Required<RoutingConstraints> {
  return {
    model_pinned: own(input, 'model'),
    effort_pinned: ['effort', 'reasoning_effort', 'model_reasoning_effort'].some(k => own(input, k)),
    role_pinned: ['resume','resume_agent','agent_id'].some(k=>own(input,k)) || (client === 'claude' ? input.subagent_type !== 'general-purpose' :
      own(input, 'agent_type') || own(input, 'role')),
    fork_inherits: client === 'codex' ? input.fork_turns !== 'none' || own(input, 'fork_context') : input.subagent_type === 'fork',
    // Native tool arguments do not prove the source or precedence of settings.
    provenance_verified: false,
  };
}

/** Extract only a task label and safe structural features, never prompt/message/transcript. */
export function hookInput({ client, event, policy = defaultPolicy }: HookOptions = {}): RoutingInput | null {
  const found = target(client, event);
  if (!found) return null;
  const summary = client === 'claude' ? found.input.description : found.input.task_name;
  if (typeof summary !== 'string' || !summary.trim() || Buffer.byteLength(summary) > 4000) return null;
  const request_id = createHash('sha256').update(JSON.stringify([
    found.client, found.event.session_id ?? null, found.id,
  ])).digest('hex');
  return {
    request_id, client: found.client,
    task: { summary, operation: 'analysis', context_sufficient: false },
    eligible_profile_ids: policy.profiles.filter(p => p.client === client).map(p => p.id),
    constraints: constraints(found.client, found.input),
  };
}

/** Native Hook JSON, defaulting to no permission or argument intervention. */
export function hookOutput({ client, event, recommendation, mode = 'shadow', compatibilityVerified = false, policy = defaultPolicy }: HookOptions = {}): HookOutput {
  if (mode !== 'apply' || compatibilityVerified !== true) return {};
  const found = target(client, event);
  if (!found || !object(recommendation) || recommendation.status !== 'recommended') return {};
  const pins = constraints(found.client, found.input);
  if ((['model_pinned', 'effort_pinned', 'role_pinned', 'fork_inherits'] as const).some(k => pins[k])) return {};
  const profile = policy.profiles.find(p => p.client === client && p.id === recommendation.profile_id) as Profile | undefined;
  if (!profile || !isSupportedProfile(profile) || recommendation.policy_version !== policy.version ||
      recommendation.catalog_version !== policy.catalog_version) return {};
  // Select executable values solely from the trusted catalog. Reject conflicting
  // copies instead of letting a provider supply arbitrary model/effort strings.
  if (own(recommendation, 'model') || own(recommendation, 'reasoning_effort') || own(recommendation, 'effort')) return {};
  const suppliedProfile = recommendation.profile;
  if (!object(suppliedProfile) || Object.keys(suppliedProfile).length !== Object.keys(profile).length ||
      Object.entries(profile).some(([key, value]) => suppliedProfile[key] !== value)) return {};
  let updatedInput;
  try { updatedInput = structuredClone(found.input); } catch { return {}; }
  updatedInput.model = profile.model;
  if (client === 'codex') updatedInput.reasoning_effort = profile.reasoning_effort;
  return { hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    // Codex requires allow with updatedInput. Claude permits input-only
    // replacement, retaining the host's normal permission decision path.
    ...(client === 'codex' ? { permissionDecision: 'allow' } : {}),
    updatedInput,
  } };
}
