import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRelease, createReleaseManifest, verifyReleaseArtifact, safeReleaseError } from '../scripts/publish-check.ts';
import { createTestTemp } from '../test-support/temp.ts';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t, extra = {}) {
  const cwd = createTestTemp(t, 'codex-publish-check-');
  const pkg = { name: 'aptly', version: '0.1.0', private: false, repository: { type: 'git', url: 'git+https://github.com/example/aptly.git' }, ...extra };
  const write = () => writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2) + '\n'); write();
  writeFileSync(join(cwd, '.gitignore'), 'dist/\n.npmrc\n');
  git(cwd, ['init', '-q', '--initial-branch=main']);
  const commit = () => { git(cwd, ['add', 'package.json', '.gitignore']); git(cwd, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture']); };
  commit(); const tag = 'v' + pkg.version; git(cwd, ['tag', tag]);
  const sha = git(cwd, ['rev-parse', 'HEAD']);
  const env = { PATH: process.env.PATH, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'example/aptly', GITHUB_REF: 'refs/tags/' + tag, GITHUB_SHA: sha, RELEASE_REPOSITORY_PRIVATE: 'false', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc-value' };
  const options = { cwd, env, tag, mode: 'publish', nodeVersion: '24.22.1', npmVersion: '11.19.1' };
  const archiveDir = join(cwd, 'artifact'); mkdirSync(archiveDir, { mode: 0o700 });
  const makeArchive = (name = 'aptly-' + pkg.version + '.tgz', archivePkg = pkg) => {
    const staging = join(cwd, 'staging'); mkdirSync(join(staging, 'package'), { recursive: true });
    writeFileSync(join(staging, 'package', 'package.json'), JSON.stringify(archivePkg, null, 2) + '\n');
    execFileSync('tar', ['-czf', join(archiveDir, name), '-C', staging, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    writeFileSync(join(archiveDir, 'pack.json'), JSON.stringify([{ name: pkg.name, version: pkg.version, filename: name }]));
    return join(archiveDir, name);
  };
  return { cwd, pkg, env, options, archiveDir, makeArchive, write, commit, sha };
}
const code = (fn, expected) => assert.throws(fn, e => safeReleaseError(e) === expected);

test('private unpublished package is allowed for dry-run but blocked for actual publication', t => {
  const f = fixture(t, { private: true, repository: undefined });
  assert.equal(checkRelease({ ...f.options, mode: 'dry-run', env: { GITHUB_REPOSITORY: 'example/aptly', GITHUB_REF: 'refs/heads/main' } }).mode, 'dry-run');
  code(() => checkRelease(f.options), 'release_package_private');
  f.makeArchive();
  assert.equal(createReleaseManifest({ ...f.options, mode: 'dry-run', archiveDir: f.archiveDir }).name, 'aptly');
});

test('publish preflight binds the version tag, checkout and workflow run commit', t => {
  const f = fixture(t); assert.equal(checkRelease(f.options).source_sha, f.sha);
  code(() => checkRelease({ ...f.options, tag: 'v0.2.0' }), 'release_tag_version_mismatch');
  code(() => checkRelease({ ...f.options, env: { ...f.env, GITHUB_REF: 'refs/heads/main' } }), 'release_publish_ref_mismatch');
  code(() => checkRelease({ ...f.options, env: { ...f.env, GITHUB_SHA: 'a'.repeat(40) } }), 'release_publish_ref_mismatch');
  writeFileSync(join(f.cwd, 'package.json'), JSON.stringify({ ...f.pkg, description: 'uncommitted' }));
  code(() => checkRelease(f.options), 'release_dirty_checkout');
  f.write(); git(f.cwd, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-q', '-m', 'second']);
  code(() => checkRelease(f.options), 'release_tag_checkout_mismatch');
});

test('publication requires matching public GitHub metadata and public npm registry settings', t => {
  for (const [extra, expected] of [
    [{ repository: undefined }, 'release_repository_metadata_required'],
    [{ repository: { type: 'git', url: 'git+https://github.com/example/elsewhere.git' } }, 'release_repository_mismatch'],
    [{ repository: { type: 'git', url: 'https://person:credential@github.com/example/aptly.git' } }, 'release_repository_mismatch'],
    [{ publishConfig: { registry: 'https://example.invalid' } }, 'release_registry_mismatch'],
    [{ publishConfig: { access: 'restricted' } }, 'release_access_not_public'],
    [{ publishConfig: { tag: 'beta' } }, 'release_dist_tag_mismatch'],
    [{ publishConfig: { provenance: false } }, 'release_provenance_disabled'],
    [{ publishConfig: { _authToken: 'synthetic-auth-value' } }, 'release_publish_config_unsupported'],
  ]) { const f = fixture(t, extra); code(() => checkRelease(f.options), expected); }
  const f = fixture(t);
  code(() => checkRelease({ ...f.options, env: { ...f.env, RELEASE_REPOSITORY_PRIVATE: 'true' } }), 'release_repository_not_public');
  for (const key of ['NPM_TOKEN', 'NODE_AUTH_TOKEN']) code(() => checkRelease({ ...f.options, env: { ...f.env, [key]: 'synthetic-auth-value' } }), 'release_token_auth_forbidden');
  writeFileSync(join(f.cwd, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
  code(() => checkRelease(f.options), 'release_project_npmrc_forbidden');
});

test('toolchain floor and strict tag syntax fail with fixed codes', t => {
  const f = fixture(t);
  code(() => checkRelease({ ...f.options, nodeVersion: '22.14.0' }), 'release_node_too_old');
  code(() => checkRelease({ ...f.options, nodeVersion: '24.0.0-rc.1' }), 'release_node_too_old');
  code(() => checkRelease({ ...f.options, npmVersion: '11.5.0' }), 'release_npm_too_old');
  code(() => checkRelease({ ...f.options, npmVersion: '11.5.1-rc.1' }), 'release_npm_too_old');
  assert.equal(checkRelease({ ...f.options, npmVersion: '11.5.1' }).version, '0.1.0');
  for (const tag of ['0.1.0', 'v00.1.0', 'v0.1.0-01', 'v0.1.0-rc..1', 'v0.1.0\n', 'v0.1.0;echo']) code(() => checkRelease({ ...f.options, tag }), 'release_tag_version_mismatch');
});

test('manifest and publish verification use the exact tested archive without lifecycle execution', t => {
  const f = fixture(t); f.makeArchive();
  const opts = { ...f.options, archiveDir: f.archiveDir };
  const manifest = createReleaseManifest(opts);
  assert.equal(manifest.dist_tag, 'latest'); assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verifyReleaseArtifact(opts).sha256, manifest.sha256);
  assert.equal(readFileSync(join(f.archiveDir, 'SHA256SUMS'), 'utf8'), manifest.sha256 + '  ' + manifest.filename + '\n');
  code(() => createReleaseManifest(opts), 'release_manifest_already_exists');
  assert.equal(verifyReleaseArtifact(opts).sha256, manifest.sha256);
  code(() => verifyReleaseArtifact({ ...opts, env: { ...f.env, ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' } }), 'release_oidc_environment_missing');
});

test('modified archive, source binding and metadata are rejected before publication', t => {
  const f = fixture(t); const archive = f.makeArchive(); const opts = { ...f.options, archiveDir: f.archiveDir };
  createReleaseManifest(opts); appendFileSync(archive, 'extra bytes');
  code(() => verifyReleaseArtifact(opts), 'release_archive_integrity_mismatch');
  const g = fixture(t); g.makeArchive(undefined, { ...g.pkg, version: '8.0.0' });
  code(() => createReleaseManifest({ ...g.options, archiveDir: g.archiveDir }), 'release_archive_metadata_mismatch');
  const h = fixture(t); h.makeArchive(); const hOpts = { ...h.options, archiveDir: h.archiveDir }; createReleaseManifest(hOpts);
  const path = join(h.archiveDir, 'release-manifest.json'), manifest = JSON.parse(readFileSync(path, 'utf8')); manifest.source_sha = 'a'.repeat(40); writeFileSync(path, JSON.stringify(manifest));
  code(() => verifyReleaseArtifact(hOpts), 'release_manifest_mismatch');
});

test('unsafe filenames and symlinks cannot escape the artifact directory', t => {
  for (const filename of ['../outside.tgz', '/absolute.tgz', 'nested/file.tgz', 'aptly.tgz\n', 'aptly.tgz;echo']) {
    const f = fixture(t); writeFileSync(join(f.archiveDir, 'pack.json'), JSON.stringify([{ name: 'aptly', version: '0.1.0', filename }]));
    code(() => createReleaseManifest({ ...f.options, archiveDir: f.archiveDir }), 'release_archive_filename_invalid');
  }
  const f = fixture(t); const actual = f.makeArchive();
  symlinkSync(actual, join(f.archiveDir, 'linked.tgz')); writeFileSync(join(f.archiveDir, 'pack.json'), JSON.stringify([{ name: 'aptly', version: '0.1.0', filename: 'linked.tgz' }]));
  code(() => createReleaseManifest({ ...f.options, archiveDir: f.archiveDir }), 'release_unsafe_file');
});

test('gzip header corruption fails the integrity gate before archive metadata parsing', t => {
  const f = fixture(t); const archive = f.makeArchive(); const opts = { ...f.options, archiveDir: f.archiveDir };
  createReleaseManifest(opts);
  const damaged = readFileSync(archive); damaged[0] ^= 0xff; writeFileSync(archive, damaged);
  code(() => verifyReleaseArtifact(opts), 'release_archive_integrity_mismatch');
});

test('prereleases stay on next and dry-run artifacts cannot be promoted without a publish validation', t => {
  const f = fixture(t, { version: '0.1.0-rc.1' }); f.makeArchive();
  assert.equal(createReleaseManifest({ ...f.options, archiveDir: f.archiveDir, mode: 'dry-run' }).dist_tag, 'next');
  code(() => verifyReleaseArtifact({ ...f.options, archiveDir: f.archiveDir }), 'release_manifest_mismatch');
});

test('failed two-file manifest creation preserves preexisting artifacts', t => {
  const f = fixture(t); f.makeArchive(); writeFileSync(join(f.archiveDir, 'SHA256SUMS'), 'operator-owned');
  code(() => createReleaseManifest({ ...f.options, archiveDir: f.archiveDir }), 'release_manifest_already_exists');
  assert.equal(existsSync(join(f.archiveDir, 'release-manifest.json')), false);
  assert.equal(readFileSync(join(f.archiveDir, 'SHA256SUMS'), 'utf8'), 'operator-owned');
});

test('CLI failures emit only controlled diagnostics and never invoke publish', t => {
  const f = fixture(t); const helper = fileURLToPath(new URL('../scripts/publish-check.ts', import.meta.url));
  const result = spawnSync(process.execPath, [helper, 'preflight', '--tag', 'v0.2.0', '--mode', 'publish'], { cwd: f.cwd, env: { ...process.env, NPM_TOKEN: 'synthetic-value-not-to-log' }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { status: 'error', code: 'release_tag_version_mismatch' });
  assert.equal(result.stderr.includes('synthetic-value-not-to-log'), false);
  assert.equal(safeReleaseError(new Error('unexpected private details')), 'release_check_failed');
});
