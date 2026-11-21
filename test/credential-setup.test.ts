import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {setApiKey} from '../src/credential-setup.ts';
import {setDefaults} from '../src/setup.ts';
import {createTestTemp} from '../test-support/temp.ts';
const value='sk-synthetic-key-not-valid-12345';
function backend(){const data=new Map();return{data,loadSecret:({account})=>data.get(account)??null,storeSecret:(value,{account})=>{data.set(account,value);},deleteSecret:({account})=>{data.delete(account);}};}
test('per-host OS keys write references only and never enter settings, receipts or results',t=>{
 const home=createTestTemp(t,'codex-secret-setup-'),b=backend();const r=setApiKey(value,{home,env:{},clients:['codex']},b);assert.equal(r.status,'complete');assert.equal(b.data.get('codex:OPENAI_API_KEY'),value);assert.equal(b.data.has('claude:OPENAI_API_KEY'),false);assert.doesNotMatch(JSON.stringify(r),new RegExp(value));
 for(const file of ['config.toml','hooks.json','aptly/setup-ownership.json','aptly/auto-policy.json'])assert.doesNotMatch(readFileSync(join(home,'.codex',file),'utf8'),new RegExp(value));const config=readFileSync(join(home,'.codex/config.toml'),'utf8');assert.match(config,/APTLY_SECRET_BACKEND = "os"/);assert.match(config,/APTLY_SECRET_CLIENT = "codex"/);
});
test('failed configuration restores the old OS key and preserves operator data',t=>{
 const home=createTestTemp(t,'codex-secret-rollback-'),b=backend();setDefaults({home,env:{},clients:['codex']});b.data.set('codex:OPENAI_API_KEY','previous-synthetic');const file=join(home,'.codex/config.toml');writeFileSync(file,'invalid = [');const r=setApiKey(value,{home,env:{},clients:['codex']},b);assert.equal(r.status,'partial');assert.equal(b.data.get('codex:OPENAI_API_KEY'),'previous-synthetic');assert.equal(readFileSync(file,'utf8'),'invalid = [');
});
test('store failure and invalid secret produce fixed errors without configuring a host',t=>{
 const home=createTestTemp(t,'codex-secret-failure-'),b=backend();b.storeSecret=()=>{throw Error(value);};const r=setApiKey(value,{home,env:{},clients:['claude']},b);assert.equal(r.status,'partial');assert.deepEqual(r.clients[0].codes,['credential_store_failed']);assert.doesNotMatch(JSON.stringify(r),new RegExp(value));assert.equal(setApiKey('bad',{home,env:{}},b).status,'partial');assert.deepEqual(readdirSync(home),[]);
});

test('uncertain writes restore previous credentials or absence without configuring hosts', t => {
 for(const previous of [null,'previous-synthetic']) for(const failure of ['secure_store_timeout','secure_store_failed']) {
  const home=createTestTemp(t,'codex-uncertain-write-'),b=backend(),account='codex:OPENAI_API_KEY';
  if(previous!==null)b.data.set(account,previous);
  let writes=0;const store=b.storeSecret;
  b.storeSecret=(key,options)=>{writes++;store(key,options);if(key===value)throw Error(failure);};
  const r=setApiKey(value,{home,env:{},clients:['codex']},b);
  assert.equal(b.data.get(account)??null,previous);assert.equal(writes,previous===null?1:2);
  assert.deepEqual(r.clients[0].codes,[failure]);assert.deepEqual(readdirSync(home),[]);
  assert.doesNotMatch(JSON.stringify(r),new RegExp(value));
 }
});
test('failed or unverifiable recovery reports both the original error and recovery failure', t => {
 for(const previous of [null,'previous-synthetic']) {
  const home=createTestTemp(t,'codex-failed-recovery-'),b=backend(),account='codex:OPENAI_API_KEY';
  if(previous!==null)b.data.set(account,previous);
  let writes=0;
  b.storeSecret=(key,options)=>{writes++;if(key===value)b.data.set(options.account,key);throw Error('secure_store_timeout');};
  b.deleteSecret=()=>{throw Error('synthetic-delete-failed');};
  const r=setApiKey(value,{home,env:{},clients:['codex']},b);
  assert.deepEqual(r.clients[0].codes,['secure_store_timeout','credential_rollback_failed']);
  assert.equal(writes,previous===null?1:2);assert.equal(b.data.get(account),value);
  assert.deepEqual(readdirSync(home),[]);assert.doesNotMatch(JSON.stringify(r),new RegExp(value));
 }
});
test('configuration rollback is attempted once and retains the configuration error', t => {
 const home=createTestTemp(t,'codex-config-recovery-'),b=backend(),account='codex:OPENAI_API_KEY';
 setDefaults({home,env:{},clients:['codex']});
 b.data.set(account,'previous-synthetic');let writes=0;
 b.storeSecret=(key,options)=>{writes++;if(key===value){b.data.set(options.account,key);writeFileSync(join(home,'.codex/config.toml'),'invalid = [');}else throw Error('secure_store_denied');};
 const r=setApiKey(value,{home,env:{},clients:['codex']},b);
 assert.equal(writes,2);assert.ok(r.clients[0].codes.includes('concurrent_configuration_change'));
 assert.ok(r.clients[0].codes.includes('credential_rollback_failed'));
});
test('recovery acknowledgement failure is resolved by readback, but failed readback is uncertain', t => {
 for(const readable of [true,false]) {
  const home=createTestTemp(t,'codex-verify-recovery-'),b=backend(),account='codex:OPENAI_API_KEY';
  b.data.set(account,'previous-synthetic');const store=b.storeSecret,load=b.loadSecret;let reads=0;
  b.storeSecret=(key,options)=>{store(key,options);throw Error('secure_store_timeout');};
  b.loadSecret=options=>{if(++reads>1&&!readable)throw Error('synthetic-read-failed');return load(options);};
  const r=setApiKey(value,{home,env:{},clients:['codex']},b);
  assert.equal(b.data.get(account),readable?'previous-synthetic':value);
  assert.deepEqual(r.clients[0].codes,['secure_store_timeout',...(readable?[]:['credential_rollback_failed'])]);
 }
});
test('initial credential read failure never writes or deletes', t => {
 const home=createTestTemp(t,'codex-initial-read-failure-');
 const r=setApiKey(value,{home,env:{},clients:['codex']},{loadSecret(){throw Error('secure_store_denied');},storeSecret(){assert.fail('write');},deleteSecret(){assert.fail('delete');}});
 assert.deepEqual(r.clients[0].codes,['secure_store_denied']);assert.deepEqual(readdirSync(home),[]);
});

const managedEnd = '# aptly managed MCP end v1';
const trustTables = '\r\n[features]\r\nhooks = true\r\n\r\n[hooks.state.synthetic]\r\ntrusted_hash = "sha256:preserve-existing-state"\r\n';
function reformattedCodex(t) {
  const home = createTestTemp(t, 'codex-reformatted-setup-');
  const options = { home, env: {}, clients: ['codex' as const] };
  assert.equal(setDefaults(options).status, 'complete');
  const config = join(home, '.codex', 'config.toml');
  const original = readFileSync(config, 'utf8');
  assert.ok(original.includes(managedEnd));
  const text = original.replace('env_vars =', 'env_vars=').replaceAll('\n', '\r\n')
    .replace(managedEnd, () => trustTables + managedEnd);
  writeFileSync(config, text);
  return { home, options, config, text };
}

test('Codex credential setup preserves host tables written before the managed end marker', t => {
  const { home, options, config, text } = reformattedCodex(t);
  const hooks = join(home, '.codex', 'hooks.json');
  const hookBefore = readFileSync(hooks, 'utf8');
  const b = backend();
  const r = setApiKey(value, options, b);
  assert.equal(r.status, 'complete', JSON.stringify(r));
  assert.equal(b.data.get('codex:OPENAI_API_KEY'), value);
  const updated = readFileSync(config, 'utf8');
  assert.ok(updated.includes(trustTables));
  assert.ok(updated.indexOf(managedEnd) < updated.indexOf('[features]'));
  assert.ok(updated.includes('APTLY_SECRET_BACKEND = "os"'));
  assert.equal(readFileSync(hooks, 'utf8'), hookBefore);
  assert.ok(!updated.includes(value));
  assert.ok(!text.includes('APTLY_SECRET_BACKEND'));
});

test('reformatted Codex ownership never permits changed settings or comments to be taken over', t => {
  const mutations = [
    text => text.replace('ROUTER_PROVIDER = "decisions"', 'ROUTER_PROVIDER = "fixture"'),
    text => text.replace('ROUTER_PROVIDER = "decisions"', 'ROUTER_PROVIDER = "decisions" # keep this comment'),
    text => text.replace(managedEnd, managedEnd + '\r\n' + managedEnd),
  ];
  for (const mutate of mutations) {
    const { options, config, text } = reformattedCodex(t);
    const changed = mutate(text);
    assert.notEqual(changed, text);
    writeFileSync(config, changed);
    const result = setApiKey(value, options, {
      loadSecret() { assert.fail('credential store opened'); },
      storeSecret() { assert.fail('credential store written'); },
      deleteSecret() { assert.fail('credential store changed'); },
    });
    assert.ok(result.clients[0].codes.includes('managed_mcp_changed'));
    assert.equal(readFileSync(config, 'utf8'), changed);
  }
});
