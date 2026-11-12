import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ContextRetries } from '../src/context-retry.ts';
import { Router, defaultPolicy } from '../src/core.ts';
import { loadAutomaticHookPolicy } from '../src/automatic-hook.ts';
import { createServer } from '../src/server.ts';
import { VERSION } from '../src/version.ts';
import { createTestTemp } from '../test-support/temp.ts';

test('retry diagnostics count retained slots without checking eligibility or changing them', t=>{
 const dir=createTestTemp(t,'codex-runtime-diagnostics-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});
 const policyPath=join(dir,'policy.json'),policy=JSON.stringify({schema_version:1,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',enabled:true,state_directory:state});writeFileSync(policyPath,policy,{mode:0o600});
 const router=new Router({ledgerPath:join(state,'ledger.json'),policy:defaultPolicy,provider:async()=>{throw Error('provider must not be invoked');}});
 let now=0,clockReads=0,callbacks=0;
 const retries=new ContextRetries(router,policyPath,()=>{clockReads++;return now;});
 const fingerprint=loadAutomaticHookPolicy(policyPath).fingerprint;
 for(let i=0;i<128;i++)assert.ok(retries.register({request_id:`request-${i}`,client:'codex',eligible_profile_ids:['codex-routine'],policy_fingerprint:fingerprint},()=>{callbacks++;throw Error('must not check eligibility');}).retry_id);
 // A cancelled, active entry still occupies a slot and does not imply eligibility.
 const entries=(retries as any).entries as Map<string,any>;
 const first=entries.values().next().value;first.cancelled=true;first.active=true;
 unlinkSync(policyPath); // Diagnostics cannot depend on reloading the policy.
 now=299_999;clockReads=0;
 assert.deepEqual(retries.diagnostics(),{scope:'this_process',capacity:128,used:128,remaining:0,expired_retained:0,in_flight:1,retry_eligibility:'not_checked'});
 assert.equal(clockReads,1);assert.equal(callbacks,0);
 now=300_000;clockReads=0;
 assert.deepEqual(retries.diagnostics(),{scope:'this_process',capacity:128,used:128,remaining:0,expired_retained:128,in_flight:1,retry_eligibility:'not_checked'});
 assert.equal(clockReads,1);assert.equal(callbacks,0);assert.equal(entries.size,128);
 writeFileSync(policyPath,policy,{mode:0o600});
 assert.equal(retries.register({request_id:'overflow',client:'codex',eligible_profile_ids:['codex-routine'],policy_fingerprint:fingerprint}).reason,'context_retry_capacity');
});

test('capabilities add process diagnostics while preserving existing keys and credential status',async t=>{
 const dir=createTestTemp(t,'codex-runtime-server-');
 for(const [path,expected] of [[undefined,'unconfigured'],[join(dir,'fixed.json'),'fixed'],['@codex-home','codex_home']] as const){
  const env={ROUTER_PROVIDER:'fixture',ROUTER_LEDGER_PATH:join(dir,'ledger.json'),CODEX_HOME:dir,...(path===undefined?{}:{APTLY_HOOK_POLICY_PATH:path})};
  const server=createServer({env}),client=new Client({name:'codex-runtime-diagnostics-test',version:'1'});
  const [left,right]=InMemoryTransport.createLinkedPair();await server.connect(right);await client.connect(left);
  try{
   const result=await client.callTool({name:'get_routing_capabilities',arguments:{}});
   assert.notEqual(result.isError,true);
   const caps=result.structuredContent as Record<string,any>;
   for(const key of ['budget_configuration','provider','hook_mode','precedence','automatic_settings_discovery','recommendation','model_information','disabled_clients','credential_status','execution_statistics','automatic_hook'])assert.ok(Object.hasOwn(caps,key),key);
   assert.deepEqual(caps.runtime_diagnostics,{version:VERSION,policy_source_kind:expected,credential_status_observed:'startup_snapshot',context_retries:{scope:'this_process',capacity:128,used:0,remaining:128,expired_retained:0,in_flight:0,retry_eligibility:'not_checked'}});
  }finally{await client.close();await server.close();}
 }
});
