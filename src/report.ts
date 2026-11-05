import { closeSync, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, rmdirSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertNoRedirectedAncestors } from './files.ts';
import { errorCode } from './types.ts';
import type { UnknownRecord } from './types.ts';

const statuses = ['ok', 'warning', 'error', 'unknown'] as const;
export type DiagnosticStatus = typeof statuses[number];
const checkCodes = Object.freeze({
  node_runtime: ['node_supported', 'node_unsupported'],
  classification_provider: ['provider_fixture', 'provider_decisions', 'provider_invalid'],
  api_key: ['key_present_unverified', 'key_missing', 'key_not_required'],
  ledger_location: ['ledger_private_location_ready', 'ledger_not_configured', 'ledger_location_unavailable'],
  operator_configuration: ['configuration_default_shadow', 'configuration_valid', 'configuration_unavailable', 'configuration_invalid'],
  host_evidence: ['host_evidence_not_configured', 'host_evidence_loaded_unverified', 'host_evidence_unavailable', 'host_evidence_changed'],
  host_cli_versions: ['host_cli_not_probed'],
});
const privacyKeys = ['task_text', 'paths', 'environment_values', 'credentials', 'raw_errors'] as const;
const platforms = ['aix', 'android', 'darwin', 'freebsd', 'haiku', 'linux', 'netbsd', 'openbsd', 'sunos', 'win32', 'unknown'];
const architectures = ['arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', 'x64', 'unknown'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const semver = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?(?:\+[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/;
const own = (obj: object, key: PropertyKey): boolean => Object.hasOwn(obj, key);
const fail = (code: string) => Object.assign(new Error(code), { code });

function exact(value: unknown, keys: readonly string[]): value is UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === keys.length && keys.every(key =>
    own(descriptors, key) && own(descriptors[key], 'value') && descriptors[key].enumerable) &&
    Object.getOwnPropertySymbols(value).length === 0;
}
function version(value: unknown): value is string { return typeof value === 'string' && value.length <= 64 && semver.test(value) && !/sk-/i.test(value); }
export type DiagnosticCheckId = keyof typeof checkCodes;
export interface DiagnosticCheck { id: DiagnosticCheckId; status: DiagnosticStatus; code: string; }
export type DiagnosticSummary = Record<DiagnosticStatus,number>;
export interface Diagnostic {
 schema_version:1; report_id:string; generated_at:string;
 tool:{name:'aptly'|'subagent-decisions';version:string};
 environment:{node:string;platform:string;arch:string};
 checks:DiagnosticCheck[]; summary:DiagnosticSummary;
 privacy:Record<typeof privacyKeys[number],false>;
 network_requests:0;paid_calls:0;
}
export interface ReportExportResult {report_id:string;files:string[];summary:DiagnosticSummary;}
const isStatus=(value:unknown): value is DiagnosticStatus => typeof value==='string'&&(statuses as readonly string[]).includes(value);
const isCheckId=(value:unknown): value is DiagnosticCheckId => typeof value==='string'&&own(checkCodes,value);
function validateDiagnostic(value: unknown): Diagnostic {
 try {
  if(!exact(value,['schema_version','report_id','generated_at','tool','environment','checks','summary','privacy','network_requests','paid_calls'])||
   value.schema_version!==1||typeof value.report_id!=='string'||!uuid.test(value.report_id)||
   typeof value.generated_at!=='string'||value.generated_at.length!==24||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.generated_at)||
   !Number.isFinite(Date.parse(value.generated_at))||new Date(value.generated_at).toISOString()!==value.generated_at||
   !exact(value.tool,['name','version'])||typeof value.tool.name!=='string'||!['aptly','subagent-decisions'].includes(value.tool.name)||!version(value.tool.version)||
   !exact(value.environment,['node','platform','arch'])||!version(value.environment.node)||
   typeof value.environment.platform!=='string'||!platforms.includes(value.environment.platform)||
   typeof value.environment.arch!=='string'||!architectures.includes(value.environment.arch)||
   !Array.isArray(value.checks)||value.checks.length!==Object.keys(checkCodes).length||
   !exact(value.summary,statuses)||!exact(value.privacy,privacyKeys)||value.network_requests!==0||value.paid_calls!==0)throw fail('report_invalid_diagnostic');
  const privacy=value.privacy,summary=value.summary;
  if(privacyKeys.some(key=>privacy[key]!==false))throw fail('report_invalid_diagnostic');
  const seen=new Set<DiagnosticCheckId>(),counts:DiagnosticSummary={ok:0,warning:0,error:0,unknown:0};
  const checks:DiagnosticCheck[]=value.checks.map((check:unknown)=>{
   if(!exact(check,['id','status','code'])||!isCheckId(check.id)||seen.has(check.id)||
    !isStatus(check.status)||typeof check.code!=='string'||!checkCodes[check.id].includes(check.code))throw fail('report_invalid_diagnostic');
   seen.add(check.id);counts[check.status]++;
   return {id:check.id,status:check.status,code:check.code};
  });
  if(statuses.some(key=>summary[key]!==counts[key]))throw fail('report_invalid_diagnostic');
  return {schema_version:1,report_id:value.report_id.toLowerCase(),generated_at:value.generated_at,
   tool:{name:value.tool.name as Diagnostic['tool']['name'],version:value.tool.version},
   environment:{node:value.environment.node,platform:value.environment.platform,arch:value.environment.arch},
   checks,summary:counts,privacy:{task_text:false,paths:false,environment_values:false,credentials:false,raw_errors:false},network_requests:0,paid_calls:0};
 }catch{throw fail('report_invalid_diagnostic');}
}

export function renderDiagnosticMarkdown(diagnostic: unknown): string {
  const value = validateDiagnostic(diagnostic);
  return [
    '# Diagnostic report', '',
    `Report ID: \`${value.report_id}\``, `Schema version: ${value.schema_version}`, `Generated at: ${value.generated_at}`, '',
    '| Environment | Value |', '| --- | --- |',
    `| Tool | ${value.tool.name} |`, `| Tool version | ${value.tool.version} |`,
    `| Node.js | ${value.environment.node} |`, `| Platform | ${value.environment.platform} |`, `| Architecture | ${value.environment.arch} |`, '',
    '| Check | Status | Code |', '| --- | --- | --- |',
    ...value.checks.map(check => `| ${check.id} | ${check.status} | ${check.code} |`), '',
    `Summary: ok=${value.summary.ok}, warning=${value.summary.warning}, error=${value.summary.error}, unknown=${value.summary.unknown}.`,
    'Network requests: 0. Paid calls: 0.', '',
    'This attachment contains only allowlisted diagnostic fields. It contains no task text, private paths, environment values, credentials, or raw errors.',
    'Key presence does not prove authentication. Host CLI versions were not probed. Review this file before attaching it to an issue; nothing is uploaded automatically.', '',
  ].join('\n');
}

function privateDirectory(path: string, created: string[]): void {
  const missing = [];
  let existing = path;
  while (true) {
    try { lstatSync(existing); break; }
    catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      missing.push(existing);
      const parent = dirname(existing); if (parent === existing) throw fail('report_output_unavailable'); existing = parent;
    }
  }
  assertNoRedirectedAncestors(existing);
  for (const dir of missing.reverse()) {
    assertNoRedirectedAncestors(dirname(dir));
    try { mkdirSync(dir, { mode: 0o700 }); created.push(dir); chmodSync(dir, 0o700); }
    catch (error) { if (errorCode(error) !== 'EEXIST') throw error; }
    assertNoRedirectedAncestors(dir);
    if (!lstatSync(dir).isDirectory()) throw fail('report_output_unavailable');
  }
  assertNoRedirectedAncestors(path);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
      (process.getuid && stat.uid !== process.getuid())) throw fail('report_output_unavailable');
}

/** Write reviewed, local attachments only. No network, process execution, or config changes. */
export function exportDiagnosticReport({ diagnostic, format = 'both', outputDir = 'reports' }: {diagnostic?: unknown;format?: unknown;outputDir?: unknown} = {}): ReportExportResult {
  const value = validateDiagnostic(diagnostic);
  if (typeof format!=='string'||!['md', 'json', 'both'].includes(format)) throw fail('report_invalid_format');
  if (typeof outputDir !== 'string' || !outputDir || outputDir.length > 4096 || outputDir.includes('\0')) throw fail('report_output_unavailable');
  const directory = resolve(outputDir), createdDirectories: string[] = [], createdFiles: {path:string;dev:number;ino:number}[] = [];
  const extensions = format === 'both' ? ['json', 'md'] : [format];
  const files = extensions.map(extension => `diagnostic-${value.report_id}.${extension}`);
  try {
    privateDirectory(directory, createdDirectories);
    for (let i = 0; i < files.length; i++) {
      // Recheck parents before each exclusive creation; never follow a redirect
      // or replace a pre-existing attachment, even a symlink or directory.
      assertNoRedirectedAncestors(directory);
      const path = join(directory, files[i]);
      let fd: number|undefined;
      try {
        fd = openSync(path, 'wx', 0o600);
        const stat = fstatSync(fd); createdFiles.push({ path, dev: stat.dev, ino: stat.ino });
        fchmodSync(fd, 0o600);
        writeFileSync(fd, extensions[i] === 'json' ? JSON.stringify(value, null, 2) + '\n' : renderDiagnosticMarkdown(value));
      } finally { if (fd !== undefined) closeSync(fd); }
    }
    return { report_id: value.report_id, files, summary: { ...value.summary } };
  } catch (error) {
    // Roll back only attachments created in this operation, preserving an
    // existing collision and any concurrent replacement with a different inode.
    for (const file of createdFiles.reverse()) {
      try { const current = lstatSync(file.path); if (!current.isSymbolicLink() && current.dev === file.dev && current.ino === file.ino) unlinkSync(file.path); } catch {}
    }
    for (const dir of createdDirectories.reverse()) { try { rmdirSync(dir); } catch {} }
    throw fail(errorCode(error) === 'EEXIST' ? 'report_already_exists' : 'report_output_unavailable');
  }
}
