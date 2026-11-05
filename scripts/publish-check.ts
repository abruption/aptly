#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

type Mode = 'dry-run' | 'publish';
type Metadata = Record<string, unknown>;
export interface ReleaseOptions {
  tag: string;
  mode: Mode;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Test injection only; CLI always checks its actual toolchain. */
  nodeVersion?: string;
  npmVersion?: string;
}
export interface ArtifactOptions extends ReleaseOptions { archiveDir: string }
export interface ReleaseContext {
  name: string;
  version: string;
  tag: string;
  mode: Mode;
  source_sha: string;
  source_repository: string;
  dist_tag: 'latest' | 'next';
}
export interface ReleaseManifest extends ReleaseContext {
  schema_version: 1;
  filename: string;
  sha256: string;
}
function fail(code: string): never { throw new Error(code); }
const record = (v: unknown): v is Metadata => !!v && typeof v === 'object' && !Array.isArray(v);
const maxArchiveBytes = 50 * 1024 * 1024;
const registry = 'https://registry.npmjs.org/';
const safeFilename = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._+-]*\.tgz$/.test(v);
const safeRepository = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v) && !v.split('/').some(s => s === '.' || s === '..');
function read(path: string, maximum: number): Buffer {
  try { const s = lstatSync(path); if (!s.isFile() || s.isSymbolicLink() || s.size > maximum) return fail('release_unsafe_file'); return readFileSync(path); }
  catch (e) { if (e instanceof Error && e.message === 'release_unsafe_file') throw e; return fail('release_file_unavailable'); }
}
function json(path: string, maximum = 65536): Metadata {
  let value: unknown; try { value = JSON.parse(read(path, maximum).toString('utf8')); } catch (e) { if (e instanceof Error && e.message.startsWith('release_')) throw e; return fail('release_invalid_json'); }
  if (!record(value)) return fail('release_invalid_metadata'); return value;
}
function version(v: unknown): v is string {
  if (typeof v !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v)) return false;
  const [core, build] = v.split('+');
  const pre = core.includes('-') ? core.slice(core.indexOf('-') + 1) : undefined;
  return (!pre || pre.split('.').every(s => !!s && !/^0\d+$/.test(s))) && (build === undefined || build.split('.').every(Boolean));
}
function atLeast(actual: string, minimum: number[]): boolean {
  const match = actual.match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/); if (!match) return false;
  const values = match.slice(1).map(Number);
  for (let i = 0; i < 3; i++) { if (values[i] > minimum[i]) return true; if (values[i] < minimum[i]) return false; } return true;
}
function git(cwd: string, args: string[]): string {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 65536 }).trim(); }
  catch { return fail('release_git_unavailable'); }
}
function packageMetadata(cwd: string): Metadata { return json(join(cwd, 'package.json')); }
function publicationMetadata(pkg: Metadata, repository: string) {
  if (pkg.private === true) fail('release_package_private');
  if (pkg.private !== undefined && pkg.private !== false) fail('release_invalid_metadata');
  if (!record(pkg.repository) || pkg.repository.type !== 'git' || typeof pkg.repository.url !== 'string') fail('release_repository_metadata_required');
  const raw = pkg.repository.url as string;
  let parsed: URL; try { parsed = new URL(raw.replace(/^git\+/, '')); } catch { return fail('release_repository_mismatch'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port || parsed.pathname.replace(/\/$/, '').replace(/\.git$/, '') !== '/' + repository) fail('release_repository_mismatch');
  if (pkg.publishConfig !== undefined) {
    if (!record(pkg.publishConfig)) fail('release_invalid_metadata');
    if (Object.keys(pkg.publishConfig).some(key => !['registry', 'access', 'tag', 'provenance'].includes(key))) fail('release_publish_config_unsupported');
    if (pkg.publishConfig.registry !== undefined && String(pkg.publishConfig.registry).replace(/\/$/, '') !== registry.replace(/\/$/, '')) fail('release_registry_mismatch');
    if (pkg.publishConfig.access !== undefined && pkg.publishConfig.access !== 'public') fail('release_access_not_public');
    if (pkg.publishConfig.tag !== undefined && pkg.publishConfig.tag !== (String(pkg.version).split('+', 1)[0].includes('-') ? 'next' : 'latest')) fail('release_dist_tag_mismatch');
    if (pkg.publishConfig.provenance !== undefined && pkg.publishConfig.provenance !== true) fail('release_provenance_disabled');
  }
}
export function checkRelease(options: ReleaseOptions): ReleaseContext {
  const cwd = resolve(options.cwd ?? process.cwd()), env = options.env ?? process.env;
  if (options.mode !== 'dry-run' && options.mode !== 'publish') fail('release_invalid_mode');
  const pkg = packageMetadata(cwd);
  if (typeof options.tag !== 'string' || !options.tag.startsWith('v') || !version(options.tag.slice(1)) || !version(pkg.version) || options.tag !== 'v' + pkg.version) fail('release_tag_version_mismatch');
  if (typeof pkg.name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(pkg.name)) fail('release_invalid_metadata');
  if (!atLeast(options.nodeVersion ?? process.version, [24, 0, 0])) fail('release_node_too_old');
  let npmVersion = options.npmVersion;
  if (!npmVersion) { try { npmVersion = execFileSync('npm', ['--version'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 1024 }).trim(); } catch { return fail('release_npm_unavailable'); } }
  if (!atLeast(npmVersion, [11, 5, 1])) fail('release_npm_too_old');
  const sourceSha = git(cwd, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || git(cwd, ['rev-parse', '--verify', `refs/tags/${options.tag}^{commit}`]) !== sourceSha) fail('release_tag_checkout_mismatch');
  const dirty = spawnSync('git', ['-C', cwd, 'diff-index', '--quiet', 'HEAD', '--'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
  if (dirty.error || dirty.status !== 0) fail('release_dirty_checkout');
  const repository = env.GITHUB_REPOSITORY ?? '';
  if (repository && !safeRepository(repository)) fail('release_repository_mismatch');
  if (options.mode === 'publish') {
    publicationMetadata(pkg, repository);
    if (env.GITHUB_ACTIONS !== 'true' || !safeRepository(repository) || env.GITHUB_REF !== `refs/tags/${options.tag}` || env.GITHUB_SHA !== sourceSha) fail('release_publish_ref_mismatch');
    if (env.RELEASE_REPOSITORY_PRIVATE !== 'false') fail('release_repository_not_public');
    if (env.NPM_TOKEN || env.NODE_AUTH_TOKEN) fail('release_token_auth_forbidden');
    try { lstatSync(join(cwd, '.npmrc')); fail('release_project_npmrc_forbidden'); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  }
  return { name: pkg.name, version: pkg.version, tag: options.tag, mode: options.mode, source_sha: sourceSha, source_repository: repository, dist_tag: pkg.version.split('+', 1)[0].includes('-') ? 'next' : 'latest' };
}
function directory(path: string) {
  if (!isAbsolute(path)) fail('release_archive_directory_invalid');
  try { const s = lstatSync(path); if (!s.isDirectory() || s.isSymbolicLink()) fail('release_archive_directory_invalid'); } catch { fail('release_archive_directory_invalid'); }
}
function archiveMetadata(path: string): Metadata {
  let data: string;
  try { data = execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 65536 }); } catch { return fail('release_archive_metadata_invalid'); }
  try { const value: unknown = JSON.parse(data); if (!record(value)) fail('release_archive_metadata_invalid'); return value as Metadata; } catch { return fail('release_archive_metadata_invalid'); }
}
function verifyArchive(options: ArtifactOptions, context: ReleaseContext, filename: unknown, expectedSha?: string) {
  if (!safeFilename(filename)) fail('release_archive_filename_invalid');
  const path = join(options.archiveDir, filename), bytes = read(path, maxArchiveBytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Check immutable bytes before invoking platform-specific tar/gzip parsers.
  // Corruption must have the same fixed diagnostic on GNU and BSD tar.
  if (expectedSha !== undefined && sha256 !== expectedSha) fail('release_archive_integrity_mismatch');
  const packed = archiveMetadata(path), source = packageMetadata(resolve(options.cwd ?? process.cwd()));
  if (!isDeepStrictEqual(packed, source) || packed.name !== context.name || packed.version !== context.version) fail('release_archive_metadata_mismatch');
  if (options.mode === 'publish') publicationMetadata(packed, context.source_repository);
  return { sha256, filename };
}
export function createReleaseManifest(options: ArtifactOptions): ReleaseManifest {
  const context = checkRelease(options); directory(options.archiveDir);
  let packed: unknown; try { packed = JSON.parse(read(join(options.archiveDir, 'pack.json'), 4 * 1024 * 1024).toString('utf8')); } catch (e) { if (e instanceof Error && e.message.startsWith('release_')) throw e; return fail('release_pack_manifest_invalid'); }
  if (!Array.isArray(packed) || packed.length !== 1 || !record(packed[0]) || packed[0].name !== context.name || packed[0].version !== context.version) fail('release_pack_manifest_invalid');
  const archive = verifyArchive(options, context, packed[0].filename);
  const manifest: ReleaseManifest = { schema_version: 1, ...context, ...archive };
  const target = join(options.archiveDir, 'release-manifest.json'), sums = join(options.archiveDir, 'SHA256SUMS');
  const body = JSON.stringify(manifest, null, 2) + '\n'; let wroteManifest = false;
  try { writeFileSync(target, body, { flag: 'wx', mode: 0o600 }); wroteManifest = true; writeFileSync(sums, `${archive.sha256}  ${archive.filename}\n`, { flag: 'wx', mode: 0o600 }); }
  catch { if (wroteManifest) { try { if (read(target, 65536).toString('utf8') === body) unlinkSync(target); } catch { /* Do not replace or delete another writer's artifact. */ } } fail('release_manifest_already_exists'); }
  return manifest;
}
export function verifyReleaseArtifact(options: ArtifactOptions): ReleaseManifest {
  const context = checkRelease(options); directory(options.archiveDir);
  if (options.mode === 'publish') { const env = options.env ?? process.env; if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('release_oidc_environment_missing'); }
  const manifest = json(join(options.archiveDir, 'release-manifest.json'));
  const keys = ['schema_version', 'name', 'version', 'tag', 'mode', 'source_sha', 'source_repository', 'dist_tag', 'filename', 'sha256'];
  if (Object.keys(manifest).length !== keys.length || Object.keys(manifest).some(k => !keys.includes(k)) || manifest.schema_version !== 1 || Object.entries(context).some(([key, value]) => manifest[key] !== value) || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) fail('release_manifest_mismatch');
  const archive = verifyArchive(options, context, manifest.filename, manifest.sha256);
  if (archive.sha256 !== manifest.sha256 || read(join(options.archiveDir, 'SHA256SUMS'), 1024).toString('utf8') !== `${archive.sha256}  ${archive.filename}\n`) fail('release_archive_integrity_mismatch');
  return manifest as unknown as ReleaseManifest;
}
const errorCodes = new Set(['release_invalid_mode','release_unsafe_file','release_file_unavailable','release_invalid_json','release_invalid_metadata','release_repository_metadata_required','release_repository_mismatch','release_registry_mismatch','release_access_not_public','release_publish_config_unsupported','release_dist_tag_mismatch','release_provenance_disabled','release_package_private','release_tag_version_mismatch','release_node_too_old','release_npm_unavailable','release_npm_too_old','release_git_unavailable','release_tag_checkout_mismatch','release_dirty_checkout','release_publish_ref_mismatch','release_repository_not_public','release_token_auth_forbidden','release_project_npmrc_forbidden','release_archive_directory_invalid','release_archive_metadata_invalid','release_archive_filename_invalid','release_archive_metadata_mismatch','release_pack_manifest_invalid','release_manifest_already_exists','release_oidc_environment_missing','release_manifest_mismatch','release_archive_integrity_mismatch','release_invalid_options']);
export function safeReleaseError(error: unknown): string { return error instanceof Error && errorCodes.has(error.message) ? error.message : 'release_check_failed'; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2), values = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) { if (!['--tag','--mode','--archive-dir'].includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('release_invalid_options'); values.set(args[i], args[i + 1]); }
    const tag = values.get('--tag'), mode = values.get('--mode');
    if (!tag || (mode !== 'dry-run' && mode !== 'publish') || !['preflight','manifest','verify'].includes(command) || (command === 'preflight' ? values.has('--archive-dir') : !values.has('--archive-dir'))) fail('release_invalid_options');
    const options: ArtifactOptions = { tag, mode, archiveDir: values.get('--archive-dir') ?? '' };
    const result = command === 'preflight' ? checkRelease(options) : command === 'manifest' ? createReleaseManifest(options) : verifyReleaseArtifact(options);
    process.stdout.write(JSON.stringify({ status: 'ok', command, ...result }) + '\n');
  } catch (error) { process.stderr.write(JSON.stringify({ status: 'error', code: safeReleaseError(error) }) + '\n'); process.exitCode = 1; }
}
