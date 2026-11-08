import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createTestTemp } from '../test-support/temp.ts';
import { Router, defaultPolicy } from '../src/core.ts';
import { acquireLedgerLock } from '../src/ledger-lock.ts';
import { budgetEnvironmentDefaults, budgetEnvironmentKeys, budgetErrorDetails, parseBudgetValue, resolveBudgetSettings } from '../src/budget.ts';
import { ContextRetries } from '../src/context-retry.ts';
import { loadAutomaticHookPolicy } from '../src/automatic-hook.ts';
import { runtime } from '../src/runtime.ts';

const request = (request_id='legacy-request') => ({ request_id, client:'codex',
  task:{summary:'Read the synthetic module and identify a missing guard.',operation:'read_only',context_sufficient:true},
  eligible_profile_ids:['codex-routine','codex-deep'],
  constraints:{provenance_verified:true,model_pinned:false,effort_pinned:false,role_pinned:false,fork_inherits:false} });
const legacyPolicy = () => ({...defaultPolicy,max_daily_calls:20,max_total_calls:50,estimated_call_usd:.01,max_estimated_usd:.5});
// Fixed captured pre-budget-configuration hashes: changes must not weaken compatibility to accept arbitrary records.
const goldenHook='3e76a0cdecbfc26be51af14bda1bbca3b714169caa655f292741e175b709bdca';
const goldenAdvice='385bd90a0cdc933f7c766d3972fc37eca53b78b9392f33c547c08cfd267c6605';
const goldenCustom='f6274a8fb7c053a7e44089b52d7ed38b3141580819da7219677b4784856dd25f';
const provider=async()=>({choice:'codex-routine'});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function saveLedger(path,digest,state='complete',result={status:'unavailable',reason:'budget_exhausted',application:'advisory_only',policy_version:defaultPolicy.version,catalog_version:defaultPolicy.catalog_version},calls=0) {
  const today=new Date().toISOString().slice(0,10);
  writeFileSync(path,JSON.stringify({version:1,calls,estimated_usd:calls*.01,days:calls?{[today]:calls}:{},requests:{'legacy-request':{digest,state,...(state==='complete'?{result}:{})}}}),{mode:0o600});
}

test('single-value budget parsing is strict, bounded, and independent of aggregate defaults',()=>{
  assert.deepEqual(budgetEnvironmentKeys,Object.keys(budgetEnvironmentDefaults));
  assert.deepEqual(resolveBudgetSettings({}).limits,{max_daily_calls:200,max_total_calls:0,max_estimated_usd:0,estimated_call_usd:.002});
  for(const key of budgetEnvironmentKeys) {
    for(const value of ['', ' ', ' 1', '1 ', '1e2', 'NaN', 'Infinity', '-1', '+1', '.5', '01', '0.0000001', '0.'+'0'.repeat(400)+'1', {}, 2, null]) assert.throws(()=>parseBudgetValue(key,value),/invalid_budget_configuration/);
  }
  for(const key of ['APTLY_MAX_DAILY_CALLS','APTLY_MAX_TOTAL_CALLS']) {
    assert.equal(parseBudgetValue(key,'0'),0);
    for(const value of ['0.1','1.0','1000001'])assert.throws(()=>parseBudgetValue(key,value));
  }
  assert.equal(parseBudgetValue('APTLY_MAX_DAILY_CALLS','100000'),100000);
  assert.equal(parseBudgetValue('APTLY_MAX_TOTAL_CALLS','1000000'),1000000);
  assert.throws(()=>parseBudgetValue('APTLY_MAX_DAILY_CALLS','100001'));
  assert.equal(parseBudgetValue('APTLY_MAX_ESTIMATED_USD','0.001'),.001);
  assert.equal(parseBudgetValue('APTLY_MAX_ESTIMATED_USD','0'),0);
  assert.throws(()=>parseBudgetValue('APTLY_ESTIMATED_CALL_USD','0'));
  assert.throws(()=>parseBudgetValue('APTLY_ESTIMATED_CALL_USD','100.01'));
  assert.throws(()=>parseBudgetValue('OTHER','1'));
  assert.throws(()=>resolveBudgetSettings({APTLY_MAX_ESTIMATED_USD:'0.001'}));
  assert.equal(resolveBudgetSettings({APTLY_MAX_ESTIMATED_USD:'0.001',APTLY_ESTIMATED_CALL_USD:'0.001'}).limits.max_estimated_usd,.001);
  assert.equal(resolveBudgetSettings({APTLY_MAX_ESTIMATED_USD:'0',APTLY_ESTIMATED_CALL_USD:'100'}).limits.estimated_call_usd,100);
  assert.deepEqual(resolveBudgetSettings({APTLY_MAX_TOTAL_CALLS:'17'}).provenance,{max_daily_calls:'default',max_total_calls:'environment',max_estimated_usd:'default',estimated_call_usd:'default'});
});

test('runtime resolves budget before touching credentials and returns provenance',()=>{
  let secrets=0;
  assert.throws(()=>runtime({ROUTER_PROVIDER:'decisions',APTLY_ESTIMATED_CALL_USD:'NaN'}, {secretLoader:()=>{secrets++;return 'unused';}}),/invalid_budget_configuration/);
  assert.equal(secrets,0);
  const resolved=runtime({APTLY_MAX_DAILY_CALLS:'3',APTLY_MAX_TOTAL_CALLS:'0'});
  assert.equal(resolved.router.policy.max_daily_calls,3);
  assert.equal(resolved.budget.provenance.max_daily_calls,'environment');
});

test('each explicit zero ceiling is unlimited and still counts completed and unknown reservations',async()=>{
  for(const limits of [{max_daily_calls:0},{max_total_calls:0},{max_estimated_usd:0},{max_daily_calls:0,max_total_calls:0,max_estimated_usd:0}]) {
    let calls=0;
    const router=new Router({policy:{...defaultPolicy,...limits},provider:async()=>{calls++;if(calls===2)throw new Error('synthetic');return {choice:'codex-routine'};}});
    assert.equal((await router.recommend(request('a'))).status,'recommended');
    assert.equal((await router.recommend(request('b'))).reason,'provider_error');
    assert.equal((await router.recommend(request('b'))).reason,'outcome_unknown');
    assert.equal((await router.recommend(request('c'))).status,'recommended');
    assert.equal(calls,3);assert.equal(router.state.calls,3);assert.equal(router.state.estimated_usd,.006);
    assert.equal(router.state.requests.b.state,'unknown');
  }
});

test('new budget denials are not cached and same ID succeeds after raising a limit',async()=>{
  let calls=0;
  const router=new Router({policy:{...defaultPolicy,max_total_calls:1},budgetConfigurable:true,provider:async()=>{calls++;return {choice:'codex-routine'};}});
  await router.recommend(request('first'));
  const denied=await router.recommend(request('second'));
  assert.equal(denied.reason,'budget_exhausted');assert.equal(denied.budget_limit,'max_total_calls');
  assert.deepEqual(router.budgetStatus().exhausted_by,['max_total_calls']);
  assert.equal(router.state.requests.second,undefined);assert.equal(calls,1);
  router.policy.max_total_calls=2;
  assert.equal((await router.recommend(request('second'))).status,'recommended');assert.equal(calls,2);
  assert.equal((await router.recommend(request('first'))).cached,true);
});

test('legacy default hook/advice captures retain exact identity while arbitrary custom policies retain theirs',async()=>{
  const req=request();
  assert.equal(digest({input:req,policy:legacyPolicy()}),goldenHook);
  assert.equal(digest({kind:'advisory-v1',input:req,policy:legacyPolicy()}),goldenAdvice);
  const hook=new Router({provider});await hook.recommend(req);assert.equal(hook.state.requests[req.request_id].digest,goldenHook);
  const advice=new Router({provider});
  // advise canonicalizes caller-declared constraints; capture its exact normalized input independently.
  const normalized={...req,constraints:{model_pinned:false,effort_pinned:false,role_pinned:false,fork_inherits:false}};
  await advice.advise(req);
  assert.equal(advice.state.requests[req.request_id].digest,digest({kind:'advisory-v1',input:normalized,policy:legacyPolicy()}));
  const custom=new Router({policy:{...legacyPolicy(),max_total_calls:7},provider});await custom.recommend(req);
  assert.equal(custom.state.requests[req.request_id].digest,goldenCustom);
  custom.policy.max_total_calls=8;
  assert.equal((await custom.recommend(req)).reason,'request_conflict');
});

test('exact legacy budget completion recovers under current defaults without altering counters or unknown records',async t=>{
  const path=`${createTestTemp(t,'codex-budget-')}/ledger.json`;
  saveLedger(path,goldenHook);
  let calls=0;
  const router=new Router({provider:async()=>{calls++;return {choice:'codex-routine'};},ledgerPath:path});
  assert.equal((await router.recommend(request())).status,'recommended');assert.equal(calls,1);
  assert.equal(router.state.calls,1);assert.equal(router.state.estimated_usd,.002);
  assert.equal((await router.recommend(request())).cached,true);assert.equal(calls,1);
  saveLedger(path,goldenHook,'unknown',undefined,1);
  assert.equal((await router.recommend(request())).reason,'outcome_unknown');assert.equal(calls,1);
  assert.equal(router.state.estimated_usd,.01);
  saveLedger(path,goldenCustom);
  assert.equal((await router.recommend(request())).reason,'request_conflict');assert.equal(calls,1);
  saveLedger(path,'a'.repeat(64));
  assert.equal((await router.recommend(request())).reason,'request_conflict');assert.equal(calls,1);
});

test('completed legacy advice is cached and semantic changes still conflict before provider dispatch',async t=>{
  const path=`${createTestTemp(t,'codex-budget-')}/ledger.json`;
  const req=request(), normalized={...req,constraints:{model_pinned:false,effort_pinned:false,role_pinned:false,fork_inherits:false}};
  const hash=digest({kind:'advisory-v1',input:normalized,policy:legacyPolicy()});
  const result={status:'keep_current',reason:'provider_abstained',application:'advisory_only',policy_version:defaultPolicy.version,catalog_version:defaultPolicy.catalog_version};
  saveLedger(path,hash,'complete',result,1);
  let calls=0;const router=new Router({ledgerPath:path,provider:async()=>{calls++;return {choice:'codex-routine'};}});
  assert.equal((await router.advise(req)).cached,true);
  router.policy.estimated_call_usd=.02;assert.equal((await router.advise(req)).cached,true);
  for(const field of ['timeout_ms','max_concurrency','version','catalog_version']) {
    const previous=router.policy[field];router.policy[field]=typeof previous==='number'?previous+1:`${previous}-changed`;
    assert.equal((await router.advise(req)).reason,'request_conflict');router.policy[field]=previous;
  }
  req.task.summary+=' Changed task.';assert.equal((await router.advise(req)).reason,'request_conflict');assert.equal(calls,0);
});

test('status creates no files, reports UTC remaining limits, and existing gates serialize reads',async t=>{
  const directory=createTestTemp(t,'codex-budget-'),path=`${directory}/ledger.json`;
  let calls=0;const router=new Router({ledgerPath:path,provider:async()=>{calls++;return {choice:'codex-routine'};}});
  const absent=router.budgetStatus();assert.equal(calls,0);assert.deepEqual(readdirSync(directory),[]);
  assert.equal(absent.remaining.total_calls,null);assert.equal(absent.remaining.estimated_usd,null);
  assert.equal(absent.remaining.daily_calls,200);assert.equal(absent.utc_day,new Date().toISOString().slice(0,10));assert.equal(absent.timezone,'UTC');
  await router.recommend(request());
  const before=readFileSync(path,'utf8'),mode=statSync(path).mode;
  const status=router.budgetStatus();assert.equal(status.usage.total_calls,1);assert.equal(status.usage.estimated_usd,.002);
  assert.equal(status.remaining.daily_calls,199);assert.equal(status.local_estimate,true);
  assert.equal(readFileSync(path,'utf8'),before);assert.equal(statSync(path).mode,mode);assert.equal(calls,1);
  if(process.platform!=='win32'){
    chmodSync(path,0o644);
    assert.throws(()=>router.budgetStatus(),/unsafe_ledger/);assert.equal(statSync(path).mode&0o777,0o644);
    chmodSync(path,0o600);
  }
  const lock=acquireLedgerLock(path);
  try{assert.throws(()=>router.budgetStatus(),{code:'ledger_locked'});}finally{lock.release();}
  const noGate=`${directory}/no-gate.json`;saveLedger(noGate,goldenHook);
  assert.throws(()=>new Router({ledgerPath:noGate,provider}).budgetStatus(),{code:'ledger_error'});
  assert.equal(existsSync(`${noGate}.lock`),false);
});

test('UTC daily limit rolls over without resetting lifetime calls and estimated usage',async()=>{
  const router=new Router({policy:{...defaultPolicy,max_daily_calls:1,max_total_calls:0,max_estimated_usd:0},provider});
  router.state={version:1,calls:1,estimated_usd:.01,days:{'2000-01-01':1},requests:{}};
  const first=await router.recommend(request('today'));assert.equal(first.status,'recommended');
  assert.equal(router.state.calls,2);assert.equal(router.state.estimated_usd,.012);
  assert.equal((await router.recommend(request('today-2'))).reason,'budget_exhausted');
  assert.deepEqual(router.budgetStatus().exhausted_by,['max_daily_calls']);
});


test('budget denial identifies first exhausted ceiling without persisting new outcome fields',async()=>{
  for(const [limits,field] of [
    [{max_daily_calls:1,max_total_calls:1,max_estimated_usd:.002},'max_daily_calls'],
    [{max_daily_calls:0,max_total_calls:1,max_estimated_usd:.002},'max_total_calls'],
    [{max_daily_calls:0,max_total_calls:0,max_estimated_usd:.002},'max_estimated_usd'],
  ]) {
    const router=new Router({policy:{...defaultPolicy,...limits},provider});
    await router.recommend(request('first'));
    const result=await router.recommend(request('denied'));
    assert.equal(result.reason,'budget_exhausted');assert.equal(result.budget_limit,field);
    assert.equal(router.state.requests.denied,undefined);assert.equal(router.state.calls,1);
    assert.equal(router.budgetStatus().exhausted_by[0],field);
    assert.throws(()=>router.validateOutcome(result),/invalid_outcome/);
  }
});

test('context retry binding survives only budget configuration changes without renewing expiry or unknown outcomes',async t=>{
  const directory=createTestTemp(t,'codex-budget-'),policyPath=`${directory}/policy.json`,ledgerPath=`${directory}/ledger.json`;
  writeFileSync(policyPath,JSON.stringify({schema_version:1,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',enabled:true,state_directory:directory}),{mode:0o600});
  let now=0,calls=0;
  const router=new Router({policy:{...defaultPolicy,max_estimated_usd:.001},budgetConfigurable:true,ledgerPath,
    provider:async()=>{calls++;return {choice:'codex-routine'};}});
  const retries=new ContextRetries(router,policyPath,()=>now);
  const seed={request_id:'original-context',client:'codex',eligible_profile_ids:['codex-routine'],policy_fingerprint:loadAutomaticHookPolicy(policyPath).fingerprint,fill_model:true,fill_effort:true};
  const {retry_id}=retries.register(seed);
  const description='Review the synthetic module for incorrect imports and return concrete findings.';
  assert.equal((await retries.retry(retry_id,description)).reason,'budget_exhausted');assert.equal(calls,0);
  const fingerprint=readFileSync(`${directory}/hook-retry-${retry_id}.json`,'utf8');
  router.policy.max_estimated_usd=0;router.policy.estimated_call_usd=.003;
  assert.equal((await retries.retry(retry_id,description)).status,'recommended');assert.equal(calls,1);
  assert.equal(readFileSync(`${directory}/hook-retry-${retry_id}.json`,'utf8'),fingerprint);
  router.policy.max_daily_calls=0;assert.equal((await retries.retry(retry_id,description)).cached,true);assert.equal(calls,1);
  router.policy.timeout_ms++;assert.equal((await retries.retry(retry_id,description)).reason,'catalog_changed');router.policy.timeout_ms--;
  now=300000;assert.equal(retries.register(seed).retry_id,retry_id);assert.equal((await retries.retry(retry_id,description)).reason,'context_retry_expired');
  now=0;const uncertain=retries.register({...seed,request_id:'unknown-context'}).retry_id;
  router.provider=async()=>{calls++;throw new Error('synthetic transport');};
  assert.equal((await retries.retry(uncertain,description)).reason,'provider_error');
  router.policy.max_total_calls=0;router.policy.estimated_call_usd=.004;
  assert.equal((await retries.retry(uncertain,description)).reason,'outcome_unknown');assert.equal(calls,2);
});


test('unknown budget-prefixed environment keys fail closed while unrelated Aptly settings remain valid',()=>{
  for(const key of ['APTLY_MAX_ESTIMATED_US','APTLY_ESTIMATED_CALL_COST','APTLY_MAX_TOTAL_CALL','APTLY_MAX_']) {
    assert.throws(()=>resolveBudgetSettings({[key]:'1'}),/invalid_budget_configuration/);
  }
  assert.deepEqual(resolveBudgetSettings({APTLY_MODEL_INFO_PATH:'unrelated',APTLY_HOOK_POLICY_PATH:'unrelated'}).limits,resolveBudgetSettings({}).limits);
});

test('a provider exception named budget_exhausted remains a paid unknown outcome',async()=>{
  let calls=0;
  const router=new Router({provider:async()=>{calls++;throw Object.assign(new Error('synthetic provider failure'),{code:'budget_exhausted'});}});
  const first=await router.recommend(request());
  assert.equal(first.reason,'provider_error');assert.equal(first.budget_limit,undefined);
  assert.equal(router.state.calls,1);assert.equal(router.state.requests['legacy-request'].state,'unknown');
  router.policy.max_daily_calls=0;router.policy.max_total_calls=0;router.policy.max_estimated_usd=0;
  assert.equal((await router.recommend(request())).reason,'outcome_unknown');assert.equal(calls,1);
});

test('two independent processes recover one legacy unpaid denial with at most one dispatch',async t=>{
  const directory=createTestTemp(t,'codex-budget-process-'),path=`${directory}/ledger.json`;
  saveLedger(path,goldenHook);
  const coreUrl=new URL('../src/core.ts',import.meta.url).href;
  const dispatches=[];
  function start(hold=false) {
    const script=`import {Router} from ${JSON.stringify(coreUrl)};
      const router=new Router({ledgerPath:${JSON.stringify(path)},provider:async()=>{
        process.send({type:'dispatch'});
        ${hold?"await new Promise(resolve=>process.once('message',resolve));":''}
        return {choice:'codex-routine'};
      }});
      const result=await router.recommend(${JSON.stringify(request())});
      process.send({type:'result',result});
      process.disconnect();`;
    const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{},stdio:['ignore','ignore','pipe','ipc']});
    let readyResolve,doneResolve,doneReject,result,stderr='';
    const ready=new Promise(resolve=>{readyResolve=resolve;});
    const done=new Promise((resolve,reject)=>{doneResolve=resolve;doneReject=reject;});
    const timeout=setTimeout(()=>{child.kill();doneReject(new Error('child_timeout'));},10000);
    child.stderr.on('data',data=>{stderr+=data;});
    child.on('error',doneReject);
    child.on('message',message=>{
      if(message.type==='dispatch'){dispatches.push(child.pid);readyResolve();}
      if(message.type==='result')result=message.result;
    });
    child.on('exit',(code)=>{
      clearTimeout(timeout);
      if(code!==0||!result)doneReject(new Error(`child_failed_${code}: ${stderr}`));else doneResolve(result);
    });
    t.after(()=>{clearTimeout(timeout);if(child.exitCode===null)child.kill();});
    return {child,ready,done};
  }
  const first=start(true);
  // The first process holds the gate throughout its mocked provider dispatch.
  await Promise.race([first.ready,first.done.then(()=>{throw new Error('child_did_not_dispatch');})]);
  const second=start();
  const blocked=await second.done;
  assert.equal(blocked.reason,'ledger_locked');assert.equal(dispatches.length,1);
  first.child.send({release:true});
  const recovered=await first.done;assert.equal(recovered.status,'recommended');assert.equal(recovered.cached,undefined);
  const replay=await start().done;
  assert.equal(replay.status,'recommended');assert.equal(replay.cached,true);assert.equal(dispatches.length,1);
  const state=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(state.calls,1);assert.equal(state.estimated_usd,.002);
  assert.equal(state.requests['legacy-request'].state,'complete');
  assert.deepEqual(Object.keys(state.requests),['legacy-request']);
});


test('unlimited monetary ceiling requires literal zero and diagnostic details never echo values or unknown names',()=>{
  for(const value of ['0.0','0.00','0.000000'])assert.throws(()=>parseBudgetValue('APTLY_MAX_ESTIMATED_USD',value),/invalid_budget_configuration/);
  assert.equal(parseBudgetValue('APTLY_MAX_ESTIMATED_USD','0'),0);
  const secret='SYNTHETIC_PRIVATE_VALUE';
  let valueError;
  try{parseBudgetValue('APTLY_MAX_DAILY_CALLS',secret);}catch(error){valueError=error;}
  assert.equal(valueError.message,'invalid_budget_configuration');
  assert.deepEqual(budgetErrorDetails(valueError),{invalid_budget_keys:['APTLY_MAX_DAILY_CALLS'],budget_error:'invalid_value'});
  assert.equal(JSON.stringify(valueError).includes(secret),false);
  assert.equal(JSON.stringify(budgetErrorDetails(valueError)).includes(secret),false);
  let aggregateError;
  try{resolveBudgetSettings({APTLY_MAX_ESTIMATED_USD:'0.001'});}catch(error){aggregateError=error;}
  assert.deepEqual(budgetErrorDetails(aggregateError),{invalid_budget_keys:['APTLY_MAX_ESTIMATED_USD','APTLY_ESTIMATED_CALL_USD'],budget_error:'rate_exceeds_ceiling'});
  let unknownError;
  try{resolveBudgetSettings({['APTLY_MAX_'+secret]:secret});}catch(error){unknownError=error;}
  assert.deepEqual(budgetErrorDetails(unknownError),{budget_error:'unknown_budget_key'});
  assert.equal(JSON.stringify(unknownError).includes(secret),false);
  assert.deepEqual(budgetErrorDetails({budget_error:'invalid_value',invalid_budget_keys:[secret,'APTLY_MAX_TOTAL_CALLS','APTLY_MAX_TOTAL_CALLS'],secret}),{invalid_budget_keys:['APTLY_MAX_TOTAL_CALLS'],budget_error:'invalid_value'});
  assert.deepEqual(budgetErrorDetails({budget_error:secret,invalid_budget_keys:['APTLY_MAX_TOTAL_CALLS']}),{});
  assert.deepEqual(budgetErrorDetails(new Error(secret)),{});
  assert.deepEqual(budgetErrorDetails(null),{});
});
