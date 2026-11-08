import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'smol-toml';
import { createTestTemp } from '../test-support/temp.ts';
import { setDefaults, setEnvironment, showBudgetStatus } from '../src/setup.ts';
import { budgetEnvironmentDefaults } from '../src/budget.ts';
import { Router } from '../src/core.ts';

const fixture=t=>({home:createTestTemp(t,'codex-budget-setup-'),env:{},packageRoot:resolve('.')});
const registration=(o,client)=>client==='codex'?parse(readFileSync(join(o.home,'.codex/config.toml'),'utf8')).mcp_servers.aptly:JSON.parse(readFileSync(join(o.home,'.claude.json'),'utf8')).mcpServers.aptly;

test('default setup fills budget keys once, reports changes and preserves explicit zero/custom values',t=>{
 const o=fixture(t),first=setDefaults(o);assert.equal(first.status,'complete');
 for(const client of ['codex','claude']){
  const env=registration(o,client).env;
  for(const [key,value]of Object.entries(budgetEnvironmentDefaults))assert.equal(env[key],value);
  assert.equal(first.clients.find(c=>c.client===client).budget.added.length,4);
 }
 assert.equal(setEnvironment('APTLY_MAX_DAILY_CALLS','0',o).status,'complete');
 assert.equal(setEnvironment('APTLY_ESTIMATED_CALL_USD','0.0001',o).status,'complete');
 // Validate against the actual other settings, not a standalone default rate of .002.
 assert.equal(setEnvironment('APTLY_MAX_ESTIMATED_USD','0.0002',o).status,'complete');
 const next=setDefaults(o);assert.equal(next.status,'complete');
 for(const c of next.clients){assert.equal(c.status,'unchanged');assert.deepEqual(c.budget.added,[]);assert.deepEqual(c.budget.updated,[]);assert.equal(c.budget.preserved.length,4);}
 for(const client of ['codex','claude'])assert.equal(registration(o,client).env.APTLY_MAX_DAILY_CALLS,'0');
});

test('invalid budget settings are rejected without changes and rate zero is distinct from unlimited',t=>{
 const o=fixture(t);setDefaults(o);const path=join(o.home,'.codex/config.toml'),before=readFileSync(path,'utf8');
 for(const value of ['-1','1e3','1.5','1.0','Infinity','NaN',' 200',''])assert.equal(setEnvironment('APTLY_MAX_DAILY_CALLS',value,o).status,'partial');
 assert.equal(setEnvironment('APTLY_ESTIMATED_CALL_USD','0',o).status,'partial');
 assert.equal(readFileSync(path,'utf8'),before);
});

test('default setup refuses pre-existing invalid budget values rather than overwriting them',t=>{
 const o=fixture(t);mkdirSync(join(o.home,'.claude'),{mode:0o700});
 const path=join(o.home,'.claude.json');
 const config={mcpServers:{aptly:{command:process.execPath,args:['custom-launcher'],env:{APTLY_MAX_DAILY_CALLS:'bad'}}}};
 writeFileSync(path,JSON.stringify(config),{mode:0o600});const before=readFileSync(path,'utf8');
 const result=setDefaults({...o,clients:['claude']});assert.equal(result.status,'partial');assert.ok(result.clients[0].codes.includes('environment_invalid_value'));
 assert.equal(readFileSync(path,'utf8'),before);assert.equal(existsSync(join(o.home,'.claude/aptly/setup-ownership.json')),false);
});

test('status does not initialize a ledger, load credentials or expose keys/paths',t=>{
 const o=fixture(t);setDefaults(o);const ledger=registration(o,'codex').env.ROUTER_LEDGER_PATH;
 const result=showBudgetStatus({...o,env:{OPENAI_API_KEY:'synthetic-private-value',APTLY_SECRET_BACKEND:'invalid'}});
 assert.equal(result.status,'complete');const b=result.clients.find(c=>c.client==='codex').budget;
 assert.equal(b.usage.daily_calls,0);assert.equal(b.remaining.total_calls,null);assert.equal(b.display_limits.max_total_calls,'Unlimited');
 assert.equal(b.running_host_verified,false);assert.equal(existsSync(ledger),false);assert.equal(existsSync(ledger+'.lock'),false);
 assert.doesNotMatch(JSON.stringify(result),/synthetic-private-value|OPENAI_API_KEY|ledger\.json|codex-budget-setup/);
});

test('budget changes/defaults/status preserve paid reservations and unknown request history byte-for-byte',async t=>{
 const o=fixture(t);setDefaults(o);const ledger=registration(o,'codex').env.ROUTER_LEDGER_PATH;
 const router=new Router({ledgerPath:ledger,provider:async()=>{throw Object.assign(new Error('synthetic'),{code:'network'});}});
 const request={request_id:'unknown-budget-case',client:'codex',task:{summary:'Review supplied synthetic functions for incorrect imports.',operation:'review',context_sufficient:true}};
 assert.equal((await router.advise(request)).reason,'network');const before=readFileSync(ledger,'utf8');
 assert.equal(setEnvironment('APTLY_ESTIMATED_CALL_USD','0.003',o).status,'complete');assert.equal(setDefaults(o).status,'complete');
 const result=showBudgetStatus(o);assert.equal(result.status,'complete');const b=result.clients.find(c=>c.client==='codex').budget;
 assert.equal(b.usage.daily_calls,1);assert.equal(b.usage.estimated_usd,0.002);assert.equal(b.limits.estimated_call_usd,0.003);
 assert.equal(readFileSync(ledger,'utf8'),before);assert.equal(JSON.parse(before).requests['unknown-budget-case'].state,'unknown');
});

test('CLI accepts budget env settings and read-only registered status; rejects malformed commands',t=>{
 const o=fixture(t);const env={...process.env,HOME:o.home,CODEX_HOME:join(o.home,'.codex'),CLAUDE_CONFIG_DIR:join(o.home,'.claude'),CI:'1'};
 const run=(args,input)=>spawnSync(process.execPath,['bin/aptly.ts',...args],{cwd:resolve('.'),env,encoding:'utf8',input});
 assert.equal(run(['set','default']).status,0);
 const set=run(['set','env','APTLY_MAX_DAILY_CALLS','--client','codex','--stdin'],'0\n');assert.equal(set.status,0,set.stderr);
 const status=run(['budget','status','--client','codex']);assert.equal(status.status,0,status.stderr);const b=JSON.parse(status.stdout).clients[0].budget;
 assert.equal(b.display_limits.max_daily_calls,'Unlimited');assert.equal(b.provenance.max_daily_calls,'environment');
 assert.equal(run(['budget','reset']).status,1);assert.equal(run(['budget','status','--client','bad']).status,1);
 assert.equal(run(['set','env','APTLY_ESTIMATED_CALL_USD','--stdin'],'0\n').status,1);
});
