// Read only the session metadata of recent candidates before opening linked rollouts.
import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function isInside(root, file) {
  const path = relative(root, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function rolloutFile(root, file) {
  if (!isAbsolute(file) || extname(file) !== '.jsonl' || !isInside(root, file)) return;
  const resolved = realpathSync(file);
  if (isInside(realpathSync(root), resolved) && statSync(resolved).isFile()) return resolved;
}

function parentOf(file) {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(65536);
    const length = readSync(fd, buffer, 0, buffer.length, 0);
    const newline = buffer.indexOf(10, 0);
    if (newline < 0 || newline >= length) throw Error('session_meta_pending');
    const entry = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
    return entry.type === 'session_meta' ? entry.payload?.source?.subagent?.thread_spawn?.parent_thread_id : undefined;
  } finally {
    closeSync(fd);
  }
}

export async function lookupEvidence({ database, sessionsRoot, parent, startMs, endMs, readRollout, attempts = 6, delayMs = 500, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let latest = { natives: [], children: [] }, lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const db = new DatabaseSync(database, { readOnly: true });
      try {
        const p = db.prepare('SELECT rollout_path FROM threads WHERE id=?').get(parent);
        const parentFile = p?.rollout_path && rolloutFile(sessionsRoot, p.rollout_path);
        if (!parentFile) throw Error('parent_rollout_unavailable');
        const natives = readRollout(parentFile, parent).natives;
        // A time window and a hard cap bound the lookup without relying on cwd spelling.
        const rows = db.prepare('SELECT id, rollout_path FROM threads WHERE created_at>=? AND created_at<=? LIMIT 257')
          .all(Math.floor(startMs / 1000) - 5, Math.floor(endMs / 1000) + 5);
        if (rows.length > 256) throw Error('too_many_evidence_candidates');
        const children = [];
        let pending = false;
        for (const row of rows) {
          if (row.id === parent || !row.rollout_path) continue;
          try {
            const file = rolloutFile(sessionsRoot, row.rollout_path);
            if (!file || parentOf(file) !== parent) continue;
            const child = readRollout(file, parent);
            if (child.linked) children.push({ contexts: child.contexts, completed: child.completed, marker_returned: child.markerReturned, output_tokens: child.tokens });
          } catch { pending = true; }
        }
        latest = { natives, children };
        lastError = undefined;
        if (!pending && natives.length && children.length && children.every(c => c.completed)) return latest;
      } finally { db.close(); }
    } catch (error) { lastError = error; }
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  if (lastError) throw lastError;
  return latest;
}
