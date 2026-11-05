import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTemp } from '../test-support/temp.ts';
import { assertPrivateStatePath,systemAliasAllowed } from '../src/files.ts';
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
