import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {runtime} from '../src/runtime.ts';
import {createTestTemp} from '../test-support/temp.ts';
test('explicit OS references select a per-host key and unavailable stores never fall back to environment keys',async t=>{
 const dir=createTestTemp(t,'codex-runtime-secret-');let account;
 const env={ROUTER_PROVIDER:'decisions',ROUTER_LEDGER_PATH:join(dir,'ledger.json'),OPENAI_API_KEY:'sk-synthetic-env-not-used',APTLY_SECRET_BACKEND:'os',APTLY_SECRET_CLIENT:'claude'};
 const loaded=runtime(env,{secretLoader:options=>{account=options.account;return 'sk-synthetic-os-not-valid';}});assert.equal(account,'claude:OPENAI_API_KEY');assert.equal(loaded.credentialStatus,'os_store');
 const unavailable=runtime(env,{secretLoader:()=>{throw Error('synthetic raw store error');}});assert.equal(unavailable.credentialStatus,'os_store_unavailable');const r=await unavailable.router.advise({request_id:'missing-os-key',client:'codex',task:{summary:'Sort the supplied numbers [3,1,2] in ascending order.',operation:'analysis',context_sufficient:true}});assert.equal(r.reason,'unauthorized');
});
test('fixture never reads OS credentials and invalid references do not query the store',t=>{
 let calls=0;const loader=()=>{calls++;return 'synthetic';};assert.equal(runtime({ROUTER_PROVIDER:'fixture',APTLY_SECRET_BACKEND:'os'},{secretLoader:loader}).credentialStatus,'unused_in_fixture');const dir=createTestTemp(t,'codex-runtime-invalid-secret-');assert.equal(runtime({ROUTER_PROVIDER:'decisions',ROUTER_LEDGER_PATH:join(dir,'ledger.json'),APTLY_SECRET_BACKEND:'os',APTLY_SECRET_CLIENT:'other'},{secretLoader:loader}).credentialStatus,'invalid_os_reference');assert.equal(calls,0);
});
