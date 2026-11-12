import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse,stringify} from 'smol-toml';
import {setupHosts,migrateLauncher,removeSetup} from '../src/setup.ts';
import {setApiKey} from '../src/credential-setup.ts';
import {createTestTemp} from '../test-support/temp.ts';

const load=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,v)=>writeFileSync(p,typeof v==='string'?v:JSON.stringify(v),{mode:0o600});
function fixture(t,client='claude'){
 const home=createTestTemp(t,'codex-preserved-launcher-'),dir=join(home,client==='claude'?'.claude':'.codex');
 mkdirSync(dir);
 const options={home,env:{},clients:[client],packageRoot:resolve('.')};
 const config=client==='claude'?join(home,'.claude.json'):join(dir,'config.toml');
 const receipt=join(dir,'aptly/setup-ownership.json'),policy=join(dir,'aptly/auto-policy.json'),hooks=join(dir,client==='claude'?'settings.json':'hooks.json');
 const staleCommand=join(home,'retired-runtime',process.platform==='win32'?'node.exe':'node'),staleArgs=[join(home,'old','dist','src','server.js')];
 const entry={command:staleCommand,args:staleArgs,env:{KEEP:'synthetic-retained-setting'},unknown:'preserved'};
 const original=client==='claude'?{top_level:'preserved',mcpServers:{aptly:entry,other:{command:'preserve-other'}}}:{model:'keep-model',mcp_servers:{aptly:entry,other:{command:'preserve-other'}}};
 save(config,client==='claude'?original:'# keep this comment\n'+stringify(original));
 assert.equal(setupHosts({...options,mode:'advisory'}).status,'complete');
 const readConfig=()=>client==='claude'?load(config):parse(readFileSync(config,'utf8'));
 const writeConfig=c=>save(config,client==='claude'?c:stringify(c));
 const server=c=>c[client==='claude'?'mcpServers':'mcp_servers'].aptly;
 const paths=[config,receipt,policy,hooks];
 const snapshot=()=>paths.map(p=>[p,readFileSync(p,'utf8')]);
 const unchanged=before=>{for(const [p,text] of before)assert.equal(readFileSync(p,'utf8'),text);};
 return{home,dir,options,config,receipt,policy,hooks,readConfig,writeConfig,server,snapshot,unchanged,staleCommand,staleArgs};
}
for(const client of ['codex','claude']){
 test(`${client}: preserved standard launcher requires explicit opt-in, with read-only preview and no ownership adoption`,t=>{
  const f=fixture(t,client),before=f.snapshot(),original=f.readConfig(),owner=load(f.receipt);
  assert.equal(owner.mcp_created,false);assert.equal(owner.mcp,undefined);
  assert.equal(migrateLauncher(f.options,true).clients[0].codes[0],'launcher_migration_not_owned');
  assert.equal(migrateLauncher(f.options).status,'partial');f.unchanged(before);
  assert.equal(migrateLauncher(f.options,true,true).status,'complete');f.unchanged(before);
  assert.equal(migrateLauncher(f.options,false,true).status,'complete');
  const migrated=f.readConfig();f.server(original).command=process.execPath;f.server(original).args=[join(resolve('.'),'dist','src','server.js')];
  assert.deepEqual(migrated,original);assert.deepEqual(load(f.receipt),owner);
  for(const [p,text] of before.filter(([p])=>p!==f.config))assert.equal(readFileSync(p,'utf8'),text);
  if(client==='codex')assert.ok(readFileSync(f.config,'utf8').startsWith('# keep this comment\n'));
  assert.equal(migrateLauncher(f.options,false,true).status,'complete');
  assert.equal(removeSetup(f.options).status,'complete');
  const retained=f.server(f.readConfig());assert.equal(retained.command,process.execPath);assert.deepEqual(retained.args,[join(resolve('.'),'dist','src','server.js')]);
  assert.deepEqual({...retained.env},{KEEP:'synthetic-retained-setting'});assert.equal(retained.unknown,'preserved');
 });
 test(`${client}: explicitly migrated preserved launcher supports synthetic credential references without changing another host`,t=>{
  const f=fixture(t,client),other=client==='claude'?'codex':'claude';assert.equal(setupHosts({...f.options,clients:[other]}).status,'complete');
  const otherConfig=other==='claude'?join(f.home,'.claude.json'):join(f.home,'.codex/config.toml'),otherBefore=readFileSync(otherConfig,'utf8');
  assert.equal(migrateLauncher(f.options,false,true).status,'complete');
  const data=new Map(),backend={loadSecret:({account})=>data.get(account)??null,storeSecret:(v,{account})=>data.set(account,v),deleteSecret:({account})=>data.delete(account)};
  assert.equal(setApiKey('sk-synthetic-preserved-launcher-12345',f.options,backend).status,'complete');
  assert.equal(data.get(`${client}:OPENAI_API_KEY`),'sk-synthetic-preserved-launcher-12345');
  assert.equal(load(f.receipt).mcp_created,false);assert.equal(readFileSync(otherConfig,'utf8'),otherBefore);
  assert.equal(removeSetup(f.options).status,'complete');assert.deepEqual({...f.server(f.readConfig()).env},{KEEP:'synthetic-retained-setting'});
 });
 test(`${client}: opt-in refuses changed managed additions, policy, Hook and missing ownership`,t=>{
  for(const change of ['env','policy','hook','missing']){
   const f=fixture(t,client);
   if(change==='env'){const c=f.readConfig();f.server(c).env.ROUTER_LEDGER_PATH=join(f.home,'changed-ledger');f.writeConfig(c);}
   if(change==='policy'){const p=load(f.policy);p.enabled=false;save(f.policy,p);}
   if(change==='hook'){const h=load(f.hooks);h.hooks.PreToolUse[0].hooks[0].timeout=99;save(f.hooks,h);}
   if(change==='missing')unlinkSync(f.receipt);
   const paths=[f.config,f.policy,f.hooks,...(change==='missing'?[]:[f.receipt])],before=paths.map(p=>[p,readFileSync(p,'utf8')]);
   for(const dryRun of [true,false])assert.equal(migrateLauncher(f.options,dryRun,true).status,'partial');
   for(const [p,text] of before)assert.equal(readFileSync(p,'utf8'),text);
  }
 });
 test(`${client}: opt-in rejects wrappers, relative paths, extra arguments and nonstandard server paths`,t=>{
  for(const change of ['wrapper','relative-node','relative-server','extra-arg','foreign-server']){
   const f=fixture(t,client),c=f.readConfig(),entry=f.server(c);
   if(change==='wrapper')entry.command=join(f.home,'private-wrapper');
   if(change==='relative-node')entry.command='node';
   if(change==='relative-server')entry.args=['dist/src/server.js'];
   if(change==='extra-arg')entry.args.push('--custom');
   if(change==='foreign-server')entry.args=[join(f.home,'foreign-server.js')];
   f.writeConfig(c);const before=f.snapshot();
   for(const dryRun of [true,false])assert.equal(migrateLauncher(f.options,dryRun,true).status,'partial');
   f.unchanged(before);
  }
 });
}
test('include-existing never overrides a modified Aptly-created registration receipt',t=>{
 const home=createTestTemp(t,'codex-preserved-owned-'),options={home,env:{},clients:['claude'],packageRoot:resolve('.')};
 assert.equal(setupHosts(options).status,'complete');const path=join(home,'.claude.json'),c=load(path);c.mcpServers.aptly.args=[join(home,'changed/dist/src/server.js')];save(path,c);
 const before=readFileSync(path,'utf8');assert.equal(migrateLauncher(options,false,true).clients[0].codes[0],'launcher_migration_not_owned');assert.equal(readFileSync(path,'utf8'),before);
});
test('CLI include-existing requires explicit single-client launcher migration and rejects ambiguous combinations without writes',t=>{
 const home=createTestTemp(t,'codex-preserved-cli-');
 const run=args=>spawnSync(process.execPath,[resolve('bin/aptly.ts'),...args],{env:{PATH:process.env.PATH,HOME:home,USERPROFILE:home},encoding:'utf8',timeout:15000});
 for(const args of [
  ['setup','--include-existing'],['setup','--include-existing','--dry-run'],['remove','--include-existing'],
  ['setup','--migrate-launcher','--include-existing'],['setup','--client','all','--migrate-launcher','--include-existing'],
  ['setup','--client','claude','--migrate-launcher','--include-existing','--automatic'],
  ['setup','--client','claude','--migrate-launcher','--include-existing','--mode','defaults'],
  ['setup','--client','claude','--migrate-launcher','--include-existing','--include-existing']
 ]){const r=run(args);assert.equal(r.status,1);assert.match(r.stderr,/aptly: setup_invalid_options/);}
 assert.deepEqual(readdirSync(home),[]);
 const help=run(['setup','--help']);assert.equal(help.status,0);assert.match(help.stdout,/--include-existing/);
});

test('Codex preserved migration refuses multiline launcher assignments and inline tables without rewriting unrelated layout',t=>{
 for(const layout of ['multiline','inline']){
  const f=fixture(t,'codex');
  if(layout==='multiline'){
   const text=readFileSync(f.config,'utf8');
   save(f.config,text.replace(/^args = (.+)$/m,(_,args)=>'args = [\n  '+JSON.stringify(JSON.parse(args)[0])+'\n]'));
  }else{
   const entry=f.server(f.readConfig());
   const env=Object.entries(entry.env).map(([key,value])=>key+' = '+JSON.stringify(value)).join(', ');
   save(f.config,'# preserve inline layout\nmcp_servers = { aptly = { command = '+JSON.stringify(entry.command)+', args = '+JSON.stringify(entry.args)+', env = { '+env+' } } }\n');
  }
  const before=f.snapshot();
  for(const dryRun of [true,false])assert.equal(migrateLauncher(f.options,dryRun,true).status,'partial');
  f.unchanged(before);
 }
});
test('CLI explicitly previews and migrates a preserved Claude launcher while default invocation refuses it',t=>{
 const f=fixture(t),before=f.snapshot();
 const run=flags=>spawnSync(process.execPath,[resolve('bin/aptly.ts'),'setup','--client','claude','--migrate-launcher',...flags],{env:{PATH:process.env.PATH,HOME:f.home,USERPROFILE:f.home},encoding:'utf8',timeout:15000});
 const refused=run(['--dry-run']);assert.equal(refused.status,1);assert.ok(JSON.parse(refused.stdout).clients[0].codes.includes('launcher_migration_not_owned'));f.unchanged(before);
 const preview=run(['--include-existing','--dry-run']);assert.equal(preview.status,0);assert.ok(JSON.parse(preview.stdout).clients[0].codes.includes('launcher_migration_available'));f.unchanged(before);
 const result=run(['--include-existing']);assert.equal(result.status,0);assert.ok(JSON.parse(result.stdout).clients[0].codes.includes('launcher_migrated'));
 assert.equal(f.server(f.readConfig()).command,process.execPath);assert.equal(load(f.receipt).mcp_created,false);
 assert.doesNotMatch(result.stdout,new RegExp(f.home.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
