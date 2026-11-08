import { randomUUID } from 'node:crypto';
import { closeSync, linkSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { DatabaseSync as Connection } from 'node:sqlite';
import { assertNoRedirectedAncestors, assertPrivateStatePath } from './files.ts';

const require = createRequire(import.meta.url);
const applicationId = 0x4150544c;
const userVersion = 1;
type LockCode = 'ledger_locked' | 'ledger_error';
function fail(code: LockCode): never { throw Object.assign(new Error(code), { code }); }
const codeOf = (error: unknown): unknown => error && typeof error === 'object' && 'code' in error ? error.code : undefined;
const sqliteCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object' || !('errcode' in error) || typeof error.errcode !== 'number') return;
  return error.errcode & 0xff;
};
interface Identity { dev: bigint; ino: bigint; uid: bigint; mode: bigint }
function identity(path: string, directory = false): Identity {
  const stat = lstatSync(path, { bigint: true });
  if ((directory ? !stat.isDirectory() : !stat.isFile()) || stat.isSymbolicLink() || stat.ino === 0n) fail('ledger_error');
  if (process.platform !== 'win32' && ((stat.mode & 0o077n) !== 0n || (process.getuid && stat.uid !== BigInt(process.getuid())))) fail('ledger_error');
  return { dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode };
}
function same(actual: Identity, expected: Identity): boolean {
  return actual.dev === expected.dev && actual.ino === expected.ino && actual.uid === expected.uid && actual.mode === expected.mode;
}
function close(connection: Connection | undefined, transaction: boolean): boolean {
  if (!connection) return true;
  let success = true;
  if (transaction) { try { connection.exec('ROLLBACK'); } catch { success = false; } }
  try { connection.close(); } catch { success = false; }
  return success;
}

/**
 * Publish a completely initialized gate with an atomic no-replace hard link.
 * Existing empty/unknown locks belong to the legacy protocol and are untouched.
 * Never open an old stage alias: a crash after link may leave it sharing the gate
 * inode, and an ordinary fs close could cancel this process's SQLite POSIX lock.
 */
function initialize(path: string, Database: typeof import('node:sqlite').DatabaseSync): void {
  const stage = join(dirname(path), `.aptly-lock-init-${randomUUID()}`);
  let created = false, connection: Connection | undefined, transaction = false;
  try {
    const fd = openSync(stage, 'wx', 0o600); created = true; closeSync(fd);
    assertPrivateStatePath(stage); identity(stage);
    connection = new Database(stage);
    connection.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); transaction = true;
    connection.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=${userVersion}; COMMIT`); transaction = false;
    connection.close(); connection = undefined;
    try { linkSync(stage, path); }
    catch (error) { if (codeOf(error) !== 'EEXIST') throw error; }
  } finally {
    close(connection, transaction);
    // Only our exclusive, unique stage is removed; the canonical gate persists.
    if (created) unlinkSync(stage);
  }
}

export interface LedgerLock {
  /** lstat-only while held: never open/read/close the canonical SQLite file. */
  assertHeld(): void;
  /** Roll back and close this connection. Never unlink the persistent gate. */
  release(): void;
}

/** Local, hard-link-capable filesystems only; no PID or stale-age recovery. */
export function acquireLedgerLock(ledgerPath: string, options: { initialize?: boolean } = {}): LedgerLock {
  let connection: Connection | undefined, transaction = false;
  try {
    const path = `${ledgerPath}.lock`;
    assertPrivateStatePath(ledgerPath);
    assertPrivateStatePath(path);
    const parent = identity(dirname(path), true);
    // Load only for persistent ledgers. Fixture-only callers need no SQLite.
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    try { lstatSync(path); }
    catch (error) { if (codeOf(error) !== 'ENOENT') throw error; if(options.initialize===false)fail('ledger_error'); initialize(path, DatabaseSync); }
    assertPrivateStatePath(path);
    const before = identity(path);
    // Do not let SQLite initialize an existing empty legacy ownership marker.
    if (lstatSync(path).size < 512) fail('ledger_locked');
    connection = new DatabaseSync(path);
    const assertIdentity = () => {
      // ACLs are checked before opening; while held use only path metadata.
      assertNoRedirectedAncestors(dirname(path));
      if (!same(identity(dirname(path), true), parent) || !same(identity(path), before)) fail('ledger_error');
    };
    assertIdentity();
    connection.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); transaction = true;
    assertIdentity();
    const app = connection.prepare('PRAGMA application_id').get();
    const version = connection.prepare('PRAGMA user_version').get();
    const journal = connection.prepare('PRAGMA journal_mode').get();
    if (app?.application_id !== applicationId || version?.user_version !== userVersion || journal?.journal_mode !== 'delete') fail('ledger_locked');
    assertIdentity();
    const owned = connection;
    let released = false;
    return {
      assertHeld() {
        if (released) fail('ledger_error');
        try { assertIdentity(); } catch { fail('ledger_error'); }
      },
      release() {
        if (released) return;
        released = true;
        if (!close(owned, true)) fail('ledger_error');
      },
    };
  } catch (error) {
    close(connection, transaction);
    const code = codeOf(error), sqlite = sqliteCode(error);
    if (code === 'ledger_locked' || sqlite === 5 || sqlite === 6 || sqlite === 11 || sqlite === 26) fail('ledger_locked');
    fail('ledger_error');
  }
}
