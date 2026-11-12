import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,renameSync} from 'node:fs';
import fs from 'node:fs';
import {join} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {parse,stringify} from 'smol-toml';
import {createTestTemp} from '../test-support/temp.ts';
import {setupHosts,migrateLauncher,checkSetup,setCredentialReference,setDefaults,setPolicySource,setStatisticsCollection,removeSetup,showStatistics,showTransmission} from '../src/setup.ts';
import {collectDoctor} from '../src/doctor.ts';
import {validateStableRegistration} from '../src/stable-runtime.ts';
const posix={skip:process.platform==='win32'};
function fixture(t){
 // Unit-only filesystem metadata adapter for this prescribed external work volume.
 // It models a protected HOME; no launcher process is executed by these setup tests.
 const volume=process.cwd().match(/^\/Volumes\/[^/]+/)?.[0];
 if(volume&&(fs.lstatSync(volume).mode&0o022)){
  const old=fs.lstatSync;fs.lstatSync=((path,...args)=>{const value=old(path,...args);if(String(path)!==volume)return value;const view=Object.create(value);Object.defineProperty(view,'mode',{value:value.mode&~0o022});return view;})as typeof fs.lstatSync;syncBuiltinESMExports();
  t.after(()=>{fs.lstatSync=old;syncBuiltinESMExports();});
 }
 const dir=createTestTemp(t,'codex-stable-setup-'),home=join(dir,'home'),root=join(dir,'package');mkdirSync(home,{mode:0o700});
 mkdirSync(join(root,'dist/src'),{recursive:true});mkdirSync(join(root,'dist/bin'),{recursive:true});
 writeFileSync(join(root,'package.json'),JSON.stringify({name:'aptly',version:'0.1.13',type:'module',dependencies:{}}));writeFileSync(join(root,'LICENSE'),'MIT fixture');
 writeFileSync(join(root,'dist/src/server.js'),"import './runtime.js';export async function serve(){}\n");
 writeFileSync(join(root,'dist/src/runtime.js'),"export const markers=['APTLY_SECRET_BACKEND','APTLY_SECRET_CLIENT'];\n");
 writeFileSync(join(root,'dist/bin/aptly-observe.js'),'// isolated fixture observer\n');
 const options={home,packageRoot:root,env:{}},config=join(home,'.codex/config.toml');
 const entry=(client='codex')=>client==='codex'?(parse(readFileSync(config,'utf8'))as any).mcp_servers.aptly:JSON.parse(readFileSync(join(home,'.claude.json'),'utf8')).mcpServers.aptly;
 const policy=(client='codex')=>join(home,client==='codex'?'.codex':'.claude','aptly/auto-policy.json');
 return {dir,home,root,options,config,entry,policy};
}
const complete=r=>assert.equal(r.status,'complete',JSON.stringify(r));
test('explicit new stable setup creates shared immutable launcher; check/credentials/defaults/policy/doctor remain compatible',posix,t=>{
 const f=fixture(t);complete(setupHosts({...f.options,launcher:'stable'}));const e=f.entry(),stable=validateStableRegistration(e,{home:f.home});assert.ok(stable);assert.deepEqual(e.args,['serve']);assert.equal(f.entry('claude').command,e.command);assert.ok(!e.command.includes('.nvm'));
 complete(checkSetup(f.options));complete(setDefaults({...f.options,clients:['codex']}));complete(setCredentialReference({...f.options,clients:['codex']}));complete(setPolicySource({...f.options,clients:['codex']},true));complete(setPolicySource({...f.options,clients:['codex']},false));
 complete(showTransmission(f.options));const before=readFileSync(e.command);const doctor=collectDoctor(f.options);complete(doctor);assert.ok(doctor.clients.every(c=>c.registration==='stable_runtime_registration'));assert.deepEqual(readFileSync(e.command),before);
});
test('legacy remains default; existing direct registration requires explicit migration for stable',posix,t=>{
 const f=fixture(t);complete(setupHosts(f.options));assert.equal(f.entry().command,process.execPath);const before=readFileSync(f.config);
 const r=setupHosts({...f.options,clients:['codex'],launcher:'stable'});assert.equal(r.status,'partial');assert.ok(r.clients[0].codes.includes('stable_launcher_migration_required'));assert.deepEqual(readFileSync(f.config),before);assert.equal(existsSync(join(f.home,'.local')),false);
});
test('migration dry-run has no runtime/host writes and actual migration preserves env/policy/data',posix,t=>{
 const f=fixture(t);complete(setupHosts(f.options));const original=f.entry(),policy=readFileSync(f.policy()),state=join(f.home,'.codex/aptly/state'),ledger=join(state,'ledger.json');writeFileSync(ledger,'PRESERVE_LEDGER');const options={...f.options,clients:['codex']as['codex'],launcher:'stable'as const};
 const before=readFileSync(f.config);complete(migrateLauncher(options,true));assert.equal(existsSync(join(f.home,'.local')),false);assert.deepEqual(readFileSync(f.config),before);
 complete(migrateLauncher(options,false));const e=f.entry();assert.ok(validateStableRegistration(e,{home:f.home}));assert.deepEqual(e.env,original.env);assert.deepEqual(e.env_vars,original.env_vars);assert.deepEqual(readFileSync(f.policy()),policy);assert.equal(readFileSync(ledger,'utf8'),'PRESERVE_LEDGER');
});
test('owned enabled statistics observers migrate with MCP without changing native metadata/keys/history',posix,t=>{
 const f=fixture(t);complete(setupHosts(f.options));const options={...f.options,clients:['codex']as['codex']};complete(setStatisticsCollection(true,{...options,codexNativeMetadata:true}));
 const state=join(f.home,'.codex/aptly/state'),config=readFileSync(join(state,'stats-config.json')),key=readFileSync(join(state,'stats-key')),db=readFileSync(join(state,'stats.sqlite'));
 complete(migrateLauncher({...options,launcher:'stable'},false));const e=f.entry(),hooks=JSON.parse(readFileSync(join(f.home,'.codex/hooks.json'),'utf8')).hooks;
 for(const name of ['PostToolUse','SubagentStart','PostModelRequest','SubagentStop']){const handler=hooks[name][0].hooks[0];assert.ok(handler.command.includes(e.command));assert.ok(handler.command.includes("'observe'"));assert.ok(!handler.command.includes('aptly-observe.js'));}
 assert.deepEqual(readFileSync(join(state,'stats-config.json')),config);assert.deepEqual(readFileSync(join(state,'stats-key')),key);assert.deepEqual(readFileSync(join(state,'stats.sqlite')),db);complete(showStatistics(options));
 complete(setStatisticsCollection(true,{...options,codexNativeMetadata:true}));assert.deepEqual(readFileSync(join(state,'stats-config.json')),config);
});
test('stable mode is sticky across ordinary setup and migration; explicit next generation preserves old one',posix,t=>{
 const f=fixture(t),options={...f.options,clients:['codex']as['codex']};complete(setupHosts({...options,launcher:'stable'}));const first=f.entry().command;complete(setupHosts(options));assert.equal(f.entry().command,first);complete(migrateLauncher(options,false));assert.equal(f.entry().command,first);
 writeFileSync(join(f.root,'dist/src/server.js'),"import './runtime.js';export async function serve(){} // next generation\n");complete(migrateLauncher(options,false));assert.notEqual(f.entry().command,first);assert.equal(existsSync(first),true);assert.ok(validateStableRegistration(f.entry(),{home:f.home}));
});
test('modified statistics observers block the whole migration without adopting changes',posix,t=>{
 const f=fixture(t),options={...f.options,clients:['codex']as['codex']};complete(setupHosts(options));complete(setStatisticsCollection(true,options));const path=join(f.home,'.codex/hooks.json'),hooks=JSON.parse(readFileSync(path,'utf8'));hooks.hooks.PostToolUse[0].hooks[0].command+=' --custom';writeFileSync(path,JSON.stringify(hooks));const before=readFileSync(f.config),receipt=readFileSync(join(f.home,'.codex/aptly/stats-ownership.json'));
 const r=migrateLauncher({...options,launcher:'stable'},false);assert.equal(r.status,'partial');assert.ok(r.clients[0].codes.includes('managed_hook_changed'));assert.deepEqual(readFileSync(f.config),before);assert.deepEqual(readFileSync(join(f.home,'.codex/aptly/stats-ownership.json')),receipt);assert.equal(existsSync(join(f.home,'.local')),false);
});
test('custom launcher is never adopted and failed multi-client planning writes no stable state',posix,t=>{
 const f=fixture(t);complete(setupHosts(f.options));const cfg=parse(readFileSync(f.config,'utf8'))as any;cfg.mcp_servers.aptly.command='/custom/launcher';writeFileSync(f.config,stringify(cfg));const before=readFileSync(f.config);const r=migrateLauncher({...f.options,clients:['codex'],launcher:'stable'},false,true);assert.equal(r.status,'partial');assert.deepEqual(readFileSync(f.config),before);assert.equal(existsSync(join(f.home,'.local')),false);
 const g=fixture(t);mkdirSync(join(g.home,'.claude'),{recursive:true});writeFileSync(join(g.home,'.claude.json'),'{bad-json');assert.equal(setupHosts({...g.options,launcher:'stable'}).status,'partial');assert.equal(existsSync(join(g.home,'.local')),false);assert.equal(existsSync(g.config),false);
});
test('remove keeps shared snapshot and history, mutation rejects credential preparation without repair',posix,t=>{
 const f=fixture(t),options={...f.options,clients:['codex']as['codex']};complete(setupHosts({...options,launcher:'stable'}));const e=f.entry(),s=validateStableRegistration(e,{home:f.home})!;
 writeFileSync(join(s.packageRoot,'dist/src/runtime.js'),'MODIFIED');const config=readFileSync(f.config);assert.equal(setCredentialReference(options).status,'partial');assert.deepEqual(readFileSync(f.config),config);assert.equal(collectDoctor(options).status,'complete'); // metadata-only does not certify the full payload
 complete(removeSetup(options));assert.equal(existsSync(e.command),true);
});
test('a host commit failure restores prior references; generated payload remains unreferenced',posix,t=>{
 const f=fixture(t),options={...f.options,clients:['codex']as['codex']};complete(setupHosts(options));const before=readFileSync(f.config),old=fs.renameSync;let injected=false;
 fs.renameSync=((from,to)=>{if(to===f.config&&!injected){injected=true;throw Error('synthetic_commit_failure');}return old(from,to);})as typeof fs.renameSync;syncBuiltinESMExports();
 try{assert.equal(migrateLauncher({...options,launcher:'stable'},false).status,'partial');assert.equal(injected,true);assert.deepEqual(readFileSync(f.config),before);}finally{fs.renameSync=old;syncBuiltinESMExports();}
 const roots=join(f.home,'.local/share/aptly/runtimes');assert.equal(existsSync(roots),true);assert.ok(readdirSync(roots).length>0);
});
test('explicitly included preserved standard registration stays user-owned through stable remigration',posix,t=>{
 const f=fixture(t);mkdirSync(join(f.home,'.codex'),{mode:0o700});writeFileSync(f.config,stringify({mcp_servers:{aptly:{command:process.execPath,args:[join(f.root,'dist/src/server.js')],env:{ROUTER_PROVIDER:'fixture',CUSTOM_KEEP:'unchanged'}}}}));
 const options={...f.options,clients:['codex']as['codex']};complete(setupHosts(options));assert.equal(JSON.parse(readFileSync(join(f.home,'.codex/aptly/setup-ownership.json'),'utf8')).mcp_created,false);
 assert.equal(migrateLauncher({...options,launcher:'stable'},false).status,'partial');complete(migrateLauncher({...options,launcher:'stable'},false,true));const first=f.entry().command;assert.ok(validateStableRegistration(f.entry(),{home:f.home}));assert.equal(f.entry().env.CUSTOM_KEEP,'unchanged');
 complete(setCredentialReference(options));complete(migrateLauncher(options,false,true));assert.equal(f.entry().command,first);complete(removeSetup(options));assert.equal(f.entry().command,first);assert.equal(f.entry().env.CUSTOM_KEEP,'unchanged');assert.equal(existsSync(first),true);
});
