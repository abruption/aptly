import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {parse} from 'smol-toml';
import {createTestTemp} from '../test-support/temp.ts';
import {setupHosts,setPolicySource,checkSetup,setEnvironment,prepareTransmissionReview} from '../src/setup.ts';

const content=(path:string)=>readFileSync(path,'utf8');
test('explicit selector preserves each account state and reconciles canonical mirrored config',t=>{
 const home=createTestTemp(t,'codex-policy-source-setup-');
 const opts=(name:string)=>({home,env:{CODEX_HOME:join(home,name)},packageRoot:resolve('.'),clients:['codex'] as ['codex']});
 const a=opts('a'),b=opts('b');
 assert.equal(setupHosts(a).status,'complete');assert.equal(setupHosts(b).status,'complete');
 const config=(o:typeof a)=>join(o.env.CODEX_HOME,'config.toml'), policy=(o:typeof a)=>join(o.env.CODEX_HOME,'aptly','auto-policy.json');
 const aPolicy=content(policy(a)),bPolicy=content(policy(b)), original=content(config(a));
 assert.equal(setPolicySource(a,true).status,'complete');assert.equal(content(config(a)),original);
 assert.equal(setPolicySource(a).status,'complete');
 const mirrored=content(config(b)).replace(`APTLY_HOOK_POLICY_PATH = "${policy(b)}"`,'APTLY_HOOK_POLICY_PATH = "@codex-home"').replace('env_vars = ["OPENAI_API_KEY"]','env_vars = ["OPENAI_API_KEY","CODEX_HOME"]');
 writeFileSync(config(b),mirrored);
 assert.equal(setPolicySource(b).status,'complete');
 assert.equal(content(policy(a)),aPolicy);assert.equal(content(policy(b)),bPolicy);
 for(const o of [a,b]){
  const entry=(parse(content(config(o))) as any).mcp_servers.aptly;
  assert.equal(entry.env.APTLY_HOOK_POLICY_PATH,'@codex-home');assert.ok(entry.env_vars.includes('CODEX_HOME'));
  assert.equal(checkSetup(o).status,'complete');assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',o).status,'complete');
  assert.equal(prepareTransmissionReview(o).result.status,'complete');
 }
});
test('selector rejects changed ownership and literal CODEX_HOME without writes',t=>{
 const home=createTestTemp(t,'codex-policy-source-guard-'),o={home,env:{CODEX_HOME:join(home,'.codex')},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 setupHosts(o);const path=join(home,'.codex','config.toml');
 const source=content(path);writeFileSync(path,source.replace('ROUTER_PROVIDER = "decisions"','ROUTER_PROVIDER = "fixture"'));
 const changed=content(path);assert.equal(setPolicySource(o).status,'partial');assert.equal(content(path),changed);
 writeFileSync(path,source.replace('[mcp_servers.aptly.env]','[mcp_servers.aptly.env]\nCODEX_HOME = "/tmp/other"'));
 const literal=content(path);assert.equal(setPolicySource(o).status,'partial');assert.equal(content(path),literal);
});

test('existing standard registration retains unowned fields and removes only owned additions',async t=>{
 const {mkdirSync}=await import('node:fs');
 const {removeSetup}=await import('../src/setup.ts');
 const home=createTestTemp(t,'codex-policy-source-existing-'),dir=join(home,'.codex');mkdirSync(dir);
 const path=join(dir,'config.toml'),o={home,env:{CODEX_HOME:join(home,'.codex')},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 writeFileSync(path,`[mcp_servers.aptly]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([join(resolve('.'),'dist','src','server.js')])}\nenv_vars = ["OPENAI_API_KEY", "OTHER"]\n[mcp_servers.aptly.env]\nROUTER_PROVIDER = "fixture"\n`);
 assert.equal(setupHosts(o).status,'complete');assert.equal(setPolicySource(o).status,'complete');
 assert.equal(setEnvironment('ROUTER_PROVIDER','fixture',o).status,'complete');
 assert.equal(removeSetup(o).status,'complete');
 const entry=(parse(content(path)) as any).mcp_servers.aptly;
 assert.deepEqual(entry.env_vars,['OPENAI_API_KEY','OTHER']);assert.equal(entry.env.ROUTER_PROVIDER,'fixture');
 assert.equal(entry.env.APTLY_HOOK_POLICY_PATH,undefined);
});

test('migration restores a preexisting policy reference and leaves other registration fields intact',async t=>{
 const {mkdirSync}=await import('node:fs');
 const {removeSetup,setDefaults,prepareCredentialReference}=await import('../src/setup.ts');
 const home=createTestTemp(t,'codex-policy-source-unowned-'),dir=join(home,'.codex');mkdirSync(dir);
 const path=join(dir,'config.toml'),policy=join(dir,'aptly','auto-policy.json'),ledger=join(dir,'aptly','state','ledger.json');
 const o={home,env:{CODEX_HOME:join(home,'.codex')},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 writeFileSync(path,`[mcp_servers.aptly]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([join(resolve('.'),'dist','src','server.js')])}\nenv_vars = ["OPENAI_API_KEY", "OTHER"]\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH = ${JSON.stringify(policy)}\nROUTER_LEDGER_PATH = ${JSON.stringify(ledger)}\n`);
 assert.equal(setupHosts(o).status,'complete');
 assert.deepEqual(JSON.parse(content(join(dir,'aptly','setup-ownership.json'))).env_added,{});
 assert.equal(setPolicySource(o).status,'complete');assert.equal(checkSetup(o).status,'complete');
 assert.equal(setDefaults(o).status,'complete');assert.equal(prepareCredentialReference(o,'codex').result.status,'unchanged');
 assert.equal(setPolicySource(o).status,'complete');assert.equal(removeSetup(o).status,'complete');
 const entry=(parse(content(path)) as any).mcp_servers.aptly;
 assert.equal(entry.env.APTLY_HOOK_POLICY_PATH,policy);assert.equal(entry.env.ROUTER_LEDGER_PATH,ledger);
 assert.deepEqual(entry.env_vars,['OPENAI_API_KEY','OTHER']);
});
test('reconciles an already mirrored unowned selector without inventing an earlier source',async t=>{
 const {mkdirSync}=await import('node:fs');const {removeSetup}=await import('../src/setup.ts');
 const home=createTestTemp(t,'codex-policy-source-mirror-'),dir=join(home,'.codex');mkdirSync(dir);
 const path=join(dir,'config.toml'),policy=join(dir,'aptly','auto-policy.json');
 const o={home,env:{CODEX_HOME:join(home,'.codex')},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 writeFileSync(path,`[mcp_servers.aptly]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([join(resolve('.'),'dist','src','server.js')])}\nenv_vars = ["OPENAI_API_KEY"]\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH = ${JSON.stringify(policy)}\nROUTER_LEDGER_PATH = ${JSON.stringify(join(dir,'aptly','state','ledger.json'))}\n`);
 assert.equal(setupHosts(o).status,'complete');
 writeFileSync(path,content(path).replace(JSON.stringify(policy),'"@codex-home"').replace('["OPENAI_API_KEY"]','["OPENAI_API_KEY", "CODEX_HOME"]'));
 assert.equal(setPolicySource(o).status,'complete');assert.equal(checkSetup(o).status,'complete');assert.equal(removeSetup(o).status,'complete');
 const entry=(parse(content(path)) as any).mcp_servers.aptly;
 assert.equal(entry.env.APTLY_HOOK_POLICY_PATH,'@codex-home');assert.deepEqual(entry.env_vars,['OPENAI_API_KEY','CODEX_HOME']);
});

test('missing forwarding on a mirrored unowned selector is restored on removal',async t=>{
 const {mkdirSync}=await import('node:fs');const {removeSetup}=await import('../src/setup.ts');
 const home=createTestTemp(t,'codex-policy-source-forward-'),dir=join(home,'.codex');mkdirSync(dir);
 const path=join(dir,'config.toml'),policy=join(dir,'aptly','auto-policy.json');
 const o={home,env:{CODEX_HOME:dir},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 writeFileSync(path,`[mcp_servers.aptly]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([join(resolve('.'),'dist','src','server.js')])}\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH = ${JSON.stringify(policy)}\nROUTER_LEDGER_PATH = ${JSON.stringify(join(dir,'aptly','state','ledger.json'))}\n`);
 assert.equal(setupHosts(o).status,'complete');writeFileSync(path,content(path).replace(JSON.stringify(policy),'"@codex-home"'));
 assert.equal(setPolicySource(o).status,'complete');assert.equal(removeSetup(o).status,'complete');
 const entry=(parse(content(path)) as any).mcp_servers.aptly;
 assert.equal(entry.env.APTLY_HOOK_POLICY_PATH,'@codex-home');assert.equal(entry.env_vars,undefined);
});

test('malformed forwarding ownership fails closed',async t=>{
 const {mkdirSync}=await import('node:fs');const {removeSetup}=await import('../src/setup.ts');
 const home=createTestTemp(t,'codex-policy-source-invalid-'),dir=join(home,'.codex');mkdirSync(dir);
 const path=join(dir,'config.toml'),o={home,env:{CODEX_HOME:dir},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 writeFileSync(path,`[mcp_servers.aptly]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([join(resolve('.'),'dist','src','server.js')])}\nenv_vars = ["OTHER"]\n[mcp_servers.aptly.env]\n`);
 assert.equal(setupHosts(o).status,'complete');const receipt=join(dir,'aptly','setup-ownership.json');
 const before=JSON.parse(content(receipt));
 for(const bad of [{env_vars_added:['OTHER']},{env_vars_added:'CODEX_HOME'},{env_vars_was_absent:true},{env_vars_added:['CODEX_HOME'],env_vars_was_absent:'yes'}]){
  writeFileSync(receipt,JSON.stringify({...before,...bad}));const config=content(path);
  assert.equal(removeSetup(o).clients[0].codes[0],'invalid_ownership');assert.equal(content(path),config);
 }
});


test('CLI default home without CODEX_HOME supports source migration and ordinary commands',async t=>{
 const {setDefaults,setStatisticsCollection,showStatistics,prepareCredentialReference}=await import('../src/setup.ts');
 const home=createTestTemp(t,'codex-policy-source-cli-default-'),o={home,env:{},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 assert.equal(setupHosts({...o,transmission:'excerpt'}).status,'complete');
 const policy=join(home,'.codex/aptly/auto-policy.json'),hooks=join(home,'.codex/hooks.json'),beforePolicy=content(policy),beforeHooks=content(hooks);
 assert.equal(setPolicySource(o,true).status,'complete');assert.equal(setPolicySource(o).status,'complete');
 assert.equal(checkSetup(o).status,'complete');assert.equal(setupHosts(o).status,'complete');
 assert.equal(setDefaults(o).status,'complete');assert.equal(prepareCredentialReference(o,'codex').result.status,'unchanged');
 assert.equal(prepareTransmissionReview(o).result.status,'complete');
 assert.equal(content(hooks),beforeHooks);
 assert.equal(setStatisticsCollection(true,o).status,'complete');assert.equal(showStatistics(o).clients[0].status,'ok');
 assert.equal(content(policy),beforePolicy);
});

test('CLI source selection rejects invalid explicit homes and preserves other account homes',t=>{
 const home=createTestTemp(t,'codex-policy-source-cli-invalid-'),o={home,env:{},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 setupHosts(o);setPolicySource(o);const path=join(home,'.codex/config.toml'),before=content(path);
 for(const CODEX_HOME of ['', 'relative', join(home,'bad\npath')]){
  assert.equal(setPolicySource({...o,env:{CODEX_HOME}}).status,'partial');
  assert.equal(checkSetup({...o,env:{CODEX_HOME}}).status,'partial');assert.equal(content(path),before);
 }
 const account={...o,env:{CODEX_HOME:join(home,'account')}};
 assert.equal(setupHosts({...account,transmission:'none'}).status,'complete');assert.equal(setPolicySource(account).status,'complete');
 assert.equal(prepareTransmissionReview({...account,forceReview:true}).candidates[0].transmission,'none');
 assert.equal(prepareTransmissionReview({...o,forceReview:true}).candidates[0].transmission,'unselected');assert.equal(content(path),before);
});


test('CLI setup succeeds from a default-home terminal without CODEX_HOME after source migration',async t=>{
 const {spawnSync}=await import('node:child_process');
 const home=createTestTemp(t,'codex-policy-source-real-cli-'),o={home,env:{},packageRoot:resolve('.'),clients:['codex'] as ['codex']};
 assert.equal(setupHosts({...o,transmission:'excerpt'}).status,'complete');assert.equal(setPolicySource(o).status,'complete');
 const env={HOME:home,USERPROFILE:home,PATH:process.env.PATH,CI:'true',APTLY_NO_UPDATE_NOTIFIER:'1'};
 for(const args of [['setup','--check','--client','codex'],['setup','--client','codex']]){
  const r=spawnSync(process.execPath,[resolve('bin/aptly.ts'),...args],{env,encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'complete');
 }
});
