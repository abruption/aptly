import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, readdirSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createTestTemp } from '../test-support/temp.ts';
import { resolveCodexStatisticsBridge } from '../src/statistics-codex.ts';

const parent='00000000-0000-4000-8000-000000000001', child='00000000-0000-4000-8000-000000000002';
const hash=(domain,client,value)=>createHmac('sha256','fixture-key').update(JSON.stringify([domain,client,value])).digest('hex');
const src=(p=parent,path='/root/sort_fixture')=>JSON.stringify({subagent:{thread_spawn:{parent_thread_id:p,depth:1,agent_path:path}}});
function fixture(t,mode='delete') {
 const home=createTestTemp(t,'codex-statistics-'), file=join(home,'state_5.sqlite');
 const db=new DatabaseSync(file); db.exec(`PRAGMA journal_mode=${mode}; CREATE TABLE threads(id TEXT PRIMARY KEY, source TEXT NOT NULL, agent_path TEXT);`);
 db.prepare('INSERT INTO threads VALUES(?,?,?)').run(child,src(),'/root/sort_fixture');
 return {home,file,db,run:(extra={})=>resolveCodexStatisticsBridge({codexHome:home,childId:child,parentId:parent,hash,env:{},...extra})};
}
const miss=r=>assert.deepEqual(r,{status:'unknown',reason:'metadata_unavailable'});
const posixTest=(name,fn)=>test(name,{skip:process.platform==='win32'?'native metadata adapter is unsupported on Windows':false},fn);
posixTest('reads only exact child and returns keyed parent and path bridge',t=>{
 const f=fixture(t); f.db.close();
 assert.deepEqual(f.run(),{status:'matched',parentSessionHash:hash('session','codex',parent),taskPathHash:hash('task_path','codex','/root/sort_fixture')});
 miss(f.run({parentId:child})); miss(f.run({childId:parent}));
});
posixTest('rejects malformed source, wrong parent and ambiguous path',t=>{
 const f=fixture(t);
 for (const [s,p] of [[src(child),'/root/sort_fixture'],[src(parent,'/root/other'),'/root/sort_fixture'],['{}','/root/sort_fixture'],[src(parent,'/root/root'),'/root/root'],['{','/root/sort_fixture']]) {
  f.db.prepare('UPDATE threads SET source=?, agent_path=?').run(s,p); miss(f.run());
 }
 f.db.close();
});
posixTest('rejects redirect config, environment, malformed config and unsafe file paths',t=>{
 const f=fixture(t); f.db.close();
 miss(f.run({env:{CODEX_SQLITE_HOME:'/fixture'}})); miss(f.run({codexHome:'.'}));
 const config=join(f.home,'config.toml');
 writeFileSync(config,'sqlite_home = "/elsewhere"'); miss(f.run());
 writeFileSync(config,'bad = ['); miss(f.run()); unlinkSync(config);
 const link=join(f.home,'link'); linkSync(f.file,link); miss(f.run()); unlinkSync(link);
 renameSync(f.file,link); symlinkSync(link,f.file); miss(f.run());
});
posixTest('refuses unsupported schema and missing WAL sidecars without creating files',t=>{
 const f=fixture(t,'wal'); f.db.close();
 const before=readdirSync(f.home).sort(); miss(f.run()); assert.deepEqual(readdirSync(f.home).sort(),before);
 const d=new DatabaseSync(f.file); d.exec('PRAGMA journal_mode=DELETE; DROP TABLE threads; CREATE TABLE threads(id TEXT, source TEXT, agent_path TEXT)'); d.close();
 miss(f.run());
});
posixTest('reads live WAL when safe existing sidecars are present without creating files',t=>{
 const f=fixture(t,'wal');
 const before=readdirSync(f.home).sort(); assert(before.includes('state_5.sqlite-wal')); assert(before.includes('state_5.sqlite-shm'));
 assert.equal(f.run().status,'matched'); assert.deepEqual(readdirSync(f.home).sort(),before);
 f.db.close();
});
posixTest('accepts owner-controlled readable native metadata and rejects writable paths',t=>{
 const f=fixture(t); f.db.close();
 chmodSync(f.home,0o755); chmodSync(f.file,0o644); assert.equal(f.run().status,'matched');
 chmodSync(f.home,0o775); miss(f.run()); chmodSync(f.home,0o755);
 chmodSync(f.file,0o666); miss(f.run()); chmodSync(f.file,0o600);
 chmodSync(f.home,0o700);
});
