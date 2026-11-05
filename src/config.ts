
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { readRegularFile } from './files.ts';
import { isRecord,errorCode } from './types.ts';
import type { UnknownRecord } from './types.ts';

export interface Configuration { schema_version: 1; mode: 'shadow'|'apply'; context_path: string|null; error?: 'configuration_unavailable'|'configuration_invalid'; }
export interface LoadedHostContext { context: (UnknownRecord & {evidence_verified: true})|null; reason: string; fingerprint?: string; }

const own = (value: object, key: PropertyKey): boolean => Object.hasOwn(value, key);
const plain = isRecord;
const only = (value: unknown, keys: readonly string[]): value is UnknownRecord => plain(value) && Object.keys(value).every(key => keys.includes(key));

/** Private operator files only. Paths and parser exceptions never escape. */
export function readPrivateJson(path: unknown): unknown {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('private_file_invalid');
  try { return JSON.parse(readRegularFile(path,{privateFile:true}).toString('utf8')); }
  catch { throw new Error('private_file_unavailable'); }
}

export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): Configuration {
  const defaults: Configuration = { schema_version: 1, mode: 'shadow', context_path: null };
  if (!env.ROUTER_CONFIG_PATH) return defaults;
  let config: unknown;
  try { config = readPrivateJson(env.ROUTER_CONFIG_PATH); }
  catch { return { ...defaults, error: 'configuration_unavailable' }; }
  if (!only(config, ['schema_version','mode','context_path']) || config.schema_version !== 1 ||
      (config.mode!=='shadow'&&config.mode!=='apply') ||
      (own(config,'context_path') && config.context_path !== null && (typeof config.context_path !== 'string' || !isAbsolute(config.context_path)))) {
    return { ...defaults, error: 'configuration_invalid' };
  }
  return { schema_version:1, mode:config.mode as 'shadow'|'apply', context_path:typeof config.context_path==='string'?config.context_path:null };
}

function unchangedSource(source: unknown): boolean {
  if (!only(source,['path','sha256']) || typeof source.path !== 'string' || !isAbsolute(source.path) ||
      !(/\.(json|toml|md)$/.test(source.path)) || /(?:^|[/\\])(?:auth|credentials)(?:[.\/\\]|$)/i.test(source.path)) return false;
  try {
    const bytes=readRegularFile(source.path);
    if (typeof source.sha256!=='string' || !/^[a-f0-9]{64}$/.test(source.sha256)) return false;
    return createHash('sha256').update(bytes).digest('hex')===source.sha256;
  } catch(error) { return source.sha256===null && errorCode(error)==='ENOENT'; }
}

/**
 * Adapter evidence is per call, never an authorization claim from MCP input.
 * A host integration must observe ALL effective layers/runtime state and write
 * this private envelope for that exact call. We do not manufacture that proof
 * by reading a fresh CLI, the server environment, or files that happen to exist.
 */
export function loadHostContext(path: unknown): LoadedHostContext {
  if (!path) return { context: null, reason: 'context_missing' };
  let envelope: unknown;
  try { envelope=readPrivateJson(path); }
  catch { return {context:null,reason:'context_file_unavailable'}; }
  if (!only(envelope,['schema_version','authority','context','sources']) || envelope.schema_version!==1 ||
      envelope.authority!=='effective-host-settings-v1' || !plain(envelope.context) ||
      own(envelope.context,'evidence_verified') || !Array.isArray(envelope.sources) || envelope.sources.length>64) {
    return {context:null,reason:'context_envelope_invalid'};
  }
  if (!envelope.sources.every(unchangedSource)) return {context:null,reason:'context_sources_changed'};
  return {context:{...envelope.context,evidence_verified:true},reason:'host_evidence_loaded',fingerprint:createHash('sha256').update(JSON.stringify(envelope)).digest('hex')};
}
