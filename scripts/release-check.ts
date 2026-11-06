#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isRecord, errorCode } from '../src/types.ts';
interface Issue { code:string; file:string; }
interface SourceEntry { path?:unknown; content?:unknown; symlink?:unknown; }
interface AuditOptions { files?:unknown; packageFiles?:unknown; packageMetadata?:unknown; }
export interface AuditResult { passed:boolean; sourceFileCount?:number; packageFileCount?:number; issues:Issue[]; }

const readmeFiles = ['README.md', 'README.en.md', 'README.zh-CN.md', 'README.ja.md'];
const userGuideFiles = ['docs/guide/ko.md', 'docs/guide/en.md', 'docs/guide/zh-CN.md', 'docs/guide/ja.md'];
const rootFiles = new Set(['package.json', 'package-lock.json', ...readmeFiles, 'LICENSE', 'tsconfig.json', '.gitignore', '.gitattributes', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', '.env.example']);
const rootDirectories = new Set(['src', 'bin', 'examples', 'docs', 'test', 'test-support', 'scripts', '.github', 'dist']);
const forbiddenSegments = new Set(['.local', '.poc', 'node_modules', '.worktree', '.release', '.git', 'AGENTS.md']);
const packagedRootFiles = new Set([...readmeFiles, ...userGuideFiles, 'LICENSE', 'package.json', 'docs/ADVISORY_USAGE.md', 'docs/SPAWN_CONTEXT.md', 'docs/DRAFT_0_1_0.md']);
const packagedDirectories = new Set(['dist/src', 'dist/bin', 'examples', 'docs/guide']);
const maximumSourceBytes = 2 * 1024 * 1024;

const patterns: Array<[string,RegExp]> = [
  ['secret_key', /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{40,}\b/],
  ['private_key_material', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/],
  ['private_user_path', /\/Users\/(?!<|\$)[A-Za-z0-9._-]+(?:\/|(?=["'\s]))/],
  ['private_user_path', /\/home\/(?!<|\$)[A-Za-z0-9._-]+(?:\/|(?=["'\s]))/],
  ['private_user_path', /\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!<|\$)[A-Za-z0-9._-]+(?:[\\/]|(?=["'\s]))/],
  ['private_tailnet_dns', /\b(?:[A-Za-z0-9-]+\.)*tail[a-z0-9]{4,}\.ts\.net\b/i],
  ['private_vault_reference', /\bvaultItem\s*=\s*["'`][^"'`\r\n]+["'`]/],
  ['private_vault_reference', /Vaultwarden[ \t]*항목명[^\r\n]{0,120}[|:=][ \t]*[`"'][^`"'\r\n]+[`"']/i],
  ['private_vault_reference', /(?:항목[ \t]*(?:ID|UUID)|vault(?:warden)?[ \t_-]*item[ \t_-]*(?:id|uuid))[^\r\n]{0,100}\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i],
  ['private_vault_reference', /OpenAI[ \t]*[—–-][ \t]*[A-Za-z0-9_-]+[ \t]+PoC[ \t]*\(\d{4}-\d{2}-\d{2}\)/],
];

function validPath(path:unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.length <= 512 &&
    !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
}
function isTailnetAddress(content:string): boolean {
  const addresses = content.match(/\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
  return addresses.some(address => {
    const [, second, third, fourth] = address.split('.').map(Number);
    return second >= 64 && second <= 127 && third <= 255 && fourth <= 255;
  });
}
function sensitivePath(path:string): boolean {
  return patterns.some(([, pattern]) => pattern.test(path)) || isTailnetAddress(path);
}
function safeFile(path:unknown): string {
  return validPath(path) && !sensitivePath(path) ? path : '<invalid-or-private-path>';
}
function metadataPackageIssues(value:unknown): Issue[] {
  const metadata=isRecord(value)?value:{};
  const issues: Issue[] = [];
  const add = (code:string) => issues.push({ code, file: 'package.json' });
  const entries = metadata?.files;
  const normalized = (value:unknown) => typeof value === 'string' ? value.replace(/\/\*\*$/, '').replace(/\/$/, '') : '';
  if (!Array.isArray(entries) || !entries.length || entries.some(value => {
    const path = normalized(value);
    return !(packagedRootFiles.has(path) || packagedDirectories.has(path));
  })) add('package_allowlist_required');
  for (const key of ['bundledDependencies', 'bundleDependencies']) {
    const value = metadata?.[key];
    if (value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0)) add('package_bundled_dependencies_forbidden');
  }
  // npm can include main/bin/man targets independently of files. Validate before pack.
  const declared = [metadata?.main, ...(typeof metadata?.bin === 'object' && metadata.bin ? Object.values(metadata.bin) : [metadata?.bin]), ...(Array.isArray(metadata?.man) ? metadata.man : [metadata?.man])].filter(value => value !== undefined);
  if (declared.some(value => typeof value !== 'string' || !validPath(value.replace(/^\.\//, '')) || !packageAllowed(value.replace(/^\.\//, '')))) add('package_entrypoint_outside_allowlist');
  return issues;
}
function privateArtifact(path:string): boolean {
  return path.split('/').some(part => /^\.env(?:\.|$)/i.test(part) && part!=='.env.example' || /^(?:auth|credentials)(?:\.[^.]+)?$/i.test(part) || /^\.npmrc$/i.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part));
}
function sourceAllowed(path:string): boolean {
  const segments = path.split('/');
  return !privateArtifact(path) && !segments.some(part => forbiddenSegments.has(part)) &&
    (rootFiles.has(path) || (segments.length > 1 && rootDirectories.has(segments[0])));
}
function packageAllowed(path:string): boolean {
  const segments = path.split('/');
  if(privateArtifact(path)||segments.some(part=>forbiddenSegments.has(part)))return false;
  if(packagedRootFiles.has(path))return true;
  if(path.startsWith('examples/'))return true;
  if(path.startsWith('dist/bin/'))return ['dist/bin/aptly.js','dist/bin/aptly.d.ts'].includes(path);
  return path.startsWith('dist/src/')&&(/\.js$/.test(path)||/\.d\.ts$/.test(path));
}

/** Pure audit. files entries are {path, content, symlink?}; packageFiles accepts paths or {path}. */
export function auditFiles({ files = [], packageFiles = [], packageMetadata = {} }:AuditOptions = {}): AuditResult {
  const issues: Issue[] = [];
  const issue = (code:string, path:unknown) => issues.push({ code, file: safeFile(path) });
  if (!Array.isArray(files)) issue('source_manifest_invalid', '<source-manifest>');
  if (!Array.isArray(packageFiles)) issue('package_manifest_invalid', '<package-manifest>');
  const sources: SourceEntry[] = Array.isArray(files) ? files.map((entry:unknown)=>isRecord(entry)?entry:{}) : [];
  const packaged: unknown[] = Array.isArray(packageFiles) ? packageFiles : [];
  for (const entry of sources) {
    const path = entry?.path;
    if (!validPath(path)) { issue('invalid_source_path', path); continue; }
    if (sensitivePath(path)) issue('private_source_path', path);
    if (!sourceAllowed(path)) { issue('disallowed_source_path', path); continue; }
    if (entry.symlink) { issue('source_symlink', path); continue; }
    const content = entry.content;
    if (typeof content !== 'string' && !Buffer.isBuffer(content)) { issue('source_content_missing', path); continue; }
    if (Buffer.byteLength(content) > maximumSourceBytes) { issue('source_size_limit', path); continue; }
    const text = typeof content === 'string' ? content : content.toString('utf8');
    for (const [code, pattern] of patterns) if (pattern.test(text)) issue(code, path);
    if (isTailnetAddress(text)) issue('private_tailnet_ip', path);
  }
  const seenPackagePaths = new Set();
  for (const entry of packaged) {
    const path = typeof entry === 'string' ? entry : isRecord(entry)?entry.path:undefined;
    if (!validPath(path)) { issue('invalid_package_path', path); continue; }
    if (seenPackagePaths.has(path)) issue('duplicate_package_path', path);
    seenPackagePaths.add(path);
    if (!packageAllowed(path)) issue('disallowed_package_path', path);
    if (sensitivePath(path)) issue('private_package_path', path);
  }
  if (!isRecord(packageMetadata) || packageMetadata.license !== 'MIT') issue('mit_license_metadata_required', 'package.json');
  const license = sources.find(entry => entry?.path === 'LICENSE' && !entry.symlink)?.content;
  const licenseText = Buffer.isBuffer(license) ? license.toString('utf8') : license;
  if (typeof licenseText !== 'string' || !/\bMIT License\b/.test(licenseText) || !licenseText.includes('Permission is hereby granted, free of charge')) issue('mit_license_file_required', 'LICENSE');
  issues.push(...metadataPackageIssues(packageMetadata));
  const unique = [...new Map(issues.map(entry => [`${entry.code}:${entry.file}`, entry])).values()];
  unique.sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code));
  return { passed: unique.length === 0, sourceFileCount: sources.length, packageFileCount: packaged.length, issues: unique };
}

function collectSources(root:string) {
  const files: SourceEntry[] = [];
  const problems: Issue[] = [];
  function visit(path:string) {
    const name = relative(root, path).split('\\').join('/');
    // Never descend into or open local artifacts, including nested occurrences.
    if (privateArtifact(name)) { problems.push({code:'private_artifact_in_public_tree',file:safeFile(name)});return; }
    if (name.split('/').some(part => forbiddenSegments.has(part))) {
      if ([...packagedDirectories].some(base=>name===base||name.startsWith(base+'/'))) problems.push({ code: 'excluded_artifact_in_package_root', file: safeFile(name) });
      return;
    }
    let stat;
    try { stat = lstatSync(path); } catch (error) {
      if (errorCode(error) !== 'ENOENT') problems.push({ code: 'source_read_failed', file: safeFile(name) });
      return;
    }
    if (stat.isSymbolicLink()) { files.push({ path: name, symlink: true }); return; }
    if (stat.isDirectory()) {
      for (const child of readdirSync(path).sort()) visit(join(path, child));
      return;
    }
    if (!stat.isFile()) { problems.push({ code: 'unsupported_source_entry', file: safeFile(name) }); return; }
    if (stat.size > maximumSourceBytes) { problems.push({ code: 'source_size_limit', file: safeFile(name) }); return; }
    try { files.push({ path: name, content: readFileSync(path, 'utf8') }); }
    catch { problems.push({ code: 'source_read_failed', file: safeFile(name) }); }
  }
  for (const name of [...rootFiles, ...rootDirectories].sort()) visit(join(root, name));
  return { files, problems };
}

function checkRelease(root:string): AuditResult {
  const { files, problems } = collectSources(root);
  let metadata:unknown;
  try { metadata = JSON.parse(String(files.find(entry => entry.path === 'package.json')?.content ?? 'null')); }
  catch { problems.push({ code: 'package_metadata_invalid', file: 'package.json' }); }
  const preflight = metadataPackageIssues(metadata);
  if (preflight.length || problems.length) {
    const report = auditFiles({ files, packageMetadata: metadata });
    return { ...report, passed: false, issues: [...report.issues, ...problems].sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code)) };
  }
  const pack = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_update_notifier: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let packageFiles: Array<{path:unknown}> = [];
  if (pack.status !== 0 || pack.error) problems.push({ code: 'package_dry_run_failed', file: 'package.json' });
  else {
    try {
      const manifest = JSON.parse(pack.stdout);
      if (!Array.isArray(manifest) || manifest.length !== 1 || !Array.isArray(manifest[0].files)) throw new Error();
      packageFiles = manifest[0].files.map((entry:unknown) => ({ path: isRecord(entry)?entry.path:undefined }));
    } catch { problems.push({ code: 'package_manifest_invalid', file: 'package.json' }); }
  }
  const report = auditFiles({ files, packageFiles, packageMetadata: metadata });
  const issues = [...report.issues, ...problems].sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code));
  return { ...report, passed: issues.length === 0, issues };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argumentsOnly = process.argv.slice(2);
  if (argumentsOnly.includes('--help') && argumentsOnly.length === 1) console.log('Usage: node scripts/release-check.ts [--json]');
  else {
    let report:AuditResult;
    try {
      report = argumentsOnly.some(value => value !== '--json')
        ? { passed: false, issues: [{ code: 'invalid_arguments', file: '<arguments>' }] }
        : checkRelease(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
    } catch { report = { passed: false, issues: [{ code: 'release_check_failed', file: '<release-check>' }] }; }
    if (argumentsOnly.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.passed ? `Release checks passed (${report.sourceFileCount} source files, ${report.packageFileCount} package files).` : 'Release checks failed.');
      for (const issue of report.issues) console.log(`${issue.code}: ${issue.file}`);
    }
    if (!report.passed) process.exitCode = 1;
  }
}
