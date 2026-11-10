import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'smol-toml';
import { assertNoRedirectedAncestors, readRegularFile } from './files.ts';

/** The callback is supplied by the statistics store and uses its private installation key. */
export type CodexBridgeHash = (domain: 'session' | 'task_path', client: 'codex', value: string) => string;
export type CodexBridge = { status: 'matched'; parentSessionHash: string; taskPathHash: string } | { status: 'unknown'; reason: 'metadata_unavailable' };
const unknown: CodexBridge = { status: 'unknown', reason: 'metadata_unavailable' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pathPattern = /^\/root(?:\/[a-z0-9_]+)+$/;
const own = (s: Stats) => typeof process.getuid === 'function' && s.uid === process.getuid();
type Identity = { dev: number; ino: number };
function safeFile(path: string): Identity {
 assertNoRedirectedAncestors(path);
 const s = lstatSync(path);
 if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || !own(s) || (s.mode & 0o022)) throw new Error('unsafe');
 return { dev:s.dev, ino:s.ino };
}
function same(a: Identity, b: Identity): boolean { return a.dev === b.dev && a.ino === b.ino; }
function optionalFile(path: string): Identity | null {
 try { return safeFile(path); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
function header(path: string, identity: Identity): number {
 const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
 try {
  const s = fstatSync(fd), bytes = Buffer.alloc(20);
  if (!s.isFile() || s.nlink !== 1 || !own(s) || (s.mode & 0o022) || !same(identity,s) || readSync(fd, bytes, 0, 20, 0) !== 20 ||
      bytes.subarray(0,16).toString('binary') !== 'SQLite format 3\0' || bytes[18] !== bytes[19] || ![1,2].includes(bytes[18])) throw new Error('unsafe');
  return bytes[18];
 } finally { closeSync(fd); }
}
function canonicalPath(value: unknown): value is string {
 return typeof value === 'string' && value.length <= 1024 && pathPattern.test(value) && !value.split('/').slice(2).includes('root');
}
/**
 * Read exactly one native child metadata row. No transcript, model, or effort is read.
 * Existing SQLite SHM read marks can change during a read; files are never repaired or created intentionally.
 * The caller must pass only its explicit operator-selected home, never Hook-supplied paths.
 * Pre/post identity checks cannot eliminate a malicious same-account path replacement race.
 */
export function resolveCodexStatisticsBridge(options: {
 codexHome: string; childId: string; parentId: string; hash: CodexBridgeHash;
 env?: NodeJS.ProcessEnv;
}): CodexBridge {
 try {
  if (process.platform === 'win32' || typeof options?.hash !== 'function' || !uuid.test(options.childId) || !uuid.test(options.parentId) ||
      typeof options.codexHome !== 'string' || !isAbsolute(options.codexHome) || resolve(options.codexHome) !== options.codexHome ||
      (options.env ?? process.env).CODEX_SQLITE_HOME) return unknown;
  const home = options.codexHome;
  assertNoRedirectedAncestors(home);
  const directory = lstatSync(home);
  if (!directory.isDirectory() || !own(directory) || (directory.mode & 0o022)) return unknown;
  const config = join(home,'config.toml'), configIdentity = optionalFile(config);
  let configBytes: Buffer | undefined;
  if (configIdentity) {
   configBytes = readRegularFile(config,{maxBytes:1024*1024});
   const parsed = parse(new TextDecoder('utf-8',{fatal:true}).decode(configBytes));
   if (Object.hasOwn(parsed,'sqlite_home') || !same(configIdentity,safeFile(config))) return unknown;
  }
  const dbPath = join(home,'state_5.sqlite'), dbIdentity = safeFile(dbPath);
  const walPath = `${dbPath}-wal`, shmPath = `${dbPath}-shm`, journalPath = `${dbPath}-journal`;
  const wal = optionalFile(walPath), shm = optionalFile(shmPath);
  if (optionalFile(journalPath)) return unknown;
  const mode = header(dbPath,dbIdentity);
  if ((mode === 2 && (!wal || !shm)) || (mode === 1 && (wal || shm))) return unknown;
  let db: DatabaseSync | undefined;
  let row: Record<string, unknown> | undefined;
  try {
   db = new DatabaseSync(dbPath,{readOnly:true,allowExtension:false});
   db.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF');
   const schema = db.prepare("SELECT type FROM sqlite_schema WHERE name = 'threads'").all();
   if (schema.length !== 1 || schema[0].type !== 'table') return unknown;
   const columns = db.prepare('PRAGMA table_info(threads)').all();
   for (const [name,pk,notnull] of [['id',1,0],['source',0,1],['agent_path',0,0]] as const) {
    const found = columns.filter(c=>c.name===name);
    if (found.length!==1 || found[0].type !== 'TEXT' || found[0].pk !== pk || found[0].notnull !== notnull) return unknown;
   }
   const rows = db.prepare('SELECT id, source, agent_path FROM threads WHERE id = ? LIMIT 2').all(options.childId);
   if (rows.length !== 1) return unknown;
   row = rows[0];
  } finally { db?.close(); }
  const directoryAfter = lstatSync(home);
  if (!same(dbIdentity,safeFile(dbPath)) || !same(directory,directoryAfter) || !own(directoryAfter) || (directoryAfter.mode & 0o022) ||
      (wal ? !same(wal,safeFile(walPath)) : optionalFile(walPath)!==null) ||
      (shm ? !same(shm,safeFile(shmPath)) : optionalFile(shmPath)!==null) || optionalFile(journalPath) ||
      (configIdentity ? !same(configIdentity,safeFile(config)) || !configBytes!.equals(readRegularFile(config,{maxBytes:1024*1024})) : optionalFile(config)!==null)) return unknown;
  if (!row || row.id !== options.childId || typeof row.source !== 'string' || row.source.length > 65536 || !canonicalPath(row.agent_path)) return unknown;
  const source: unknown = JSON.parse(row.source);
  if (!source || typeof source !== 'object') return unknown;
  const spawn = (source as {subagent?: {thread_spawn?: {parent_thread_id?: unknown;agent_path?: unknown}}}).subagent?.thread_spawn;
  if (!spawn || spawn.parent_thread_id !== options.parentId || spawn.agent_path !== row.agent_path) return unknown;
  const parentSessionHash = options.hash('session','codex',options.parentId), taskPathHash = options.hash('task_path','codex',row.agent_path);
  if (!/^[a-f0-9]{64}$/.test(parentSessionHash) || !/^[a-f0-9]{64}$/.test(taskPathHash)) return unknown;
  return {status:'matched', parentSessionHash, taskPathHash};
 } catch { return unknown; }
}
