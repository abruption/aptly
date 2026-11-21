import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTestTemp } from '../test-support/temp.ts';
import { lookupEvidence } from '../test-support/windows-live-codex-evidence.mjs';

function fixture(t) {
  const dir = createTestTemp(t, 'codex-evidence-');
  const database = join(dir, 'state.sqlite');
  const sessionsRoot = join(dir, 'sessions');
  mkdirSync(sessionsRoot);
  const db = new DatabaseSync(database);
  db.exec('CREATE TABLE threads (id TEXT, rollout_path TEXT, cwd TEXT, created_at INTEGER)');
  const insert = db.prepare('INSERT INTO threads VALUES (?, ?, ?, ?)');
  function row(id, parent, cwd, created = 100, root = sessionsRoot) {
    const path = join(root, id + '.jsonl');
    writeFileSync(path, JSON.stringify({ type: 'session_meta', payload: { source: { subagent: { thread_spawn: { parent_thread_id: parent } } } } }) + '\n');
    insert.run(id, path, cwd, created);
    return path;
  }
  t.after(() => db.close());
  return { database, sessionsRoot, row, dir };
}

test('finds only exact-parent children in the bounded time window regardless of cwd', async t => {
  const { database, sessionsRoot, row, dir } = fixture(t);
  const parentFile = row('parent', null, 'C:\\Temp\\A');
  const childFile = row('child', 'parent', 'c:/temp/a');
  row('unrelated', 'other', 'C:\\Temp\\A');
  row('outside', 'parent', 'C:\\Temp\\A', 100, dir);
  row('old', 'parent', 'C:\\Temp\\A', 10);
  row('future', 'parent', 'C:\\Temp\\A', 200);
  const read = [];
  const result = await lookupEvidence({ database, sessionsRoot, parent: 'parent', startMs: 100000, endMs: 100000, attempts: 1,
    readRollout(file) {
      read.push(file);
      return file === parentFile ? { natives: [{ task_exact: true }] } :
        { linked: file === childFile, contexts: [], completed: true, markerReturned: true, tokens: 1 };
    } });
  assert.deepEqual(read, [parentFile, childFile]);
  assert.equal(result.children.length, 1);
  assert.equal(result.children[0].marker_returned, true);
});

test('retries read-only lookup until records and rollout completion are flushed', async t => {
  const { database, sessionsRoot, row } = fixture(t);
  row('parent', null, 'parent');
  let sleeps = 0, complete = false;
  const result = await lookupEvidence({ database, sessionsRoot, parent: 'parent', startMs: 100000, endMs: 100000, attempts: 4, delayMs: 0,
    sleep() { if (++sleeps === 1) row('child', 'parent', 'different'); else complete = true; },
    readRollout(file) { return file.endsWith('parent.jsonl') ? { natives: [{}] } :
      { linked: true, contexts: [], completed: complete, markerReturned: complete, tokens: 1 }; } });
  assert.equal(sleeps, 2);
  assert.equal(result.children[0].completed, true);
});

test('bounds retries when child evidence does not arrive', async t => {
  const { database, sessionsRoot, row } = fixture(t);
  row('parent', null, 'parent');
  let sleeps = 0;
  const result = await lookupEvidence({ database, sessionsRoot, parent: 'parent', startMs: 100000, endMs: 100000, attempts: 3,
    sleep() { sleeps++; }, readRollout() { return { natives: [{}] }; } });
  assert.equal(sleeps, 2);
  assert.deepEqual(result.children, []);
});

test('retries a temporarily locked SQLite database without writing to it', async t => {
  const { database, sessionsRoot, row } = fixture(t);
  row('parent', null, 'parent');
  row('child', 'parent', 'child');
  const lock = new DatabaseSync(database);
  t.after(() => lock.close());
  lock.exec('BEGIN EXCLUSIVE');
  let sleeps = 0;
  const result = await lookupEvidence({ database, sessionsRoot, parent: 'parent', startMs: 100000, endMs: 100000, attempts: 2,
    sleep() { sleeps++; lock.exec('ROLLBACK'); },
    readRollout(file) { return file.endsWith('parent.jsonl') ? { natives: [{}] } :
      { linked: true, contexts: [], completed: true, markerReturned: true, tokens: 1 }; } });
  assert.equal(sleeps, 1);
  assert.equal(result.children.length, 1);
});
