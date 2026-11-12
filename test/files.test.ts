import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{ chmodSync,writeFileSync,appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { createTestTemp } from '../test-support/temp.ts';
import { assertPrivateStatePath,systemAliasAllowed,readRegularFile } from '../src/files.ts';
import { runtime } from '../src/runtime.ts';
test('OS root aliases are allowed precisely; arbitrary or user-owned redirects are refused',()=>{
 assert.equal(systemAliasAllowed('/var',{uid:0},'private/var','darwin'),true);
 assert.equal(systemAliasAllowed('/tmp',{uid:0},'private/tmp','darwin'),true);
 assert.equal(systemAliasAllowed('/tmp',{uid:123},'private/tmp','darwin'),false);
 assert.equal(systemAliasAllowed('/var',{uid:0},'other','darwin'),false);
 assert.equal(systemAliasAllowed('/tmp',{uid:0},'private/tmp','linux'),false);
});
test('paid runtime requires an absolute ledger in an owner-private directory',t=>{
 const dir=createTestTemp(t,'codex-private-state-'),path=join(dir,'ledger.json');
 assert.doesNotThrow(()=>assertPrivateStatePath(path));
 assert.throws(()=>runtime({ROUTER_PROVIDER:'decisions',ROUTER_LEDGER_PATH:'relative.json'}));
 chmodSync(dir,0o755);assert.throws(()=>runtime({ROUTER_PROVIDER:'decisions',ROUTER_LEDGER_PATH:path}));
 chmodSync(dir,0o700);assert.doesNotThrow(()=>runtime({ROUTER_PROVIDER:'decisions',ROUTER_LEDGER_PATH:path}));
});
test('small regular reads do not allocate the entire permitted maximum',t=>{
 const dir=createTestTemp(t,'codex-read-budget-'),path=join(dir,'small');writeFileSync(path,'small');const original=Buffer.alloc;
 Buffer.alloc=((size,...args)=>{assert.ok(size<=65536,'small file exceeded allocation budget');return original(size,...args);})as typeof Buffer.alloc;
 try{assert.equal(readRegularFile(path,{maxBytes:8*1024*1024}).toString(),'small');}finally{Buffer.alloc=original;}
});
test('growth during a bounded regular read is rejected rather than silently truncated',t=>{
 const dir=createTestTemp(t,'codex-read-growth-'),path=join(dir,'changing');writeFileSync(path,'first');const original=fs.readSync;let grew=false;
 fs.readSync=((...args)=>{if(!grew){grew=true;appendFileSync(path,' second');}return original(...args);})as typeof fs.readSync;syncBuiltinESMExports();
 try{assert.throws(()=>readRegularFile(path,{maxBytes:1024}),/unsafe_file/);assert.equal(grew,true);}finally{fs.readSync=original;syncBuiltinESMExports();}
});
