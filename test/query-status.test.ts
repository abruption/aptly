import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,unlinkSync,chmodSync,statSync,renameSync,symlinkSync,existsSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {parse,stringify} from 'smol-toml';
import {spawnSync} from 'node:child_process';
import {createTestTemp} from '../test-support/temp.ts';
import {setupHosts,setPolicySource,removeSetup,setStatisticsCollection,setTransmission,showStatistics,showTransmission} from '../src/setup.ts';
import {QuerySnapshot} from '../src/query-snapshot.ts';
import {loadAutomaticHookPolicy,queryAutomaticHookPolicy} from '../src/automatic-hook.ts';

const posix={skip:process.platform==='win32'};
function files(root:string){const out:Record<string,unknown>={};const walk=(dir:string)=>{for(const name of readdirSync(dir)){const p=join(dir,name),s=statSync(p);if(s.isDirectory())walk(p);else out[relative(root,p)]={bytes:readFileSync(p).toString('base64'),mode:s.mode&0o777};}};walk(root);return out;}
function fixture(t,installed=false){
 const home=createTestTemp(t,'codex-query-status-'),options={home,env:{},packageRoot:resolve('.')};
 if(installed)assert.equal(setupHosts(options).status,'complete');
 const guard=join(home,'guard.mjs');writeFileSync(guard,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';let calls=0;globalThis.fetch=()=>{calls++;throw Error('unexpected_network')};cp.spawnSync=()=>{calls++;throw Error('unexpected_child')};syncBuiltinESMExports();process.on('exit',()=>{if(calls)process.stderr.write('UNEXPECTED_EXTERNAL_CALL');});`);
 const run=(args:string[],input?:string,extra?:Record<string,string>)=>spawnSync(process.execPath,['--import',guard,resolve('bin/aptly.ts'),...args],{env:{HOME:home,USERPROFILE:home,PATH:process.env.PATH,CI:'true',APTLY_NO_UPDATE_NOTIFIER:'1',ROUTER_PROVIDER:'decisions',...extra},input,encoding:'utf8',timeout:15000});
 const query=(args:string[],exit:number,status:'complete'|'partial')=>{const before=files(home),r=run(args);assert.equal(r.status,exit,r.stderr);assert.equal(r.stderr,'');const value=JSON.parse(r.stdout);assert.equal(value.status,status,r.stdout);assert.deepEqual(files(home),before);return value;};
 return {home,options,run,query,policy:(client='codex')=>join(home,client==='codex'?'.codex':'.claude','aptly/auto-policy.json')};
}
test('unconfigured CLI reads succeed without creating files or contacting external services',posix,t=>{
 const f=fixture(t);
 assert.deepEqual(f.query(['stats'],0,'complete').clients.map(c=>c.status),['statistics_requires_setup','statistics_requires_setup']);
 assert.ok(f.query(['set','transmission','--show'],0,'complete').clients.every(c=>c.status==='unavailable'));
 assert.equal(showStatistics(f.options).status,'complete');assert.equal(showTransmission(f.options).status,'complete');
});
test('manual direct-only MCP registration is normal unconfigured with legacy client fields',posix,t=>{
 const f=fixture(t);mkdirSync(join(f.home,'.codex'));writeFileSync(join(f.home,'.codex/config.toml'),'[mcp_servers.aptly]\ncommand="manual"\nargs=[]\n');
 const stats=f.query(['stats','--client','codex'],0,'complete');assert.equal(stats.clients[0].status,'statistics_policy_conflict');
 f.query(['set','transmission','--show','--client','codex'],0,'complete');
});
test('valid policies with disabled collection, none and unselected transmission are successful queries',posix,t=>{
 const f=fixture(t,true);
 f.query(['stats','--today'],0,'complete');
 let view=f.query(['set','transmission','--show'],0,'complete');assert.ok(view.clients.every(c=>c.transmission==='unselected'));
 assert.equal(setTransmission('none',f.options).status,'complete');view=f.query(['set','transmission','--show'],0,'complete');assert.ok(view.clients.every(c=>c.transmission==='none'));
});
for(const kind of ['missing','malformed','unsafe-mode','corrupt-receipt','mcp-malformed'] as const)test(`policy query failures aggregate and retain other client results: ${kind}`,posix,t=>{
 const f=fixture(t,true),policy=f.policy();
 if(kind==='missing')unlinkSync(policy);
 if(kind==='malformed')writeFileSync(policy,'{not-json');
 if(kind==='unsafe-mode')chmodSync(policy,0o644);
 if(kind==='corrupt-receipt')writeFileSync(join(f.home,'.codex/aptly/setup-ownership.json'),'{not-json');
 if(kind==='mcp-malformed')writeFileSync(join(f.home,'.codex/config.toml'),'[broken');
 const stats=f.query(['stats'],1,'partial');assert.equal(stats.clients.find(c=>c.client==='claude').status,'ok');
 const scope=f.query(['set','transmission','--show'],1,'partial');assert.equal(scope.clients.find(c=>c.client==='claude').status,'configured');
});
test('statistics configuration failures do not masquerade as healthy disabled collection',posix,t=>{
 const f=fixture(t,true),dir=join(f.home,'.codex/aptly/state');
 writeFileSync(join(dir,'stats-config.json'),'{bad-json',{mode:0o600});
 const result=f.query(['stats','--client','codex'],1,'partial');assert.equal(result.clients[0].status,'ok');assert.equal(result.clients[0].collection.codex,false);
 // The transmission query is independent of collection configuration.
 f.query(['set','transmission','--show','--client','codex'],0,'complete');
});
test('missing expected stats config/DB and corrupt DB fail without recreating the store',posix,t=>{
 const f=fixture(t,true),options={...f.options,clients:['codex'] as ['codex']};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const dir=join(f.home,'.codex/aptly/state'),config=join(dir,'stats-config.json'),saved=readFileSync(config);
 unlinkSync(config);f.query(['stats','--client','codex'],1,'partial');writeFileSync(config,saved,{mode:0o600});
 const db=join(dir,'stats.sqlite');writeFileSync(db,'not-sqlite',{mode:0o600});const result=f.query(['stats','--client','codex'],1,'partial');assert.equal(result.clients[0].status,'unavailable');
 unlinkSync(db);f.query(['stats','--client','codex'],1,'partial');
});
test('invalid override, policy conflicts and inaccessible paths fail rather than being treated as absent',posix,t=>{
 const f=fixture(t,true);const before=files(f.home),invalid=f.run(['stats','--client','codex'],undefined,{CODEX_HOME:'relative'});assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stdout).status,'partial');assert.deepEqual(files(f.home),before);
 const p=join(f.home,'.codex/config.toml');writeFileSync(p,readFileSync(p,'utf8').replace('APTLY_HOOK_POLICY_PATH = ','APTLY_HOOK_POLICY_PATH = "other" # '));f.query(['stats','--client','codex'],1,'partial');
 if(process.getuid?.()!==0){const dir=join(f.home,'.claude/aptly');chmodSync(dir,0);try{const r=f.run(['set','transmission','--show','--client','claude']);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).status,'partial');assert.equal(r.stderr,'');}finally{chmodSync(dir,0o700);}}
});
test('query JSON adds only aggregate status on healthy results and budget semantics remain intact',posix,t=>{
 const f=fixture(t,true);const result=f.query(['set','transmission','--show','--client','codex'],0,'complete');
 assert.deepEqual(Object.keys(result),['status','clients']);assert.deepEqual(Object.keys(result.clients[0]),['client','status','application_mode','enabled','transmission_review','transmission','transmission_source']);
 f.query(['budget','status'],0,'complete');
});
test('specific argument and size errors stay redacted while unexpected stats failures are not option errors',posix,t=>{
 const f=fixture(t);
 for(const [args,expected]of [[['setup','--dry-run'],'setup_invalid_options'],[['stats','--bad'],'statistics_invalid_options'],[['recommend'],'input_too_large']] as [string[],string][]){
  const r=f.run(args,args[0]==='recommend'?'x'.repeat(16385):undefined);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'aptly: '+expected+'\n');
 }
 const bad=join(f.home,'stdout-error.mjs');writeFileSync(bad,`process.stdout.write=()=>{throw Error('RAW_PRIVATE_VALUE /synthetic/private/path')};`);
 const r=spawnSync(process.execPath,['--import',bad,resolve('bin/aptly.ts'),'stats'],{env:{HOME:f.home,PATH:process.env.PATH,CI:'true'},encoding:'utf8',timeout:15000});
 assert.equal(r.status,1);assert.equal(r.stderr,'aptly: statistics_failed\n');assert.doesNotMatch(r.stderr,/RAW_PRIVATE_VALUE|synthetic|Error:|at /);
 const before=files(f.home);for(const args of [['--help'],['stats','--help'],['setup','--check']]){const r=f.run(args);assert.equal(r.status,0,r.stderr);}assert.deepEqual(files(f.home),before);
});
test('unsupported statistics is an explicit partial result',t=>{
 const original=Object.getOwnPropertyDescriptor(process,'platform')!;
 Object.defineProperty(process,'platform',{...original,value:'win32'});
 try{const r=showStatistics({clients:['codex']});assert.equal(r.status,'partial');assert.equal(r.clients[0].status,'statistics_platform_unsupported');}finally{Object.defineProperty(process,'platform',original);}
});
test('query observations detect content changes, recreated paths and unsafe redirects',posix,t=>{
 const dir=createTestTemp(t,'codex-query-snapshot-'),file=join(dir,'data.json');writeFileSync(file,'first',{mode:0o600});
 let view=new QuerySnapshot();assert.equal(view.read(file,{privateFile:true})?.toString(),'first');writeFileSync(file,'second');assert.throws(()=>view.verify(),/concurrent_configuration_change/);
 view=new QuerySnapshot();assert.equal(view.read(join(dir,'absent')),null);writeFileSync(join(dir,'absent'),'new');assert.throws(()=>view.verify(),/concurrent_configuration_change/);
 view=new QuerySnapshot();view.read(file);renameSync(file,file+'.old');writeFileSync(file,'second',{mode:0o600});assert.throws(()=>view.verify(),/concurrent_configuration_change/);
 symlinkSync(dir,join(dir,'redirect'));assert.throws(()=>new QuerySnapshot().read(join(dir,'redirect','missing')),/unsafe_configuration_file/);
 assert.throws(()=>new QuerySnapshot().read('relative'),/unsafe_configuration_file/);
});
test('query availability distinguishes absence without changing Hook failure reasons',posix,t=>{
 const f=fixture(t,true);const valid=loadAutomaticHookPolicy(f.policy());const view=new QuerySnapshot(),q=queryAutomaticHookPolicy(f.policy(),view);assert.deepEqual(q.policy,valid.policy);view.verify();
 unlinkSync(f.policy());assert.equal(loadAutomaticHookPolicy(f.policy()).reason,'automatic_policy_invalid');assert.equal(queryAutomaticHookPolicy(f.policy(),new QuerySnapshot()).availability,'absent');
 writeFileSync(f.policy(),'{bad',{mode:0o600});assert.equal(loadAutomaticHookPolicy(f.policy()).reason,'automatic_policy_invalid');assert.equal(queryAutomaticHookPolicy(f.policy(),new QuerySnapshot()).availability,'error');
 assert.equal(loadAutomaticHookPolicy(undefined).reason,'automatic_policy_missing');
});


test('normal removal with disabled retained history remains genuinely unconfigured',posix,t=>{
 const f=fixture(t,true),options={...f.options,clients:['codex'] as ['codex']};
 assert.equal(setStatisticsCollection(true,options).status,'complete');assert.equal(removeSetup(options).status,'complete');
 f.query(['stats','--client','codex'],0,'complete');f.query(['set','transmission','--show','--client','codex'],0,'complete');
});


test('an existing insecure private parent is an error even when its files are absent',posix,t=>{
 const f=fixture(t),dir=join(f.home,'.codex/aptly');mkdirSync(dir,{recursive:true});chmodSync(dir,0o777);
 f.query(['stats','--client','codex'],1,'partial');f.query(['set','transmission','--show','--client','codex'],1,'partial');
 assert.deepEqual(readdirSync(dir),[]);assert.equal(statSync(dir).mode&0o777,0o777);
});
test('queries detect an in-flight policy change instead of accepting a later absence',posix,t=>{
 for(const kind of ['stats','transmission']){
  const f=fixture(t,true),verify=QuerySnapshot.prototype.verify;let changed=false;
  QuerySnapshot.prototype.verify=function(){if(!changed){changed=true;unlinkSync(f.policy());}return verify.call(this);};
  try{const result=kind==='stats'?showStatistics({...f.options,clients:['codex']}):showTransmission({...f.options,clients:['codex']});assert.equal(result.status,'partial');assert.ok(changed);}
  finally{QuerySnapshot.prototype.verify=verify;}
 }
});

for(const client of ['codex','claude'] as const)for(const mismatch of ['different-existing-policy','relative','missing-reference','non-string'] as const)test(`transmission query detects ${client} policy binding conflict: ${mismatch}`,posix,t=>{
 const f=fixture(t,true),path=client==='codex'?join(f.home,'.codex/config.toml'):join(f.home,'.claude.json');
 const config=(client==='codex'?parse(readFileSync(path,'utf8')):JSON.parse(readFileSync(path,'utf8'))) as any;
 const entry=config[client==='codex'?'mcp_servers':'mcpServers'].aptly;
 if(mismatch==='different-existing-policy')entry.env.APTLY_HOOK_POLICY_PATH=f.policy(client==='codex'?'claude':'codex');
 if(mismatch==='relative')entry.env.APTLY_HOOK_POLICY_PATH='relative-policy.json';
 if(mismatch==='missing-reference')delete entry.env.APTLY_HOOK_POLICY_PATH;
 if(mismatch==='non-string')entry.env.APTLY_HOOK_POLICY_PATH=42;
 writeFileSync(path,client==='codex'?stringify(config):JSON.stringify(config));
 const before=files(f.home),direct=showTransmission(f.options);assert.equal(direct.status,'partial');assert.deepEqual(files(f.home),before);
 // Legacy per-client fields describe the local policy; only aggregate query health changes.
 assert.equal(direct.clients.find(c=>c.client===client).status,'configured');
 const cli=f.query(['set','transmission','--show'],1,'partial');assert.equal(cli.clients.find(c=>c.client!==client).status,'configured');
 f.query(['set','transmission','--show','--client',client],1,'partial');
});
test('transmission query accepts valid codex-home binding and rejects a broken forwarding contract',posix,t=>{
 const f=fixture(t,true);assert.equal(setPolicySource({...f.options,clients:['codex']},false).status,'complete');
 f.query(['set','transmission','--show'],0,'complete');
 const path=join(f.home,'.codex/config.toml'),config=parse(readFileSync(path,'utf8')) as any;
 config.mcp_servers.aptly.env_vars=config.mcp_servers.aptly.env_vars.filter(key=>key!=='CODEX_HOME');writeFileSync(path,stringify(config));
 f.query(['set','transmission','--show'],1,'partial');
});

for(const client of ['codex','claude'] as const)test(`fresh ${client} collection is queryable before the first event`,posix,t=>{
 const f=fixture(t,true),options={...f.options,clients:[client]};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const before=files(f.home),r=showStatistics(options);assert.equal(r.status,'complete');assert.equal(r.clients[0].collection[client],true);assert.equal(r.clients[0].delegations,0);assert.deepEqual(files(f.home),before);
 f.query(['stats','--client',client],0,'complete');
});
for(const client of ['codex','claude'] as const)test(`${client} statistics ownership detects loss of all store files before any event`,posix,t=>{
 const f=fixture(t,true),options={...f.options,clients:[client]};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const state=join(f.home,client==='codex'?'.codex':'.claude','aptly/state');
 for(const name of ['stats-config.json','stats-key','stats.sqlite'])if(existsSync(join(state,name)))unlinkSync(join(state,name));
 const before=files(f.home),r=showStatistics(f.options);assert.equal(r.status,'partial');assert.equal(r.clients.find(c=>c.client!==client).status,'ok');assert.deepEqual(files(f.home),before);
 f.query(['stats','--client',client],1,'partial');
});
test('enable validates existing statistics history and reports initialization failure without replacing it',posix,t=>{
 const f=fixture(t,true),options={...f.options,clients:['codex'] as ['codex']},db=join(f.home,'.codex/aptly/state/stats.sqlite');
 assert.equal(setStatisticsCollection(true,options).status,'complete');
 const saved=readFileSync(db);assert.equal(setStatisticsCollection(true,options).status,'complete');assert.deepEqual(readFileSync(db),saved);
 writeFileSync(db,'CORRUPT_DATABASE_SENTINEL');const corrupt=files(f.home),r=setStatisticsCollection(true,options);assert.equal(r.status,'partial');assert.ok(r.clients[0].codes.includes('statistics_store_initialization_failed'));assert.deepEqual(files(f.home),corrupt);
 f.query(['stats','--client','codex'],1,'partial');
});
