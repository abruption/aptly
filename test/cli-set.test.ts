import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createTestTemp} from '../test-support/temp.ts';

function fixture(t){const home=createTestTemp(t,'codex-cli-set-');return{home,run:(args,input=undefined)=>spawnSync(process.execPath,[resolve('bin/aptly.ts'),...args],{env:{PATH:process.env.PATH,HOME:home,USERPROFILE:home},encoding:'utf8',input,timeout:15000})};}
test('CLI adds defaults to both isolated hosts and reads validated values through explicit stdin',t=>{
 const f=fixture(t),created=f.run(['set','default']);assert.equal(created.status,0);assert.equal(JSON.parse(created.stdout).status,'complete');
 const changed=f.run(['set','env','APTLY_CODEX_MODELS','--stdin'],'["gpt-6.1-sol"]\n');assert.equal(changed.status,0);assert.doesNotMatch(changed.stdout,/\[\\?"gpt/);const c=JSON.parse(readFileSync(join(f.home,'.claude.json'),'utf8'));assert.equal(c.mcpServers.aptly.env.APTLY_CODEX_MODELS,'["gpt-6.1-sol"]');
 assert.equal(f.run(['set','default']).status,0);assert.equal(JSON.parse(readFileSync(join(f.home,'.claude.json'),'utf8')).mcpServers.aptly.env.APTLY_CODEX_MODELS,'["gpt-6.1-sol"]');
});
test('CLI rejects unsafe keys and argv values without echoing sensitive data or writing files',t=>{
 const f=fixture(t),secret='sk-synthetic-value-not-an-api-key-123';for(const args of [['set','env','PATH','--stdin'],['set','env','APTLY_CODEX_MODELS',secret],['set','env','OPENAI_API_KEY',secret],['set','default','--stdin']]){const r=f.run(args,secret);assert.equal(r.status,1);assert.doesNotMatch(r.stdout+r.stderr,new RegExp(secret));}assert.deepEqual(readdirSync(f.home),[]);
});
test('noninteractive input requires --stdin and help has no side effects',t=>{
 const f=fixture(t),r=f.run(['set','env','APTLY_CODEX_MODELS'],'[]');assert.equal(r.status,1);assert.match(r.stderr,/set_interactive_input_required/);assert.equal(f.run(['set','--help']).status,0);assert.deepEqual(readdirSync(f.home),[]);
});
test('invalid provider and malformed candidates cannot mutate a configured host',t=>{
 const f=fixture(t);assert.equal(f.run(['set','default']).status,0);const before=readFileSync(join(f.home,'.codex/config.toml'),'utf8');for(const [key,value] of [['ROUTER_PROVIDER','foreign'],['APTLY_CODEX_MODELS','not-json'],['APTLY_CODEX_MODELS','["unsupported"]']]){assert.equal(f.run(['set','env',key,'--stdin'],value).status,1);assert.equal(readFileSync(join(f.home,'.codex/config.toml'),'utf8'),before);}
});

test('key preflight reports incompatible hosts before reading stdin and provides host-specific recovery',t=>{
 const f=fixture(t);assert.equal(f.run(['set','default']).status,0);
 const file=join(f.home,'.claude.json'),receipt=join(f.home,'.claude/aptly/setup-ownership.json');
 const c=JSON.parse(readFileSync(file,'utf8')),o=JSON.parse(readFileSync(receipt,'utf8'));
 c.mcpServers.aptly.args=[join(f.home,'old','dist/src/server.js')];o.mcp=c.mcpServers.aptly;
 writeFileSync(file,JSON.stringify(c));writeFileSync(receipt,JSON.stringify(o));
 const codex=readFileSync(join(f.home,'.codex/config.toml'),'utf8');
 for(const extra of [[],['--stdin'],['--check']]){
  const r=f.run(['set','env','OPENAI_API_KEY',...extra]);assert.equal(r.status,1);assert.equal(r.stderr,'');
  const result=JSON.parse(r.stdout);assert.equal(result.clients[0].status,'unchanged');assert.ok(result.clients[1].codes.includes('launcher_migration_available'));assert.doesNotMatch(r.stdout,new RegExp(f.home));
 }
 assert.equal(readFileSync(join(f.home,'.codex/config.toml'),'utf8'),codex);
 assert.equal(f.run(['setup','--migrate-launcher']).status,1);
 assert.equal(f.run(['setup','--client','claude','--migrate-launcher','--dry-run']).status,0);
 assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),c);
 assert.equal(f.run(['setup','--client','claude','--migrate-launcher']).status,0);
 const checked=f.run(['set','env','OPENAI_API_KEY','--client','claude','--check']);assert.equal(checked.status,0);assert.equal(JSON.parse(checked.stdout).status,'complete');
 assert.equal(readFileSync(join(f.home,'.codex/config.toml'),'utf8'),codex);
});
