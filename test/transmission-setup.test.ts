import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setupHosts, setDefaults, setTransmission, showTransmission, removeSetup } from '../src/setup.ts';
import { createTestTemp } from '../test-support/temp.ts';

const read = path => JSON.parse(readFileSync(path,'utf8'));
const save = (path,value) => writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});
function fixture(t) {
  const home=createTestTemp(t,'codex-transmission-setup-');
  return {home,env:{},packageRoot:resolve('.')};
}
const privatePaths=(options,client)=>{
  const dir=join(options.home,client==='codex'?'.codex':'.claude','aptly');
  return {dir,policy:join(dir,'auto-policy.json'),receipt:join(dir,'setup-ownership.json')};
};

test('new setup is unselected, read-only status creates nothing, explicit scope stays removable',t=>{
  const o=fixture(t);
  assert.equal(showTransmission(o).clients[0].status,'unavailable');
  assert.equal(existsSync(join(o.home,'.codex')),false);
  assert.equal(setDefaults(o).status,'complete');
  assert.deepEqual(showTransmission(o).clients.map(c=>[c.transmission,c.transmission_source]),[['unselected','unselected'],['unselected','unselected']]);
  for(const scope of ['none','description','excerpt']) {
    assert.equal(setTransmission(scope,o).status,'complete');
    assert.deepEqual(showTransmission(o).clients.map(c=>c.transmission),[scope,scope]);
    assert.equal(setDefaults(o).status,'complete');
    for(const client of ['codex','claude']) {
      const p=privatePaths(o,client);
      assert.deepEqual(read(p.receipt).policy,read(p.policy));
      assert.equal(read(p.policy).transmission,scope);
    }
  }
  assert.equal(removeSetup(o).status,'complete');
});

test('legacy v1 stays byte-identical until explicit scope migration, without changing ledger bindings',t=>{
  const o=fixture(t);setupHosts(o);
  for(const client of ['codex','claude']) {
    const p=privatePaths(o,client),policy=read(p.policy),receipt=read(p.receipt);
    delete policy.transmission;policy.schema_version=1;receipt.policy=policy;
    save(p.policy,policy);save(p.receipt,receipt);
    const before=readFileSync(p.policy,'utf8');
    save(join(p.dir,'state','hook-call-synthetic.json'),{request_id:'unchanged',state:'unknown'});
    assert.equal(setDefaults({...o,clients:[client]}).status,'complete');
    assert.equal(readFileSync(p.policy,'utf8'),before);
    assert.equal(showTransmission({...o,clients:[client]}).clients[0].transmission_source,'legacy');
    assert.equal(setTransmission('description',{...o,clients:[client]}).status,'complete');
    assert.equal(read(p.policy).schema_version,2);assert.equal(read(p.policy).transmission,'description');
    assert.deepEqual(read(p.receipt).policy,read(p.policy));
    assert.deepEqual(read(join(p.dir,'state','hook-call-synthetic.json')),{request_id:'unchanged',state:'unknown'});
  }
});

test('owned disabled policy remains disabled through scope change; external modification is not adopted',t=>{
  const o=fixture(t);setupHosts(o);
  const p=privatePaths(o,'codex'),policy=read(p.policy),receipt=read(p.receipt);
  policy.enabled=false;receipt.policy=policy;save(p.policy,policy);save(p.receipt,receipt);
  assert.equal(setTransmission('description',{...o,clients:['codex']}).status,'complete');
  assert.equal(read(p.policy).enabled,false);
  const changed=read(p.policy);changed.mode='advisory';save(p.policy,changed);
  const before=readFileSync(p.receipt,'utf8');
  assert.equal(setTransmission('excerpt',{...o,clients:['codex']}).status,'partial');
  assert.equal(readFileSync(p.receipt,'utf8'),before);assert.deepEqual(read(p.policy),changed);
});

test('scope write failure restores policy and receipt instead of leaving mismatched ownership',t=>{
  const o=fixture(t);setupHosts(o);const p=privatePaths(o,'codex');
  const beforePolicy=readFileSync(p.policy,'utf8'),beforeReceipt=readFileSync(p.receipt,'utf8');
  const original=fs.renameSync;let failed=false;
  fs.renameSync=(source,target)=>{if(target===p.receipt&&!failed){failed=true;throw Object.assign(new Error('synthetic'),{code:'EIO'});}return original(source,target);};syncBuiltinESMExports();
  try {assert.equal(setTransmission('description',{...o,clients:['codex']}).status,'partial');}
  finally {fs.renameSync=original;syncBuiltinESMExports();}
  assert.equal(failed,true);assert.equal(readFileSync(p.policy,'utf8'),beforePolicy);assert.equal(readFileSync(p.receipt,'utf8'),beforeReceipt);
});

test('CLI noninteractive defaults do not opt in; --show is read-only and scope is explicit',t=>{
  const o=fixture(t),codex=join(o.home,'codex'),claude=join(o.home,'claude');
  const env={...process.env,HOME:o.home,CODEX_HOME:codex,CLAUDE_CONFIG_DIR:claude,CI:'1'};
  const run=(...args)=>spawnSync(process.execPath,['bin/aptly.ts',...args],{cwd:resolve('.'),env,encoding:'utf8'});
  let result=run('set','transmission','--show');assert.equal(result.status,0);assert.equal(existsSync(codex),false);
  result=run('set','default');assert.equal(result.status,0,result.stderr);
  assert.ok(JSON.parse(result.stdout).clients.every(c=>c.transmission==='unselected'));
  result=run('set','transmission','description','--client','codex');assert.equal(result.status,0,result.stderr);
  result=run('set','transmission','--show');const clients=JSON.parse(result.stdout).clients;
  assert.equal(clients.find(c=>c.client==='codex').transmission,'description');
  assert.equal(clients.find(c=>c.client==='claude').transmission,'unselected');
  assert.equal(run('setup','--client','codex','--mode','advisory','--transmission','excerpt').status,0);
  assert.equal(run('setup','--client','codex','--transmission','none').status,0);
  const kept=JSON.parse(run('set','transmission','--show','--client','codex').stdout).clients[0];
  assert.equal(kept.application_mode,'advisory');assert.equal(kept.transmission,'none');
  assert.equal(run('set','transmission','bad').status,1);
  assert.equal(run('set','transmission','--show','extra').status,1);
});

test('a prompt-time selection cannot overwrite a scope chosen by another operator',t=>{
 const o=fixture(t);setupHosts(o);assert.equal(setTransmission('description',o).status,'complete');
 const result=setTransmission('excerpt',{...o,selectUnselectedOnly:true});
 assert.equal(result.status,'partial');assert.ok(result.clients.every(c=>c.codes.includes('transmission_selection_changed')));
 assert.ok(showTransmission(o).clients.every(c=>c.transmission==='description'));
});
