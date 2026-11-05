import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, defaultPolicy } from '../src/core.ts';
import { resolveCatalog } from '../src/catalog.ts';
import { createTestTemp } from '../test-support/temp.ts';

const advice = (id='new-request') => ({request_id:id,client:'codex',task:{summary:'Sort supplied numbers [3,1,2].',operation:'analysis',context_sufficient:true}});
const filteredPolicy = () => {
  const catalog=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6.1-sol"]'});
  return {...defaultPolicy,profiles:catalog.profiles,profile_descriptions:catalog.descriptions,catalog_version:catalog.version};
};
const legacyProfiles = [
  {id:'codex-routine',client:'codex',model:'gpt-6.1-sol',reasoning_effort:'low'},
  {id:'codex-deep',client:'codex',model:'gpt-6-astra',reasoning_effort:'high'},
  {id:'claude-routine',client:'claude',model:'haiku'},
  {id:'claude-deep',client:'claude',model:'sonnet'},
];
function historicalLedger(profiles=legacyProfiles) {
  return {version:1,calls:profiles.length,estimated_usd:profiles.length*defaultPolicy.estimated_call_usd,
    days:{'2026-11-03':profiles.length},requests:Object.fromEntries(profiles.map((profile,index)=>['legacy-'+index,{
      digest:'a'.repeat(64),state:'complete',result:{status:'recommended',reason:'allowed_profile',application:'advisory_only',policy_version:'poc-v1',catalog_version:'poc-v1',profile_id:profile.id,profile},
    }]))};
}
const write = (path,value) => writeFileSync(path,JSON.stringify(value),{mode:0o600});
const read = path => JSON.parse(readFileSync(path,'utf8'));

test('new requests survive a catalog subset change without altering or reusing previous complete records', async t => {
  const path=join(createTestTemp(t,'codex-catalog-history-'),'ledger.json');let calls=0;
  const first=new Router({ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-simple'};}});
  assert.equal((await first.advise(advice('completed-before-filter'))).profile_id,'codex-simple');
  const historical=structuredClone(read(path).requests['completed-before-filter']);
  const next=new Router({ledgerPath:path,policy:filteredPolicy(),provider:async()=>{calls++;return{choice:'codex-deep'};}});
  const newResult=await next.advise(advice());assert.equal(newResult.status,'recommended');assert.equal(newResult.profile_id,'codex-deep');
  assert.deepEqual(read(path).requests['completed-before-filter'],historical);
  assert.equal((await next.advise(advice('completed-before-filter'))).reason,'request_conflict');assert.equal(calls,2);
  assert.equal((await next.advise(advice())).cached,true);assert.equal(calls,2);
});

test('all four exact preview tuples can remain archival records under the new default catalog', async t => {
  const path=join(createTestTemp(t,'codex-catalog-history-'),'ledger.json');const initial=historicalLedger();write(path,initial);let calls=0;
  const next=new Router({ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-simple'};}});
  assert.equal((await next.advise(advice())).status,'recommended');assert.equal(calls,1);
  for(let i=0;i<legacyProfiles.length;i++){
    assert.deepEqual(read(path).requests['legacy-'+i],initial.requests['legacy-'+i]);
    const input={...advice('legacy-'+i),client:legacyProfiles[i].client};
    assert.equal((await next.advise(input)).reason,'request_conflict');
  }
  assert.equal(calls,1);
});

test('preview and current unknown IDs are never retried after catalog changes', async t => {
  const path=join(createTestTemp(t,'codex-catalog-history-'),'ledger.json');const initial=historicalLedger();
  initial.calls++;initial.estimated_usd+=defaultPolicy.estimated_call_usd;initial.days['2026-11-03']++;
  initial.requests['legacy-unknown']={digest:'b'.repeat(64),state:'unknown'};write(path,initial);let calls=0;
  const first=new Router({ledgerPath:path,provider:async()=>{calls++;throw Object.assign(new Error('private-fixture-error'),{code:'network'});}});
  assert.equal((await first.advise(advice('current-unknown'))).reason,'network');
  const next=new Router({ledgerPath:path,policy:filteredPolicy(),provider:async()=>{calls++;return{choice:'codex-deep'};}});
  for(const id of ['legacy-unknown','current-unknown'])assert.equal((await next.advise(advice(id))).reason,'request_conflict');
  assert.equal(calls,1);
  const unchanged=new Router({ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-simple'};}});
  assert.equal((await unchanged.advise(advice('current-unknown'))).reason,'outcome_unknown');assert.equal(calls,1);
  assert.equal(read(path).requests['legacy-unknown'].state,'unknown');assert.equal(read(path).requests['current-unknown'].state,'unknown');
});

test('known historical tuples cannot be reused solely because a current profile ID is identical', async t => {
  const path=join(createTestTemp(t,'codex-catalog-history-'),'ledger.json');let calls=0;
  const first=new Router({ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-routine'};}});
  assert.equal((await first.advise(advice())).status,'recommended');
  const ledger=read(path);ledger.requests['new-request'].result.profile={...legacyProfiles[0]};write(path,ledger);
  // The digest and declared versions still match, but the old Sol/low tuple is
  // not the current Terra/high tuple and must never become a cached result.
  const next=new Router({ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-routine'};}});
  const result=await next.advise(advice());assert.equal(result.reason,'ledger_error');assert.equal(calls,1);
});

test('arbitrary or inconsistent archival profiles fail the ledger without enabling provider calls', async t => {
  const root=createTestTemp(t,'codex-catalog-history-');
  for(const [index,mutate] of [
    r=>{r.result.profile.model='unknown-injected-model';},
    r=>{r.result.profile.command='injected-command';},
    r=>{r.result.profile.reasoning_effort='unsupported';},
    r=>{r.result.profile_id='codex-simple';},
    r=>{r.result.policy_version='';},
    r=>{r.result.usage={input_tokens:12,output_tokens:0,total_tokens:11};},
  ].entries()){
    const path=join(root,'ledger-'+index+'.json'),initial=historicalLedger();mutate(initial.requests['legacy-0']);write(path,initial);let calls=0;
    const next=new Router({ledgerPath:path,provider:async()=>{calls++;return{choice:'codex-simple'};}});
    assert.equal((await next.advise(advice())).reason,'ledger_error');assert.equal(calls,0);
  }
});

test('archival tuple compatibility does not permit retired profiles in a runtime policy', () => {
  for(const profile of legacyProfiles){assert.throws(()=>new Router({policy:{...defaultPolicy,profiles:[profile]},provider:async()=>({choice:profile.id})}),/invalid_policy/);}
});
