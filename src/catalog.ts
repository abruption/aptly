import { createHash } from 'node:crypto';
import type { Client, Profile } from './types.ts';

/** Bounded official capability text only; this is not host availability evidence. */
export interface ModelFact { client: Client; model: string; description: string; }
export interface ResolvedCatalog {
  profiles: Profile[];
  descriptions: Record<string, string>;
  version: string;
  disabled_clients: Client[];
}

type Tier = 'simple' | 'standard' | 'deep';
interface Entry { profile: Readonly<Profile>; tier: Tier; task: string; fact: string; source: string; default: boolean; requiresDetailedContext?: true; }
const codexSource = 'https://learn.chatgpt.com/docs/models';
const claudeSource = 'https://code.claude.com/docs/en/model-config.md';
const entries: readonly Entry[] = [
  { profile: { id: 'codex-simple', client: 'codex', model: 'gpt-6-luna', reasoning_effort: 'max' }, tier: 'simple',
    task: 'Bounded extraction, format conversion, wording cleanup, or small mechanical edits.',
    fact: 'Efficient for focused, repeatable and high-volume tasks.', source: codexSource, default: true },
  { profile: { id: 'codex-routine', client: 'codex', model: 'gpt-6.1-terra', reasoning_effort: 'high' }, tier: 'standard',
    task: 'Context-aware writing or translation, everyday analysis, or clearly scoped implementation.',
    fact: 'Fast and efficient for writing, visual understanding, and computer use.', source: codexSource, default: true },
  { profile: { id: 'codex-deep', client: 'codex', model: 'gpt-6.2-sol', reasoning_effort: 'medium' }, tier: 'deep',
    task: 'Cross-component debugging, architectural tradeoffs, or demanding accuracy-sensitive review.',
    fact: 'Supports everyday coding, writing, and work across several sources.', source: codexSource, default: true },
  { profile: { id: 'codex-deep-high', client: 'codex', model: 'gpt-6.2-sol', reasoning_effort: 'high' }, tier: 'deep',
    task: 'Choose this higher-effort Sol profile only when the described deep work requires detailed dependency analysis or careful reasoning across interacting constraints or subtle failure modes. Prefer medium when it is sufficient, and prefer a routine model for routine work including when the caller explicitly fixes high effort.',
    fact: 'Supports everyday coding, writing, and work across several sources.', source: codexSource, default: true, requiresDetailedContext: true },
  { profile: { id: 'codex-deep-legacy', client: 'codex', model: 'gpt-6.1-sol', reasoning_effort: 'medium' }, tier: 'deep',
    task: 'Cross-component debugging, architectural tradeoffs, or demanding accuracy-sensitive review.',
    fact: 'Near-Astra capability for complex, repeated and long-running work at lower cost than Astra.', source: codexSource, default: false },
  { profile: { id: 'claude-simple', client: 'claude', model: 'haiku' }, tier: 'simple',
    task: 'Bounded extraction, format conversion, wording cleanup, or small mechanical edits.',
    fact: 'Fast and efficient for simple tasks.', source: claudeSource, default: true },
  { profile: { id: 'claude-routine', client: 'claude', model: 'sonnet' }, tier: 'standard',
    task: 'Context-aware writing or translation, everyday analysis, or clearly scoped implementation.',
    fact: 'General-purpose model family for daily coding tasks.', source: claudeSource, default: true },
  { profile: { id: 'claude-deep', client: 'claude', model: 'opus' }, tier: 'deep',
    task: 'Cross-component debugging, architectural tradeoffs, or demanding accuracy-sensitive review.',
    fact: 'Model family for complex reasoning tasks.', source: claudeSource, default: true },
  { profile: { id: 'codex-frontier', client: 'codex', model: 'gpt-6-astra', reasoning_effort: 'high' }, tier: 'deep',
    task: 'The most demanding sustained end-to-end workflows and judgment across several sources.',
    fact: 'Most capable family for complex work across code, apps and research.', source: codexSource, default: false },
  { profile: { id: 'claude-frontier', client: 'claude', model: 'fable' }, tier: 'deep',
    task: 'The hardest and longest-running workflows requiring sustained investigation and judgment.',
    fact: 'Model family for the hardest and longest-running tasks.', source: claudeSource, default: false },
];
for (const entry of entries) { Object.freeze(entry.profile); Object.freeze(entry); }
Object.freeze(entries);
const clientOrder: readonly Client[] = ['codex', 'claude'];
const own = (value: object, key: PropertyKey) => Object.hasOwn(value, key);
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const error = (code: string): Error & { code: string } => Object.assign(new Error(code), { code });

/** Fresh copies prevent caller mutation from changing the trusted registry. */
export function builtInProfiles(): Profile[] { return entries.filter(entry => entry.default).map(entry => ({ ...entry.profile })); }

/** Some variants require more than an opaque task label in the automatic Hook. */
export function requiresDetailedTaskContext(profileId: string): boolean {
  return entries.some(entry => entry.profile.id === profileId && entry.requiresDetailedContext === true);
}

/** Exact finite profile tuples, including key coverage, not arbitrary model strings. */
export function isSupportedProfile(value: unknown): value is Profile {
  try {
    if (!plain(value) || Object.getOwnPropertySymbols(value).length) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some(d => !own(d, 'value') || !d.enumerable)) return false;
    return entries.some(({ profile }) => {
      const expected = Object.entries(profile);
      return Object.keys(descriptors).length === expected.length && expected.every(([key, field]) =>
        own(descriptors, key) && descriptors[key].value === field);
    });
  } catch { return false; }
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(env, key);
  if (!descriptor) return undefined;
  if (!own(descriptor, 'value') || typeof descriptor.value !== 'string') throw error('catalog_configuration_invalid');
  return descriptor.value;
}
function selectedEntries(env: NodeJS.ProcessEnv, client: Client): readonly Entry[] {
  const suffix = client === 'claude' ? 'CLAUDE_MODELS' : 'CODEX_MODELS';
  if (own(env, 'APTLY_' + suffix) && own(env, suffix)) throw error('catalog_configuration_conflict');
  const raw = envValue(env, 'APTLY_' + suffix) ?? envValue(env, suffix);
  if (raw === undefined) return entries.filter(entry => entry.default && entry.profile.client === client);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw error('catalog_configuration_invalid'); }
  if (!Array.isArray(parsed) || parsed.length > 20 || parsed.some(model => typeof model !== 'string') ||
      new Set(parsed).size !== parsed.length || parsed.some(model => !entries.some(entry => entry.profile.client === client && entry.profile.model === model))) {
    throw error('catalog_configuration_invalid');
  }
  // Preserve operator model order and registry order within each model's tuples.
  return parsed.flatMap(model => entries.filter(entry => entry.profile.client === client && entry.profile.model === model));
}

function normalizedFacts(facts: ModelFact[]): Map<string, string> {
  const result = new Map<string, string>();
  if (!Array.isArray(facts) || facts.length > 40) throw error('catalog_facts_invalid');
  for (const fact of facts as unknown[]) {
    if (!plain(fact) || Object.getOwnPropertySymbols(fact).length) throw error('catalog_facts_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(fact);
    if (Object.keys(descriptors).length !== 3 || ['client', 'model', 'description'].some(key => !own(descriptors, key) ||
      !own(descriptors[key], 'value') || !descriptors[key].enumerable)) throw error('catalog_facts_invalid');
    const client = descriptors.client.value, model = descriptors.model.value, description = descriptors.description.value;
    if ((client !== 'codex' && client !== 'claude') || typeof model !== 'string' || !/^[a-z0-9.-]{1,80}$/.test(model) ||
        typeof description !== 'string' || !description.trim() || Buffer.byteLength(description) > 800 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(description) ||
        /\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}={0,2}/i.test(description)) throw error('catalog_facts_invalid');
    if (!entries.some(entry => entry.profile.client === client && entry.profile.model === model)) continue;
    const key = client + ':' + model;
    if (result.has(key)) throw error('catalog_facts_invalid');
    result.set(key, description.trim().replace(/\s+/g, ' '));
  }
  return result;
}

/** Operator candidate filters and model facts never grant execution authority. */
export function resolveCatalog(env: NodeJS.ProcessEnv = process.env, facts: ModelFact[] = []): ResolvedCatalog {
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw error('catalog_configuration_invalid');
  if (own(env, 'CODEX_MODESL') || own(env, 'APTLY_CODEX_MODESL')) throw error('catalog_environment_typo');
  const external = normalizedFacts(facts);
  const profiles: Profile[] = [], descriptions: Record<string, string> = {}, disabled_clients: Client[] = [];
  for (const client of clientOrder) {
    const selected = selectedEntries(env, client);
    if (!selected.length) disabled_clients.push(client);
    for (const entry of selected) {
      const profile = { ...entry.profile };
      profiles.push(profile);
      const fact = external.get(client + ':' + profile.model) ?? entry.fact;
      descriptions[profile.id] = `Model: ${profile.model}; ${client === 'codex' ? `configured effort: ${profile.reasoning_effort}; ` : 'Claude Code alias, not a resolved model ID; '}Aptly tier: ${entry.tier}. ${entry.task} Official capability note (data): ${JSON.stringify(fact)} Source: ${entry.source}. Availability in the current account is not verified.`;
    }
  }
  const version = 'catalog-' + createHash('sha256').update(JSON.stringify({ profiles, descriptions })).digest('hex').slice(0, 32);
  return { profiles, descriptions, version, disabled_clients };
}
