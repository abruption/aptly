import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, writeFileSync, existsSync, chmodSync, linkSync, unlinkSync, symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { setupHosts, setTransmission, prepareTransmissionReview, showTransmission } from '../src/setup.ts';
import { createTestTemp } from '../test-support/temp.ts';

const load=path=>JSON.parse(readFileSync(path,'utf8'));
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const paths=(o,client='codex')=>{
  const host=join(o.home,client==='codex'?'.codex':'.claude'),dir=join(host,'aptly');
  return {host,dir,policy:join(dir,'auto-policy.json'),owner:join(dir,'setup-ownership.json'),marker:join(dir,'transmission-review.json'),mcp:client==='codex'?join(host,'config.toml'):join(o.home,'.claude.json'),hooks:join(host,client==='codex'?'hooks.json':'settings.json')};
};
function fixture(t) { return {home:createTestTemp(t,'codex-transmission-review-'),env:{},packageRoot:resolve('.')}; }
function alterPolicy(o,change) {const p=paths(o),policy=load(p.policy),owner=load(p.owner);change(policy);owner.policy=policy;save(p.policy,policy);save(p.owner,owner);}

test('review preparation and read-only state never create host directories',t=>{
  const o=fixture(t);
  assert.equal(prepareTransmissionReview(o).result.status,'skipped');
  assert.equal(prepareTransmissionReview(o).candidates.length,0);
  showTransmission(o);
  assert.equal(existsSync(paths(o).host),false);
  assert.equal(existsSync(paths(o,'claude').host),false);
});

test('new unselected setup keep selects none and acknowledges exactly once',t=>{
  const o=fixture(t);assert.equal(setupHosts(o).status,'complete');
  const before=prepareTransmissionReview(o);assert.equal(before.candidates.length,2);
  assert.deepEqual(before.candidates.map(c=>c.transmission),['unselected','unselected']);
  assert.equal(before.apply('keep').status,'complete');
  assert.deepEqual(showTransmission(o).clients.map(c=>[c.transmission,c.transmission_review]),[['none','complete'],['none','complete']]);
  assert.equal(prepareTransmissionReview(o).candidates.length,0);
  assert.equal(prepareTransmissionReview({...o,forceReview:true}).candidates.length,2);
  for(const client of ['codex','claude']) {
    const marker=load(paths(o,client).marker);
    assert.deepEqual(Object.keys(marker),['schema_version','revision','client','binding_sha256']);
    assert.equal(JSON.stringify(marker).includes(o.home),false);
  }
});

for(const legacy of [false,true]) test(`keep preserves ${legacy?'v1':'v2'} policy and ownership bytes`,t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'description'});
  if(legacy)alterPolicy(o,p=>{p.schema_version=1;delete p.transmission;});
  unlinkSync(paths(o).marker);
  const p=paths(o),before=[readFileSync(p.policy,'utf8'),readFileSync(p.owner,'utf8')];
  const review=prepareTransmissionReview(o);assert.equal(review.candidates[0].transmission,legacy?'excerpt':'description');
  assert.equal(review.apply('keep').status,'complete');
  assert.deepEqual([readFileSync(p.policy,'utf8'),readFileSync(p.owner,'utf8')],before);
  assert.equal(prepareTransmissionReview(o).candidates.length,0);
});

test('scope acknowledgement binds scope/home but excludes mode and enabled',t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'description'});
  const marker=readFileSync(paths(o).marker,'utf8');
  alterPolicy(o,p=>{p.mode='advisory';p.enabled=false;});
  assert.equal(prepareTransmissionReview(o).candidates.length,0);
  assert.equal(readFileSync(paths(o).marker,'utf8'),marker);
  alterPolicy(o,p=>p.transmission='excerpt');
  const review=prepareTransmissionReview(o);assert.equal(review.candidates.length,1);
  assert.equal(review.candidates[0].enabled,false);
  assert.equal(review.apply('none').status,'complete');assert.equal(load(paths(o).policy).enabled,false);
  const other=fixture(t);setupHosts({...other,clients:['codex'],transmission:'none'});
  writeFileSync(paths(other).marker,readFileSync(paths(o).marker));
  assert.equal(prepareTransmissionReview({...other,clients:['codex']}).candidates.length,1);
});

test('explicit scope only touches pending candidates; force review includes acknowledged hosts',t=>{
  const o=fixture(t);setupHosts(o);setTransmission('description',{...o,clients:['codex']});
  const p=paths(o),before=[readFileSync(p.policy,'utf8'),readFileSync(p.owner,'utf8'),readFileSync(p.marker,'utf8')];
  const review=prepareTransmissionReview(o);assert.deepEqual(review.candidates.map(c=>c.client),['claude']);
  assert.equal(review.apply('excerpt').status,'complete');
  assert.deepEqual([readFileSync(p.policy,'utf8'),readFileSync(p.owner,'utf8'),readFileSync(p.marker,'utf8')],before);
  assert.equal(prepareTransmissionReview({...o,forceReview:true}).candidates.length,2);
});

test('apply preserves all initial results and original client order',t=>{
  const o=fixture(t);setupHosts(o);setTransmission('description',{...o,clients:['codex']});
  let review=prepareTransmissionReview({...o,clients:['claude','codex']});
  const completed=review.result.clients[1];
  const invalid=review.apply('bad' as any);
  assert.deepEqual(invalid.clients.map(c=>c.client),['claude','codex']);
  assert.deepEqual(invalid.clients[1],completed);
  const applied=review.apply('none');
  assert.deepEqual(applied.clients.map(c=>c.client),['claude','codex']);
  assert.deepEqual(applied.clients[1],completed);
  assert.ok(applied.clients[0].codes.includes('transmission_review_complete'));
  const fresh=fixture(t);setupHosts({...fresh,clients:['codex']});
  review=prepareTransmissionReview(fresh);
  const absent=review.result.clients[1];
  const kept=review.apply('keep');
  assert.deepEqual(kept.clients.map(c=>c.client),['codex','claude']);
  assert.deepEqual(kept.clients[1],absent);
});

test('all preflight failures are reported and healthy candidates are blocked with metadata',t=>{
  const o=fixture(t);setupHosts(o);
  let review=prepareTransmissionReview(o);
  writeFileSync(paths(o).policy,readFileSync(paths(o).policy,'utf8')+'\n');
  const blocked=review.apply('none');
  assert.deepEqual(blocked.clients.map(c=>c.client),['codex','claude']);
  assert.equal(blocked.clients[0].status,'error');
  assert.equal(blocked.clients[1].status,'skipped');
  assert.deepEqual(blocked.clients[1].codes,['other_host_validation_failed']);
  assert.equal(blocked.clients[1].transmission_review,'required');
  assert.equal(blocked.clients[1].transmission,'unselected');
  assert.equal(existsSync(paths(o,'claude').marker),false);
  review=prepareTransmissionReview(o);
  for(const client of ['codex','claude'])writeFileSync(paths(o,client).owner,readFileSync(paths(o,client).owner,'utf8')+'\n');
  const failed=review.apply('keep');
  assert.deepEqual(failed.clients.map(c=>c.status),['error','error']);
  assert.ok(failed.clients.every(c=>c.codes.includes('concurrent_configuration_change')));
});

test('same explicit v2 choice only acknowledges marker and preserves nonstandard JSON bytes',t=>{
  const o={...fixture(t),clients:['claude']};setupHosts({...o,transmission:'description'});const p=paths(o,'claude');
  unlinkSync(p.marker);
  const preserved=[p.mcp,p.hooks,p.policy,p.owner];
  for(const path of preserved)writeFileSync(path,JSON.stringify(load(path),null,4)+'\n\n');
  const before=preserved.map(path=>readFileSync(path,'utf8'));
  const reviewed=prepareTransmissionReview(o).apply('description');
  assert.equal(reviewed.status,'complete');
  assert.deepEqual(preserved.map(path=>readFileSync(path,'utf8')),before);
  assert.deepEqual(reviewed.clients[0].codes,['transmission_review_complete']);
  assert.equal(existsSync(p.marker),true);
});

test('explicit legacy excerpt choice migrates v1 and acknowledges review',t=>{
  const o={...fixture(t),clients:['codex']};setupHosts(o);
  alterPolicy(o,p=>{p.schema_version=1;delete p.transmission;});
  const reviewed=prepareTransmissionReview(o).apply('excerpt');
  assert.equal(reviewed.status,'complete');assert.equal(load(paths(o).policy).schema_version,2);
  assert.ok(reviewed.clients[0].codes.includes('transmission_review_complete'));
});

test('display-first-read change before plan snapshot fails before prompting',t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'description'});const p=paths(o);
  const originalRead=fs.readFileSync,originalWrite=fs.writeFileSync;let changed=false;
  fs.readFileSync=((path,...args)=>{
    const result=originalRead(path,...args);
    if(path===p.hooks&&!changed){
      changed=true;
      const policy=JSON.parse(originalRead(p.policy,'utf8')),owner=JSON.parse(originalRead(p.owner,'utf8'));
      policy.transmission='excerpt';owner.policy=policy;
      originalWrite(p.policy,JSON.stringify(policy,null,2)+'\n');originalWrite(p.owner,JSON.stringify(owner,null,2)+'\n');
    }
    return result;
  }) as typeof fs.readFileSync;syncBuiltinESMExports();
  let reviewed;
  try { reviewed=prepareTransmissionReview(o); }
  finally {fs.readFileSync=originalRead;syncBuiltinESMExports();}
  assert.equal(changed,true);assert.equal(reviewed.result.status,'partial');assert.equal(reviewed.candidates.length,0);
  assert.ok(reviewed.result.clients[0].codes.includes('concurrent_configuration_change'));
  assert.equal(load(p.policy).transmission,'excerpt');
});

for(const file of ['policy','mcp','owner','hooks','marker']) test(`prompt-time ${file} edit is preserved without any write`,t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'description'});
  const review=prepareTransmissionReview({...o,forceReview:true}),p=paths(o);
  const changed=readFileSync(p[file],'utf8')+'\n';writeFileSync(p[file],changed);
  const policy=readFileSync(p.policy,'utf8'),owner=readFileSync(p.owner,'utf8');
  const result=review.apply('none');assert.equal(result.status,'partial');
  assert.ok(result.clients[0].codes.includes('concurrent_configuration_change'));
  assert.equal(readFileSync(p[file],'utf8'),changed);
  assert.equal(readFileSync(p.policy,'utf8'),policy);assert.equal(readFileSync(p.owner,'utf8'),owner);
});

test('all clients preflight before writes and incomplete registration requires setup',t=>{
  const o=fixture(t);setupHosts(o);const p=paths(o,'claude');
  unlinkSync(p.hooks);const review=prepareTransmissionReview(o);
  assert.equal(review.result.status,'partial');assert.equal(review.candidates.length,0);
  assert.ok(review.result.clients.some(c=>c.codes.includes('transmission_review_requires_setup')));
  assert.equal(existsSync(paths(o).marker),false);assert.equal(existsSync(p.hooks),false);
});

test('malformed private marker is pending and may be replaced on explicit answer',t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'none'});
  writeFileSync(paths(o).marker,'{broken');const review=prepareTransmissionReview(o);
  assert.equal(review.candidates.length,1);assert.equal(review.apply('keep').status,'complete');
  assert.equal(prepareTransmissionReview(o).candidates.length,0);
});

for(const unsafe of ['mode','hardlink','symlink']) test(`unsafe ${unsafe} marker fails closed`,t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'none'});const p=paths(o);
  if(unsafe==='mode')chmodSync(p.marker,0o644);
  if(unsafe==='hardlink')linkSync(p.marker,join(p.dir,'alias'));
  if(unsafe==='symlink'){unlinkSync(p.marker);symlinkSync(p.policy,p.marker);}
  const review=prepareTransmissionReview(o);assert.equal(review.result.status,'partial');assert.equal(review.candidates.length,0);
});

test('marker staging failure rolls back policy and ownership',t=>{
  const o={...fixture(t),clients:['codex']};setupHosts({...o,transmission:'description'});const p=paths(o);
  const before=[readFileSync(p.policy,'utf8'),readFileSync(p.owner,'utf8'),readFileSync(p.marker,'utf8')];
  const original=fs.renameSync;let failed=false;
  fs.renameSync=(source,target)=>{if(target===p.marker&&!failed){failed=true;throw Object.assign(new Error('synthetic'),{code:'EIO'});}return original(source,target);};syncBuiltinESMExports();
  try { assert.equal(prepareTransmissionReview({...o,forceReview:true}).apply('excerpt').status,'partial'); }
  finally {fs.renameSync=original;syncBuiltinESMExports();}
  assert.equal(failed,true);
  assert.deepEqual([readFileSync(p.policy,'utf8'),readFileSync(p.owner,'utf8'),readFileSync(p.marker,'utf8')],before);
});
