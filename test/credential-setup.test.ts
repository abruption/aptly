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
