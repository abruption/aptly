import { lstatSync, readFileSync, mkdirSync, chmodSync, openSync, writeFileSync, closeSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';

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
export interface SetupClientResult { client: Client; status: 'configured' | 'unchanged' | 'removed' | 'skipped' | 'error'; codes: string[]; requires_hook_review?: boolean }
export interface SetupResult { status: 'complete' | 'partial' | 'skipped'; clients: SetupClientResult[] }
type Snapshot = { path: string; before: string | null; after: string | null; mode: number };
type Ownership = { schema_version: 1; kind: 'aptly-setup-ownership'; client: Client; hook: ObjectValue; mcp_created: boolean; mcp?: ObjectValue; policy: ObjectValue; policy_created: boolean; env_added: Record<string, string>; toml_block?: string };
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const stringify = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const fail = (code: string): never => { throw new Error(code); };
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
function prepare(options: SetupOptions, client: Client, removing: boolean): { changes: Snapshot[]; dirs: string[]; result: SetupClientResult } {
  const env = options.env ?? process.env, paths = resolved(options, client), { dir, mcpPath, hooksPath, privateDir } = paths;
  const changes: Snapshot[] = [], dirs: string[] = [];
  noSymlinks(dir); noSymlinks(privateDir);
  for (const path of [privateDir, join(privateDir, 'state')]) {
    try { checkedDirectory(path); if ((lstatSync(path).mode & 0o077) !== 0) fail('private_directory_permissions'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  }
  const hasDir = (() => { try { checkedDirectory(dir); return true; } catch (e: any) { if (e.code === 'ENOENT') return false; throw e; } })();
  const result: SetupClientResult = { client, status: 'unchanged', codes: [] };
  if (!hasDir && (options.automatic || removing)) return { changes, dirs, result: { client, status: 'skipped', codes: ['host_not_configured'] } };
  const policyPath = join(privateDir, 'auto-policy.json'), manifestPath = join(privateDir, 'setup-ownership.json'), stateDir = join(privateDir, 'state');
  const snap = (path: string) => { const source = read(path); return { path, before: source.text, after: source.text, mode: source.mode }; };
  const mcp = snap(mcpPath), hooks = snap(hooksPath), policy = snap(policyPath), manifest = snap(manifestPath);
  for (const privateFile of [policy, manifest]) if (privateFile.before !== null && (privateFile.mode & 0o077) !== 0) fail('private_file_permissions');
  const oldOwner = manifest.before === null ? undefined : ownership(json(manifest.before), client);
  if (removing && !oldOwner) return { changes, dirs, result: { client, status: 'skipped', codes: ['no_owned_setup'] } };
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
    if (servers.aptly === undefined) {
      created = true;
      servers.aptly = { ...(client === 'claude' ? { type: 'stdio' } : {}), command: process.execPath, args: [join(root, 'dist', 'src', 'server.js')], ...(client === 'codex' ? { env_vars: ['OPENAI_API_KEY'] } : {}), env: { ROUTER_PROVIDER: env.ROUTER_PROVIDER === 'fixture' ? 'fixture' : 'decisions', ...additions } };
      if (client === 'codex') { tomlBlock = newTomlBlock(servers.aptly); mcp.after = (mcp.before ?? '') + ((mcp.before ?? '').endsWith('\n') || !mcp.before ? '\n' : '\n\n') + tomlBlock; }
      else mcp.after = stringify(config);
    } else {
      if (!object(servers.aptly)) fail('mcp_entry_conflict');
      const currentEnv = map(servers.aptly, 'env');
      if (currentEnv.APTLY_HOOK_POLICY_PATH !== undefined && currentEnv.APTLY_HOOK_POLICY_PATH !== policyPath) fail('mcp_environment_conflict');
      const missing = Object.fromEntries(Object.entries(additions).filter(([key]) => currentEnv[key] === undefined));
      Object.assign(currentEnv, missing);
      mcp.after = client === 'codex' ? addTomlEnv(mcp.before ?? '', missing) : stringify(config);
    }
    const existingRoute = entries.filter(routeHook);
    if (existingRoute.some(entry => !isDeepStrictEqual(entry, hookValue))) fail('existing_routing_hook_conflict');
    if (existingRoute.length === 0) entries.push(hookValue);
    hooks.after = stringify(hooksObject);
    const policyValue = { schema_version: 1, kind: 'aptly-auto-hook', mode: options.mode ?? 'defaults', issuer: 'operator_installation', enabled: true, state_directory: stateDir };
    if (policy.before !== null) {
      const p = json(policy.before);
      if (!isDeepStrictEqual(p, policyValue)) fail('policy_conflict');
    } else policy.after = stringify(policyValue);
    const envAdded = oldOwner?.env_added ?? (created ? {} : Object.fromEntries(Object.entries(additions).filter(([key]) => {
      const original = client === 'codex' ? toml(mcp.before ?? '') : json(mcp.before); return original[client === 'codex' ? 'mcp_servers' : 'mcpServers']?.aptly?.env?.[key] === undefined;
    })));
    if (existingRoute.length && !oldOwner) fail('existing_hook_not_owned');
    const owner: Ownership = oldOwner ?? { schema_version: 1, kind: 'aptly-setup-ownership', client, hook: hookValue, policy: policyValue, policy_created: policy.before === null, mcp_created: created, ...(created ? { mcp: servers.aptly } : {}), env_added: envAdded, ...(tomlBlock ? { toml_block: tomlBlock } : {}) };
    manifest.after = stringify(owner);
    if (client === 'codex') result.requires_hook_review = true;
    result.codes = client === 'codex' ? ['requires_hook_review'] : [];
    dirs.push(dir, privateDir, stateDir);
  }
  // Validate complete desired data before any host file is changed.
  if (client === 'codex' && mcp.after !== null) toml(mcp.after);
  for (const snapshot of [mcp, hooks, policy, manifest]) if (snapshot.before !== snapshot.after) changes.push(snapshot);
  if (!removing && changes.length) result.status = 'configured';
  return { changes, dirs, result };
}
/** Secure sibling staging is short-lived and never a backup; original settings stay in memory. */
function replace(snapshot: Snapshot, forward: boolean) {
  const expected = forward ? snapshot.before : snapshot.after, next = forward ? snapshot.after : snapshot.before;
  if (read(snapshot.path).text !== expected) fail('concurrent_configuration_change');
  if (next === null) { if (expected !== null) unlinkSync(snapshot.path); return; }
  const stage = join(dirname(snapshot.path), `.aptly-stage-${randomUUID()}`);
  let fd: number | undefined;
  try {
    fd = openSync(stage, 'wx', 0o600); writeFileSync(fd, next); closeSync(fd); fd = undefined;
    if (read(snapshot.path).text !== expected) fail('concurrent_configuration_change');
    renameSync(stage, snapshot.path);
    if (snapshot.mode !== 0o600) chmodSync(snapshot.path, snapshot.mode);
  } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(stage); } catch (e: any) { if (e.code !== 'ENOENT') throw e; } }
}
function execute(options: SetupOptions, removing: boolean): SetupResult {
  const clients = [...new Set(options.clients ?? ['codex', 'claude'])] as Client[];
  if (clients.some(client => client !== 'codex' && client !== 'claude')) return { status: 'partial', clients: [] };
  const env = options.env ?? process.env;
  if (!removing && options.automatic && (env.APTLY_SKIP_SETUP === '1' || !!env.CI)) return { status: 'skipped', clients: clients.map(client => ({ client, status: 'skipped', codes: [env.APTLY_SKIP_SETUP === '1' ? 'setup_disabled' : 'ci_environment'] })) };
  const prepared = clients.map(client => {
    try { return prepare(options, client, removing); } catch (e: any) { return { changes: [] as Snapshot[], dirs: [] as string[], result: { client, status: 'error', codes: [safeCode(e)] } as SetupClientResult }; }
  });
  const results = prepared.map(plan => plan.result);
  // Each host is independent; prepare every host before committing any host.
  for (const plan of prepared) {
    if (!plan.changes.length) continue;
    const written: Snapshot[] = [], madeDirs: string[] = [];
    try {
      for (const path of plan.dirs) {
        noSymlinks(path);
        try { checkedDirectory(path); } catch (e: any) { if (e.code !== 'ENOENT') throw e; mkdirSync(path, { mode: 0o700 }); madeDirs.push(path); }
        if (path.endsWith('/aptly') || path.endsWith('/aptly/state')) { if ((lstatSync(path).mode & 0o077) !== 0) fail('private_directory_permissions'); }
      }
      for (const snapshot of plan.changes) { replace(snapshot, true); written.push(snapshot); }
    } catch (e: any) {
      let rollbackConflict = false;
      for (const snapshot of written.reverse()) { try { replace(snapshot, false); } catch { rollbackConflict = true; } }
      for (const path of madeDirs.reverse()) { try { rmdirSync(path); } catch { /* Never remove another writer's files. */ } }
      plan.result.status = 'error'; plan.result.codes = [safeCode(e), ...(rollbackConflict ? ['rollback_concurrent_change'] : [])];
    }
  }
  return { status: results.some(result => result.status === 'error') ? 'partial' : results.every(result => result.status === 'skipped') ? 'skipped' : 'complete', clients: results };
}
const codes = new Set(['unsafe_directory','unsafe_symlink','unsafe_configuration_file','invalid_json','invalid_json_object','configuration_shape_conflict','hook_shape_conflict','invalid_toml','unsupported_toml_layout','relative_configuration_directory','invalid_ownership','managed_hook_changed','managed_mcp_changed','managed_entry_changed','managed_policy_changed','mcp_entry_conflict','mcp_environment_conflict','existing_routing_hook_conflict','policy_conflict','existing_hook_not_owned','concurrent_configuration_change','private_directory_permissions','private_file_permissions']);
function safeCode(error: unknown) { return error instanceof Error && codes.has(error.message) ? error.message : 'configuration_io_error'; }
export function setupHosts(options: SetupOptions = {}): SetupResult { return execute(options, false); }
export function removeSetup(options: SetupOptions = {}): SetupResult { return execute(options, true); }
