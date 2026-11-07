import { lstatSync, readFileSync, mkdirSync, chmodSync, openSync, writeFileSync, closeSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';
import { resolveCatalog } from './catalog.ts';
import { assertPrivateStatePath } from './files.ts';
import { assertWindowsPrivatePath, protectNewWindowsPrivateDirectory, copyWindowsFilePermissions } from './windows-private.ts';

type Client = 'codex' | 'claude';
type ObjectValue = Record<string, any>;
export interface SetupOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  automatic?: boolean;
  clients?: Client[];
  mode?: 'defaults' | 'advisory';
}
export interface SetupClientResult { client: Client; status: 'configured' | 'unchanged' | 'removed' | 'skipped' | 'error'; codes: string[]; requires_hook_review?: boolean; recovery?: string[] }
export interface SetupResult { status: 'complete' | 'partial' | 'skipped'; clients: SetupClientResult[] }
type Snapshot = { path: string; before: string | null; after: string | null; mode: number };
type Ownership = { schema_version: 1; kind: 'aptly-setup-ownership'; client: Client; hook: ObjectValue; mcp_created: boolean; mcp?: ObjectValue; policy: ObjectValue; policy_created: boolean; env_added: Record<string, string>; toml_block?: string };
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
  const lines = [blockStart, '[mcp_servers.aptly]', `command = ${q(entry.command)}`, `args = ${JSON.stringify(entry.args)}`, 'env_vars = ["OPENAI_API_KEY"]', '[mcp_servers.aptly.env]'];
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
export const configurableEnvironmentKeys: readonly string[] = Object.freeze(['ROUTER_PROVIDER', 'APTLY_CLAUDE_MODELS', 'APTLY_CODEX_MODELS', 'CLAUDE_MODELS', 'CODEX_MODELS', 'APTLY_MODEL_INFO_PATH'] as const);
type EnvironmentEdit = { defaults: true } | { key: string; value: string } | { credential: true } | { migrate: true; includeExisting?: boolean };
const defaultEnvironment = { ROUTER_PROVIDER: 'decisions', APTLY_CLAUDE_MODELS: '["haiku","sonnet","opus"]', APTLY_CODEX_MODELS: '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]' };
function validateEnvironmentValue(key: string, value: string) {
  if (!(configurableEnvironmentKeys as readonly string[]).includes(key)) fail(/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) ? 'environment_secret_key_unsupported' : 'environment_key_unsupported');
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 8192 || /[\x00-\x1f\x7f]/.test(value)) fail('environment_invalid_value');
  if (/\bsk-[A-Za-z0-9_-]{8,}|\bBearer\s+\S+|https?:\/\/[^/\s]+:[^/\s]+@/i.test(value)) fail('environment_sensitive_value');
  if (key === 'ROUTER_PROVIDER' && !['fixture','decisions'].includes(value)) fail('environment_invalid_value');
  if (key === 'APTLY_MODEL_INFO_PATH') { try { assertPrivateStatePath(value); } catch { fail('environment_invalid_value'); } }
}
function editEnvironment(current: ObjectValue, edit: EnvironmentEdit, client: Client): Record<string,string> {
  const updates: Record<string,string> = {};
  if ('defaults' in edit) {
    for (const [key,value] of Object.entries(defaultEnvironment)) {
      const alias = key === 'APTLY_CLAUDE_MODELS' ? 'CLAUDE_MODELS' : key === 'APTLY_CODEX_MODELS' ? 'CODEX_MODELS' : null;
      if (current[key] === undefined && (!alias || current[alias] === undefined)) updates[key] = value;
    }
  } else if ('credential' in edit) {
    updates.APTLY_SECRET_BACKEND = 'os';
    updates.APTLY_SECRET_CLIENT = client;
  } else if (!('migrate' in edit)) { validateEnvironmentValue(edit.key, edit.value); updates[edit.key] = edit.value; }
  const effective = { ...current, ...updates };
  if (effective.ROUTER_PROVIDER !== undefined && !['fixture','decisions'].includes(effective.ROUTER_PROVIDER)) fail('environment_invalid_value');
  try { resolveCatalog(effective); } catch { fail('environment_invalid_value'); }
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
function resolved(options: SetupOptions, client: Client) {
  const home = resolve(options.home ?? homedir()), env = options.env ?? process.env;
  const override = client === 'codex' ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR;
  if (override && !isAbsolute(override)) fail('relative_configuration_directory');
  const dir = override || join(home, client === 'codex' ? '.codex' : '.claude');
  const mcpPath = client === 'codex' ? join(dir, 'config.toml') : override ? join(dir, '.claude.json') : join(home, '.claude.json');
  return { dir, mcpPath, hooksPath: join(dir, client === 'codex' ? 'hooks.json' : 'settings.json'), privateDir: join(dir, 'aptly') };
}
function ownership(value: ObjectValue, client: Client): Ownership {
  if (value.schema_version !== 1 || value.kind !== 'aptly-setup-ownership' || value.client !== client || !object(value.hook) || typeof value.mcp_created !== 'boolean' || !object(value.env_added) || !object(value.policy) || typeof value.policy_created !== 'boolean') fail('invalid_ownership');
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
  if (removing && !oldOwner) return { changes, observations, dirs, result: { client, status: 'skipped', codes: ['no_owned_setup'] } };
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
    }
    const p = json(policy.before);
    if (!isDeepStrictEqual(p, owned.policy)) fail('managed_policy_changed');
    if (owned.policy_created) policy.after = null; manifest.after = null; result.status = 'removed';
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
      if (edit && oldOwner?.mcp_created && !isDeepStrictEqual(servers.aptly,oldOwner.mcp)) fail('managed_mcp_changed');
      const currentEnv = map(servers.aptly, 'env');
      if (currentEnv.APTLY_HOOK_POLICY_PATH !== undefined && currentEnv.APTLY_HOOK_POLICY_PATH !== policyPath) fail('mcp_environment_conflict');
      const missing = Object.fromEntries(Object.entries(additions).filter(([key]) => currentEnv[key] === undefined));
      Object.assign(currentEnv, missing);
      mcp.after = client === 'codex' ? addTomlEnv(mcp.before ?? '', missing) : stringify(config);
    }
    if (edit && 'migrate' in edit) {
      servers.aptly.command = process.execPath;
      servers.aptly.args = [join(root,'dist','src','server.js')];
    }
    if (edit && ('credential' in edit || 'migrate' in edit)) requireCredentialRuntime(servers.aptly,root);
    const currentEnv = map(servers.aptly, 'env');
    const updates = edit ? editEnvironment(currentEnv,edit,client) : {};
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
    const preservedMode = edit && policy.before !== null ? json(policy.before).mode : undefined;
    const policyValue = { schema_version: 1, kind: 'aptly-auto-hook', mode: options.mode ?? (['defaults','advisory'].includes(preservedMode) ? preservedMode : 'defaults'), issuer: 'operator_installation', enabled: true, state_directory: stateDir };
    if (policy.before !== null) {
      const p = json(policy.before);
      if (!isDeepStrictEqual(p, policyValue)) fail('policy_conflict');
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
    manifest.after = stringify(owner);
    if (client === 'codex') result.requires_hook_review = true;
    result.codes = client === 'codex' ? ['requires_hook_review'] : [];
    dirs.push(dir, privateDir, stateDir);
  }
  // Validate complete desired data before any host file is changed.
  if (client === 'codex' && mcp.after !== null) toml(mcp.after);
  for (const snapshot of [mcp, hooks, policy, manifest]) if (snapshot.before !== snapshot.after) changes.push(snapshot);
  if (!removing && changes.length) result.status = 'configured';
  return { changes, observations, dirs, result };
}
/** Secure sibling staging is short-lived and never a backup; original settings stay in memory. */
function replace(snapshot: Snapshot, forward: boolean) {
  const expected = forward ? snapshot.before : snapshot.after, next = forward ? snapshot.after : snapshot.before;
  const check = () => {
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
function execute(options: SetupOptions, removing: boolean, edit?: EnvironmentEdit, captured?: SetupPlan[]): SetupResult {
  const clients = [...new Set(options.clients ?? ['codex', 'claude'])] as Client[];
  if (clients.some(client => client !== 'codex' && client !== 'claude')) return { status: 'partial', clients: [] };
  const env = options.env ?? process.env;
  if (!removing && options.automatic && (env.APTLY_SKIP_SETUP === '1' || !!env.CI)) return { status: 'skipped', clients: clients.map(client => ({ client, status: 'skipped', codes: [env.APTLY_SKIP_SETUP === '1' ? 'setup_disabled' : 'ci_environment'] })) };
  const prepared = captured ?? clients.map(client => {
    try { return prepare(options, client, removing, edit); } catch (e: any) { return { changes: [] as Snapshot[], observations: [] as Snapshot[], dirs: [] as string[], result: { client, status: 'error', codes: [safeCode(e)] } as SetupClientResult }; }
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
const codes = new Set(['launcher_migration_not_owned','launcher_migration_not_standard','credential_launcher_unverified','environment_invalid_value','environment_sensitive_value','environment_key_unsupported','environment_secret_key_unsupported','unsafe_directory','unsafe_symlink','unsafe_configuration_file','invalid_json','invalid_json_object','configuration_shape_conflict','hook_shape_conflict','invalid_toml','unsupported_toml_layout','relative_configuration_directory','invalid_ownership','managed_hook_changed','managed_mcp_changed','managed_entry_changed','managed_policy_changed','mcp_entry_conflict','mcp_environment_conflict','existing_routing_hook_conflict','policy_conflict','existing_hook_not_owned','concurrent_configuration_change','private_directory_permissions','private_file_permissions']);
function safeCode(error: unknown) { return error instanceof Error && codes.has(error.message) ? error.message : 'configuration_io_error'; }
export function setupHosts(options: SetupOptions = {}): SetupResult { return execute(options, false); }
export function removeSetup(options: SetupOptions = {}): SetupResult { return execute(options, true); }

export function setDefaults(options: SetupOptions = {}): SetupResult { return execute(options,false,{ defaults:true }); }
export function setEnvironment(key: string, value: string, options: SetupOptions = {}): SetupResult {
  try { validateEnvironmentValue(key,value); } catch (error) { return { status:'partial',clients:(options.clients ?? ['codex','claude']).map(client=>({client,status:'error',codes:[safeCode(error)]})) }; }
  return execute(options,false,{key,value});
}

/** Store only the nonsecret source reference; credential values never enter setup. */
export function setCredentialReference(options: SetupOptions = {}): SetupResult { return execute(options,false,{credential:true}); }

/** Include unchanged files: a no-op reference update must still detect prompt-time edits. */
function validateObservations(plan: SetupPlan, written: Snapshot[] = []) {
  for (const snapshot of plan.observations) {
    const current = read(snapshot.path);
    const expected=written.includes(snapshot)?snapshot.after:snapshot.before;
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
    const reason=(error as {reason?:string})?.reason;
    const reasons=['credential_node_mismatch','credential_server_mismatch','credential_runtime_unsupported'];
    const migration=migrateLauncher({...options,clients:[client]},true);
    const canMigrate=migration.status==='complete';
    result = {client,status:'error',codes:[safeCode(error),...(reason&&reasons.includes(reason)?[reason]:[]),...(canMigrate?['launcher_migration_available']:[])],
      recovery:canMigrate?recovery(client):[`aptly set env OPENAI_API_KEY --client ${client} --check`, 'Keep custom or modified launchers unchanged. Review the host registration locally; use its secure credential environment or a separately reviewed standard registration.']};
  }
  const check = () => {
    if (!plan) return result;
    try {
      validateObservations(plan);
      // Recheck runtime support, symlinks, private permissions and policy before storage.
      prepare({...options,clients:[client]},client,false,{credential:true});
      return result;
    } catch(error) { return {client,status:'error' as const,codes:[safeCode(error)],recovery:recovery(client)}; }
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
  } catch(error) { return {status:'partial',clients:[{client,status:'error',codes:[safeCode(error)]}]}; }
}
