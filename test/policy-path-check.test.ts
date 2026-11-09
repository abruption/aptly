import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,statSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkSetup,setupHosts,prepareCredentialReference,migrateLauncher} from '../src/setup.ts';
import {createTestTemp} from '../test-support/temp.ts';

const snapshot = (p:string) => { const st=statSync(p); return {mode:st.mode,mtime:st.mtimeMs,contents:st.isDirectory()?readdirSync(p).sort().map(n=>[n,snapshot(join(p,n))]):readFileSync(p,'utf8')}; };
test('setup check is a read-only normal plan including missing homes and unchanged installations',t=>{
 const home=createTestTemp(t,'codex-policy-check-'),options={home,env:{}};
 const before=snapshot(home),result=checkSetup(options);
 assert.deepEqual(result.clients.map(c=>c.codes[0]),['setup_check_configure_ready','setup_check_configure_ready']);assert.deepEqual(snapshot(home),before);
 assert.equal(setupHosts(options).status,'complete');const installed=snapshot(home);
 assert.deepEqual(checkSetup(options).clients.map(c=>c.codes[0]),['setup_check_ok','setup_check_ok']);assert.deepEqual(snapshot(home),installed);
});
test('separate home policy mismatches are redacted, isolated and use policy recovery',t=>{
 for(const client of ['codex','claude'] as const) for(const location of ['default_home','elsewhere'] as const){
  const home=createTestTemp(t,'codex-policy-conflict-'),dir=join(home,'alternate');mkdirSync(dir);
  const env=client==='codex'?{CODEX_HOME:dir}:{CLAUDE_CONFIG_DIR:dir};
  const path=location==='default_home'?join(home,client==='codex'?'.codex':'.claude','aptly','auto-policy.json'):join(home,'private-other');
  const file=join(dir,client==='codex'?'config.toml':'.claude.json');
  writeFileSync(file,client==='codex'?`[mcp_servers.aptly]\ncommand="custom"\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH=${JSON.stringify(path)}\n`:JSON.stringify({mcpServers:{aptly:{command:'custom',env:{APTLY_HOOK_POLICY_PATH:path}}}}));
  const options={home,env},before=snapshot(home),check=checkSetup(options),item=check.clients.find(c=>c.client===client)!;
  assert.deepEqual(item.codes,['mcp_environment_conflict','hook_policy_path_conflict']);assert.equal(item.policy_location,location);assert.equal(item.selected_home_source,'override');
  assert.equal(check.clients.find(c=>c.client!==client)!.codes[0],'setup_check_configure_ready');
  for(const value of [check,setupHosts({...options,clients:[client]}),prepareCredentialReference(options,client).result]){
   const json=JSON.stringify(value);assert.ok(json.includes('hook_policy_path_conflict'));assert.ok(!json.includes(JSON.stringify(home).slice(1,-1)));assert.ok(!json.includes('migrate-launcher'));
  }
  assert.deepEqual(snapshot(home),before);
 }
});
test('credential recheck retains ownership guard and reports changed policy without storage',t=>{
 const home=createTestTemp(t,'codex-policy-recheck-'),options={home,env:{},clients:['codex'] as const};
 setupHosts({...options,clients:['codex']}); const plan=prepareCredentialReference(options,'codex');assert.equal(plan.result.status,'unchanged');
 const file=join(home,'.codex/config.toml'),old=readFileSync(file,'utf8');writeFileSync(file,old.replace(/APTLY_HOOK_POLICY_PATH = .*/,`APTLY_HOOK_POLICY_PATH = ${JSON.stringify(join(home,'elsewhere'))}`));
 const result=plan.check();assert.deepEqual(result.codes,['concurrent_configuration_change','hook_policy_path_conflict']);assert.ok(!JSON.stringify(result).includes(JSON.stringify(home).slice(1,-1)));assert.ok(!JSON.stringify(result).includes('migrate-launcher'));
});
test('CLI and help reject check combinations and do not touch homes',t=>{
 const home=createTestTemp(t,'codex-policy-cli-'),env={...process.env,HOME:home,CODEX_HOME:join(home,'missing-codex'),CLAUDE_CONFIG_DIR:join(home,'missing-claude'),CI:'1'};
 const run=(args:string[])=>spawnSync(process.execPath,['bin/aptly.ts',...args],{cwd:process.cwd(),env,encoding:'utf8'});
 const checked=run(['setup','--check','--client','all']);assert.equal(checked.status,0);assert.deepEqual(JSON.parse(checked.stdout).clients.map(c=>c.codes[0]),['setup_check_configure_ready','setup_check_configure_ready']);
 for(const option of ['--mode','--transmission','--automatic','--migrate-launcher','--dry-run','--include-existing']){
  const value=option==='--mode'?['defaults']:option==='--transmission'?['none']:[];
  assert.notEqual(run(['setup','--check',option,...value]).status,0);assert.notEqual(run(['setup','--check',option,...value,'--help']).status,0);
 }
 assert.match(run(['setup','--help']).stdout,/--check/);assert.deepEqual(readdirSync(home),[]);
});
test('default selected home reports an elsewhere reference and direct check rejects operational options',t=>{
 const home=createTestTemp(t,'codex-policy-default-'),dir=join(home,'.codex');mkdirSync(dir);
 writeFileSync(join(dir,'config.toml'),`[mcp_servers.aptly]\ncommand="custom"\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH=${JSON.stringify(join(home,'elsewhere'))}\n`);
 const item=checkSetup({home,env:{},clients:['codex']}).clients[0];assert.equal(item.policy_location,'elsewhere');assert.equal(item.selected_home_source,'default');
 for(const invalid of [{clients:[]},{automatic:true},{mode:'defaults'},{transmission:'none'},{selectUnselectedOnly:true},{clients:['invalid']}]) assert.equal(checkSetup({home,env:{},...invalid} as any).status,'partial');
});

test('launcher migration preserves and diagnoses a copied owned registration with another policy path',t=>{
 const home=createTestTemp(t,'codex-policy-migration-'),original=join(home,'original'),copied=join(home,'copied');mkdirSync(original);
 const initial={home,env:{CODEX_HOME:original},clients:['codex'] as ('codex')[]};assert.equal(setupHosts(initial).status,'complete');cpSync(original,copied,{recursive:true});
 const options={...initial,env:{CODEX_HOME:copied}},before=snapshot(home);
 for(const dry of [true,false]){const result=migrateLauncher(options,dry),item=result.clients[0];assert.deepEqual(item.codes,['mcp_environment_conflict','hook_policy_path_conflict']);assert.equal(item.policy_location,'elsewhere');assert.equal(item.selected_home_source,'override');assert.ok(!JSON.stringify(result).includes(JSON.stringify(home).slice(1,-1)));assert.ok(!JSON.stringify(result).includes('migrate-launcher'));assert.deepEqual(snapshot(home),before);}
});

test('malformed policy references retain conflict refusal without path classification',t=>{
 for(const client of ['codex','claude'] as const) for(const value of ['',false,42]){
  const home=createTestTemp(t,'codex-policy-malformed-'),dir=join(home,client==='codex'?'.codex':'.claude');mkdirSync(dir);
  const file=client==='codex'?join(dir,'config.toml'):join(home,'.claude.json');
  writeFileSync(file,client==='codex'?`[mcp_servers.aptly]\ncommand="custom"\n[mcp_servers.aptly.env]\nAPTLY_HOOK_POLICY_PATH=${JSON.stringify(value)}\n`:JSON.stringify({mcpServers:{aptly:{command:'custom',env:{APTLY_HOOK_POLICY_PATH:value}}}}));
  const before=snapshot(home);for(const result of [checkSetup({home,env:{},clients:[client]}),setupHosts({home,env:{},clients:[client]}),prepareCredentialReference({home,env:{}},client).result]){
   const item='clients' in result?result.clients[0]:result;assert.deepEqual(item.codes,['mcp_environment_conflict']);assert.equal(item.policy_location,undefined);assert.equal(item.selected_home_source,undefined);
  }assert.deepEqual(snapshot(home),before);
 }
});

test('mixed owned launcher and policy changes retain the guard and warn to review the launcher',t=>{
 const home=createTestTemp(t,'codex-policy-mixed-'),options={home,env:{},clients:['codex'] as ('codex')[]};
 assert.equal(setupHosts(options).status,'complete');const file=join(home,'.codex','config.toml');
 const text=readFileSync(file,'utf8').replace(/^command = .*/m,'command = "/synthetic-unverified-launcher"').replace(/^APTLY_HOOK_POLICY_PATH = .*/m,`APTLY_HOOK_POLICY_PATH = ${JSON.stringify(join(home,'elsewhere'))}`);writeFileSync(file,text);
 const before=snapshot(home),item=prepareCredentialReference(options,'codex').result;assert.deepEqual(item.codes,['managed_mcp_changed','hook_policy_path_conflict']);
 assert.match(item.recovery!.join(' '),/does not authenticate the launcher/);assert.match(item.recovery!.join(' '),/do not execute an unverified launcher/);assert.ok(!JSON.stringify(item).includes(JSON.stringify(home).slice(1,-1)));assert.deepEqual(snapshot(home),before);
});
