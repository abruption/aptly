import test from 'node:test';
import assert from 'node:assert/strict';
import fs, {readFileSync,writeFileSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {setupHosts,migrateLauncher,removeSetup} from '../src/setup.ts';
import {prepareApiKey,setApiKey} from '../src/credential-setup.ts';
import {createTestTemp} from '../test-support/temp.ts';
const value='sk-synthetic-migration-value-12345';
const save=(p,v)=>writeFileSync(p,typeof v==='string'?v:JSON.stringify(v),{mode:0o600});
const load=p=>JSON.parse(readFileSync(p,'utf8'));
function fixture(t,client='claude'){
 const home=createTestTemp(t,'codex-launcher-migration-');
 const options={home,env:{},clients:[client],packageRoot:resolve('.')};
 const dir=join(home,client==='claude'?'.claude':'.codex');
 const config=client==='claude'?join(home,'.claude.json'):join(dir,'config.toml');
 const receipt=join(dir,'aptly/setup-ownership.json');
 return {home,options,dir,config,receipt};
}
function backend(){const data=new Map();return {data,loadSecret:({account})=>data.get(account)??null,storeSecret:(v,{account})=>data.set(account,v),deleteSecret:({account})=>data.delete(account)};}
function snapshot(f){return [f.config,join(f.dir,f.options.clients[0]==='claude'?'settings.json':'hooks.json'),f.receipt,join(f.dir,'aptly/auto-policy.json')].map(p=>[p,readFileSync(p,'utf8')]);}
function unchanged(s){for(const [p,text] of s)assert.equal(readFileSync(p,'utf8'),text);}

test('read-only current preflight does not create files or access a credential backend',t=>{
 const f=fixture(t);const plan=prepareApiKey(f.options);
 assert.equal(plan.result.status,'complete');assert.equal(plan.result.clients[0].status,'unchanged');assert.deepEqual(readdirSync(f.home),[]);
});
for(const client of ['codex','claude'])test(`${client}: explicit stale-root migration preserves policy and environment, updates receipt and supports OS references`,t=>{
 const f=fixture(t,client);assert.equal(setupHosts({...f.options,packageRoot:join(f.home,'old-install'),mode:'advisory'}).status,'complete');
 const before=snapshot(f),diagnostic=prepareApiKey(f.options).result;
 assert.equal(diagnostic.status,'partial');assert.ok(diagnostic.clients[0].codes.includes('credential_server_mismatch'));assert.doesNotMatch(JSON.stringify(diagnostic),new RegExp(f.home));
 assert.equal(migrateLauncher(f.options,true).status,'complete');unchanged(before);
 assert.equal(migrateLauncher(f.options).status,'complete');
 const owner=load(f.receipt);assert.deepEqual(owner.mcp.args,[join(resolve('.'),'dist/src/server.js')]);assert.equal(owner.policy.mode,'advisory');
 for(const [p,text] of before.filter(([p])=>p.endsWith('auto-policy.json')||p.endsWith('settings.json')||p.endsWith('hooks.json')))assert.equal(readFileSync(p,'utf8'),text);
 const b=backend();assert.equal(setApiKey(value,f.options,b).status,'complete');assert.equal(b.data.get(`${client}:OPENAI_API_KEY`),value);
 assert.equal(removeSetup(f.options).status,'complete');
});
test('receipt-matching changed Node path migrates without invoking the old executable',t=>{
 const f=fixture(t);setupHosts(f.options);const c=load(f.config),o=load(f.receipt);
 c.mcpServers.aptly.command=join(f.home,'retired-node','node');o.mcp.command=c.mcpServers.aptly.command;save(f.config,c);save(f.receipt,o);
 assert.ok(prepareApiKey(f.options).result.clients[0].codes.includes('credential_node_mismatch'));
 assert.equal(migrateLauncher(f.options).status,'complete');assert.equal(load(f.config).mcpServers.aptly.command,process.execPath);
});
test('custom and operator-modified launchers are never implicitly or explicitly adopted',t=>{
 for(const owned of [false,true]){
  const f=fixture(t);if(owned)setupHosts(f.options);else mkdirSync(f.dir);
  const c=owned?load(f.config):{mcpServers:{}};c.mcpServers.aptly={command:'/synthetic/private-wrapper',args:['private-argument'],env:{SECRET:'synthetic-private-value'}};save(f.config,c);
  if(!owned)assert.equal(setupHosts(f.options).status,'complete');
  const before=snapshot(f);let calls=0;const b={loadSecret(){calls++;return null;},storeSecret(){calls++;},deleteSecret(){calls++;}};
  assert.equal(setApiKey(value,f.options,b).status,'partial');assert.equal(calls,0);
  assert.equal(migrateLauncher(f.options,true).status,'partial');assert.equal(migrateLauncher(f.options).status,'partial');unchanged(before);
  assert.doesNotMatch(JSON.stringify(prepareApiKey(f.options).result),/private-wrapper|private-argument|synthetic-private-value/);
 }
});
test('mixed hosts preserve a successful Codex registration while Claude is diagnosed and later migrated alone',t=>{
 const f=fixture(t);setupHosts({...f.options,clients:['codex']});setupHosts({...f.options,packageRoot:join(f.home,'old')});
 const b=backend();const r=setApiKey(value,{...f.options,clients:['codex','claude']},b);
 assert.equal(r.status,'partial');assert.equal(r.clients[0].status,'configured');assert.equal(r.clients[1].status,'error');assert.equal(b.data.has('claude:OPENAI_API_KEY'),false);
 const codex=readFileSync(join(f.home,'.codex/config.toml'),'utf8');assert.equal(migrateLauncher(f.options).status,'complete');assert.equal(setApiKey(value,f.options,b).status,'complete');assert.equal(readFileSync(join(f.home,'.codex/config.toml'),'utf8'),codex);
});
test('prompt-time edits, including unchanged reference files, prevent all credential access',t=>{
 const f=fixture(t),b=backend();assert.equal(setApiKey(value,f.options,b).status,'complete');
 const plan=prepareApiKey(f.options),c=load(f.config);c.operatorChange=true;save(f.config,c);
 const noAccess={loadSecret(){assert.fail('read');},storeSecret(){assert.fail('write');},deleteSecret(){assert.fail('delete');}};
 const r=plan.apply(value,noAccess);assert.ok(r.clients[0].codes.includes('concurrent_configuration_change'));assert.equal(load(f.config).operatorChange,true);
 assert.ok(plan.apply(value,noAccess).clients[0].codes.includes('credential_plan_consumed'));
});
test('configuration changes during OS write preserve operator data and recover the previous credential',t=>{
 const f=fixture(t),b=backend();setupHosts(f.options);b.data.set('claude:OPENAI_API_KEY','previous-synthetic');const store=b.storeSecret;
 b.storeSecret=(v,o)=>{store(v,o);if(v===value){const c=load(f.config);c.operatorChange=true;save(f.config,c);}};
 const r=setApiKey(value,f.options,b);assert.ok(r.clients[0].codes.includes('concurrent_configuration_change'));assert.equal(b.data.get('claude:OPENAI_API_KEY'),'previous-synthetic');assert.equal(load(f.config).operatorChange,true);
});
test('recovery does not overwrite a third-party credential observed after a failed write',t=>{
 const f=fixture(t),b=backend();b.data.set('claude:OPENAI_API_KEY','previous-synthetic');b.storeSecret=(_,o)=>{b.data.set(o.account,'concurrent-synthetic');throw Error('secure_store_timeout');};
 const r=setApiKey(value,f.options,b);assert.ok(r.clients[0].codes.includes('credential_rollback_failed'));assert.equal(b.data.get('claude:OPENAI_API_KEY'),'concurrent-synthetic');assert.deepEqual(readdirSync(f.home),[]);
});
test('migration rolls back its config if the receipt write fails',t=>{
 const f=fixture(t);setupHosts({...f.options,packageRoot:join(f.home,'old')});const before=snapshot(f),rename=fs.renameSync;
 fs.renameSync=(from,to)=>{if(to===f.receipt)throw Error('synthetic-write-failure');return rename(from,to);};syncBuiltinESMExports();
 try{assert.equal(migrateLauncher(f.options).status,'partial');unchanged(before);}finally{fs.renameSync=rename;syncBuiltinESMExports();}
});
test('migration refuses a concurrent receipt edit and reports rollback conflicts without overwriting them',t=>{
 const f=fixture(t);setupHosts({...f.options,packageRoot:join(f.home,'old')});const rename=fs.renameSync;
 fs.renameSync=(from,to)=>{const r=rename(from,to);if(to===f.config){const c=load(f.config);c.concurrent=true;save(f.config,c);const o=load(f.receipt);o.concurrent=true;save(f.receipt,o);}return r;};syncBuiltinESMExports();
 try{const r=migrateLauncher(f.options);assert.equal(r.status,'partial');assert.ok(r.clients[0].codes.includes('concurrent_configuration_change'));assert.ok(r.clients[0].codes.includes('rollback_concurrent_change'));assert.equal(load(f.config).concurrent,true);assert.equal(load(f.receipt).concurrent,true);}finally{fs.renameSync=rename;syncBuiltinESMExports();}
});

test('missing ownership or unsupported current runtime cannot be migrated or store a key',t=>{
 const f=fixture(t);setupHosts({...f.options,packageRoot:join(f.home,'old')});unlinkSync(f.receipt);
 assert.equal(migrateLauncher(f.options).clients[0].codes[0],'launcher_migration_not_owned');
 const g=fixture(t);setupHosts(g.options);const before=snapshot(g);
 const bad={...g.options,packageRoot:join(g.home,'missing-current-build')};
 assert.equal(migrateLauncher(bad).status,'partial');unchanged(before);
 const h=fixture(t);setupHosts({...h.options,packageRoot:join(h.home,'missing')});
 const diagnostic=prepareApiKey({...h.options,packageRoot:join(h.home,'missing')}).result;
 assert.ok(diagnostic.clients[0].codes.includes('credential_runtime_unsupported'));
});
