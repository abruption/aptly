import { lstatSync, readFileSync, mkdirSync, chmodSync, openSync, writeFileSync, closeSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';
import { resolveCatalog } from './catalog.ts';
import { budgetEnvironmentDefaults, budgetEnvironmentKeys, parseBudgetValue, resolveBudgetSettings, budgetErrorDetails } from './budget.ts';
import { Router, defaultPolicy } from './core.ts';
import { QuerySnapshot } from './query-snapshot.ts';
import { loadAutomaticHookPolicy, queryAutomaticHookPolicy, effectiveTransmission, type AutoPolicy } from './automatic-hook.ts';
import { assertPrivateStatePath } from './files.ts';
import { CODEX_HOME_POLICY_SOURCE, resolvePolicySource } from './policy-source.ts';
import { assertWindowsPrivatePath, protectNewWindowsPrivateDirectory, copyWindowsFilePermissions } from './windows-private.ts';

import { STATISTICS_CONFIG_FILE, STATISTICS_KEY_FILE, STATISTICS_DB_FILE, parseStatisticsConfig, serializeStatisticsConfig, readStatisticsQuery, type StatisticsConfig } from './statistics.ts';

type Client = 'codex' | 'claude';
type ObjectValue = Record<string, any>;
export interface SetupOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  automatic?: boolean;
  clients?: Client[];
  mode?: 'defaults' | 'advisory';
  transmission?: TransmissionScope;
  selectUnselectedOnly?: boolean;
}
export type TransmissionScope = 'none' | 'description' | 'excerpt';
export interface SetupClientResult { client: Client; status: 'configured' | 'unchanged' | 'removed' | 'skipped' | 'error'; codes: string[]; invalid_budget_keys?:string[]; budget_error?:string; policy_location?: 'default_home' | 'elsewhere'; selected_home_source?: 'default' | 'override'; requires_hook_review?: boolean; recovery?: string[]; transmission?: string; transmission_source?: 'explicit' | 'legacy' | 'unselected'; transmission_review?: 'required' | 'complete'; budget?: { limits:Record<string,number>; added:string[]; updated:string[]; preserved:string[]; inherited:string[]; restart_required:boolean } }
export interface SetupResult { status: 'complete' | 'partial' | 'skipped'; clients: SetupClientResult[] }
type Snapshot = { path: string; before: string | null; after: string | null; mode: number; reviewPrivate?: boolean; identity?: string };
type Ownership = { schema_version: 1; kind: 'aptly-setup-ownership'; client: Client; hook: ObjectValue; mcp_created: boolean; mcp?: ObjectValue; policy: ObjectValue; policy_created: boolean; env_added: Record<string, string>; env_vars_added?: string[]; env_vars_was_absent?: boolean; policy_source_previous?: string; toml_block?: string };
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const stringify = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const fail = (code: string): never => { throw new Error(code); };
function privatePermissions(path: string, code: 'private_directory_permissions' | 'private_file_permissions') {
  if (process.platform === 'win32') { try { assertWindowsPrivatePath(path); } catch { fail(code); } }
  else if ((lstatSync(path).mode & 0o077) !== 0) fail(code);
}
const checkedDirectory = (path: string) => { const s = lstatSync(path); if (!s.isDirectory() || s.isSymbolicLink()) fail('unsafe_directory'); };
function noSymlinks(path: string) {
  let current = resolve(path);
  for (;;) {
    try { if (lstatSync(current).isSymbolicLink()) fail('unsafe_symlink'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
}
function read(path: string): { text: string | null; mode: number } {
  noSymlinks(path);
  try {
    const s = lstatSync(path);
    if (!s.isFile() || s.size > 4 * 1024 * 1024) fail('unsafe_configuration_file');
    return { text: readFileSync(path, 'utf8'), mode: s.mode & 0o777 };
  } catch (e: any) { if (e.code === 'ENOENT') return { text: null, mode: 0o600 }; throw e; }
}
function json(text: string | null): ObjectValue {
  if (text === null) return {};
  let value: unknown; try { value = JSON.parse(text); } catch { return fail('invalid_json'); }
  if (!object(value)) fail('invalid_json_object'); return value as ObjectValue;
}
function map(parent: ObjectValue, key: string): ObjectValue {
  if (parent[key] === undefined) parent[key] = {};
  if (!object(parent[key])) fail('configuration_shape_conflict'); return parent[key];
}
function hook(client: Client) {
  return { matcher: client === 'codex' ? '^(spawn_agent|collaborationspawn_agent|Agent)$' : '^Agent$', hooks: [{ type: 'mcp_tool', server: 'aptly', tool: 'route_spawn_hook', input: { client, event: { hook_event_name: '${hook_event_name}', tool_name: '${tool_name}', tool_input: '${tool_input}', tool_use_id: '${tool_use_id}', session_id: '${session_id}', cwd: '${cwd}' } }, timeout: 20 }] };
}
function hooksArray(settings: ObjectValue): any[] {
  const hooks = map(settings, 'hooks');
  if (hooks.PreToolUse === undefined) hooks.PreToolUse = [];
  if (!Array.isArray(hooks.PreToolUse)) fail('hook_shape_conflict'); return hooks.PreToolUse;
}
function routeHook(entry: unknown) { return object(entry) && Array.isArray(entry.hooks) && entry.hooks.some((h: unknown) => object(h) && h.type === 'mcp_tool' && h.server === 'aptly' && h.tool === 'route_spawn_hook'); }
function toml(text: string): ObjectValue { try { return structuredClone(parse(text)) as ObjectValue; } catch { return fail('invalid_toml'); } }
const q = (value: string) => JSON.stringify(value);
const blockStart = '# aptly managed MCP start v1';
const blockEnd = '# aptly managed MCP end v1';
function newTomlBlock(entry: ObjectValue) {
  const lines = [blockStart, '[mcp_servers.aptly]', `command = ${q(entry.command)}`, `args = ${JSON.stringify(entry.args)}`, `env_vars = ${JSON.stringify(entry.env_vars ?? [])}`, '[mcp_servers.aptly.env]'];
  for (const [key, value] of Object.entries(entry.env)) lines.push(`${key} = ${q(value as string)}`);
  return lines.concat(blockEnd, '').join('\n');
}
/** Append only the owned env table/keys; validation rejects inline/ambiguous layouts. */
function addTomlEnv(text: string, additions: Record<string, string>): string {
  if (!Object.keys(additions).length) return text;
  const target = structuredClone(toml(text));
  Object.assign(map(map(map(target, 'mcp_servers'), 'aptly'), 'env'), additions);
  const lines = Object.entries(additions).map(([key, value]) => `${key} = ${q(value)}\n`).join('');
  const headers = [...text.matchAll(/^\s*\[([^\n]+)\][ \t]*(?:#[^\n]*)?\r?$/gm)];
  let found: RegExpMatchArray | undefined;
  for (const h of headers) {
    try { const probe = toml(`${h[0]}\naptly_probe = true\n`); if (probe.mcp_servers?.aptly?.env?.aptly_probe === true) found = h; } catch { /* Not the target table. */ }
  }
  let result: string;
  if (found) {
    const next = headers.find(h => h.index! > found!.index!);
    const offset = next?.index ?? text.length;
    result = text.slice(0, offset) + (offset && text[offset - 1] !== '\n' ? '\n' : '') + lines + text.slice(offset);
  } else result = text + (text.endsWith('\n') ? '\n' : '\n\n') + '[mcp_servers.aptly.env]\n' + lines;
  try { if (!isDeepStrictEqual(toml(result), target)) fail('unsupported_toml_layout'); } catch { fail('unsupported_toml_layout'); }
  return result;
}
function removeTomlEnv(text: string, additions: Record<string, string>): string {
  const target = structuredClone(toml(text));
  for (const [key, value] of Object.entries(additions)) {
    if (target.mcp_servers?.aptly?.env?.[key] !== value) fail('managed_entry_changed');
    delete target.mcp_servers.aptly.env[key];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = new RegExp(`^${escaped} = ${q(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n`, 'gm');
    const matches = [...text.matchAll(line)]; if (matches.length !== 1) fail('managed_entry_changed'); text = text.replace(line, '');
  }
  if (!isDeepStrictEqual(toml(text), target)) fail('managed_entry_changed'); return text;
}
export const configurableEnvironmentKeys: readonly string[] = Object.freeze([...budgetEnvironmentKeys, 'ROUTER_PROVIDER', 'APTLY_CLAUDE_MODELS', 'APTLY_CODEX_MODELS', 'CLAUDE_MODELS', 'CODEX_MODELS', 'APTLY_MODEL_INFO_PATH'] as const);
type EnvironmentEdit = { defaults: true } | { key: string; value: string } | { credential: true } | { migrate: true; includeExisting?: boolean } | { transmission: TransmissionScope };
const defaultEnvironment = { ...budgetEnvironmentDefaults, ROUTER_PROVIDER: 'decisions', APTLY_CLAUDE_MODELS: '["haiku","sonnet","opus"]', APTLY_CODEX_MODELS: '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]' };
function validateEnvironmentValue(key: string, value: string) {
  if (!(configurableEnvironmentKeys as readonly string[]).includes(key)) fail(/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) ? 'environment_secret_key_unsupported' : 'environment_key_unsupported');
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 8192 || /[\x00-\x1f\x7f]/.test(value)) fail('environment_invalid_value');
  if (/\bsk-[A-Za-z0-9_-]{8,}|\bBearer\s+\S+|https?:\/\/[^/\s]+:[^/\s]+@/i.test(value)) fail('environment_sensitive_value');
  if (budgetEnvironmentKeys.includes(key)) { try {parseBudgetValue(key,value);} catch(error) {throw Object.assign(new Error('environment_invalid_value'),budgetErrorDetails(error));} }
  if (key === 'ROUTER_PROVIDER' && !['fixture','decisions'].includes(value)) fail('environment_invalid_value');
  if (key === 'APTLY_MODEL_INFO_PATH') { try { assertPrivateStatePath(value); } catch { fail('environment_invalid_value'); } }
}
function budgetInheritance(entry:ObjectValue, environment:NodeJS.ProcessEnv, client:Client) {
  if(client==='codex'&&entry.env_vars!==undefined&&(!Array.isArray(entry.env_vars)||entry.env_vars.some((key:unknown)=>typeof key!=='string')))fail('configuration_shape_conflict');
  const permitted=client==='codex'?(entry.env_vars??[]):[],keys=new Set<string>(),values:Record<string,unknown>={};
  for(const key of budgetEnvironmentKeys){
    if(client==='codex'?permitted.includes(key):environment[key]!==undefined){keys.add(key);if(environment[key]!==undefined)values[key]=environment[key];}
  }
  for(const key of Object.keys(environment))if((key.startsWith('APTLY_MAX_')||key.startsWith('APTLY_ESTIMATED_'))&&(client==='claude'||permitted.includes(key)))values[key]=environment[key];
  return {keys,values};
}
function editEnvironment(current: ObjectValue, edit: EnvironmentEdit, client: Client, inherited:{keys:Set<string>;values:Record<string,unknown>}): Record<string,string> {
  const updates: Record<string,string> = {};
  if ('defaults' in edit) {
    for (const [key,value] of Object.entries(defaultEnvironment)) {
      const alias = key === 'APTLY_CLAUDE_MODELS' ? 'CLAUDE_MODELS' : key === 'APTLY_CODEX_MODELS' ? 'CODEX_MODELS' : null;
      if (current[key] === undefined && (!alias || current[alias] === undefined) && !(budgetEnvironmentKeys.includes(key)&&inherited.keys.has(key))) updates[key] = value;
    }
  } else if ('credential' in edit) {
    updates.APTLY_SECRET_BACKEND = 'os';
    updates.APTLY_SECRET_CLIENT = client;
  } else if (!('migrate' in edit) && !('transmission' in edit)) { validateEnvironmentValue(edit.key, edit.value); updates[edit.key] = edit.value; }
  const effective = { ...inherited.values, ...current, ...updates };
  if (effective.ROUTER_PROVIDER !== undefined && !['fixture','decisions'].includes(effective.ROUTER_PROVIDER)) fail('environment_invalid_value');
  try { resolveCatalog(effective); resolveBudgetSettings(effective); } catch(error) { throw Object.assign(new Error('environment_invalid_value'),budgetErrorDetails(error)); }
  return Object.fromEntries(Object.entries(updates).filter(([key,value]) => current[key] !== value));
}
/** Change only selected single-line scalar env assignments; refuse ambiguous TOML layouts. */
function updateTomlEnv(text: string, updates: Record<string,string>): string {
  const parsed = toml(text), existing = parsed.mcp_servers?.aptly?.env ?? {};
  const expected = structuredClone(parsed); Object.assign(map(map(map(expected,'mcp_servers'),'aptly'),'env'), updates);
  const headers = [...text.matchAll(/^\s*\[([^\n]+)\][ \t]*(?:#[^\n]*)?\r?$/gm)];
  const header = headers.find(h => { try { return toml(h[0]+'\naptly_probe = true\n').mcp_servers?.aptly?.env?.aptly_probe === true; } catch { return false; } });
  const present = Object.entries(updates).filter(([key]) => existing[key] !== undefined);
  if (present.length) {
    if (!header) fail('unsupported_toml_layout');
    const end = headers.find(h => h.index! > header!.index!)?.index ?? text.length;
    let body = text.slice(header!.index! + header![0].length, end);
    for (const [key,value] of present) {
      const line = new RegExp('^[ \t]*'+key+'[ \t]*=[^\n]*(?:\n|$)','gm');
      if ([...body.matchAll(line)].length !== 1) fail('unsupported_toml_layout');
      body = body.replace(line, () => key+' = '+q(value)+'\n');
    }
    text = text.slice(0,header!.index!+header![0].length)+body+text.slice(end);
  }
  text = addTomlEnv(text,Object.fromEntries(Object.entries(updates).filter(([key]) => existing[key] === undefined)));
  if (!isDeepStrictEqual(toml(text),expected)) fail('unsupported_toml_layout'); return text;
}
/** Replace only unambiguous single-line launcher assignments in an existing table. */
function updateTomlLauncher(text: string, entry: ObjectValue): string {
  const original = toml(text), expected = structuredClone(original);
  expected.mcp_servers.aptly.command = entry.command;
  expected.mcp_servers.aptly.args = entry.args;
  const headers = [...text.matchAll(/^\s*\[([^\n]+)\][ \t]*(?:#[^\n]*)?\r?$/gm)];
  const header = headers.find(h => { try { return toml(h[0]+'\naptly_probe = true\n').mcp_servers?.aptly?.aptly_probe === true; } catch { return false; } });
  if (!header) fail('unsupported_toml_layout');
  const start = header!.index! + header![0].length, end = headers.find(h => h.index! > header!.index!)?.index ?? text.length;
  let body = text.slice(start,end);
  for (const key of ['command','args']) {
    const assignment = new RegExp('^[ \\t]*'+key+'[ \\t]*=[^\\n]*(?:\\n|$)','gm');
    const matches = [...body.matchAll(assignment)];
    if (matches.length !== 1 || !isDeepStrictEqual(toml(matches[0][0])[key],original.mcp_servers.aptly[key])) fail('unsupported_toml_layout');
    body = body.replace(assignment, () => key+' = '+JSON.stringify(entry[key])+(matches[0][0].endsWith('\r\n')?'\r\n':matches[0][0].endsWith('\n')?'\n':''));
  }
  const rendered = text.slice(0,start)+body+text.slice(end);
  if (!isDeepStrictEqual(toml(rendered),expected)) fail('unsupported_toml_layout');
  return rendered;
}

/** Replace an unambiguous env_vars assignment, preserving every existing forwarded name. */
function updateTomlForwarding(text:string, names:string[]|undefined):string {
  const original=toml(text), expected=structuredClone(original);
  if(names===undefined)delete expected.mcp_servers.aptly.env_vars; else expected.mcp_servers.aptly.env_vars=names;
  const headers=[...text.matchAll(/^\s*\[([^\n]+)\][ \t]*(?:#[^\n]*)?\r?$/gm)];
  const header=headers.find(h=>{try{return toml(h[0]+'\naptly_probe = true\n').mcp_servers?.aptly?.aptly_probe===true;}catch{return false;}});
  if(!header)fail('unsupported_toml_layout');
  const start=header!.index!+header![0].length,end=headers.find(h=>h.index!>header!.index!)?.index??text.length;
  let body=text.slice(start,end); const line=/^[ \t]*env_vars[ \t]*=[^\n]*(?:\n|$)/gm, matches=[...body.matchAll(line)];
  if(matches.length>1 || (original.mcp_servers.aptly.env_vars!==undefined && matches.length!==1))fail('unsupported_toml_layout');
  if(matches.length)body=body.replace(line,()=>names===undefined?'':`env_vars = ${JSON.stringify(names)}\n`);
  else if(names!==undefined)body='\n'+`env_vars = ${JSON.stringify(names)}\n`+body.replace(/^\r?\n/,'');
  const rendered=text.slice(0,start)+body+text.slice(end);
  if(!isDeepStrictEqual(toml(rendered),expected))fail('unsupported_toml_layout');
  return rendered;
}
/** CLI commands validate their explicitly selected config home, not a running host. */
function selectedCliPolicyPath(options:SetupOptions):string|undefined {
  const env=options.env??process.env;
  return resolvePolicySource(CODEX_HOME_POLICY_SOURCE,env.CODEX_HOME===undefined?{...env,CODEX_HOME:resolved(options,'codex').dir}:env);
}
function policyReferenceMatches(entry:ObjectValue,client:Client,policyPath:string,options:SetupOptions):boolean {
  const source=entry.env?.APTLY_HOOK_POLICY_PATH;
  if(source!==CODEX_HOME_POLICY_SOURCE)return source===policyPath;
  return client==='codex' && entry.env?.CODEX_HOME===undefined && Array.isArray(entry.env_vars) && entry.env_vars.every((x:unknown)=>typeof x==='string') && entry.env_vars.includes('CODEX_HOME') && selectedCliPolicyPath(options)===policyPath;
}

function resolved(options: SetupOptions, client: Client) {
  const home = resolve(options.home ?? homedir()), env = options.env ?? process.env;
  const override = client === 'codex' ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR;
  if (override && !isAbsolute(override)) fail('relative_configuration_directory');
  if(client==='codex'&&override!==undefined)resolvePolicySource(CODEX_HOME_POLICY_SOURCE,env);
  const dir = override || join(home, client === 'codex' ? '.codex' : '.claude');
  const mcpPath = client === 'codex' ? join(dir, 'config.toml') : override ? join(dir, '.claude.json') : join(home, '.claude.json');
  return { dir, mcpPath, hooksPath: join(dir, client === 'codex' ? 'hooks.json' : 'settings.json'), privateDir: join(dir, 'aptly') };
}
function ownership(value: ObjectValue, client: Client): Ownership {
  if (value.schema_version !== 1 || value.kind !== 'aptly-setup-ownership' || value.client !== client || !object(value.hook) || typeof value.mcp_created !== 'boolean' || !object(value.env_added) || !object(value.policy) || typeof value.policy_created !== 'boolean') fail('invalid_ownership');
  if (value.policy_source_previous !== undefined && (client !== 'codex' || value.mcp_created || typeof value.policy_source_previous !== 'string' || !isAbsolute(value.policy_source_previous) || Object.hasOwn(value.env_added,'APTLY_HOOK_POLICY_PATH'))) fail('invalid_ownership');
  if (value.env_vars_added !== undefined && (client !== 'codex' || value.mcp_created || !Array.isArray(value.env_vars_added) || value.env_vars_added.length!==1 || value.env_vars_added[0]!=='CODEX_HOME')) fail('invalid_ownership');
  if (value.env_vars_was_absent !== undefined && (client !== 'codex' || value.mcp_created || typeof value.env_vars_was_absent!=='boolean' || !value.env_vars_added)) fail('invalid_ownership');
  return value as Ownership;
}
/** Compatibility restriction only: this does not authenticate arbitrary launcher code. */
function requireCredentialRuntime(entry: ObjectValue, root: string) {
  const allowed = [join(root,'dist','src','server.js'), join(root,'src','server.ts')];
  const incompatible=(reason:string):never=>{throw Object.assign(new Error('credential_launcher_unverified'),{reason});};
  if(entry.command!==process.execPath)incompatible('credential_node_mismatch');
  if(!Array.isArray(entry.args)||entry.args.length!==1||!allowed.includes(entry.args[0]))incompatible('credential_server_mismatch');
  try {
    const extension = entry.args[0].endsWith('.ts') ? 'ts' : 'js';
    const server = read(entry.args[0]).text;
    const runtime = read(join(dirname(entry.args[0]),'runtime.'+extension)).text;
    if (!server?.includes('./runtime.'+extension) || !runtime?.includes('APTLY_SECRET_BACKEND') || !runtime.includes('APTLY_SECRET_CLIENT')) fail('credential_launcher_unverified');
  } catch { incompatible('credential_runtime_unsupported'); }
}
type SetupPlan = { changes: Snapshot[]; observations: Snapshot[]; dirs: string[]; result: SetupClientResult };
function prepare(options: SetupOptions, client: Client, removing: boolean, edit?: EnvironmentEdit): SetupPlan {
  const env = options.env ?? process.env, paths = resolved(options, client), { dir, mcpPath, hooksPath, privateDir } = paths;
  const changes: Snapshot[] = [], observations: Snapshot[] = [], dirs: string[] = [];
  noSymlinks(dir); noSymlinks(privateDir);
  for (const path of [privateDir, join(privateDir, 'state')]) {
    try { checkedDirectory(path); privatePermissions(path, 'private_directory_permissions'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  }
  const hasDir = (() => { try { checkedDirectory(dir); return true; } catch (e: any) { if (e.code === 'ENOENT') return false; throw e; } })();
  const result: SetupClientResult = { client, status: 'unchanged', codes: [] };
  if (!hasDir && (options.automatic || removing)) return { changes, observations, dirs, result: { client, status: 'skipped', codes: ['host_not_configured'] } };
  const policyPath = join(privateDir, 'auto-policy.json'), manifestPath = join(privateDir, 'setup-ownership.json'), stateDir = join(privateDir, 'state');
  const snap = (path: string) => { const source = read(path); return { path, before: source.text, after: source.text, mode: source.mode }; };
  const mcp = snap(mcpPath), hooks = snap(hooksPath), policy = snap(policyPath), manifest = snap(manifestPath);
  for (const privateFile of [policy, manifest]) if (privateFile.before !== null) privatePermissions(privateFile.path, 'private_file_permissions');
  observations.push(mcp, hooks, policy, manifest);
  const oldOwner = manifest.before === null ? undefined : ownership(json(manifest.before), client);
  if (removing && !oldOwner) { if(read(join(privateDir,STATISTICS_OWNERSHIP_FILE)).text!==null)fail('statistics_observers_present'); return { changes, observations, dirs, result: { client, status: 'skipped', codes: ['no_owned_setup'] } }; }
  const hookValue = hook(client), hooksObject = json(hooks.before), entries = hooksArray(hooksObject);
  const config = client === 'codex' ? toml(mcp.before ?? '') : json(mcp.before), servers = map(config, client === 'codex' ? 'mcp_servers' : 'mcpServers');
  if (removing) {
    const owned = oldOwner!;
    const index = entries.findIndex(entry => isDeepStrictEqual(entry, owned.hook));
    if (index < 0) fail('managed_hook_changed');
    for (let i = entries.length - 1; i >= 0; i--) if (isDeepStrictEqual(entries[i], owned.hook)) entries.splice(i, 1);
    hooks.after = stringify(hooksObject);
    if (owned.mcp_created) {
      if (!isDeepStrictEqual(servers.aptly, owned.mcp)) fail('managed_mcp_changed');
      if (client === 'codex') {
        if (!owned.toml_block || !(mcp.before ?? '').includes(owned.toml_block)) fail('managed_mcp_changed');
        mcp.after = (mcp.before ?? '').replace(owned.toml_block!, '');
        const expected = structuredClone(config); delete expected.mcp_servers.aptly;
        // An empty mcp_servers parent is semantically harmless after removing our section.
        const actual = toml(mcp.after); if (!Object.keys(expected.mcp_servers).length && !actual.mcp_servers) delete expected.mcp_servers;
        if (!isDeepStrictEqual(actual, expected)) fail('managed_mcp_changed');
      } else { delete servers.aptly; mcp.after = stringify(config); }
    } else {
      if (!object(servers.aptly)) fail('managed_mcp_changed');
      for (const [key, value] of Object.entries(owned.env_added)) { if (servers.aptly.env?.[key] !== value) fail('managed_entry_changed'); delete servers.aptly.env[key]; }
      mcp.after = client === 'codex' ? removeTomlEnv(mcp.before ?? '', owned.env_added) : stringify(config);
      if(owned.policy_source_previous !== undefined) {
        if(servers.aptly.env?.APTLY_HOOK_POLICY_PATH!==CODEX_HOME_POLICY_SOURCE)fail('managed_entry_changed');
        mcp.after=updateTomlEnv(mcp.after!,{APTLY_HOOK_POLICY_PATH:owned.policy_source_previous});
      }
      if(client==='codex' && owned.env_vars_added?.length) {
        const names=toml(mcp.after!).mcp_servers?.aptly?.env_vars;
        if(!Array.isArray(names) || owned.env_vars_added.some(name=>names.filter((x:unknown)=>x===name).length!==1))fail('managed_entry_changed');
        const remaining=names.filter((name:string)=>!owned.env_vars_added!.includes(name));
        mcp.after=updateTomlForwarding(mcp.after!,owned.env_vars_was_absent && remaining.length===0 ? undefined : remaining);
      }
    }
    const p = json(policy.before);
    if (!isDeepStrictEqual(p, owned.policy)) fail('managed_policy_changed');
    if (owned.policy_created) policy.after = null; manifest.after = null; result.status = 'removed';
    appendStatisticsRemoval(options,client,hooksObject,hooks,changes,observations);
  } else {
    const root = resolve(options.packageRoot ?? join(dirname(fileURLToPath(import.meta.url)), '..', ...(import.meta.url.includes('/dist/src/') ? ['..'] : [])));
    const additions = { APTLY_HOOK_POLICY_PATH: policyPath, ROUTER_LEDGER_PATH: join(stateDir, 'ledger.json') };
    let created = false, tomlBlock: string | undefined;
    if (edit && 'migrate' in edit) {
      if (!oldOwner || !object(servers.aptly) || (oldOwner.mcp_created ? !isDeepStrictEqual(servers.aptly, oldOwner.mcp) : !edit.includeExisting)) fail('launcher_migration_not_owned');
      const entry = servers.aptly;
      if (typeof entry.command !== 'string' || !isAbsolute(entry.command) || !['node','node.exe'].includes(basename(entry.command).toLowerCase()) || !Array.isArray(entry.args) || entry.args.length !== 1 || typeof entry.args[0] !== 'string' || !isAbsolute(entry.args[0]) || !/(?:^|[\\/])(?:dist[\\/]src[\\/]server\.js|src[\\/]server\.ts)$/.test(entry.args[0])) fail('launcher_migration_not_standard');
      if (!entries.some(entry => isDeepStrictEqual(entry,oldOwner!.hook)) || !isDeepStrictEqual(json(policy.before),oldOwner!.policy)) fail('managed_entry_changed');
      for (const [key,value] of Object.entries(oldOwner!.env_added)) if (entry.env?.[key] !== value) fail('managed_entry_changed');
    }
    if (servers.aptly === undefined) {
      created = true;
      servers.aptly = { ...(client === 'claude' ? { type: 'stdio' } : {}), command: process.execPath, args: [join(root, 'dist', 'src', 'server.js')], ...(client === 'codex' ? { env_vars: ['OPENAI_API_KEY'] } : {}), env: { ROUTER_PROVIDER: edit && 'defaults' in edit ? 'decisions' : env.ROUTER_PROVIDER === 'fixture' ? 'fixture' : 'decisions', ...additions } };
    } else {
      if (!object(servers.aptly)) fail('mcp_entry_conflict');
      const configuredPolicy = object(servers.aptly.env) ? servers.aptly.env.APTLY_HOOK_POLICY_PATH : undefined;
      if(oldOwner?.policy_source_previous !== undefined && configuredPolicy!==CODEX_HOME_POLICY_SOURCE)fail('managed_entry_changed');
      const mismatch = configuredPolicy !== undefined && !policyReferenceMatches(servers.aptly,client,policyPath,options);
      const detail = mismatch && typeof configuredPolicy === 'string' && configuredPolicy.length > 0 ? {
        policy_location: configuredPolicy === join(resolve(options.home ?? homedir()), client === 'codex' ? '.codex' : '.claude', 'aptly', 'auto-policy.json') ? 'default_home' : 'elsewhere',
        selected_home_source: (client === 'codex' ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR) ? 'override' : 'default',
      } : undefined;
      if (edit && oldOwner?.mcp_created && !isDeepStrictEqual(servers.aptly,oldOwner.mcp)) throw Object.assign(new Error('managed_mcp_changed'), detail ? {policyConflict:detail} : {});
      if (mismatch) throw Object.assign(new Error('mcp_environment_conflict'), {policyConflict:detail});
      const currentEnv = map(servers.aptly, 'env');
      const missing = Object.fromEntries(Object.entries(additions).filter(([key]) => currentEnv[key] === undefined));
      Object.assign(currentEnv, missing);
      mcp.after = client === 'codex' ? addTomlEnv(mcp.before ?? '', missing) : stringify(config);
    }
    if (edit && 'migrate' in edit) {
      servers.aptly.command = process.execPath;
      servers.aptly.args = [join(root,'dist','src','server.js')];
    }
    if ((edit && ('credential' in edit || 'migrate' in edit)) || servers.aptly.env?.APTLY_HOOK_POLICY_PATH===CODEX_HOME_POLICY_SOURCE) requireCredentialRuntime(servers.aptly,root);
    const currentEnv = map(servers.aptly, 'env');
    const originalEnvKeys=new Set(Object.keys(currentEnv)),inheritedBudget=budgetInheritance(servers.aptly,env,client);
    const updates = edit ? editEnvironment(currentEnv,edit,client,inheritedBudget) : {};
    Object.assign(currentEnv,updates);
    if (created) {
      if (client === 'codex') { tomlBlock = newTomlBlock(servers.aptly); mcp.after = (mcp.before ?? '') + ((mcp.before ?? '').endsWith('\n') || !mcp.before ? '\n' : '\n\n') + tomlBlock; }
      else mcp.after = stringify(config);
    } else if (edit) {
      mcp.after = client === 'codex' ? updateTomlEnv(mcp.after!,updates) : stringify(config);
      if (client === 'codex' && 'migrate' in edit && !oldOwner?.mcp_created) mcp.after = updateTomlLauncher(mcp.after!,servers.aptly);
    }
    const existingRoute = entries.filter(routeHook);
    if (existingRoute.some(entry => !isDeepStrictEqual(entry, hookValue))) fail('existing_routing_hook_conflict');
    if (existingRoute.length === 0) entries.push(hookValue);
    hooks.after = edit && 'migrate' in edit ? hooks.before : stringify(hooksObject);
    const currentPolicy = policy.before === null ? undefined : loadAutomaticHookPolicy(policyPath).policy;
    if (policy.before !== null && !currentPolicy) fail('policy_conflict');
    const requestedScope = options.transmission ?? (edit && 'transmission' in edit ? edit.transmission : undefined);
    if (requestedScope !== undefined && !['none','description','excerpt'].includes(requestedScope)) fail('transmission_invalid_scope');
    const preservedMode = edit && currentPolicy ? currentPolicy.mode : undefined;
    const desiredMode = options.mode ?? preservedMode ?? currentPolicy?.mode ?? 'defaults';
    // Existing v1 settings retain their original scope and byte representation.
    // Only an explicit operator scope selection migrates them to v2.
    let policyValue: AutoPolicy = currentPolicy ? { ...currentPolicy, mode: desiredMode } : {
      schema_version: 2, kind: 'aptly-auto-hook', mode: desiredMode,
      issuer: 'operator_installation', enabled: true, state_directory: stateDir, transmission: 'unselected',
    };
    if (requestedScope !== undefined) {
      if (options.selectUnselectedOnly && (!currentPolicy || effectiveTransmission(currentPolicy)!=='unselected')) fail('transmission_selection_changed');
      if (currentPolicy && (!oldOwner || !isDeepStrictEqual(currentPolicy,oldOwner.policy))) fail('managed_policy_changed');
      policyValue = { ...policyValue, schema_version: 2, transmission: requestedScope };
    }
    if (policy.before !== null) {
      if (requestedScope === undefined && !isDeepStrictEqual(currentPolicy,policyValue)) fail('policy_conflict');
      // An unrelated setup/env operation must never adopt externally modified policy.
      if (oldOwner && !isDeepStrictEqual(currentPolicy,oldOwner.policy)) fail('policy_conflict');
      if (requestedScope !== undefined) policy.after = stringify(policyValue);
    } else policy.after = stringify(policyValue);
    const envAdded = oldOwner?.env_added ?? (created ? {} : Object.fromEntries(Object.entries(additions).filter(([key]) => {
      const original = client === 'codex' ? toml(mcp.before ?? '') : json(mcp.before); return original[client === 'codex' ? 'mcp_servers' : 'mcpServers']?.aptly?.env?.[key] === undefined;
    })));
    if (existingRoute.length && !oldOwner) fail('existing_hook_not_owned');
    const owner: Ownership = oldOwner ?? { schema_version: 1, kind: 'aptly-setup-ownership', client, hook: hookValue, policy: policyValue, policy_created: policy.before === null, mcp_created: created, ...(created ? { mcp: servers.aptly } : {}), env_added: envAdded, ...(tomlBlock ? { toml_block: tomlBlock } : {}) };
    if (edit && oldOwner) {
      if (oldOwner.mcp_created) {
        owner.mcp = structuredClone(servers.aptly);
        if (client === 'codex') {
          const oldBlock = oldOwner.toml_block;
          if (!oldBlock || !(mcp.before ?? '').includes(oldBlock)) fail('managed_mcp_changed');
          const nextBlock = newTomlBlock(servers.aptly);
          const rendered = (mcp.before ?? '').replace(oldBlock!,nextBlock);
          if (!isDeepStrictEqual(toml(rendered),config)) fail('managed_mcp_changed');
          mcp.after = rendered; owner.toml_block = nextBlock;
        }
      } else {
        const prior = client === 'codex' ? toml(mcp.before ?? '') : json(mcp.before);
        const priorEnv = prior[client === 'codex' ? 'mcp_servers' : 'mcpServers']?.aptly?.env ?? {};
        for (const [key,value] of Object.entries(updates)) if (Object.hasOwn(owner.env_added,key) || priorEnv[key] === undefined) owner.env_added[key] = value;
      }
    } else if (edit && !created) {
      const prior = client === 'codex' ? toml(mcp.before ?? '') : json(mcp.before);
      const priorEnv = prior[client === 'codex' ? 'mcp_servers' : 'mcpServers']?.aptly?.env ?? {};
      for (const [key,value] of Object.entries(updates)) if (priorEnv[key] === undefined) owner.env_added[key] = value;
    }
    if (requestedScope !== undefined) owner.policy = structuredClone(policyValue);
    if (edit && ('defaults' in edit || ('key' in edit && budgetEnvironmentKeys.includes(edit.key)))) {
      const budget=resolveBudgetSettings({...inheritedBudget.values,...currentEnv});
      result.budget={limits:{...budget.limits},added:budgetEnvironmentKeys.filter(key=>Object.hasOwn(updates,key)&&!originalEnvKeys.has(key)),
        updated:budgetEnvironmentKeys.filter(key=>Object.hasOwn(updates,key)&&originalEnvKeys.has(key)),
        preserved:budgetEnvironmentKeys.filter(key=>!Object.hasOwn(updates,key)&&currentEnv[key]!==undefined),
        inherited:budgetEnvironmentKeys.filter(key=>currentEnv[key]===undefined&&inheritedBudget.keys.has(key)),restart_required:budgetEnvironmentKeys.some(key=>Object.hasOwn(updates,key))};
    }
    result.transmission = effectiveTransmission(policyValue);
    result.transmission_source = policyValue.schema_version === 1 ? 'legacy' : policyValue.transmission === 'unselected' ? 'unselected' : 'explicit';
    manifest.after = stringify(owner);
    const review = transmissionReviewSnapshot(options, client);
    observations.push(review);
    if (requestedScope !== undefined) {
      review.after = transmissionReviewMarker(options, client, policyValue);
      if (review.after !== review.before) changes.push(review);
    }
    result.transmission_review = reviewMatches(review.after, options, client, policyValue) ? 'complete' : 'required';
    if (client === 'codex') result.requires_hook_review = true;
    result.codes = [...(client === 'codex' ? ['requires_hook_review'] : []), ...(result.transmission === 'unselected' ? ['transmission_selection_required'] : result.transmission_source === 'legacy' ? ['legacy_transmission_excerpt'] : []), ...(requestedScope !== undefined || result.budget?.restart_required ? ['mcp_restart_required'] : [])];
    dirs.push(dir, privateDir, stateDir);
  }
  // Validate complete desired data before any host file is changed.
  if (client === 'codex' && mcp.after !== null) toml(mcp.after);
  for (const snapshot of [mcp, hooks, policy, manifest]) if (snapshot.before !== snapshot.after) changes.push(snapshot);
  if (!removing && changes.length) result.status = 'configured';
  const markerIndex = changes.findIndex(item => item.reviewPrivate);
  if (markerIndex >= 0) changes.push(...changes.splice(markerIndex, 1));
  return { changes, observations, dirs, result };
}
/** Secure sibling staging is short-lived and never a backup; original settings stay in memory. */
function replace(snapshot: Snapshot, forward: boolean) {
  const expected = forward ? snapshot.before : snapshot.after, next = forward ? snapshot.after : snapshot.before;
  const check = () => {
    if (snapshot.reviewPrivate) validateReviewPrivate(snapshot.path);
    const current = read(snapshot.path);
    if (current.text !== expected || (process.platform !== 'win32' && expected !== null && current.mode !== snapshot.mode)) fail('concurrent_configuration_change');
  };
  check();
  if (next === null) { if (expected !== null) unlinkSync(snapshot.path); return; }
  const stage = join(dirname(snapshot.path), `.aptly-stage-${randomUUID()}`);
  let fd: number | undefined, staged = true;
  try {
    fd = openSync(stage, 'wx', 0o600);
    if (process.platform === 'win32' && expected !== null) {
      try { copyWindowsFilePermissions(snapshot.path, stage); } catch { fail('private_file_permissions'); }
    }
    writeFileSync(fd, next); closeSync(fd); fd = undefined;
    if (process.platform !== 'win32') chmodSync(stage, snapshot.mode);
    check();
    renameSync(stage, snapshot.path);
    staged = false;
  } finally { if (fd !== undefined) closeSync(fd); if (staged) { try { unlinkSync(stage); } catch (e: any) { if (e.code !== 'ENOENT') throw e; } } }
}
function policyRecovery(client: Client): string[] {
  return [`aptly setup --check --client ${client}`, 'Review the selected host configuration directory and its existing policy reference locally; intentional sharing cannot be inferred. Preserve the registration and select the intended host directory before retrying. A policy conflict does not authenticate the launcher or other changed settings. Review all changed registration fields locally before reuse; keep custom or modified launchers unchanged and do not execute an unverified launcher. Do not copy keys, ledgers or trust settings.'];
}
function errorResult(client: Client, error: unknown): SetupClientResult {
  const detail = (error as {policyConflict?: {policy_location:'default_home'|'elsewhere'; selected_home_source:'default'|'override'}})?.policyConflict;
  return {client,status:'error',codes:[safeCode(error),...(detail?['hook_policy_path_conflict']:[])],...budgetErrorDetails(error),...(detail?{...detail,recovery:policyRecovery(client)}:{})};
}
function execute(options: SetupOptions, removing: boolean, edit?: EnvironmentEdit, captured?: SetupPlan[]): SetupResult {
  const clients = [...new Set(options.clients ?? ['codex', 'claude'])] as Client[];
  if (clients.some(client => client !== 'codex' && client !== 'claude')) return { status: 'partial', clients: [] };
  const env = options.env ?? process.env;
  if (options.transmission !== undefined && !['none','description','excerpt'].includes(options.transmission)) return {status:'partial',clients:clients.map(client=>({client,status:'error',codes:['transmission_invalid_scope']}))};
  if (!removing && options.automatic && (env.APTLY_SKIP_SETUP === '1' || !!env.CI)) return { status: 'skipped', clients: clients.map(client => ({ client, status: 'skipped', codes: [env.APTLY_SKIP_SETUP === '1' ? 'setup_disabled' : 'ci_environment'] })) };
  const prepared = captured ?? clients.map(client => {
    try { return prepare(options, client, removing, edit); } catch (e: any) { return { changes: [] as Snapshot[], observations: [] as Snapshot[], dirs: [] as string[], result: errorResult(client,e) }; }
  });
  const results = prepared.map(plan => plan.result);
  if (edit && results.some(result => result.status === 'error')) return { status: 'partial', clients: results.map(result => result.status === 'error' ? result : { ...result, status: 'skipped', codes: ['other_host_validation_failed'] }) };
  // Each host is independent; prepare every host before committing any host.
  for (const plan of prepared) {
    if (!plan.changes.length) continue;
    const written: Snapshot[] = [], madeDirs: string[] = [];
    try {
      validateObservations(plan);
      for (const path of plan.dirs) {
        noSymlinks(path);
        try { checkedDirectory(path); } catch (e: any) { if (e.code !== 'ENOENT') throw e; mkdirSync(path, { mode: 0o700 }); madeDirs.push(path);
          if (process.platform === 'win32') { try { protectNewWindowsPrivateDirectory(path); } catch { fail('private_directory_permissions'); } } }
        if (basename(path) === 'aptly' || (basename(path) === 'state' && basename(dirname(path)) === 'aptly')) privatePermissions(path, 'private_directory_permissions');
      }
      for (const snapshot of plan.changes) { validateObservations(plan,written); replace(snapshot, true); written.push(snapshot); }
      validateObservations(plan,written);
    } catch (e: any) {
      let rollbackConflict = false, rollbackFailure = false;
      for (const snapshot of written.reverse()) { try { replace(snapshot, false); } catch (error) { if (safeCode(error) === 'concurrent_configuration_change') rollbackConflict = true; else rollbackFailure = true; } }
      for (const path of madeDirs.reverse()) { try { rmdirSync(path); } catch { /* Never remove another writer's files. */ } }
      plan.result.status = 'error'; plan.result.codes = [safeCode(e), ...(rollbackConflict ? ['rollback_concurrent_change'] : []), ...(rollbackFailure ? ['rollback_failed'] : [])];
    }
  }
  return { status: results.some(result => result.status === 'error') ? 'partial' : results.every(result => result.status === 'skipped') ? 'skipped' : 'complete', clients: results };
}
const codes = new Set(['policy_source_home_invalid','policy_source_requires_setup','policy_source_invalid_options','transmission_review_requires_setup','transmission_review_invalid_options','statistics_requires_setup','statistics_policy_conflict','statistics_config_invalid','statistics_ownership_invalid','statistics_observers_present','statistics_key_missing','statistics_shared_state','statistics_platform_unsupported','statistics_invalid_options','statistics_observer_missing','unsafe_ledger','invalid_ledger','budget_ledger_unconfigured','invalid_budget_configuration','ledger_locked','ledger_error','transmission_selection_changed','transmission_invalid_scope','launcher_migration_not_owned','launcher_migration_not_standard','credential_launcher_unverified','environment_invalid_value','environment_sensitive_value','environment_key_unsupported','environment_secret_key_unsupported','unsafe_directory','unsafe_symlink','unsafe_configuration_file','invalid_json','invalid_json_object','configuration_shape_conflict','hook_shape_conflict','invalid_toml','unsupported_toml_layout','relative_configuration_directory','invalid_ownership','managed_hook_changed','managed_mcp_changed','managed_entry_changed','managed_policy_changed','mcp_entry_conflict','mcp_environment_conflict','existing_routing_hook_conflict','policy_conflict','existing_hook_not_owned','concurrent_configuration_change','private_directory_permissions','private_file_permissions']);
function safeCode(error: unknown) { return error instanceof Error && codes.has(error.message) ? error.message : 'configuration_io_error'; }
export function setupHosts(options: SetupOptions = {}): SetupResult { return execute(options, false); }
/** Snapshot the normal setup plan without applying it; it does not verify a running host. */
export function checkSetup(options: SetupOptions = {}): SetupResult {
  const clients = [...new Set(options.clients ?? ['codex','claude'])] as Client[];
  if (!clients.length || clients.some(client=>client!=='codex'&&client!=='claude') || options.automatic !== undefined || options.mode !== undefined || options.transmission !== undefined || options.selectUnselectedOnly !== undefined) return {status:'partial',clients:[]};
  const results = clients.map(client => {
    try {
      const plan = prepare(options,client,false);
      return {...plan.result,status:'unchanged' as const,codes:[plan.changes.length?'setup_check_configure_ready':'setup_check_ok',...plan.result.codes]};
    } catch (error) { return errorResult(client,error); }
  });
  return {status:results.some(result=>result.status==='error')?'partial':'complete',clients:results};
}
export function removeSetup(options: SetupOptions = {}): SetupResult { return execute(options, true); }

export function setDefaults(options: SetupOptions = {}): SetupResult { return execute(options,false,{ defaults:true }); }
export function setEnvironment(key: string, value: string, options: SetupOptions = {}): SetupResult {
  try { validateEnvironmentValue(key,value); } catch (error) { return { status:'partial',clients:(options.clients ?? ['codex','claude']).map(client=>({client,status:'error',codes:[safeCode(error)],...budgetErrorDetails(error)})) }; }
  return execute(options,false,{key,value});
}

/** Store only the nonsecret source reference; credential values never enter setup. */
export function setCredentialReference(options: SetupOptions = {}): SetupResult { return execute(options,false,{credential:true}); }

/** Include unchanged files: a no-op reference update must still detect prompt-time edits. */
function validateObservations(plan: SetupPlan, written: Snapshot[] = []) {
  for (const snapshot of plan.observations) {
    if (snapshot.reviewPrivate) validateReviewPrivate(snapshot.path);
    const current = read(snapshot.path);
    const expected=written.includes(snapshot)?snapshot.after:snapshot.before;
    if (!written.includes(snapshot) && snapshot.identity && reviewIdentity(snapshot.path) !== snapshot.identity) fail('concurrent_configuration_change');
    if (current.text !== expected || (process.platform!=='win32' && expected!==null && current.mode !== snapshot.mode)) fail('concurrent_configuration_change');
  }
}
function recovery(client: Client): string[] {
  return [`aptly set env OPENAI_API_KEY --client ${client} --check`,
    `aptly setup --client ${client} --migrate-launcher --dry-run`,
    `aptly setup --client ${client} --migrate-launcher`,
    `aptly set env OPENAI_API_KEY --client ${client}`];
}
/** Snapshot-only plan. No file writes, credential access, paths or values in diagnostics. */
export function prepareCredentialReference(options: SetupOptions, client: Client) {
  let plan: SetupPlan | undefined;
  let result: SetupClientResult;
  try {
    plan = prepare({...options,clients:[client]},client,false,{credential:true});
    result = {client,status:'unchanged',codes:['credential_preflight_ok']};
  } catch(error) {
    if ((error as {policyConflict?:unknown})?.policyConflict) { result=errorResult(client,error); } else {
    const reason=(error as {reason?:string})?.reason;
    const reasons=['credential_node_mismatch','credential_server_mismatch','credential_runtime_unsupported'];
    const migration=migrateLauncher({...options,clients:[client]},true);
    const canMigrate=migration.status==='complete';
    result = {client,status:'error',codes:[safeCode(error),...(reason&&reasons.includes(reason)?[reason]:[]),...(canMigrate?['launcher_migration_available']:[])],
      recovery:canMigrate?recovery(client):[`aptly set env OPENAI_API_KEY --client ${client} --check`, 'Keep custom or modified launchers unchanged. Review the host registration locally; use its secure credential environment or a separately reviewed standard registration.']};
    }
  }
  const check = () => {
    if (!plan) return result;
    try {
      validateObservations(plan);
      // Recheck runtime support, symlinks, private permissions and policy before storage.
      prepare({...options,clients:[client]},client,false,{credential:true});
      return result;
    } catch(error) {
      // Preserve the concurrent-change guard, but surface a policy mismatch if one is now visible.
      try { prepare({...options,clients:[client]},client,false,{credential:true}); } catch (current) { if ((current as {policyConflict?:unknown})?.policyConflict) { const detail=errorResult(client,current); return {...detail,codes:[safeCode(error),'hook_policy_path_conflict']}; } }
      const result=errorResult(client,error); return result.recovery ? result : {...result,recovery:recovery(client)};
    }
  };
  return {result,check,commit:():SetupClientResult => {
    const checked=check();
    if (checked.status==='error' || !plan) return checked;
    return execute({...options,clients:[client]},false,{credential:true},[plan]).clients[0];
  }};
}
/** Preserved standard registrations require a separate explicit opt-in; ownership stays unchanged. */
export function migrateLauncher(options: SetupOptions, dryRun = false, includeExisting = false): SetupResult {
  const client=options.clients?.[0];
  if (options.clients?.length!==1 || !client || !['codex','claude'].includes(client) || options.automatic || options.mode) return {status:'partial',clients:[]};
  try {
    const edit = {migrate:true as const,includeExisting};
    const plan=prepare(options,client,false,edit);
    if(dryRun) return {status:'complete',clients:[{client,status:'unchanged',codes:[plan.changes.length?'launcher_migration_available':'launcher_current'],requires_hook_review:client==='codex'}]};
    const result=execute(options,false,edit,[plan]);
    if(result.status==='complete') result.clients[0].codes.push('launcher_migrated','mcp_restart_required');
    return result;
  } catch(error) { return {status:'partial',clients:[errorResult(client,error)]}; }
}

/** Explicitly select a per-Codex-home policy without moving any state. */
export function setPolicySource(options:SetupOptions, dryRun=false):SetupResult {
  if(options.clients?.length!==1 || options.clients[0]!=='codex' || options.automatic!==undefined || options.mode!==undefined || options.transmission!==undefined || options.selectUnselectedOnly!==undefined)
    return {status:'partial',clients:[{client:'codex',status:'error',codes:['policy_source_invalid_options']}]};
  const client='codex' as const;
  try {
    const paths=resolved(options,client), policyPath=join(paths.privateDir,'auto-policy.json');
    // Validate the selector even when CODEX_HOME is present but empty.
    if(selectedCliPolicyPath(options)!==policyPath)fail('policy_source_home_invalid');
    const snap=(path:string):Snapshot=>{const file=read(path);return {path,before:file.text,after:file.text,mode:file.mode};};
    const mcp=snap(paths.mcpPath),hooks=snap(paths.hooksPath),policy=snap(policyPath),manifest=snap(join(paths.privateDir,'setup-ownership.json'));
    for(const dir of [paths.privateDir,join(paths.privateDir,'state')]) { try {checkedDirectory(dir);privatePermissions(dir,'private_directory_permissions');} catch(e:any) {if(e.code!=='ENOENT')throw e;} }
    if(policy.before===null || manifest.before===null || mcp.before===null || hooks.before===null)fail('policy_source_requires_setup');
    privatePermissions(policy.path,'private_file_permissions');privatePermissions(manifest.path,'private_file_permissions');
    const owner=ownership(json(manifest.before),client), config=toml(mcp.before!),entry=config.mcp_servers?.aptly;
    if(!object(entry) || !object(entry.env))fail('mcp_entry_conflict');
    if(!hooksArray(json(hooks.before)).some(item=>isDeepStrictEqual(item,owner.hook)))fail('managed_hook_changed');
    if(!loadAutomaticHookPolicy(policyPath).policy || !isDeepStrictEqual(json(policy.before),owner.policy))fail('managed_policy_changed');
    const root=resolve(options.packageRoot ?? join(dirname(fileURLToPath(import.meta.url)),'..',...(import.meta.url.includes('/dist/src/')?['..']:[])));
    requireCredentialRuntime(entry,root);
    if(entry.env.CODEX_HOME!==undefined)fail('mcp_environment_conflict');
    if(entry.env_vars!==undefined && (!Array.isArray(entry.env_vars)||entry.env_vars.some((v:unknown)=>typeof v!=='string')))fail('configuration_shape_conflict');
    const source=entry.env.APTLY_HOOK_POLICY_PATH, ownedSource=owner.mcp_created ? owner.mcp?.env?.APTLY_HOOK_POLICY_PATH : owner.env_added.APTLY_HOOK_POLICY_PATH;
    const defaultPath=join(resolve(options.home??homedir()),'.codex','aptly','auto-policy.json');
    if(![policyPath,defaultPath,CODEX_HOME_POLICY_SOURCE].includes(source) || (ownedSource !== undefined && ![policyPath,defaultPath,CODEX_HOME_POLICY_SOURCE].includes(ownedSource)) || (owner.mcp_created && ownedSource===undefined))fail('managed_entry_changed');
    const vars=entry.env_vars??[];
    if(owner.mcp_created) {
      if(!object(owner.mcp) || !owner.toml_block)fail('invalid_ownership');
      const expected=structuredClone(owner.mcp!);expected.env.APTLY_HOOK_POLICY_PATH=source;
      expected.env_vars=vars;
      const priorVars=owner.mcp!.env_vars??[];
      if(!isDeepStrictEqual(vars,priorVars) && !isDeepStrictEqual(vars,[...priorVars,'CODEX_HOME']))fail('managed_mcp_changed');
      if(!isDeepStrictEqual(expected,entry))fail('managed_mcp_changed');
      const previousBlock=newTomlBlock(entry);
      if(!mcp.before!.includes(owner.toml_block!) && !mcp.before!.includes(previousBlock))fail('managed_mcp_changed');
      entry.env.APTLY_HOOK_POLICY_PATH=CODEX_HOME_POLICY_SOURCE;
      if(!vars.includes('CODEX_HOME'))entry.env_vars=[...vars,'CODEX_HOME'];
      const nextBlock=newTomlBlock(entry), oldBlock=mcp.before!.includes(owner.toml_block!)?owner.toml_block!:previousBlock;
      mcp.after=mcp.before!.replace(oldBlock,nextBlock);
      if(!isDeepStrictEqual(toml(mcp.after),config))fail('managed_mcp_changed');
      owner.mcp=structuredClone(entry);owner.toml_block=nextBlock;
    } else {
      for(const [key,value] of Object.entries(owner.env_added)) if(key!=='APTLY_HOOK_POLICY_PATH' && entry.env[key]!==value)fail('managed_entry_changed');
      if(owner.policy_source_previous !== undefined && source!==CODEX_HOME_POLICY_SOURCE)fail('managed_entry_changed');
      const preexistingSelector=ownedSource===undefined && owner.policy_source_previous===undefined && source===CODEX_HOME_POLICY_SOURCE;
      if(!vars.includes('CODEX_HOME')) {
        if(owner.env_vars_added?.length)fail('managed_entry_changed');
        mcp.after=updateTomlForwarding(mcp.after!,[...vars,'CODEX_HOME']);
        owner.env_vars_added=[...(owner.env_vars_added??[]),'CODEX_HOME'];if(entry.env_vars===undefined)owner.env_vars_was_absent=true;
      }
      mcp.after=updateTomlEnv(mcp.after!,{APTLY_HOOK_POLICY_PATH:CODEX_HOME_POLICY_SOURCE});
      if(ownedSource!==undefined)owner.env_added.APTLY_HOOK_POLICY_PATH=CODEX_HOME_POLICY_SOURCE;
      else if(!preexistingSelector && owner.policy_source_previous===undefined)owner.policy_source_previous=source;
    }
    manifest.after=stringify(owner);
    const changes=[mcp,manifest].filter(item=>item.before!==item.after);
    const plan:SetupPlan={changes,observations:[mcp,hooks,policy,manifest],dirs:[],result:{client,status:changes.length?'configured':'unchanged',codes:changes.length?['policy_source_selected','mcp_restart_required']:['policy_source_current']}};
    if(dryRun)return {status:'complete',clients:[{...plan.result,status:'unchanged',codes:[changes.length?'policy_source_selection_available':'policy_source_current']}]};
    return execute(options,false,{migrate:true},[plan]);
  } catch(error) {return {status:'partial',clients:[errorResult(client,error)]};}
}

/** Explicit operator change; updates policy and its receipt through normal guarded staging. */
export function setTransmission(scope: TransmissionScope, options: SetupOptions = {}): SetupResult {
  if (!['none','description','excerpt'].includes(scope)) return {status:'partial',clients:(options.clients??['codex','claude']).map(client=>({client,status:'error',codes:['transmission_invalid_scope']}))};
  return execute(options,false,{transmission:scope});
}

export type TransmissionReviewCandidate = {
  client: Client;
  transmission: TransmissionScope | 'unselected';
  transmission_source: 'legacy' | 'explicit' | 'unselected';
  selected_home_source: 'default' | 'override';
  application_mode: 'defaults' | 'advisory';
  enabled: boolean;
};
const TRANSMISSION_REVIEW_FILE = 'transmission-review.json';
function reviewIdentity(path: string): string {
  try { const stat=lstatSync(path); return `${stat.dev}:${stat.ino}:${stat.uid}:${stat.nlink}`; }
  catch(error) { if ((error as NodeJS.ErrnoException).code==='ENOENT') return 'missing'; throw error; }
}
function validateReviewPrivate(path: string) {
  noSymlinks(path);
  for (const [target,directory] of [[dirname(path),true],[path,false]] as const) {
    try {
      const stat=lstatSync(target);
      if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink!==1)) fail('unsafe_configuration_file');
      if (process.platform!=='win32' && process.getuid && stat.uid!==process.getuid()) fail(directory?'private_directory_permissions':'private_file_permissions');
      privatePermissions(target,directory?'private_directory_permissions':'private_file_permissions');
    } catch(error) { if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
  }
}
function transmissionReviewSnapshot(options: SetupOptions, client: Client): Snapshot {
  const path=join(resolved(options,client).privateDir,TRANSMISSION_REVIEW_FILE);
  validateReviewPrivate(path);
  const source=read(path);
  return {path,before:source.text,after:source.text,mode:source.mode,reviewPrivate:true,identity:reviewIdentity(path)};
}
function transmissionReviewMarker(options: SetupOptions, client: Client, policy: AutoPolicy): string {
  const paths=resolved(options,client),scope=effectiveTransmission(policy);
  // A local UI acknowledgement, not authentication or authorization of host code.
  const binding={selected_home:resolve(paths.dir),policyPath:join(paths.privateDir,'auto-policy.json'),
    state_directory:resolve(policy.state_directory),schema_version:policy.schema_version,effective_scope:scope,
    provenance:policy.schema_version===1?'legacy':scope==='unselected'?'unselected':'explicit'};
  return stringify({schema_version:1,revision:1,client,binding_sha256:createHash('sha256').update(JSON.stringify(binding)).digest('hex')});
}
function reviewMatches(text: string | null, options: SetupOptions, client: Client, policy: AutoPolicy): boolean {
  if (text===null || effectiveTransmission(policy)==='unselected') return false;
  try { return isDeepStrictEqual(JSON.parse(text),JSON.parse(transmissionReviewMarker(options,client,policy))); } catch { return false; }
}

/** Read-only, two-phase local acknowledgement. Recheck every captured host before writing. */
export function prepareTransmissionReview(options: SetupOptions & {forceReview?:boolean} = {}): {
  result: SetupResult; candidates: TransmissionReviewCandidate[]; apply(choice: 'keep' | TransmissionScope): SetupResult;
} {
  options={...options,home:resolve(options.home??homedir()),env:{...(options.env??process.env)},...(options.clients?{clients:[...options.clients]}:{})};
  const clients=[...new Set(options.clients??['codex','claude'])] as Client[];
  const plans: SetupPlan[]=[], candidates: TransmissionReviewCandidate[]=[];
  if (!clients.length || clients.some(client=>!['codex','claude'].includes(client)) || options.automatic!==undefined || options.mode!==undefined || options.transmission!==undefined || options.selectUnselectedOnly!==undefined) {
    const result:SetupResult={status:'partial',clients:clients.map(client=>({client,status:'error',codes:['transmission_review_invalid_options']}))};
    return {result,candidates:[],apply:()=>result};
  }
  const results:SetupClientResult[]=clients.map(client=>{
    try {
      const paths=resolved(options,client),policyPath=join(paths.privateDir,'auto-policy.json');
      const mcp=read(paths.mcpPath),config=client==='codex'?toml(mcp.text??''):json(mcp.text);
      const entry=config[client==='codex'?'mcp_servers':'mcpServers']?.aptly;
      const policySource=read(policyPath),ownerSource=read(join(paths.privateDir,'setup-ownership.json'));
      if (entry===undefined && policySource.text===null && ownerSource.text===null) return {client,status:'skipped',codes:['host_not_configured']};
      if (!object(entry) || !policyReferenceMatches(entry,client,policyPath,options) || policySource.text===null || ownerSource.text===null) fail('transmission_review_requires_setup');
      const loaded=loadAutomaticHookPolicy(policyPath);
      if (!loaded.policy) fail('policy_conflict');
      const policy=loaded.policy!,owner=ownership(json(ownerSource.text),client);
      if (!isDeepStrictEqual(policy,owner.policy)) fail('managed_policy_changed');
      const hooksSource=read(paths.hooksPath),hookSettings=json(hooksSource.text);
      if (!Array.isArray(hookSettings.hooks?.PreToolUse) || !hookSettings.hooks.PreToolUse.some((value:unknown)=>isDeepStrictEqual(value,owner.hook)) || !isDeepStrictEqual(owner.hook,hook(client))) fail('transmission_review_requires_setup');
      if (!object(entry.env) || entry.env.ROUTER_LEDGER_PATH===undefined) fail('transmission_review_requires_setup');
      // Use the existing explicit-change validator without executing a setup repair.
      const plan=prepare(options,client,false,{transmission:effectiveTransmission(policy)==='unselected'?'none':effectiveTransmission(policy) as TransmissionScope});
      for (const [path,source] of [[paths.mcpPath,mcp],[policyPath,policySource],[join(paths.privateDir,'setup-ownership.json'),ownerSource],[paths.hooksPath,hooksSource]] as const) {
        const captured=plan.observations.find(snapshot=>snapshot.path===path);
        if (!captured || captured.before!==source.text || captured.mode!==source.mode) fail('concurrent_configuration_change');
      }
      for (const snapshot of plan.observations) {
        snapshot.identity=reviewIdentity(snapshot.path);
        if (snapshot.path===policyPath || snapshot.path===join(paths.privateDir,'setup-ownership.json')) {
          validateReviewPrivate(snapshot.path); snapshot.reviewPrivate=true;
        }
      }
      const review=plan.observations.find(snapshot=>snapshot.path===join(paths.privateDir,TRANSMISSION_REVIEW_FILE))!;
      const complete=reviewMatches(review.before,options,client,policy);
      const state:SetupClientResult={client,status:'unchanged',codes:[complete?'transmission_review_complete':'transmission_review_required'],transmission_review:complete?'complete':'required',transmission:effectiveTransmission(policy),transmission_source:policy.schema_version===1?'legacy':effectiveTransmission(policy)==='unselected'?'unselected':'explicit'};
      if (!complete || options.forceReview) {
        plans.push({...plan,changes:[],dirs:[],result:state});
        candidates.push({client,transmission:effectiveTransmission(policy),transmission_source:state.transmission_source!,selected_home_source:(client==='codex'?(options.env??process.env).CODEX_HOME:(options.env??process.env).CLAUDE_CONFIG_DIR)?'override':'default',application_mode:policy.mode,enabled:policy.enabled});
      }
      return state;
    } catch(error) { return errorResult(client,error); }
  });
  const result:SetupResult={status:results.some(value=>value.status==='error')?'partial':results.every(value=>value.status==='skipped')?'skipped':'complete',clients:results};
  if (result.status==='partial') {
    result.clients=results.map(initial=>plans.some(plan=>plan.result.client===initial.client)?{...initial,status:'skipped',codes:['other_host_validation_failed']}:initial);
    return {result,candidates:[],apply:()=>result};
  }
  return {result,candidates,apply:(choice)=>{
    const merge=(updates:SetupClientResult[],status:SetupResult['status']):SetupResult=>({status,clients:results.map(initial=>updates.find(updated=>updated.client===initial.client)??initial)});
    if (!['keep','none','description','excerpt'].includes(choice)) return merge(plans.map(plan=>({...plan.result,status:'error',codes:['transmission_invalid_scope']})),'partial');
    if (!plans.length) return result;
    const commits:SetupPlan[]=[];
    const failures:SetupClientResult[]=[];
    // All preflight checks precede every write; commits retain per-client rollback.
    for (const plan of plans) {
      const client=plan.result.client;
      try {
        validateObservations(plan);
        const currentPolicy=loadAutomaticHookPolicy(join(resolved(options,client).privateDir,'auto-policy.json')).policy;
        if (!currentPolicy) fail('policy_conflict');
        if ((choice==='keep' && effectiveTransmission(currentPolicy!)!=='unselected') || (currentPolicy!.schema_version===2 && choice===effectiveTransmission(currentPolicy!))) {
          const marker=plan.observations.find(snapshot=>snapshot.path===join(resolved(options,client).privateDir,TRANSMISSION_REVIEW_FILE))!;
          marker.after=transmissionReviewMarker(options,client,currentPolicy!);
          commits.push({...plan,changes:marker.before===marker.after?[]:[marker],result:{...plan.result,status:marker.before===marker.after?'unchanged':'configured',codes:['transmission_review_complete'],transmission_review:'complete'}});
        } else {
          const scope=choice==='keep'?'none':choice;
          const next=prepare(options,client,false,{transmission:scope});
          validateObservations(plan);
          for (const original of plan.observations) {
            const fresh=next.observations.find(snapshot=>snapshot.path===original.path);
            if (!fresh || fresh.before!==original.before || fresh.mode!==original.mode) fail('concurrent_configuration_change');
          }
          // Capture the original prompt-time observations, including unchanged files.
          next.observations=plan.observations.map(original=>next.observations.find(snapshot=>snapshot.path===original.path) ? Object.assign(next.observations.find(snapshot=>snapshot.path===original.path)!,{identity:original.identity,reviewPrivate:original.reviewPrivate}) : original);
          next.dirs=[];
          next.result.codes.push('transmission_review_complete');
          commits.push(next);
        }
      } catch(error) { failures.push({...plan.result,...errorResult(client,error)}); }
    }
    if (failures.length) return merge(plans.map(plan=>failures.find(failed=>failed.client===plan.result.client)??{...plan.result,status:'skipped',codes:['other_host_validation_failed']}),'partial');
    const applied=execute({...options,clients:plans.map(plan=>plan.result.client)},false,undefined,commits);
    return merge(applied.clients,applied.status);
  }};
}

/** Query context only: no credential lookup, native discovery or configuration repair. */
function queryContext(options:SetupOptions,client:Client,snapshot:QuerySnapshot,statistics:boolean,policyMissing:boolean){
 const paths=resolved(options,client),mcp=snapshot.read(paths.mcpPath);
 const config=client==='codex'?toml(mcp?.toString('utf8')??''):json(mcp?.toString('utf8')??null);
 const servers=config[client==='codex'?'mcp_servers':'mcpServers'],entry=servers?.aptly;
 let failed=(servers!==undefined&&!object(servers))||(entry!==undefined&&(!object(entry)||(entry.env!==undefined&&!object(entry.env))));
 let expected=failed||(object(entry?.env)&&Object.hasOwn(entry.env,'APTLY_HOOK_POLICY_PATH'));
 try{
  const receipt=snapshot.read(join(paths.privateDir,'setup-ownership.json'),{privateFile:true});
  if(receipt){expected=true;ownership(json(receipt.toString('utf8')),client);}
 }catch{failed=true;expected=true;}
 if(statistics||policyMissing)try{
  const statOwner=snapshot.read(join(paths.privateDir,STATISTICS_OWNERSHIP_FILE),{privateFile:true});
  if(statOwner){expected=true;statisticsOwner(json(statOwner.toString('utf8')),client);}
 }catch{failed=true;expected=true;}
 if(policyMissing&&!expected)try{
  // A normal remove retains a disabled config and history; this is not broken setup.
  const bytes=snapshot.read(join(paths.privateDir,'state',STATISTICS_CONFIG_FILE),{privateFile:true,maxBytes:8192,singleLink:true});
  if(bytes){const state=parseStatisticsConfig(JSON.parse(bytes.toString('utf8')));if(!state){failed=true;expected=true;}else expected=state.enabled_clients.includes(client);}
  else for(const name of [STATISTICS_KEY_FILE,STATISTICS_DB_FILE])if(snapshot.track(join(paths.privateDir,'state',name),{privateFile:true,singleLink:true,identityOnly:true}))expected=true;
 }catch{failed=true;expected=true;}
 return {entry,expected,failed,paths};
}
/** Redacted policy query; aggregate status is query completion, not host readiness. */
export function showTransmission(options: SetupOptions = {}) {
 const outcomes=(options.clients??['codex','claude']).map(client=>{
  const snapshot=new QuerySnapshot();
  try {
   const {privateDir}=resolved(options,client),loaded=queryAutomaticHookPolicy(join(privateDir,'auto-policy.json'),snapshot);
   let expected=false,contextFailed=false;
   try{const context=queryContext(options,client,snapshot,false,!loaded.policy);expected=context.expected;contextFailed=context.failed;}catch{contextFailed=true;}
   const legacy=()=>{
    if(!loaded.policy)return {client,status:'unavailable',code:loaded.reason};
    // Preserve validation of the acknowledgement but read it only once for this query.
    const markerPath=join(privateDir,TRANSMISSION_REVIEW_FILE);validateReviewPrivate(markerPath);
    const marker=snapshot.read(markerPath,{privateFile:true,singleLink:true});
    return {client,status:'configured',application_mode:loaded.policy.mode,enabled:loaded.policy.enabled,
     transmission_review:reviewMatches(marker?.toString('utf8')??null,options,client,loaded.policy)?'complete':'required',
     transmission:effectiveTransmission(loaded.policy),transmission_source:loaded.policy.schema_version===1?'legacy':effectiveTransmission(loaded.policy)==='unselected'?'unselected':'explicit'};
   };
   const result=legacy();snapshot.verify();
   return {result,failed:contextFailed||loaded.availability==='error'||(loaded.availability==='absent'&&expected)};
  }catch(error){return {result:{client,status:'error',code:safeCode(error)},failed:true};}
 });
 return {status:outcomes.some(o=>o.failed)?'partial':'complete',clients:outcomes.map(o=>o.result)};
}

/** Registration snapshot only. Never loads credentials, starts a server or creates a ledger/gate. */
export function showBudgetStatus(options: SetupOptions = {}) {
  const environment=options.env??process.env;
  const clients=(options.clients??['codex','claude']).map(client=>{
    try {
      const {mcpPath}=resolved(options,client),source=read(mcpPath);
      if(source.text===null)return {client,status:'skipped',codes:['host_not_configured']};
      const config=client==='codex'?toml(source.text):json(source.text);
      const entry=config[client==='codex'?'mcp_servers':'mcpServers']?.aptly;
      if(entry===undefined)return {client,status:'skipped',codes:['host_not_configured']};
      if(!object(entry)||entry.env!==undefined&&!object(entry.env))fail('configuration_shape_conflict');
      if(client==='codex'&&entry.env_vars!==undefined&&(!Array.isArray(entry.env_vars)||entry.env_vars.some((key:unknown)=>typeof key!=='string')))fail('configuration_shape_conflict');
      const permitted=client==='codex'?(entry.env_vars??[]):[];
      const settings:Record<string,unknown>={};
      const budgetKeys=[...new Set([...budgetEnvironmentKeys,...Object.keys(entry.env??{}).filter(key=>key.startsWith('APTLY_MAX_')||key.startsWith('APTLY_ESTIMATED_')),...Object.keys(environment).filter(key=>(key.startsWith('APTLY_MAX_')||key.startsWith('APTLY_ESTIMATED_'))&&(client==='claude'||permitted.includes(key)))])];
      for(const key of [...budgetKeys,'ROUTER_LEDGER_PATH']){
        const value=Object.hasOwn(entry.env??{},key)?entry.env[key]:(client==='claude'||permitted.includes(key)?environment[key]:undefined);
        if(value!==undefined)settings[key]=value;
      }
      const budget=resolveBudgetSettings(settings),ledgerPath=settings.ROUTER_LEDGER_PATH;
      if(typeof ledgerPath!=='string')fail('budget_ledger_unconfigured');
      assertPrivateStatePath(ledgerPath);
      const router=new Router({policy:{...defaultPolicy,...budget.limits},budgetConfigurable:true,ledgerPath,
        provider:async()=>{throw new Error('status_provider_forbidden');}});
      const snapshot=router.budgetStatus();
      return {client,status:'ok',budget:{...snapshot,provenance:budget.provenance,
        display_limits:Object.fromEntries(Object.entries(snapshot.limits).map(([key,value])=>[key,key!=='estimated_call_usd'&&value===0?'Unlimited':value])),
        next_utc_day:new Date(Date.parse(snapshot.utc_day+'T00:00:00Z')+86_400_000).toISOString(),
        cost_guard:'local_estimate_not_billing_cap',snapshot_source:'host_registration_and_allowed_process_environment',
        running_host_verified:false,settings_require_mcp_restart:true}};
    }catch(error){return {client,status:'error',codes:[safeCode(error)],...budgetErrorDetails(error)};}
  });
  return {status:clients.some(client=>client.status==='error')?'partial':'complete',clients};
}


const STATISTICS_OWNERSHIP_FILE='stats-ownership.json';
type StatisticsOwner={schema_version:1;kind:'aptly-statistics-ownership';client:Client;state_directory:string;hooks:Record<string,ObjectValue>;hooks_fingerprint:string};
function statisticsOwner(value:ObjectValue,client:Client):StatisticsOwner {
 const valid=['PostToolUse','PostModelRequest','SubagentStart','SubagentStop'];
 if(value.schema_version!==1||value.kind!=='aptly-statistics-ownership'||value.client!==client||typeof value.state_directory!=='string'||!isAbsolute(value.state_directory)||!object(value.hooks)||Object.keys(value.hooks).some(k=>!valid.includes(k))||Object.values(value.hooks).some(v=>!object(v)||!Array.isArray(v.hooks))||value.hooks_fingerprint!==createHash('sha256').update(JSON.stringify(value.hooks)).digest('hex'))fail('statistics_ownership_invalid');
 return value as StatisticsOwner;
}
function statisticEntries(value:ObjectValue,event:string,create=false):any[]{
 if(value.hooks===undefined&&!create)return [];
 const events=map(value,'hooks');if(events[event]===undefined){if(!create)return [];events[event]=[];}
 if(!Array.isArray(events[event]))fail('hook_shape_conflict');return events[event];
}
function statisticsPolicy(options:SetupOptions,client:Client,requireRegistration=true){
 const paths=resolved(options,client),policyPath=join(paths.privateDir,'auto-policy.json');
 if(requireRegistration){
  const mcp=read(paths.mcpPath),config=client==='codex'?toml(mcp.text??''):json(mcp.text);
  const entry=config[client==='codex'?'mcp_servers':'mcpServers']?.aptly;
  if(!object(entry))fail('statistics_requires_setup');
  if(!policyReferenceMatches(entry,client,policyPath,options))fail('statistics_policy_conflict');
 }
 const loaded=loadAutomaticHookPolicy(policyPath);if(!loaded.policy)fail('statistics_requires_setup');
 return {...paths,policyPath,stateDirectory:loaded.policy!.state_directory};
}
function statisticsHooks(root:string,client:Client,policyPath:string):Record<string,ObjectValue>{
 const observer=join(root,'dist','bin','aptly-observe.js');
 if(read(observer).text===null)fail('statistics_observer_missing');
 for(const path of [process.execPath,observer,policyPath])if(!isAbsolute(path)||/[\x00-\x1f\x7f]/.test(path))fail('statistics_invalid_options');
 const quote=(v:string)=>"'"+v.replaceAll("'","'\\''")+"'";
 const command=[process.execPath,'--no-warnings',observer,'--client',client,'--policy-path',policyPath].map(quote).join(' ');
 const handler={type:'command',command,timeout:5,statusMessage:'Aptly local execution statistics'};
 const events=client==='codex'?['PostToolUse','SubagentStart','PostModelRequest','SubagentStop']:['PostToolUse','SubagentStart','SubagentStop'];
 return Object.fromEntries(events.map(event=>[event,{...(event==='PostToolUse'?{matcher:client==='codex'?'^(spawn_agent|collaborationspawn_agent|collaboration\\.spawn_agent)$':'^(Agent|Task)$'}:{}),hooks:[{...handler}]}]));
}
function statisticsSnapshot(path:string):Snapshot{const value=read(path);if(value.text!==null){privatePermissions(path,'private_file_permissions');if(lstatSync(path).nlink!==1)fail('unsafe_configuration_file');}return{path,before:value.text,after:value.text,mode:value.mode};}
function statisticsConfig(snapshot:Snapshot):StatisticsConfig{
 if(snapshot.before===null)return {schema_version:1 as const,enabled_clients:[] as Client[]};
 const value=parseStatisticsConfig(json(snapshot.before));if(!value)fail('statistics_config_invalid');return value!;
}
function possibleStatisticsObserver(entry:unknown):boolean {
 return object(entry)&&Array.isArray(entry.hooks)&&entry.hooks.some((h:unknown)=>object(h)&&h.type==='command'&&(h.statusMessage==='Aptly local execution statistics'||(typeof h.command==='string'&&h.command.includes('aptly-observe.js'))));
}
function clearCodexMetadata(state:StatisticsConfig,client:Client){if(client==='codex'){delete state.codex_native_metadata;delete state.codex_home;}}
function appendStatisticsRemoval(options:SetupOptions,client:Client,hooksObject:ObjectValue,hooks:Snapshot,changes:Snapshot[],observations:Snapshot[]){
 const paths=resolved(options,client),receipt=statisticsSnapshot(join(paths.privateDir,STATISTICS_OWNERSHIP_FILE));observations.push(receipt);
 const stateDirectory=statisticsPolicy(options,client,false).stateDirectory;
 const owned=receipt.before===null?undefined:statisticsOwner(json(receipt.before),client);
 if(owned&&owned.state_directory!==stateDirectory)fail('statistics_ownership_invalid');
 const config=statisticsSnapshot(join(stateDirectory,STATISTICS_CONFIG_FILE));observations.push(config);
 if(owned){
  for(const[event,entry]of Object.entries(owned.hooks)){
   const list=statisticEntries(hooksObject,event),matches=list.filter(v=>isDeepStrictEqual(v,entry));if(matches.length>1||(!matches.length&&list.some(possibleStatisticsObserver)))fail('managed_hook_changed');
   for(let n=list.length-1;n>=0;n--)if(isDeepStrictEqual(list[n],entry))list.splice(n,1);
  }
  receipt.after=null;hooks.after=stringify(hooksObject);
 }
 if(config.before!==null){const state=statisticsConfig(config);state.enabled_clients=state.enabled_clients.filter(c=>c!==client);clearCodexMetadata(state,client);config.after=serializeStatisticsConfig(state);}
 for(const snap of [config,receipt])if(snap.before!==snap.after)changes.push(snap);
}
/** Explicit collection controls; legacy routing receipt and model/credential settings stay untouched. */
export function setStatisticsCollection(enabled:boolean,options:SetupOptions&{codexNativeMetadata?:boolean}={}):SetupResult{
 const clients=[...new Set(options.clients??['codex','claude'])] as Client[];
 if(typeof enabled!=='boolean'||!clients.length||clients.some(c=>!['codex','claude'].includes(c))||options.automatic||options.mode||options.transmission||options.selectUnselectedOnly||(!enabled&&options.codexNativeMetadata!==undefined)||options.codexNativeMetadata&& !clients.includes('codex'))return{status:'partial',clients:clients.map(client=>({client,status:'error',codes:['statistics_invalid_options']}))};
 if(process.platform==='win32')return{status:'partial',clients:clients.map(client=>({client,status:'error',codes:['statistics_platform_unsupported']}))};
 const states=new Set<string>();
 const plans:SetupPlan[]=clients.map(client=>{
  try{
   if(!enabled){const base=resolved(options,client);if(read(join(base.privateDir,'auto-policy.json')).text===null&&read(join(base.privateDir,STATISTICS_OWNERSHIP_FILE)).text===null&&read(join(base.privateDir,'state',STATISTICS_CONFIG_FILE)).text===null)return{changes:[],observations:[],dirs:[],result:{client,status:'unchanged',codes:['statistics_disabled']}};}
   const paths=statisticsPolicy(options,client,enabled);
   if(enabled){try{assertPrivateStatePath(join(paths.privateDir,STATISTICS_OWNERSHIP_FILE));assertPrivateStatePath(join(paths.stateDirectory,STATISTICS_CONFIG_FILE));}catch{fail('private_directory_permissions');}}
   if(states.has(paths.stateDirectory))fail('statistics_shared_state');states.add(paths.stateDirectory);
   const observations:Snapshot[]=[],changes:Snapshot[]=[];
   const snap=(path:string,privateFile=true)=>{const result=privateFile?statisticsSnapshot(path):(()=>{const v=read(path);return{path,before:v.text,after:v.text,mode:v.mode};})();observations.push(result);return result;};
   const policy=snap(paths.policyPath);
   if(enabled){snap(paths.mcpPath,false);const routingReceipt=snap(join(paths.privateDir,'setup-ownership.json'));if(routingReceipt.before===null)fail('statistics_requires_setup');ownership(json(routingReceipt.before),client);}
   const hooks=snap(paths.hooksPath,false),config=snap(join(paths.stateDirectory,STATISTICS_CONFIG_FILE));
   let receipt:Snapshot|undefined,unreadableReceipt=false;
   try{receipt=snap(join(paths.privateDir,STATISTICS_OWNERSHIP_FILE));}catch(error){if(enabled||safeCode(error)!=='private_file_permissions')throw error;unreadableReceipt=true;}
   if(!enabled&&!unreadableReceipt&&receipt!.before===null&&config.before===null)return{changes,observations,dirs:[],result:{client,status:'unchanged',codes:['statistics_disabled']}};
   const key=enabled?snap(join(paths.stateDirectory,STATISTICS_KEY_FILE)):undefined;
   const value=json(hooks.before),originalHooks=structuredClone(value),state=statisticsConfig(config);let old:StatisticsOwner|undefined,invalidReceipt=unreadableReceipt;
   if(receipt&&receipt.before!==null)try{old=statisticsOwner(json(receipt.before),client);}catch(error){if(enabled)throw error;invalidReceipt=true;}
   if(old&&old.state_directory!==paths.stateDirectory){if(enabled)fail('statistics_ownership_invalid');old=undefined;invalidReceipt=true;}
   let modified=invalidReceipt;
   if(old)for(const[event,entry]of Object.entries(old.hooks)){
    const list=statisticEntries(value,event),matches=list.filter(v=>isDeepStrictEqual(v,entry));
    if(!matches.length){if(enabled)fail('managed_hook_changed');if(list.some(possibleStatisticsObserver))modified=true;continue;}
    if(matches.length>1){if(enabled)fail('managed_hook_changed');modified=true;continue;}
    for(let n=list.length-1;n>=0;n--)if(isDeepStrictEqual(list[n],entry))list.splice(n,1);
   }
   if(enabled){
    if(key!.before===null){try{lstatSync(join(paths.stateDirectory,STATISTICS_DB_FILE));fail('statistics_key_missing');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}key!.after=randomBytes(32).toString('hex')+'\n';}
    else if(!/^[a-f0-9]{64}\n$/.test(key!.before))fail('statistics_key_missing');
    state.enabled_clients=[...new Set([...state.enabled_clients,client])];
    if(client==='codex')clearCodexMetadata(state,client);
    if(client==='codex'&&options.codexNativeMetadata){
     if(state.codex_home!==undefined&&state.codex_home!==paths.dir)fail('statistics_config_invalid');
     state.codex_native_metadata=true;state.codex_home=paths.dir;
    }
    const root=resolve(options.packageRoot??join(dirname(fileURLToPath(import.meta.url)),'..',...(import.meta.url.includes('/dist/src/')?['..']:[])));
    const entries=statisticsHooks(root,client,paths.policyPath);
    for(const[event,entry]of Object.entries(entries)){const list=statisticEntries(value,event,true);if(list.some(possibleStatisticsObserver))fail('statistics_observers_present');list.push(entry);}
    receipt!.after=stringify({schema_version:1,kind:'aptly-statistics-ownership',client,state_directory:paths.stateDirectory,hooks:entries,hooks_fingerprint:createHash('sha256').update(JSON.stringify(entries)).digest('hex')});
   }else{
    state.enabled_clients=state.enabled_clients.filter(c=>c!==client);clearCodexMetadata(state,client);if(receipt)receipt.after=invalidReceipt?receipt.before:null;
   }
   config.after=serializeStatisticsConfig(state);if(!isDeepStrictEqual(value,originalHooks))hooks.after=stringify(value);
   for(const item of [config,...(key?[key]:[]),hooks,...(receipt?[receipt]:[])])if(item.before!==item.after)changes.push(item);
   const codes=[enabled?'statistics_enabled':'statistics_disabled',...(modified?['statistics_observers_retained_modified']:[]),...(enabled&&client==='codex'?['requires_hook_review']:[]),...(enabled?['mcp_restart_required']:[])];
   return{changes,observations,dirs:[],result:{client,status:changes.length?'configured':'unchanged',codes,...(enabled&&client==='codex'?{requires_hook_review:true}:{})}};
  }catch(error){return{changes:[],observations:[],dirs:[],result:errorResult(client,error)};}
 });
 if(enabled&&plans.some(p=>p.result.status==='error'))return{status:'partial',clients:plans.map(p=>p.result.status==='error'?p.result:{...p.result,status:'skipped',codes:['other_host_validation_failed']})};
 return execute(options,false,undefined,plans);
}
/** Snapshot view; no runtime, credentials, provider, budget gate or state creation. */
export function showStatistics(options:SetupOptions={},today=false){
 const clients=options.clients??['codex','claude'];
 if(process.platform==='win32')return{status:'partial',clients:clients.map(client=>({client,status:'statistics_platform_unsupported',collection:'disabled'}))};
 const outcomes=clients.map(client=>{
  const snapshot=new QuerySnapshot();
  try{
   const paths=resolved(options,client),policyPath=join(paths.privateDir,'auto-policy.json');
   const loaded=queryAutomaticHookPolicy(policyPath,snapshot);
   const context=queryContext(options,client,snapshot,true,!loaded.policy);
   if(!object(context.entry)){
    snapshot.verify();return {result:{client,status:'statistics_requires_setup',collection:'disabled'},failed:context.failed||!!loaded.policy||loaded.availability==='error'||context.expected};
   }
   if(!policyReferenceMatches(context.entry,client,policyPath,options)){
    snapshot.verify();return {result:{client,status:'statistics_policy_conflict',collection:'disabled'},failed:context.failed||loaded.availability!=='absent'||context.expected};
   }
   if(!loaded.policy){
    snapshot.verify();return {result:{client,status:'statistics_requires_setup',collection:'disabled'},failed:context.failed||loaded.availability==='error'||context.expected};
   }
   const outcome=readStatisticsQuery({stateDirectory:loaded.policy.state_directory},{client,today},snapshot);
   snapshot.verify();return {result:{client,...outcome.result},failed:outcome.failed||context.failed};
  }catch(error){return {result:{client,status:safeCode(error),collection:'disabled'},failed:true};}
 });
 return {status:outcomes.some(o=>o.failed)?'partial':'complete',clients:outcomes.map(o=>o.result)};
}
