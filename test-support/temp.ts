import { accessSync, chmodSync, constants, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const within = (path, root) => path === root || path.startsWith(root + sep);

/** Select a root without creating anything; explicit roots must be absolute. */
export function temporaryRoot({ cwd = process.cwd(), env = process.env, systemTemp = tmpdir() } = {}) {
  const current = resolve(cwd);
  const volume = current.match(/^\/Volumes\/[^/]+(?=\/|$)/)?.[0];
  const expected = volume ? join(volume, 'tmp') : resolve(systemTemp);
  const override = env.POC_TEST_TMP_ROOT;
  if (override !== undefined && (typeof override !== 'string' || !override || !isAbsolute(override))) {
    throw new Error('invalid_test_temp_root');
  }
  const root = override === undefined ? expected : resolve(override);
  if (volume && !within(root, expected)) throw new Error('test_temp_root_outside_work_volume');
  return { root, volume: volume ?? null };
}

function directoryWithoutSymlink(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_test_temp_root');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    mkdirSync(path, { mode: 0o700 });
  }
}

/** Creates only one owned codex-* directory and registers cleanup for that directory. */
export function createTestTemp(t, prefix = 'codex-test-') {
  if (!t || typeof t.after !== 'function' || !/^codex-[a-z0-9-]+-$/.test(prefix)) throw new Error('invalid_test_temp_request');
  const { root, volume } = temporaryRoot();
  if (volume) {
    // The operator verifies volume UUID/unlocked state before starting work.
    // A missing/unmounted/read-only volume must fail; never use another root.
    const mount = lstatSync(volume);
    if (!mount.isDirectory() || mount.isSymbolicLink() || mount.dev === statSync(dirname(volume)).dev) {
      throw new Error('test_work_volume_not_mounted');
    }
    accessSync(volume, constants.W_OK);
    const base = join(volume, 'tmp');
    directoryWithoutSymlink(base);
    let path = base;
    for (const part of relative(base, root).split(sep).filter(Boolean)) {
      path = join(path, part);
      directoryWithoutSymlink(path);
    }
    if (!within(realpathSync(root), realpathSync(base))) throw new Error('unsafe_test_temp_root');
  } else {
    mkdirSync(root, { recursive: true });
  }
  accessSync(root, constants.W_OK);
  const dir = mkdtempSync(join(root, prefix));
  chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
