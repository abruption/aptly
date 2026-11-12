import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync,lstatSync,copyFileSync,symlinkSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {createTestTemp} from '../test-support/temp.ts';
import {setupHosts,removeSetup,setStatisticsCollection,showStatistics,checkSetup} from '../src/setup.ts';
import {recordStatisticsRecommendation} from '../src/statistics.ts';

const supported={skip:process.platform==='win32'};
function fixture(t){
 const home=createTestTemp(t,'codex-stats-setup-'),options={home,env:{},packageRoot:resolve('.')};
 assert.equal(setupHosts(options).status,'complete');
 return {home,options,privateDir:join(home,'.codex','aptly'),state:join(home,'.codex','aptly','state'),hooks:join(home,'.codex','hooks.json')};
}
test('statistics opt-in preserves routing and legacy ownership and is idempotent',supported,t=>{
 const f=fixture(t),receipt=join(f.privateDir,'setup-ownership.json'),config=join(f.home,'.codex/config.toml'),policy=join(f.privateDir,'auto-policy.json');
 const original=[receipt,config,policy].map(p=>readFileSync(p,'utf8'));
 const data=JSON.parse(readFileSync(f.hooks,'utf8'));data.hooks.PostToolUse=[{matcher:'custom',hooks:[{type:'command',command:'printf custom'}]}];writeFileSync(f.hooks,JSON.stringify(data,null,2)+'\n');
 const disabled=showStatistics({...f.options,clients:['codex']});assert.equal(disabled.clients[0].status,'ok');assert.equal(existsSync(join(f.state,'stats.sqlite')),false);
 const on=setStatisticsCollection(true,{...f.options,clients:['codex'],codexNativeMetadata:true});assert.equal(on.status,'complete',JSON.stringify(on));assert.ok(on.clients[0].codes.includes('requires_hook_review'));
 assert.equal((lstatSync(join(f.state,'stats-key')).mode&0o777),0o600);
 const key=readFileSync(join(f.state,'stats-key'),'utf8'),hooks=readFileSync(f.hooks,'utf8');
 assert.equal(key.length,65);assert.equal(setStatisticsCollection(true,{...f.options,clients:['codex'],codexNativeMetadata:true}).status,'complete');assert.equal(readFileSync(f.hooks,'utf8'),hooks);assert.equal(readFileSync(join(f.state,'stats-key'),'utf8'),key);
 for(const[p,n]of [[receipt,0],[config,1],[policy,2]] as const)assert.equal(readFileSync(p,'utf8'),original[n]);
 assert.equal(checkSetup({...f.options,clients:['codex']}).status,'complete');
 const view=showStatistics({...f.options,clients:['codex']});assert.equal(view.clients[0].collection.codex,true);assert.equal(existsSync(join(f.state,'stats.sqlite')),true);
 const off=setStatisticsCollection(false,{...f.options,clients:['codex']});assert.equal(off.status,'complete');assert.equal(existsSync(join(f.privateDir,'stats-ownership.json')),false);assert.equal(readFileSync(join(f.state,'stats-key'),'utf8'),key);assert.equal(readFileSync(receipt,'utf8'),original[0]);
 assert.deepEqual(JSON.parse(readFileSync(f.hooks,'utf8')).hooks.PostToolUse,data.hooks.PostToolUse);
});
test('remove cleans exact statistics-owned hooks but retains data and key',supported,t=>{
 const f=fixture(t);assert.equal(setStatisticsCollection(true,{...f.options,clients:['codex'],codexNativeMetadata:true}).status,'complete');
 assert.equal(recordStatisticsRecommendation({stateDirectory:f.state},{client:'codex',sessionId:'s',toolUseId:'t',disposition:'blocked'}).status,'recorded');
 const result=removeSetup({...f.options,clients:['codex']});assert.equal(result.status,'complete',JSON.stringify(result));
 const hooks=JSON.parse(readFileSync(f.hooks,'utf8'));for(const event of ['PostToolUse','SubagentStart','SubagentStop','PostModelRequest'])assert.deepEqual(hooks.hooks[event],[]);
 assert.equal(existsSync(join(f.state,'stats.sqlite')),true);assert.equal(existsSync(join(f.state,'stats-key')),true);
 const config=JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8'));assert.deepEqual(config.enabled_clients,[]);assert.equal(config.codex_native_metadata,undefined);assert.equal(config.codex_home,undefined);
});
test('disable preserves modified observers while stopping Aptly collection',supported,t=>{
 const f=fixture(t);setStatisticsCollection(true,{...f.options,clients:['codex']});
 const value=JSON.parse(readFileSync(f.hooks,'utf8'));value.hooks.PostToolUse[0].hooks[0].command='printf modified';writeFileSync(f.hooks,JSON.stringify(value,null,2)+'\n');
 const result=setStatisticsCollection(false,{...f.options,clients:['codex']});assert.equal(result.status,'complete');assert.ok(result.clients[0].codes.includes('statistics_observers_retained_modified'));
 assert.equal(JSON.parse(readFileSync(f.hooks,'utf8')).hooks.PostToolUse[0].hooks[0].command,'printf modified');
 assert.deepEqual(JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8')).enabled_clients,[]);
 assert.equal(existsSync(join(f.privateDir,'stats-ownership.json')),false);
 const again=setStatisticsCollection(true,{...f.options,clients:['codex']});assert.equal(again.status,'partial');assert.ok(again.clients[0].codes.includes('statistics_observers_present'));
 const removed=removeSetup({...f.options,clients:['codex']});assert.equal(removed.status,'complete',JSON.stringify(removed));
 assert.equal(JSON.parse(readFileSync(f.hooks,'utf8')).hooks.PostToolUse[0].hooks[0].command,'printf modified');
});
test('ordinary setup never enables collection and invalid controls do not write',supported,t=>{
 const f=fixture(t);assert.equal(existsSync(join(f.state,'stats-config.json')),false);
 assert.equal(setStatisticsCollection(true,{...f.options,clients:['claude'],codexNativeMetadata:true}).status,'partial');
 assert.equal(existsSync(join(f.state,'stats-config.json')),false);
 const home=createTestTemp(t,'codex-stats-no-setup-');assert.equal(setStatisticsCollection(true,{home,env:{},clients:['codex']}).status,'partial');assert.equal(existsSync(join(home,'.codex')),false);
});
test('registered observer survives quoted paths and records once without routing or output',supported,t=>{
 const root=createTestTemp(t,'codex-stats-quoted-'),home=join(root,'home'),pkg=join(root,"package 'quoted' $literal");mkdirSync(home);mkdirSync(pkg);mkdirSync(join(pkg,'dist'));mkdirSync(join(pkg,'dist','bin'));
 writeFileSync(join(pkg,'package.json'),'{"type":"module"}');
 copyFileSync(resolve('dist/bin/aptly-observe.js'),join(pkg,'dist/bin/aptly-observe.js'));
 symlinkSync(resolve('dist/src'),join(pkg,'dist/src'));
 const options={home,env:{},packageRoot:pkg,clients:['codex'] as ('codex'|'claude')[]};
 assert.equal(setupHosts(options).status,'complete');assert.equal(setStatisticsCollection(true,options).status,'complete');
 const state=join(home,'.codex/aptly/state');
 recordStatisticsRecommendation({stateDirectory:state},{client:'codex',sessionId:'parent',toolUseId:'tool',disposition:'auto',expected:{profileId:'codex-simple',model:'gpt-6-luna',effort:'max'}});
 const receipt=JSON.parse(readFileSync(join(home,'.codex/aptly/stats-ownership.json'),'utf8'));
 const command=receipt.hooks.PostToolUse.hooks[0].command;
 const input={hook_event_name:'PostToolUse',session_id:'parent',tool_use_id:'tool',tool_name:'spawn_agent',tool_input:{model:'gpt-6-luna',reasoning_effort:'max'},tool_response:{agent_id:'child-fixture'}};
 const request={hook_event_name:'PostModelRequest',session_id:'parent',agent_id:'child-fixture',turn_id:'child-turn',model:'gpt-6-luna',status:'completed'};
 for(const event of [input,input,request,request]){
  const r=spawnSync('/bin/sh',['-c',command],{input:JSON.stringify(event),encoding:'utf8',env:{PATH:process.env.PATH,HOME:home,ROUTER_PROVIDER:'decisions',ROUTER_LEDGER_PATH:join(state,'must-not-exist.json')},timeout:15000});
  assert.equal(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 }
 const view=showStatistics(options);assert.equal(view.clients[0].auto.model_match,1);assert.equal(view.clients[0].delegations,1);assert.equal(existsSync(join(state,'must-not-exist.json')),false);
});
test('disable remains available with a corrupt statistics ownership receipt',supported,t=>{
 for(const kind of ['malformed','foreign-state']){
  const f=fixture(t);setStatisticsCollection(true,{...f.options,clients:['codex']});
  const receipt=join(f.privateDir,'stats-ownership.json'),owned=JSON.parse(readFileSync(receipt,'utf8'));owned.state_directory=join(f.home,'foreign');
  const corrupt=kind==='malformed'?'not-json':JSON.stringify(owned);writeFileSync(receipt,corrupt);
  const result=setStatisticsCollection(false,{...f.options,clients:['codex']});assert.equal(result.status,'complete');assert.ok(result.clients[0].codes.includes('statistics_observers_retained_modified'));
  assert.deepEqual(JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8')).enabled_clients,[]);assert.equal(readFileSync(receipt,'utf8'),corrupt);assert.equal(existsSync(join(f.home,'foreign')),false);
 }
});

test('native metadata consent is cleared on disable and on enable without the flag',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]},path=join(f.state,'stats-config.json');
 assert.equal(setStatisticsCollection(true,{...options,codexNativeMetadata:true}).status,'complete');
 assert.equal(JSON.parse(readFileSync(path,'utf8')).codex_native_metadata,true);
 assert.equal(setStatisticsCollection(true,options).status,'complete');
 let state=JSON.parse(readFileSync(path,'utf8'));assert.equal(state.codex_native_metadata,undefined);assert.equal(state.codex_home,undefined);
 assert.equal(setStatisticsCollection(true,{...options,codexNativeMetadata:true}).status,'complete');
 assert.equal(setStatisticsCollection(false,options).status,'complete');
 state=JSON.parse(readFileSync(path,'utf8'));assert.equal(state.codex_native_metadata,undefined);assert.equal(state.codex_home,undefined);
 assert.equal(setStatisticsCollection(true,options).status,'complete');assert.equal(JSON.parse(readFileSync(path,'utf8')).codex_native_metadata,undefined);
});
test('disable does not depend on MCP registration or the statistics key',supported,t=>{
 for(const kind of ['missing-mcp','drifted-mcp','missing-key','insecure-key']){
  const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]},key=join(f.state,'stats-key'),mcp=join(f.home,'.codex/config.toml');
  assert.equal(setStatisticsCollection(true,options).status,'complete');
  if(kind==='missing-mcp')writeFileSync(mcp,'');
  if(kind==='drifted-mcp')writeFileSync(mcp,'[mcp_servers.aptly]\ncommand = "custom"\n');
  if(kind==='missing-key')unlinkSync(key);
  if(kind==='insecure-key')chmodSync(key,0o644);
  const result=setStatisticsCollection(false,options);assert.equal(result.status,'complete',JSON.stringify(result));
  assert.deepEqual(JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8')).enabled_clients,[]);
 }
});
test('missing observers are already removed and private snapshot modes are retained',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]};
 assert.equal(setStatisticsCollection(true,options).status,'complete');
 const hooks=JSON.parse(readFileSync(f.hooks,'utf8'));hooks.hooks.PostToolUse=[];writeFileSync(f.hooks,JSON.stringify(hooks));
 chmodSync(join(f.state,'stats-config.json'),0o400);chmodSync(join(f.privateDir,'stats-ownership.json'),0o400);
 const result=removeSetup(options);assert.equal(result.status,'complete',JSON.stringify(result));
 assert.equal(existsSync(join(f.privateDir,'stats-ownership.json')),false);assert.equal(lstatSync(join(f.state,'stats-config.json')).mode&0o777,0o400);
});
test('disable before setup is a no-op',supported,t=>{
 const home=createTestTemp(t,'codex-stats-never-');const result=setStatisticsCollection(false,{home,env:{},clients:['codex']});
 assert.equal(result.status,'complete',JSON.stringify(result));assert.equal(result.clients[0].status,'unchanged');assert.equal(existsSync(join(home,'.codex')),false);
});

test('PostToolUse matchers include the supported spawn names only',supported,t=>{
 const f=fixture(t);assert.equal(setStatisticsCollection(true,{...f.options,clients:['codex','claude']}).status,'complete');
 for(const [client,path,accepted,rejected] of [
  ['codex',join(f.home,'.codex/aptly/stats-ownership.json'),['spawn_agent','collaborationspawn_agent','collaboration.spawn_agent'],['collaborationXspawn_agent','Agent','Task']],
  ['claude',join(f.home,'.claude/aptly/stats-ownership.json'),['Agent','Task'],['spawn_agent','AgentExtra']]
 ] as const){
  const matcher=new RegExp(JSON.parse(readFileSync(path,'utf8')).hooks.PostToolUse.matcher);
  for(const name of accepted)assert.ok(matcher.test(name),`${client}: ${name}`);
  for(const name of rejected)assert.equal(matcher.test(name),false,`${client}: ${name}`);
 }
});
test('disable ignores legacy receipt drift and does not create absent hook events',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const legacy=join(f.privateDir,'setup-ownership.json');writeFileSync(legacy,'invalid legacy receipt');chmodSync(legacy,0o644);
 const hooks=JSON.parse(readFileSync(f.hooks,'utf8'));delete hooks.hooks.PostToolUse;delete hooks.hooks.SubagentStart;writeFileSync(f.hooks,JSON.stringify(hooks));
 const result=setStatisticsCollection(false,options);assert.equal(result.status,'complete',JSON.stringify(result));
 const after=JSON.parse(readFileSync(f.hooks,'utf8'));assert.equal(Object.hasOwn(after.hooks,'PostToolUse'),false);assert.equal(Object.hasOwn(after.hooks,'SubagentStart'),false);
 assert.equal(readFileSync(legacy,'utf8'),'invalid legacy receipt');
});
test('disable does not overwrite invalid statistics configuration',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const path=join(f.state,'stats-config.json');writeFileSync(path,'{invalid');const result=setStatisticsCollection(false,options);
 assert.equal(result.status,'partial');assert.equal(readFileSync(path,'utf8'),'{invalid');
});

test('disable preserves an insecure ownership receipt while stopping collection',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const receipt=join(f.privateDir,'stats-ownership.json'),before=readFileSync(receipt,'utf8');chmodSync(receipt,0o644);
 const result=setStatisticsCollection(false,options);assert.equal(result.status,'complete',JSON.stringify(result));assert.ok(result.clients[0].codes.includes('statistics_observers_retained_modified'));
 assert.deepEqual(JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8')).enabled_clients,[]);assert.equal(readFileSync(receipt,'utf8'),before);assert.equal(lstatSync(receipt).mode&0o777,0o644);
});

test('enable refuses insecure private directories before writing statistics files',supported,t=>{
 for(const which of ['private','state']){
  const f=fixture(t),directory=which==='private'?f.privateDir:f.state;chmodSync(directory,0o755);
  const result=setStatisticsCollection(true,{...f.options,clients:['codex']});assert.equal(result.status,'partial',JSON.stringify(result));
  assert.equal(existsSync(join(f.state,'stats-config.json')),false);assert.equal(existsSync(join(f.state,'stats-key')),false);assert.equal(existsSync(join(f.privateDir,'stats-ownership.json')),false);
  assert.equal(lstatSync(directory).mode&0o777,0o755);chmodSync(directory,0o700);
 }
});
test('duplicate owned observers block enable and remove, but disable preserves them',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]};assert.equal(setStatisticsCollection(true,options).status,'complete');
 const hooks=JSON.parse(readFileSync(f.hooks,'utf8'));hooks.hooks.PostToolUse.push(structuredClone(hooks.hooks.PostToolUse[0]));writeFileSync(f.hooks,JSON.stringify(hooks));
 const enable=setStatisticsCollection(true,options);assert.equal(enable.status,'partial');assert.ok(enable.clients[0].codes.includes('managed_hook_changed'));
 const remove=removeSetup(options);assert.equal(remove.status,'partial');assert.ok(remove.clients[0].codes.includes('managed_hook_changed'));
 const off=setStatisticsCollection(false,options);assert.equal(off.status,'complete',JSON.stringify(off));assert.ok(off.clients[0].codes.includes('statistics_observers_retained_modified'));
 assert.equal(JSON.parse(readFileSync(f.hooks,'utf8')).hooks.PostToolUse.length,2);assert.deepEqual(JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8')).enabled_clients,[]);
});

test('disable all revokes healthy Codex even if Claude config is corrupt',supported,t=>{
 const f=fixture(t);assert.equal(setStatisticsCollection(true,{...f.options,codexNativeMetadata:true}).status,'complete');
 const claude=join(f.home,'.claude/aptly/state/stats-config.json');writeFileSync(claude,'{invalid');
 const result=setStatisticsCollection(false,f.options);assert.equal(result.status,'partial',JSON.stringify(result));
 assert.equal(result.clients.find(c=>c.client==='codex')?.status,'configured');assert.equal(result.clients.find(c=>c.client==='claude')?.status,'error');
 const state=JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8'));assert.deepEqual(state.enabled_clients,[]);assert.equal(state.codex_native_metadata,undefined);assert.equal(state.codex_home,undefined);assert.equal(readFileSync(claude,'utf8'),'{invalid');
});
test('remove revokes statistics consent without adopting hooks when receipt is missing',supported,t=>{
 const f=fixture(t),options={...f.options,clients:['codex'] as ('codex'|'claude')[]};assert.equal(setStatisticsCollection(true,{...options,codexNativeMetadata:true}).status,'complete');
 unlinkSync(join(f.privateDir,'stats-ownership.json'));const before=JSON.parse(readFileSync(f.hooks,'utf8')).hooks.PostToolUse;
 const result=removeSetup(options);assert.equal(result.status,'complete',JSON.stringify(result));
 const state=JSON.parse(readFileSync(join(f.state,'stats-config.json'),'utf8'));assert.deepEqual(state.enabled_clients,[]);assert.equal(state.codex_native_metadata,undefined);assert.equal(state.codex_home,undefined);
 assert.deepEqual(JSON.parse(readFileSync(f.hooks,'utf8')).hooks.PostToolUse,before);
});
