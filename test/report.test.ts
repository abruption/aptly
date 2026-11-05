import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportDiagnosticReport, renderDiagnosticMarkdown } from '../src/report.ts';
import { createTestTemp } from '../test-support/temp.ts';

function diagnostic() {
  const checks = [
    { id: 'node_runtime', status: 'ok', code: 'node_supported' },
    { id: 'classification_provider', status: 'ok', code: 'provider_fixture' },
    { id: 'api_key', status: 'ok', code: 'key_not_required' },
    { id: 'ledger_location', status: 'unknown', code: 'ledger_not_configured' },
    { id: 'operator_configuration', status: 'ok', code: 'configuration_default_shadow' },
    { id: 'host_evidence', status: 'unknown', code: 'host_evidence_not_configured' },
    { id: 'host_cli_versions', status: 'unknown', code: 'host_cli_not_probed' },
  ];
  return { schema_version: 1, report_id: '47af01e0-fef6-48c0-8f39-a950ea66c481', generated_at: '2026-11-03T00:00:00.000Z',
    tool: { name: 'aptly', version: '0.1.0-preview.0' },
    environment: { node: '24.22.1', platform: 'darwin', arch: 'arm64' }, checks,
    summary: { ok: 4, warning: 0, error: 0, unknown: 3 },
    privacy: { task_text: false, paths: false, environment_values: false, credentials: false, raw_errors: false },
    network_requests: 0, paid_calls: 0 };
}
const safeInvalid = fn => assert.throws(fn, error => error.code === 'report_invalid_diagnostic' && error.message === error.code);

test('Markdown uses only validated schema fields and corresponds to the JSON diagnostic', () => {
  const value = diagnostic(), markdown = renderDiagnosticMarkdown(value);
  assert.ok(markdown.startsWith('# Diagnostic report\n'));
  assert.ok(markdown.includes(value.report_id));
  for (const check of value.checks) assert.ok(markdown.includes(`| ${check.id} | ${check.status} | ${check.code} |`));
  assert.match(markdown, /nothing is uploaded automatically/);
  assert.match(markdown, /Key presence does not prove authentication/);
});
test('unknown fields and injected raw data are rejected instead of scrubbed or reflected', () => {
  const secret = ['sk', 'proj', 'sensitive-example-sentinel'].join('-'), privatePath = '/private/diagnostic-source';
  for (const mutate of [
    value => { value.raw_error = secret; }, value => { value.environment.path = privatePath; },
    value => { value.checks[0].detail = secret; }, value => { value.tool.raw_config = privatePath; },
    value => { value.checks[0].code = secret; }, value => { value.privacy.credentials = true; },
    value => { value.report_id = secret; }, value => { value.generated_at = privatePath; },
    value => { value.tool.name = { toString: () => 'aptly', private: secret }; }, value => { value.tool.version = secret; }, value => { value.tool.version = '0.1.0-' + secret; }, value => { value.environment.node = '24.1.0-' + secret; }, value => { value.environment.node = privatePath; },
    value => { value.environment.arch = secret; }, value => { value.environment.platform = privatePath; },
  ]) {
    const value = diagnostic(); mutate(value); safeInvalid(() => renderDiagnosticMarkdown(value));
  }
});
test('schema, check coverage, matching code domains and counts must be complete', () => {
  for (const mutate of [
    value => { value.checks.pop(); }, value => { value.checks[1] = { ...value.checks[0] }; },
    value => { value.checks[0].code = 'provider_fixture'; }, value => { value.checks[0].status = 'success'; },
    value => { value.summary.ok = 0; }, value => { value.paid_calls = 1; },
    value => { value.network_requests = 1; }, value => { value.schema_version = 2; },
    value => { value.generated_at = '2026-02-31T00:00:00.000Z'; },
    value => { Object.defineProperty(value.tool, 'version', { enumerable: true, get() { throw new Error('private-error'); } }); },
  ]) { const value = diagnostic(); mutate(value); safeInvalid(() => renderDiagnosticMarkdown(value)); }
});
test('default export creates two same-ID attachments in a new private directory', t => {
  const root = createTestTemp(t, 'codex-report-test-'), outputDir = join(root, 'new', 'reports'), value = diagnostic();
  const result = exportDiagnosticReport({ diagnostic: value, outputDir });
  assert.deepEqual(result, { report_id: value.report_id, files: [`diagnostic-${value.report_id}.json`, `diagnostic-${value.report_id}.md`], summary: value.summary });
  assert.equal(lstatSync(outputDir).mode & 0o777, 0o700);
  for (const file of result.files) assert.equal(lstatSync(join(outputDir, file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(outputDir, result.files[0]), 'utf8')), value);
  assert.equal(readFileSync(join(outputDir, result.files[1]), 'utf8'), renderDiagnosticMarkdown(value));
  assert.doesNotMatch(JSON.stringify(result), /codex-report-test/);
});
test('single-file format options create only the chosen attachment', t => {
  const root = createTestTemp(t, 'codex-report-test-');
  for (const format of ['md', 'json']) {
    const outputDir = join(root, format), result = exportDiagnosticReport({ diagnostic: diagnostic(), format, outputDir });
    assert.equal(result.files.length, 1); assert.ok(result.files[0].endsWith('.' + format));
    assert.equal(readdirSync(outputDir).length, 1);
  }
});
test('invalid format and diagnostic fail before creating any output directory', t => {
  const root = createTestTemp(t, 'codex-report-test-'), outputDir = join(root, 'never-created');
  assert.throws(() => exportDiagnosticReport({ diagnostic: diagnostic(), format: 'html', outputDir }), error => error.code === 'report_invalid_format');
  const value = diagnostic(); value.path = 'private'; safeInvalid(() => exportDiagnosticReport({ diagnostic: value, outputDir }));
  assert.equal(existsSync(outputDir), false);
});
test('existing files are never overwritten and a second-file collision rolls back only the new file', t => {
  const outputDir = createTestTemp(t, 'codex-report-test-'), value = diagnostic();
  const json = join(outputDir, `diagnostic-${value.report_id}.json`), md = join(outputDir, `diagnostic-${value.report_id}.md`);
  writeFileSync(md, 'existing-user-attachment', { mode: 0o600 });
  assert.throws(() => exportDiagnosticReport({ diagnostic: value, outputDir }), error => error.code === 'report_already_exists');
  assert.equal(existsSync(json), false); assert.equal(readFileSync(md, 'utf8'), 'existing-user-attachment');
  writeFileSync(json, 'existing-json', { mode: 0o600 });
  assert.throws(() => exportDiagnosticReport({ diagnostic: value, outputDir }), error => error.code === 'report_already_exists');
  assert.equal(readFileSync(json, 'utf8'), 'existing-json'); assert.equal(readFileSync(md, 'utf8'), 'existing-user-attachment');
});
test('a symlink output or ancestor is refused without touching its target', t => {
  const root = createTestTemp(t, 'codex-report-test-'), target = join(root, 'target'), link = join(root, 'link');
  mkdirSync(target, { mode: 0o700 }); symlinkSync(target, link);
  for (const outputDir of [link, join(link, 'child')]) {
    assert.throws(() => exportDiagnosticReport({ diagnostic: diagnostic(), outputDir }), error => error.code === 'report_output_unavailable');
  }
  assert.deepEqual(readdirSync(target), []);
});
test('an existing non-private directory remains unchanged and receives no attachments', t => {
  const root = createTestTemp(t, 'codex-report-test-'), outputDir = join(root, 'public');
  mkdirSync(outputDir, { mode: 0o755 }); chmodSync(outputDir, 0o755);
  assert.throws(() => exportDiagnosticReport({ diagnostic: diagnostic(), outputDir }), error => error.code === 'report_output_unavailable');
  assert.equal(lstatSync(outputDir).mode & 0o777, 0o755); assert.deepEqual(readdirSync(outputDir), []);
});

test('legacy brand reports render without rewriting their original tool identity', () => {
  const value = diagnostic(); value.tool.name = 'subagent-decisions';
  assert.match(renderDiagnosticMarkdown(value), /\| Tool \| subagent-decisions \|/);
  value.tool.name = 'untrusted-tool';
  safeInvalid(() => renderDiagnosticMarkdown(value));
});
