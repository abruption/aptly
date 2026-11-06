import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFileSync,existsSync,writeFileSync,lstatSync,linkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Router} from '../src/core.ts';
import {acquireLedgerLock} from '../src/ledger-lock.ts';
import {createTestTemp} from '../test-support/temp.ts';
import {protectNewWindowsPrivateDirectory} from '../src/windows-private.ts';
import {ledgerPolicy,ledgerRequest} from '../test-support/ledger-child.ts';

const worker=fileURLToPath(new URL('../test-support/ledger-child.ts',import.meta.url));
const ledger=p=>JSON.parse(readFileSync(p,'utf8'));
function fixture(t){
 let cleanup=()=>{};
 const dir=createTestTemp({after:fn=>{cleanup=fn;}},'codex-ledger-crash-'),children=[];
 if(process.platform==='win32')protectNewWindowsPrivateDirectory(dir);
 t.after(async()=>{
  for(const child of children)if(child.process.exitCode===null&&child.process.signalCode===null)child.process.kill('SIGKILL');
  await Promise.all(children.map(child=>child.exited));cleanup();
 });
 const start=(path,id,mode='wait')=>{
  const process=fork(worker,[path,id,mode],{execArgv:[],stdio:['ignore','ignore','pipe','ipc']});
  const messages=[],waiters=new Set();
  process.on('message',message=>{messages.push(message);for(const fn of waiters)fn();});
  const exited=new Promise(resolve=>process.once('exit',(code,signal)=>{resolve({code,signal});for(const fn of waiters)fn();}));
  const waitFor=type=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{waiters.delete(check);reject(Error('fixture_handshake_timeout'));},30000);
   const check=()=>{
    const message=messages.find(message=>message?.type===type);
    if(message){clearTimeout(timer);waiters.delete(check);resolve(message);}
    else if(process.exitCode!==null||process.signalCode!==null){clearTimeout(timer);waiters.delete(check);reject(Error('fixture_exited_before_handshake'));}
   };
   waiters.add(check);check();
  });
  const child={process,messages,exited,waitFor};children.push(child);return child;
 };
 return {dir,path:join(dir,'ledger.json'),start};
}

for(const signal of ['SIGTERM','SIGKILL'] as const)test(`${signal}: owner exit releases the gate and preserves unknown reservations and completed cache`,async t=>{
 const f=fixture(t);let calls=0;
 const provider=async()=>{calls++;return {choice:'codex-routine',confidence:1};};
 await new Router({ledgerPath:f.path,policy:ledgerPolicy(),provider}).recommend(ledgerRequest('completed'));
 const child=f.start(f.path,'interrupted');await child.waitFor('provider_enter');
 const reserved=ledger(f.path);assert.equal(reserved.calls,2);assert.equal(reserved.requests.interrupted.state,'unknown');
 const gate=readFileSync(f.path+'.lock');assert.ok(gate.length>0);
 assert.equal(child.process.kill(signal),true);await child.exited;
 const restarted=new Router({ledgerPath:f.path,policy:ledgerPolicy(),provider});
 assert.equal((await restarted.recommend(ledgerRequest('interrupted'))).reason,'outcome_unknown');
 assert.equal((await restarted.recommend(ledgerRequest('completed'))).cached,true);assert.equal(calls,1);
 assert.equal((await restarted.recommend(ledgerRequest('fresh'))).status,'recommended');assert.equal(calls,2);
 const recovered=ledger(f.path);assert.equal(recovered.calls,3);assert.equal(recovered.requests.interrupted.state,'unknown');
 assert.equal(Object.values(recovered.days).reduce((sum,n)=>sum+Number(n),0),3);
 assert.ok(Math.abs(recovered.estimated_usd-3*ledgerPolicy().estimated_call_usd)<1e-12);
 assert.deepEqual(readFileSync(f.path+'.lock'),gate);
});

test('a live owner blocks both old-ID and fresh requests without another provider call',async t=>{
 const f=fixture(t),child=f.start(f.path,'active');await child.waitFor('provider_enter');
 const before=readFileSync(f.path,'utf8');let calls=0;
 const router=new Router({ledgerPath:f.path,policy:ledgerPolicy(),provider:async()=>{calls++;return{choice:'codex-routine'};}});
 for(const id of ['active','fresh'])assert.equal((await router.recommend(ledgerRequest(id))).reason,'ledger_locked');
 assert.equal(calls,0);assert.equal(readFileSync(f.path,'utf8'),before);
 child.process.send({type:'release'});assert.equal((await child.waitFor('result')).result.status,'recommended');await child.exited;
 assert.equal((await router.recommend(ledgerRequest('active'))).cached,true);
});

for(const interrupted of [false,true])test(`concurrent ${interrupted?'recovery after a crashed owner':'first initialization'} admits at most one provider and keeps its successor gate`,async t=>{
 const f=fixture(t);
 if(interrupted){const crashed=f.start(f.path,'interrupted');await crashed.waitFor('provider_enter');crashed.process.kill('SIGKILL');await crashed.exited;}
 const contenders=Array.from({length:5},(_,index)=>f.start(f.path,'recovery_'+index));
 const first=await Promise.race(contenders.map(child=>Promise.race([
  child.waitFor('provider_enter').then(message=>({child,message})),
  child.waitFor('result').then(message=>({child,message}))
 ])));
 // One contender must eventually acquire; busy contenders may finish first.
 let winner=first.message.type==='provider_enter'?first.child:undefined;
 if(!winner){
  winner=await Promise.any(contenders.map(async child=>{await child.waitFor('provider_enter');return child;}));
 }
 const gate=lstatSync(f.path+'.lock');
 await Promise.all(contenders.filter(child=>child!==winner).map(async child=>assert.equal((await child.waitFor('result')).result.reason,'ledger_locked')));
 assert.equal(contenders.filter(child=>child.messages.some(m=>m.type==='provider_enter')).length,1);
 assert.equal(ledger(f.path).calls,interrupted?2:1);
 winner.process.send({type:'release'});assert.equal((await winner.waitFor('result')).result.status,'recommended');await winner.exited;
 const successor=f.start(f.path,'successor');await successor.waitFor('provider_enter');
 assert.equal(lstatSync(f.path+'.lock').ino,gate.ino);
 const loser=f.start(f.path,'late-contender','immediate');assert.equal((await loser.waitFor('result')).result.reason,'ledger_locked');await loser.exited;
 successor.process.send({type:'release'});await successor.waitFor('result');await successor.exited;
 assert.ok(existsSync(f.path+'.lock'));
 const after=ledger(f.path);if(interrupted)assert.equal(after.requests.interrupted.state,'unknown');assert.equal(after.calls,interrupted?3:2);
});

test('legacy empty locks are preserved and never reset the ledger or its reserved cost',async t=>{
 const f=fixture(t);writeFileSync(f.path,JSON.stringify({version:1,calls:0,estimated_usd:0,days:{},requests:{}}),{mode:0o600});
 writeFileSync(f.path+'.lock','',{mode:0o600});const before=readFileSync(f.path,'utf8');let calls=0;
 const r=new Router({ledgerPath:f.path,policy:ledgerPolicy(),provider:async()=>{calls++;return{choice:'codex-routine'};}});
 assert.equal((await r.recommend(ledgerRequest('legacy'))).reason,'ledger_locked');assert.equal(calls,0);
 assert.equal(readFileSync(f.path+'.lock','utf8'),'');assert.equal(readFileSync(f.path,'utf8'),before);
});

test('a historical PID-named write orphan cannot block new saves and is not deleted',async t=>{
 const f=fixture(t),orphan=f.path+'.write-'+process.pid;
 writeFileSync(orphan,'historical-synthetic-stage',{mode:0o600});
 const r=new Router({ledgerPath:f.path,policy:ledgerPolicy(),provider:async()=>({choice:'codex-routine'})});
 assert.equal((await r.recommend(ledgerRequest('fresh'))).status,'recommended');
 assert.equal(readFileSync(orphan,'utf8'),'historical-synthetic-stage');assert.equal(ledger(f.path).calls,1);
});

test('closing a failed same-process SQLite contender does not release an active owner to another process',async t=>{
 const f=fixture(t),owner=acquireLedgerLock(f.path);
 try{
  assert.throws(()=>acquireLedgerLock(f.path),error=>error?.code==='ledger_locked');
  const contender=f.start(f.path,'external-contender','immediate');
  assert.equal((await contender.waitFor('result')).result.reason,'ledger_locked');await contender.exited;
  owner.assertHeld();
 }finally{owner.release();}
 const successor=f.start(f.path,'after-release','immediate');
 assert.equal((await successor.waitFor('result')).result.status,'recommended');await successor.exited;
});

test('an orphan initialization hardlink is never opened and cannot break the canonical gate',async t=>{
 const f=fixture(t),initial=acquireLedgerLock(f.path);initial.release();
 const path=f.path+'.lock',orphan=join(f.dir,'.aptly-lock-init-synthetic-orphan');
 linkSync(path,orphan);const original=lstatSync(path),owner=acquireLedgerLock(f.path);
 try{
  assert.equal(lstatSync(orphan).ino,original.ino);
  const contender=f.start(f.path,'external-contender','immediate');
  assert.equal((await contender.waitFor('result')).result.reason,'ledger_locked');await contender.exited;
  owner.assertHeld();
 }finally{owner.release();}
 const successor=f.start(f.path,'after-orphan','immediate');
 assert.equal((await successor.waitFor('result')).result.status,'recommended');await successor.exited;
 assert.equal(lstatSync(path).ino,original.ino);assert.ok(existsSync(orphan));
});
