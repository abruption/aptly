import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTestTemp} from '../test-support/temp.ts';
import {setupHosts,setDefaults,setTransmission} from '../src/setup.ts';
import {canPromptTransmission} from '../src/cli-input.ts';

function fixture(t){
 const home=createTestTemp(t,'codex-review-cli-'),codex=join(home,'codex'),claude=join(home,'claude');
 const options={home,env:{CODEX_HOME:codex,CLAUDE_CONFIG_DIR:claude},packageRoot:resolve('.'),clients:['codex'] as const};
 const o={...options,clients:['codex'] as ('codex'|'claude')[]};
 const env={PATH:process.env.PATH,HOME:home,USERPROFILE:home,CODEX_HOME:codex,CLAUDE_CONFIG_DIR:claude,APTLY_NO_UPDATE_NOTIFIER:'1'};
 const dir=join(codex,'aptly');return {home,o,env,dir,policy:join(dir,'auto-policy.json'),owner:join(dir,'setup-ownership.json'),marker:join(dir,'transmission-review.json')};
}
async function cli(t,f,args,{answer='',tty=true,extraEnv={},onPrompt=()=>{}}={}){
 const source=pathToFileURL(resolve('bin/aptly.ts')).href;
 const script=`for(const stream of [process.stdin,process.stdout,process.stderr])Object.defineProperty(stream,'isTTY',{value:${tty},configurable:true});process.argv=[process.execPath,${JSON.stringify(resolve('bin/aptly.ts'))},...JSON.parse(process.argv[1])];await import(${JSON.stringify(source)});`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,JSON.stringify(args)],{env:{...f.env,...extraEnv},stdio:['pipe','pipe','pipe']});
 t.after(()=>child.kill());let stdout='',stderr='',prompted=false;
 child.stdout.on('data',c=>stdout+=c);
 child.stderr.on('data',c=>{stderr+=c;if(!prompted&&stderr.includes('Transmission scope [Enter:')){prompted=true;onPrompt();child.stdin.end(answer);}});
 if(!tty||extraEnv.CI||extraEnv.npm_lifecycle_event)child.stdin.end();
 const result=await new Promise<{status:number|null}>((accept,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(Error('CLI did not finish'));},12000);child.once('error',e=>{clearTimeout(timeout);reject(e);});child.once('close',status=>{clearTimeout(timeout);accept({status});});});
 return {...result,stdout,stderr,prompted};
}
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,d)=>writeFileSync(p,JSON.stringify(d,null,2)+'\n',{mode:0o600});

test('transmission prompts require all terminal streams and never run in CI/lifecycle contexts',()=>{
 const interactive={env:{},stdinIsTTY:true,stdoutIsTTY:true,stderrIsTTY:true};assert.equal(canPromptTransmission(interactive),true);
 for(const name of ['stdinIsTTY','stdoutIsTTY','stderrIsTTY'])assert.equal(canPromptTransmission({...interactive,[name]:false}),false);
 for(const env of [{CI:'1'},{APTLY_SKIP_SETUP:'1'},{npm_lifecycle_event:'postinstall'}])assert.equal(canPromptTransmission({...interactive,env}),false);
});
test('interactive setup recommends excerpt on stderr and stdout stays one JSON result',async t=>{
 const f=fixture(t);const r=await cli(t,f,['setup','--client','codex'],{answer:'3\n'});
 assert.equal(r.status,0,r.stderr);assert.equal(r.prompted,true);assert.match(r.stderr,/Recommended/);
 const out=JSON.parse(r.stdout);assert.equal(out.status,'complete');assert.equal(out.clients[0].transmission,'excerpt');assert.equal(out.clients[0].transmission_review,'complete');
 assert.equal(read(f.policy).transmission,'excerpt');assert.equal(existsSync(f.marker),true);assert.equal(r.stdout.includes('Review automatic'),false);
 assert.equal(r.stderr.includes(f.home),false);assert.equal(r.stdout.includes(f.home),false);
});
test('existing legacy scope is asked once, keep preserves bytes, explicit review can ask again',async t=>{
 const f=fixture(t);assert.equal(setDefaults(f.o).status,'complete');const policy=read(f.policy),owner=read(f.owner);delete policy.transmission;policy.schema_version=1;owner.policy=policy;save(f.policy,policy);save(f.owner,owner);
 const policyBefore=readFileSync(f.policy,'utf8'),ownerBefore=readFileSync(f.owner,'utf8');
 const first=await cli(t,f,['set','default','--client','codex'],{answer:'\n'});assert.equal(first.status,0,first.stderr);assert.equal(first.prompted,true);assert.match(first.stderr,/legacy v1/);
 assert.equal(readFileSync(f.policy,'utf8'),policyBefore);assert.equal(readFileSync(f.owner,'utf8'),ownerBefore);assert.ok(existsSync(f.marker));
 // No prompt reads stdin once this onboarding revision is remembered.
 const second=await cli(t,f,['setup','--client','codex'],{answer:'\n'});assert.equal(second.status,0,second.stderr);assert.equal(second.prompted,false);
 const forced=await cli(t,f,['set','transmission','--review','--client','codex'],{answer:'description\n'});assert.equal(forced.status,0,forced.stderr);assert.equal(forced.prompted,true);assert.equal(read(f.policy).transmission,'description');
});
test('EOF and Ctrl-C do not choose a scope or remember review completion',async t=>{
 for(const answer of ['','\x03']){
  const f=fixture(t);assert.equal(setupHosts(f.o).status,'complete');const before=readFileSync(f.policy,'utf8');
  const r=await cli(t,f,['set','transmission','--review','--client','codex'],{answer});assert.equal(r.status,1,r.stderr);assert.equal(r.prompted,true);assert.match(r.stderr,/set_input_cancelled/);
  assert.equal(readFileSync(f.policy,'utf8'),before);assert.equal(existsSync(f.marker),false);
 }
});
test('noninteractive setup, TTY CI and lifecycle do not prompt; explicit review requires a terminal',async t=>{
 for(const options of [{tty:false},{extraEnv:{CI:'1'}},{extraEnv:{npm_lifecycle_event:'postinstall'}}]){
  const f=fixture(t);const r=await cli(t,f,['set','default','--client','codex'],options);assert.equal(r.status,0,r.stderr);assert.equal(r.prompted,false);assert.equal(read(f.policy).transmission,'unselected');assert.equal(existsSync(f.marker),false);assert.doesNotMatch(r.stderr,/Review automatic/);
 }
 const f=fixture(t);const r=await cli(t,f,['set','transmission','--review','--client','codex'],{tty:false});assert.equal(r.status,1);assert.match(r.stderr,/set_interactive_input_required/);assert.equal(existsSync(f.dir),false);
});
test('an operator change during the question cannot be overwritten by the old answer',async t=>{
 const f=fixture(t);assert.equal(setupHosts(f.o).status,'complete');assert.equal(setTransmission('description',f.o).status,'complete');unlinkSync(f.marker);
 const r=await cli(t,f,['set','transmission','--review','--client','codex'],{answer:'3\n',onPrompt:()=>{assert.equal(setTransmission('none',f.o).status,'complete');}});
 assert.equal(r.status,1,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.status,'partial');assert.ok(out.clients[0].codes.includes('concurrent_configuration_change'));assert.equal(read(f.policy).transmission,'none');
});

test('automatic installation gives a pending-review instruction without asking or consenting',async t=>{
 const f=fixture(t);assert.equal(setupHosts(f.o).status,'complete');
 const before=readFileSync(f.policy,'utf8');
 const r=await cli(t,f,['setup','--automatic','--client','codex'],{extraEnv:{npm_lifecycle_event:'postinstall'}});
 assert.equal(r.status,0,r.stderr);assert.equal(r.prompted,false);assert.match(r.stderr,/Run aptly set transmission --review/);assert.equal(existsSync(f.marker),false);assert.equal(readFileSync(f.policy,'utf8'),before);
 assert.equal(setTransmission('description',f.o).status,'complete');
 const reviewed=await cli(t,f,['setup','--automatic','--client','codex'],{extraEnv:{npm_lifecycle_event:'postinstall'}});assert.equal(reviewed.status,0);assert.equal(reviewed.prompted,false);assert.doesNotMatch(reviewed.stderr,/review pending/);
});

test('default all-client review retains the unconfigured client in JSON results',async t=>{
 const f=fixture(t);assert.equal(setupHosts(f.o).status,'complete');
 const r=await cli(t,f,['set','transmission','--review'],{answer:'\n'});assert.equal(r.status,0,r.stderr);
 const clients=JSON.parse(r.stdout).clients;assert.deepEqual(clients.map(c=>c.client),['codex','claude']);assert.equal(clients[0].transmission,'none');assert.equal(clients[1].status,'skipped');assert.ok(clients[1].codes.includes('host_not_configured'));
});
test('one grouped Enter answer keeps legacy and selects none only for an unselected peer',async t=>{
 const f=fixture(t);assert.equal(setupHosts({...f.o,clients:['codex','claude']}).status,'complete');
 const p=read(f.policy),o=read(f.owner);p.schema_version=1;delete p.transmission;o.policy=p;save(f.policy,p);save(f.owner,o);const before=readFileSync(f.policy,'utf8');
 const r=await cli(t,f,['set','transmission','--review'],{answer:'\n'});assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/codex.*legacy v1/);assert.match(r.stderr,/claude.*unselected/);
 const clients=JSON.parse(r.stdout).clients;assert.deepEqual(clients.map(c=>[c.client,c.transmission,c.transmission_review]),[['codex','excerpt','complete'],['claude','none','complete']]);assert.equal(readFileSync(f.policy,'utf8'),before);
 const same=await cli(t,f,['set','transmission','--review','--client','claude'],{answer:'1\n'});assert.equal(same.status,0);const only=JSON.parse(same.stdout).clients[0];assert.ok(only.codes.includes('transmission_review_complete'));assert.ok(!only.codes.includes('mcp_restart_required'));
});
test('a prompt-time conflict reports the other candidate as skipped without applying it',async t=>{
 const f=fixture(t);assert.equal(setupHosts({...f.o,clients:['codex','claude']}).status,'complete');
 const r=await cli(t,f,['set','transmission','--review'],{answer:'3\n',onPrompt:()=>{assert.equal(setTransmission('none',f.o).status,'complete');}});assert.equal(r.status,1);
 const clients=JSON.parse(r.stdout).clients;assert.deepEqual(clients.map(c=>c.client),['codex','claude']);assert.ok(clients[0].codes.includes('concurrent_configuration_change'));assert.equal(clients[1].status,'skipped');assert.ok(clients[1].codes.includes('other_host_validation_failed'));
 assert.equal(read(join(f.env.CLAUDE_CONFIG_DIR,'aptly','auto-policy.json')).transmission,'unselected');assert.equal(existsSync(join(f.env.CLAUDE_CONFIG_DIR,'aptly','transmission-review.json')),false);
});
