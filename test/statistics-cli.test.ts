import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createTestTemp} from '../test-support/temp.ts';
function fixture(t){const home=createTestTemp(t,'codex-stats-cli-');return{home,run:(args,input?)=>spawnSync(process.execPath,['bin/aptly.ts',...args],{env:{PATH:process.env.PATH,HOME:home,USERPROFILE:home},encoding:'utf8',input,timeout:20000})};}
test('statistics help/read paths perform no setup and reject contradictory flags',t=>{
 const f=fixture(t);
 for(const args of [['stats','--help'],['stats','enable','--help'],['help','stats','disable'],['stats'],['stats','--today','--client','all']]){const r=f.run(args);assert.equal(r.status,0,r.stderr);}
 for(const args of [['stats','enable','--today'],['stats','disable','--codex-native-metadata'],['stats','enable','--client','claude','--codex-native-metadata'],['stats','--client','invalid'],['stats','--client','codex','--client','claude'],['stats','bogus','--help']])assert.notEqual(f.run(args).status,0);
 assert.deepEqual(readdirSync(f.home),[]);
});
test('internal observer is silent on malformed, unsupported and oversized input',t=>{
 const f=fixture(t),script=resolve('dist/bin/aptly-observe.js');
 for(const input of ['not-json',JSON.stringify({hook_event_name:'PostModelRequest',session_id:'parent'}),'x'.repeat(65537)]){
  const r=spawnSync(process.execPath,['--no-warnings',script,'--client','codex','--policy-path',join(f.home,'missing.json')],{env:{PATH:process.env.PATH,HOME:f.home,USERPROFILE:f.home},input,encoding:'utf8',timeout:15000});
  assert.equal(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 }
 assert.deepEqual(readdirSync(f.home),[]);
});
