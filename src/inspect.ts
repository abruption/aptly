// Read only explicitly supplied configuration files. This is a redacted local
// explanation, never evidence of the effective settings of a running host.
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { provenanceRequirements } from './provenance.ts';
import { assertNoRedirectedAncestors } from './files.ts';
import type { Client, UnknownRecord } from './types.ts';
import { errorCode } from './types.ts';
import type { EvidenceState } from './provenance.ts';
interface SettingStates { model: EvidenceState; effort: EvidenceState; }
export interface InspectionOptions { client?: unknown; cwd?: unknown; files?: unknown; environment?: unknown; clientVersion?: unknown; }
export interface InspectionResult { client: Client | 'unknown'; client_version: string; layers: Array<SettingStates & { source: string }>; environment: Record<string, 'set' | 'unset' | 'unknown'>; host_extensions: 'unknown'; evidence_verified: false; reason: 'effective_host_context_unobserved'; }

const MAX_BYTES = 65536;
const MAX_FILES = 64;
const own = (value: object, key: PropertyKey) => Object.hasOwn(value, key);
const plain = (value: unknown): value is UnknownRecord => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unknown = (): SettingStates => ({ model: 'unknown', effort: 'unknown' });
const unset = (): SettingStates => ({ model: 'unset', effort: 'unset' });
const mergeState = (a: EvidenceState, b: EvidenceState): EvidenceState => a === 'pinned' || b === 'pinned' ? 'pinned' : a === 'unknown' || b === 'unknown' ? 'unknown' : 'unset';
const merge = (a: SettingStates, b: SettingStates): SettingStates => ({ model: mergeState(a.model, b.model), effort: mergeState(a.effort, b.effort) });
const allowedFiles: Record<Client, string[]> = {
  codex: ['role', 'subagent_defaults', 'profile', 'project', 'user', 'system', 'managed'],
  claude: ['agent', 'settings_flag', 'local', 'project', 'user', 'managed'],
};
const MODEL_ENV = new Set(['CODEX_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE',
  'ANTHROPIC_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL']);
const EFFORT_ENV = new Set(['CODEX_REASONING_EFFORT', 'CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_CODE_MAX_EFFORT_LEVEL']);
const CLAUDE_MODEL_POLICIES = ['availableModels', 'deniedModels', 'deniedModelPatterns', 'availableModelsMatch', 'enforceAvailableModels'];
const CODEX_MODEL_POLICIES = ['allowed_models', 'denied_models', 'model_requirements'];

function secretPath(path: string): boolean {
  return path.split(/[\\/]+/).some(part => /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|id_rsa|id_ed25519)$/i.test(part) ||
    /(?:^|[._-])(?:auth|oauth|credentials?|secrets?|tokens?)(?:[._-]|$)/i.test(part) || /^Bitwarden CLI$/i.test(part));
}

function explicitFile(path: string): { status: 'read'; text: string } | { status: 'unknown' | 'missing' } {
  let fd;
  try {
    assertNoRedirectedAncestors(path);
    const before = lstatSync(path);
    if (!before.isFile() || before.size > MAX_BYTES) return { status: 'unknown' };
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const current = fstatSync(fd);
    if (!current.isFile() || current.size > MAX_BYTES || current.dev !== before.dev || current.ino !== before.ino) return { status: 'unknown' };
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const count = readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (!count) break;
      bytes += count;
    }
    if (bytes > MAX_BYTES) return { status: 'unknown' };
    const text = buffer.subarray(0, bytes).toString('utf8');
    if (text.includes('\uFFFD')) return { status: 'unknown' };
    return { status: 'read', text };
  } catch (error) {
    return { status: errorCode(error) === 'ENOENT' ? 'missing' : 'unknown' };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Intentionally a strict frontmatter subset. YAML anchors, lists, multiline
// scalars, duplicate fields and nested structures stay unknown rather than
// pretending to resolve a host's full YAML parser behavior.
function frontmatter(text: string): UnknownRecord {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0] !== '---') throw new Error('unknown_frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('unknown_frontmatter');
  const data: UnknownRecord = {};
  const known = new Set(['name', 'description', 'model', 'effort', 'model_reasoning_effort', 'tools', 'disallowedTools',
    'permissionMode', 'maxTurns', 'memory', 'background', 'isolation', 'color', 'initialPrompt', 'context',
    'user-invocable', 'disable-model-invocation', 'argument-hint', 'allowed-tools']);
  for (const line of lines.slice(1, end)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line);
    if (!match || !known.has(match[1]) || own(data, match[1])) throw new Error('unknown_frontmatter');
    const key = match[1], raw = match[2].trim();
    if (!raw || /^(?:[|>&*!\[{]|---$|\.\.\.$)/.test(raw) || /\s[&*!][A-Za-z]/.test(raw)) throw new Error('unknown_frontmatter');
    if (raw.startsWith('"')) data[key] = JSON.parse(raw);
    else if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) throw new Error('unknown_frontmatter');
      data[key] = raw.slice(1, -1).replace(/''/g, "'");
    } else {
      if (/^[\[\]{}]|:\s/.test(raw)) throw new Error('unknown_frontmatter');
      data[key] = raw.split(/\s+#/)[0].trim();
    }
    if (['model', 'effort', 'model_reasoning_effort'].includes(key) &&
        (typeof data[key] !== 'string' || !data[key] || /^(?:null|~)$/i.test(data[key] as string))) throw new Error('unknown_frontmatter');
  }
  return data;
}

function present(data: object, names: readonly string[]) { return names.some(key => own(data, key)); }
function summarize(client: Client, data: unknown): SettingStates {
  if (!plain(data)) return unknown();
  let result = unset();
  if (own(data, 'model')) result.model = 'pinned';
  if (present(data, client === 'codex' ? ['model_reasoning_effort', 'reasoning_effort', 'effort'] : ['effort', 'effortLevel', 'maxEffortLevel'])) result.effort = 'pinned';
  if (present(data, client === 'codex' ? CODEX_MODEL_POLICIES : CLAUDE_MODEL_POLICIES)) result.model = 'pinned';
  if (own(data, 'env')) {
    const env = data.env;
    if (!plain(env)) result = merge(result, unknown());
    else {
      if ([...MODEL_ENV].some(key => own(env, key))) result.model = 'pinned';
      if ([...EFFORT_ENV].some(key => own(env, key))) result.effort = 'pinned';
    }
  }
  if (client === 'codex' && own(data, 'agents')) {
    if (!plain(data.agents)) return merge(result, unknown());
    const agents = data.agents;
    if (own(agents, 'default_subagent_model')) result.model = 'pinned';
    if (own(agents, 'default_subagent_reasoning_effort')) result.effort = 'pinned';
    for (const [key, value] of Object.entries(agents)) {
      if (['default_subagent_model', 'default_subagent_reasoning_effort', 'enabled', 'max_threads',
        'max_concurrent_threads_per_session', 'interrupt_message'].includes(key)) continue;
      if (!plain(value)) { result = merge(result, unknown()); continue; }
      if (own(value, 'model')) result.model = 'pinned';
      if (present(value, ['model_reasoning_effort', 'reasoning_effort', 'effort'])) result.effort = 'pinned';
      if (own(value, 'config_file')) result = merge(result, unknown());
    }
  }
  if (client === 'claude' && own(data, 'modelSettings')) {
    if (!plain(data.modelSettings)) return merge(result, { model: 'unset', effort: 'unknown' });
    for (const settings of Object.values(data.modelSettings)) {
      if (!plain(settings)) result = merge(result, { model: 'unset', effort: 'unknown' });
      else if (present(settings, ['effort', 'effortLevel', 'maxEffortLevel'])) result.effort = 'pinned';
    }
  }
  return result;
}

function inspectOne(client: Client, cwd: unknown, descriptor: unknown): SettingStates {
  if (!plain(descriptor) || typeof descriptor.path !== 'string' || !descriptor.path ||
      descriptor.path.includes('\0') || Buffer.byteLength(descriptor.path) > 4096 ||
      typeof cwd !== 'string' || !isAbsolute(cwd)) return unknown();
  const path = resolve(cwd, descriptor.path);
  if (secretPath(path)) return unknown();
  const format = /\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase();
  if ((!format || !['json', 'toml', 'md'].includes(format))) return unknown();
  const file = explicitFile(path);
  if (file.status === 'missing') return unset();
  if (file.status !== 'read') return unknown();
  try {
    const data = format === 'json' ? JSON.parse(file.text) : format === 'toml' ? parseToml(file.text) : frontmatter(file.text);
    return summarize(client, data);
  } catch { return unknown(); }
}

/**
 * Explain only explicitly selected files and a caller-supplied env snapshot.
 * No secret values, paths, file bodies or parse errors leave this function.
 * File absence is local evidence about that file, not source completeness.
 */
export function explainSettings({ client, cwd = process.cwd(), files = [], environment = {}, clientVersion }: InspectionOptions = {}): InspectionResult {
  const supported = client === 'codex' || client === 'claude';
  const safeClient: Client | 'unknown' = supported ? client : 'unknown';
  const requirements = supported ? provenanceRequirements[client] : { layers: [], environment: [] };
  const seen = new Map<string, SettingStates>();
  if (supported && Array.isArray(files) && files.length <= MAX_FILES) {
    for (const descriptor of files) {
      if (!plain(descriptor) || (typeof descriptor.source !== 'string' || !allowedFiles[client].includes(descriptor.source))) continue;
      const value = inspectOne(client, cwd, descriptor);
      seen.set(descriptor.source, seen.has(descriptor.source) ? merge(seen.get(descriptor.source)!, value) : value);
    }
  }
  const env: Record<string, 'set' | 'unset' | 'unknown'> = {};
  for (const name of requirements.environment) env[name] = environment === null || typeof environment !== 'object' || Array.isArray(environment) ? 'unknown' : own(environment, name) ? 'set' : 'unset';
  return {
    client: safeClient,
    client_version: typeof clientVersion === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[A-Za-z0-9.-]{1,32})?$/.test(clientVersion) ? clientVersion : 'unknown',
    layers: requirements.layers.map(source => ({ source, ...(seen.get(source) ?? unknown()) })),
    environment: env,
    host_extensions: 'unknown',
    evidence_verified: false,
    reason: 'effective_host_context_unobserved',
  };
}
