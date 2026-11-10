import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFiles } from '../scripts/release-check.ts';

const mit = 'MIT License\nPermission is hereby granted, free of charge, to any person obtaining a copy.';
const baseline = extra => ({ files: [{ path: 'LICENSE', content: mit }, { path: 'src/server.ts', content: '// synthetic public source' }], packageFiles: ['package.json', 'README.md', 'LICENSE', 'dist/src/server.js'], packageMetadata: { license: 'MIT', private: true, files: ['dist/src/', 'dist/bin/', 'examples/', 'README.md', 'LICENSE'] }, ...extra });
const codes = result => result.issues.map(issue => issue.code);

test('release audit allows a private npm package in a public GitHub source tree', () => {
  assert.equal(auditFiles(baseline()).passed, true);
  assert.equal(auditFiles(baseline({ packageMetadata: { license: 'MIT', private: false, files: ['dist/src/'] } })).passed, true);
});

test('source audit rejects escapes, private artifacts, symlinks and unsupported root files', () => {
  for (const path of ['../outside', '/outside', ['C:', 'Users', 'private'].join('\\'), 'src/../outside', 'src\\outside', '.local/secret', '.poc/report.json', 'node_modules/private.json', '.worktree/private', '.release/archive', 'src/.local/secret', 'photos/private.png']) {
    const result = auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path, content: 'do not open' }] }));
    assert.equal(result.passed, false);
    assert.ok(codes(result).some(code => ['invalid_source_path', 'disallowed_source_path'].includes(code)));
  }
  assert.ok(codes(auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: 'src/linked.ts', symlink: true }] }))).includes('source_symlink'));
});

test('packaged file paths are checked independently from the source root allowlist', () => {
  for (const path of ['src/server.ts', 'src/server.js', 'bin/cli.ts', 'dist/src/a.ts', 'dist/src/a.mjs', 'dist/scripts/dev.js', 'test/example.test.ts', 'test-support/fixture.ts', 'scripts/dev.ts', 'docs/design.md', 'AGENTS.md', 'package-lock.json', '.github/workflows/ci.yml', 'src/.local/private']) {
    assert.ok(codes(auditFiles(baseline({ packageFiles: [path] }))).includes('disallowed_package_path'));
  }
  for (const path of ['../escape', '/absolute', 'src/../../escape', ['C:', 'absolute'].join('\\')]) {
    assert.ok(codes(auditFiles(baseline({ packageFiles: [path] }))).includes('invalid_package_path'));
  }
  assert.ok(codes(auditFiles(baseline({ packageFiles: ['dist/src/a.js', 'dist/src/a.js'] }))).includes('duplicate_package_path'));
});

test('actual-shaped private data produces codes and relative names without match excerpts', () => {
  const fullKey = ['sk', 'proj', 'A'.repeat(64)].join('-');
  const ip = ['100', '80', '20', '30'].join('.');
  const dns = ['machine.', 'tail', 'abcdef', '.ts.net'].join('');
  const unix = ['', 'Users', 'private-person', 'secret.txt'].join('/');
  const linux = ['', 'home', 'private-person', 'secret.txt'].join('/');
  const windows = ['C:', 'Users', 'private-person', 'secret.txt'].join('\\');
  const uuid = [8, 4, 4, 4, 12].map(length => 'a'.repeat(length)).join('-');
  const vaultName = ['OpenAI', ' — ', 'synthetic-project', ' PoC ', '(2026-01-01)'].join('');
  const itemAssignment = ['vault', 'Item', ' = ', JSON.stringify(vaultName)].join('');
  const specimens = [
    [fullKey, 'secret_key'], [ip, 'private_tailnet_ip'], [dns, 'private_tailnet_dns'],
    [unix, 'private_user_path'], [linux, 'private_user_path'], [windows, 'private_user_path'],
    [['항목 ', 'ID | `', uuid, '`'].join(''), 'private_vault_reference'],
    [itemAssignment, 'private_vault_reference'], [vaultName, 'private_vault_reference'],
  ];
  for (const [content, code] of specimens) {
    const report = auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: 'docs/specimen.md', content }] }));
    assert.ok(codes(report).includes(code), code);
    const printed = JSON.stringify(report);
    assert.equal(printed.includes(content), false, code);
    assert.deepEqual(Object.keys(report.issues[0]).sort(), ['code', 'file']);
  }
});

test('synthetic key sentinels and regex source representations do not look like issued project keys', () => {
  const content = [
    ['sk', 'fixture-only-not-a-real-secret'].join('-'),
    ['sk', 'proj', '0123456789abcdef0123456789'].join('-'),
    String(/\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{40,}\b/),
    String(/\b(?:[A-Za-z0-9-]+\.)*tail[a-z0-9]{4,}\.ts\.net\b/i),
  ].join('\n');
  assert.equal(auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: 'test/example.test.ts', content }] })).passed, true);
});

test('MIT license metadata and a license file are both required', () => {
  for (const packageMetadata of [{}, { license: 'UNLICENSED' }, { license: 'Apache-2.0' }, null]) {
    assert.ok(codes(auditFiles(baseline({ packageMetadata }))).includes('mit_license_metadata_required'));
  }
  assert.ok(codes(auditFiles(baseline({ files: [] }))).includes('mit_license_file_required'));
  assert.ok(codes(auditFiles(baseline({ files: [{ path: 'LICENSE', content: 'placeholder' }] }))).includes('mit_license_file_required'));
});

test('malformed manifests fail safely and private path names are not emitted verbatim', () => {
  assert.ok(codes(auditFiles(baseline({ files: null }))).includes('source_manifest_invalid'));
  assert.ok(codes(auditFiles(baseline({ packageFiles: null }))).includes('package_manifest_invalid'));
  const keyPath = `dist/src/${['sk', 'proj', 'Z'.repeat(64)].join('-')}.ts`;
  const report = auditFiles(baseline({ packageFiles: [keyPath.replace(/\.ts$/,'.js')] }));
  assert.ok(codes(report).includes('private_package_path'));
  assert.equal(JSON.stringify(report).includes(keyPath), false);
  const sourceReport = auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: keyPath, content: 'synthetic' }] }));
  assert.ok(codes(sourceReport).includes('private_source_path'));
  assert.equal(JSON.stringify(sourceReport).includes(keyPath), false);
});


test('metadata requires a closed package namespace before invoking npm pack', () => {
  for (const files of [['dist/src'], ['dist/src/'], ['dist/src/**'], ['dist/src/', 'dist/bin/**', 'examples', 'README.md', 'LICENSE', 'package.json']]) {
    assert.equal(auditFiles(baseline({ packageMetadata: { license: 'MIT', files } })).passed, true);
  }
  for (const files of [undefined, [], ['**'], ['scripts/'], ['.local/'], ['src/'], ['bin/'], ['dist/'], ['dist/src/../.local/'], ['dist/src//'], [null]]) {
    assert.ok(codes(auditFiles(baseline({ packageMetadata: { license: 'MIT', files } }))).includes('package_allowlist_required'));
  }
  for (const extra of [{ main: './.local/private.ts' }, { bin: { cli: '../outside' } }, { man: ['docs/private.1'] }]) {
    assert.ok(codes(auditFiles(baseline({ packageMetadata: { license: 'MIT', files: ['dist/src/'], ...extra } }))).includes('package_entrypoint_outside_allowlist'));
  }
  for (const extra of [{ bundledDependencies: true }, { bundleDependencies: ['private'] }]) {
    assert.ok(codes(auditFiles(baseline({ packageMetadata: { license: 'MIT', files: ['dist/src/'], ...extra } }))).includes('package_bundled_dependencies_forbidden'));
  }
});
test('credential-like files cannot enter an allowlisted package directory',()=>{
 for(const path of ['examples/.env','examples/.env.production','src/auth.json','bin/credentials.json','examples/client.key']){
  const result=auditFiles({files:[{path,content:'opaque'}],packageFiles:[path],packageMetadata:{license:'MIT',files:['src/','bin/','examples/','README.md','LICENSE']}});
  assert.equal(result.passed,false);assert.ok(result.issues.some(x=>x.code==='disallowed_package_path'));
 }
});

test('local agent instructions cannot enter source or package manifests',()=>{
 for(const path of ['AGENTS.md','docs/AGENTS.md','dist/src/AGENTS.md']){
  const value=auditFiles(baseline({files:[{path:'LICENSE',content:mit},{path,content:'local instructions'}],packageFiles:[path]}));
  assert.ok(codes(value).includes('disallowed_source_path'));assert.ok(codes(value).includes('disallowed_package_path'));
 }
});

test('package audit rejects stale or unexpected compiled CLI entrypoints', () => {
  for (const path of ['dist/bin/subagent-decisions.js', 'dist/bin/subagent-decisions.d.ts', 'dist/bin/extra.js']) {
    assert.ok(codes(auditFiles(baseline({ packageFiles: [path] }))).includes('disallowed_package_path'));
  }
  assert.equal(auditFiles(baseline({ packageFiles: ['dist/bin/aptly.js', 'dist/bin/aptly.d.ts'] })).passed, true);
});

test('npm can bundle the advisory guide without opening the whole docs namespace', () => {
  assert.equal(auditFiles(baseline({ packageFiles: ['docs/SPAWN_CONTEXT.md'], packageMetadata: {license:'MIT',files:['docs/SPAWN_CONTEXT.md']} })).passed,true);
  assert.equal(auditFiles(baseline({ packageFiles: ['docs/ADVISORY_USAGE.md'], packageMetadata: {license:'MIT',files:['docs/ADVISORY_USAGE.md']} })).passed,true);
  for(const path of ['docs/HOST_DISPATCH_CONTRACT.md','docs/CODEX_PROVENANCE_PATCH.md','docs/private.md']){
    assert.ok(codes(auditFiles(baseline({packageFiles:[path]}))).includes('disallowed_package_path'));
  }
  assert.ok(codes(auditFiles(baseline({packageMetadata:{license:'MIT',files:['docs/']}}))).includes('package_allowlist_required'));
});

test('four translated READMEs and user guides can be published together', () => {
  const readmes = ['README.md', 'README.en.md', 'README.zh-CN.md', 'README.ja.md'];
  const guides = ['docs/guide/ko.md', 'docs/guide/en.md', 'docs/guide/zh-CN.md', 'docs/guide/ja.md'];
  const paths = [...readmes, ...guides];
  const report = auditFiles(baseline({
    files: [{ path: 'LICENSE', content: mit }, ...paths.map(path => ({ path, content: 'synthetic public translation' }))],
    packageFiles: ['LICENSE', ...paths],
    packageMetadata: { license: 'MIT', files: [...readmes, 'docs/guide/'] },
  }));
  assert.equal(report.passed, true);
  assert.equal(auditFiles(baseline({ packageFiles: guides, packageMetadata: { license: 'MIT', files: guides } })).passed, true);
});

test('multilingual documentation keeps an exact package allowlist and private exclusions', () => {
  for (const path of ['README.fr.md', 'docs/guide/private.md', 'docs/guide/ko/notes.md', 'docs/guide/HANDOFF.md', 'docs/HANDOFF.md', 'docs/guide/AGENTS.md', 'docs/guide/.local/state.json', 'docs/guide/.env', 'docs/guide/credentials.json']) {
    assert.ok(codes(auditFiles(baseline({ packageFiles: [path] }))).includes('disallowed_package_path'), path);
  }
  for (const files of [['README.fr.md'], ['docs/guide/private.md'], ['docs/'], ['docs/guide/ko/']]) {
    assert.ok(codes(auditFiles(baseline({ packageMetadata: { license: 'MIT', files } }))).includes('package_allowlist_required'));
  }
  assert.ok(codes(auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: 'README.fr.md', content: 'outside the supported README set' }] }))).includes('disallowed_source_path'));
  for (const path of ['docs/guide/AGENTS.md', 'docs/guide/.local/state.json', 'docs/guide/credentials.json']) {
    assert.ok(codes(auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path, content: 'private' }] }))).includes('disallowed_source_path'));
  }
});


test('topic guides use an exact multilingual package allowlist', () => {
  const locales = ['ko', 'en', 'zh-CN', 'ja'];
  const topics = ['installation', 'configuration', 'routing', 'transmission', 'budget', 'statistics', 'troubleshooting', 'advanced', 'benchmarks'];
  const guides = locales.flatMap(locale => [
    `docs/guide/${locale}.md`,
    ...topics.map(topic => `docs/guide/${locale}/${topic}.md`),
  ]);
  assert.equal(guides.length, 40);
  const report = auditFiles(baseline({
    files: [{ path: 'LICENSE', content: mit }, ...guides.map(path => ({ path, content: 'public guide' }))],
    packageFiles: guides,
    packageMetadata: { license: 'MIT', files: guides },
  }));
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  for (const path of [
    'docs/guide/fr/installation.md', 'docs/guide/ko/unknown.md',
    'docs/guide/ko/nested/installation.md', 'docs/guide/ko/AGENTS.md',
    'docs/guide/ko/.local/state.md', 'docs/guide/ko/credentials.json',
  ]) {
    assert.ok(codes(auditFiles(baseline({ packageFiles: [path] }))).includes('disallowed_package_path'), path);
    assert.ok(codes(auditFiles(baseline({ packageMetadata: { license: 'MIT', files: [path] } }))).includes('package_allowlist_required'), path);
  }
  const guide = 'docs/guide/ko/installation.md';
  assert.ok(codes(auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: guide, symlink: true }] }))).includes('source_symlink'));
  const credential = ['sk', 'proj', 'A'.repeat(64)].join('-');
  assert.ok(codes(auditFiles(baseline({ files: [{ path: 'LICENSE', content: mit }, { path: guide, content: credential }] }))).includes('secret_key'));
});
