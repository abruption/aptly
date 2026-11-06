import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{copyFileSync,lstatSync,mkdirSync,readFileSync,readdirSync,renameSync,symlinkSync,writeFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {createTestTemp} from '../test-support/temp.ts';
import {acquireLedgerLock} from '../src/ledger-lock.ts';
import {protectNewWindowsPrivateDirectory} from '../src/windows-private.ts';

function fixture(t){
 let cleanup=()=>{};
 const dir=createTestTemp({after:fn=>{cleanup=fn;}},'codex-ledger-lock-'),leases=[];
 if(process.platform==='win32')protectNewWindowsPrivateDirectory(dir);
 t.after(()=>{for(const lease of leases)try{lease.release();}catch{}cleanup();});
 return {dir,path:join(dir,'ledger.json'),acquire(path=join(dir,'ledger.json')){const lease=acquireLedgerLock(path);leases.push(lease);return lease;}};
}
const fixedError=error=>['ledger_locked','ledger_error'].includes(error?.code);

test('persistent SQLite gate serializes live connections and retains its canonical inode after release',t=>{
 const f=fixture(t),first=f.acquire();first.assertHeld();
 const path=f.path+'.lock',before=lstatSync(path);
 assert.ok(before.isFile());assert.ok(before.size>0);
 assert.throws(()=>f.acquire(),error=>error?.code==='ledger_locked');
 first.assertHeld();first.release();
 assert.equal(lstatSync(path).ino,before.ino);assert.ok(readFileSync(path).length>0);
 const successor=f.acquire();successor.assertHeld();
 first.release();successor.assertHeld();
});

test('empty, unknown and corrupt pre-existing gate files fail closed without replacing their bytes',t=>{
 for(const [index,contents] of ['','legacy-unrecognized-lock','SQLite format 3\0corrupt-synthetic'].entries()){
  const f=fixture(t),path=join(f.dir,'ledger-'+index+'.json');
  writeFileSync(path+'.lock',contents,{mode:0o600});const before=lstatSync(path+'.lock');
  assert.throws(()=>f.acquire(path),fixedError);
  assert.equal(readFileSync(path+'.lock','utf8'),contents);assert.equal(lstatSync(path+'.lock').ino,before.ino);
 }
});

test('a legacy owner arriving during initialization is preserved by no-replace publication',t=>{
 const f=fixture(t),link=fs.linkSync;let incumbent;
 fs.linkSync=(source,target)=>{
  writeFileSync(target,'',{flag:'wx',mode:0o600});incumbent=lstatSync(target).ino;
  return link(source,target);
 };syncBuiltinESMExports();
 try{
  assert.throws(()=>f.acquire(),error=>error?.code==='ledger_locked');
  assert.equal(readFileSync(f.path+'.lock','utf8'),'');assert.equal(lstatSync(f.path+'.lock').ino,incumbent);
  assert.deepEqual(readdirSync(f.dir),['ledger.json.lock']);
 }finally{fs.linkSync=link;syncBuiltinESMExports();}
});

test('redirected gate ancestors are rejected without touching their target',t=>{
 const f=fixture(t),target=join(f.dir,'actual'),alias=join(f.dir,'alias');mkdirSync(target,{mode:0o700});
 symlinkSync(target,alias,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>f.acquire(join(alias,'ledger.json')),fixedError);
});

test('an externally changed journal protocol is rejected rather than silently reconfigured',async t=>{
 const f=fixture(t),initial=f.acquire();initial.release();
 const {DatabaseSync}=await import('node:sqlite');
 const changed=new DatabaseSync(f.path+'.lock');
 try{changed.exec('PRAGMA journal_mode=WAL');}finally{changed.close();}
 assert.throws(()=>f.acquire(),error=>error?.code==='ledger_locked');
});

test('observed canonical gate replacement invalidates the old holder and release preserves replacement',t=>{
 const f=fixture(t),holder=f.acquire(),path=f.path+'.lock',moved=join(f.dir,'retired-gate');
 try{renameSync(path,moved);}catch(error){
  if(process.platform==='win32'&&['EPERM','EACCES','EBUSY'].includes(error?.code)){holder.assertHeld();return;}
  throw error;
 }
 const replacementPath=join(f.dir,'replacement.json'),replacement=f.acquire(replacementPath);replacement.release();
 copyFileSync(replacementPath+'.lock',path);const bytes=readFileSync(path),stat=lstatSync(path);
 assert.throws(()=>holder.assertHeld(),fixedError);
 try{holder.release();}catch(error){assert.ok(fixedError(error));}
 assert.equal(lstatSync(path).ino,stat.ino);assert.deepEqual(readFileSync(path),bytes);
});
