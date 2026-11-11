import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {parse} from 'smol-toml';
import {createTestTemp} from '../test-support/temp.ts';
import {setDefaults,setEnvironment,removeSetup} from '../src/setup.ts';
import {resolveCatalog} from '../src/catalog.ts';

const groups=[
 {primary:'APTLY_CODEX_MODELS',alias:'CODEX_MODELS',client:'codex',models:['gpt-6.1-sol']},
 {primary:'APTLY_CLAUDE_MODELS',alias:'CLAUDE_MODELS',client:'claude',models:['opus']},
] as const;
function fixture(t,client:'codex'|'claude',forwarded:string[]=[],environment:NodeJS.ProcessEnv={},values:Record<string,string>={}){
 const home=createTestTemp(t,'codex-candidate-inheritance-');mkdirSync(join(home,client==='codex'?'.codex':'.claude'));
 const file=join(home,client==='codex'?'.codex/config.toml':'.claude.json');
 const env={ROUTER_PROVIDER:'fixture',...values};
 if(client==='codex')writeFileSync(file,['# preserve operator launcher','[mcp_servers.aptly]','command = "custom-launcher"','args = []',`env_vars = ${JSON.stringify(forwarded)}`,'[mcp_servers.aptly.env]',...Object.entries(env).map(([k,v])=>`${k} = ${JSON.stringify(v)}`),''].join('\n'),{mode:0o600});
 else writeFileSync(file,JSON.stringify({mcpServers:{aptly:{command:'custom-launcher',args:[],env}}}),{mode:0o600});
 const options={home,env:environment,packageRoot:resolve('.'),clients:[client]};
 const entry=()=>client==='codex'?(parse(readFileSync(file,'utf8')) as any).mcp_servers.aptly:JSON.parse(readFileSync(file,'utf8')).mcpServers.aptly;
 return {options,file,entry};
}
function snapshot(root:string){
 const result:Record<string,unknown>={};
 const walk=(p:string)=>{for(const name of readdirSync(p)){const path=join(p,name),s=statSync(path);if(s.isDirectory())walk(path);else result[relative(root,path)]={text:readFileSync(path,'utf8'),mode:s.mode&0o777};}};
 walk(root);return result;
}
for(const host of ['codex','claude'] as const)for(const group of groups)for(const key of [group.primary,group.alias]){
 test(`${host} defaults preserve inherited ${key} without copying its value`,t=>{
  const supplied={[key]:JSON.stringify(group.models)},f=fixture(t,host,host==='codex'?[key]:[],supplied);
  assert.equal(setDefaults(f.options).status,'complete');const entry=f.entry();
  assert.equal(entry.env[group.primary],undefined);assert.equal(entry.env[group.alias],undefined);
  assert.equal(entry.command,'custom-launcher');if(host==='codex')assert.deepEqual(entry.env_vars,[key]);
  const catalog=resolveCatalog({...supplied,...entry.env});assert.deepEqual(catalog.profiles.filter(p=>p.client===group.client).map(p=>p.model),group.models);
  const before=snapshot(f.options.home);assert.equal(setDefaults(f.options).status,'complete');assert.deepEqual(snapshot(f.options.home),before);
 });
}
for(const group of groups)for(const key of [group.primary,group.alias]){
 test(`unobserved Codex passthrough ${key} remains external`,t=>{
  const f=fixture(t,'codex',[key]);assert.equal(setDefaults(f.options).status,'complete');
  assert.equal(f.entry().env[group.primary],undefined);assert.equal(f.entry().env[group.alias],undefined);
  assert.deepEqual(f.entry().env_vars,[key]);
 });
}
for(const host of ['codex','claude'] as const){
 test(`${host} defaults retain inherited empty candidate lists`,t=>{
  const f=fixture(t,host,['CODEX_MODELS'],{CODEX_MODELS:'[]'});assert.equal(setDefaults(f.options).status,'complete');
  assert.equal(f.entry().env.APTLY_CODEX_MODELS,undefined);assert.ok(resolveCatalog({CODEX_MODELS:'[]',...f.entry().env}).disabled_clients.includes('codex'));
 });
 test(`${host} static values override the same inherited key`,t=>{
  const f=fixture(t,host,['APTLY_CODEX_MODELS'],{APTLY_CODEX_MODELS:'malformed-ambient-value'},{APTLY_CODEX_MODELS:'["gpt-6-luna"]'});
  assert.equal(setDefaults(f.options).status,'complete');assert.equal(f.entry().env.APTLY_CODEX_MODELS,'["gpt-6-luna"]');
  assert.deepEqual(resolveCatalog({...f.options.env,...f.entry().env}).profiles.filter(p=>p.client==='codex').map(p=>p.model),['gpt-6-luna']);
 });
 for(const supplied of [
  {CODEX_MODELS:''}, {CODEX_MODELS:'not-json'}, {CODEX_MODELS:'["foreign-model"]'}, {CODEX_MODELS:'["gpt-6-luna","gpt-6-luna"]'},
  {CODEX_MODELS:'["gpt-6-luna"]',APTLY_CODEX_MODELS:'["gpt-6.1-sol"]'},
 ])test(`${host} invalid/conflicting inherited candidates reject without writing: ${Object.keys(supplied).join('+')} ${supplied.CODEX_MODELS}`,t=>{
  const f=fixture(t,host,Object.keys(supplied),supplied),before=snapshot(f.options.home);
  const result=setDefaults(f.options);assert.equal(result.status,'partial');assert.deepEqual(result.clients[0].codes,['environment_invalid_value']);assert.deepEqual(snapshot(f.options.home),before);
 });
 test(`${host} static and inherited aliases still conflict`,t=>{
  const f=fixture(t,host,['CODEX_MODELS'],{CODEX_MODELS:'["gpt-6-luna"]'},{APTLY_CODEX_MODELS:'["gpt-6.1-sol"]'}),before=snapshot(f.options.home);
  assert.equal(setDefaults(f.options).status,'partial');assert.deepEqual(snapshot(f.options.home),before);
 });
 test(`${host} explicit setters preserve alias conflict checks`,t=>{
  const f=fixture(t,host,['CODEX_MODELS'],{CODEX_MODELS:'["gpt-6-luna"]'});
  assert.equal(setDefaults(f.options).status,'complete');const before=snapshot(f.options.home);
  assert.equal(setEnvironment('APTLY_CODEX_MODELS','["gpt-6.1-sol"]',f.options).status,'partial');assert.deepEqual(snapshot(f.options.home),before);
  assert.equal(setEnvironment('CODEX_MODELS','["gpt-6.1-sol"]',f.options).status,'complete');assert.equal(f.entry().env.CODEX_MODELS,'["gpt-6.1-sol"]');
 });
}
test('Codex defaults ignore process candidates that are not forwarded',t=>{
 const f=fixture(t,'codex',[],{CODEX_MODELS:'malformed-ambient-value'});
 assert.equal(setDefaults(f.options).status,'complete');assert.equal(f.entry().env.APTLY_CODEX_MODELS,'["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]');
});
test('a bad inherited candidate prevents edits to both selected hosts',t=>{
 const f=fixture(t,'codex',[],{CODEX_MODELS:'malformed-ambient-value'});mkdirSync(join(f.options.home,'.claude'));
 const before=snapshot(f.options.home),result=setDefaults({...f.options,clients:['codex','claude']});
 assert.equal(result.status,'partial');assert.equal(result.clients.find(c=>c.client==='codex')?.status,'skipped');assert.deepEqual(snapshot(f.options.home),before);
});


test('removing setup preserves operator passthrough and unrelated settings',t=>{
 const supplied={CODEX_MODELS:'["gpt-6.1-sol"]'},f=fixture(t,'codex',['CODEX_MODELS','SSH_AUTH_SOCK'],supplied);
 assert.equal(setDefaults(f.options).status,'complete');assert.equal(removeSetup(f.options).status,'complete');
 const entry=f.entry();assert.equal(entry.command,'custom-launcher');assert.deepEqual(entry.env_vars,['CODEX_MODELS','SSH_AUTH_SOCK']);
 assert.deepEqual(Object.keys(entry.env),['ROUTER_PROVIDER']);assert.equal(entry.env.ROUTER_PROVIDER,'fixture');
});
for(const host of ['codex','claude'] as const)test(`${host} rejects candidate accessors without executing them or writing`,t=>{
 let calls=0;const environment={};Object.defineProperty(environment,'CODEX_MODELS',{enumerable:true,get(){calls++;return '["gpt-6-luna"]';}});
 const f=fixture(t,host,['CODEX_MODELS'],environment),before=snapshot(f.options.home);
 assert.equal(setDefaults(f.options).status,'partial');assert.equal(calls,0);assert.deepEqual(snapshot(f.options.home),before);
});
