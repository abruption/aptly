import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{mkdirSync,writeFileSync,readFileSync,chmodSync,unlinkSync,symlinkSync,renameSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {stringify,parse} from 'smol-toml';
import {collectDoctor,observeDoctorLedger,DOCTOR_LEDGER_SCAN_LIMIT} from '../src/doctor.ts';
import {QuerySnapshot} from '../src/query-snapshot.ts';
import { VERSION } from '../src/version.ts';
import {Router,defaultPolicy,validateLedgerState} from '../src/core.ts';
import {setupHosts,setPolicySource} from '../src/setup.ts';
import {createTestTemp} from '../test-support/temp.ts';
const posix={skip:process.platform==='win32'};
function tree(root:string){const out:Record<string,unknown>={};function walk(d:string){for(const n of readdirSync(d)){const p=join(d,n),s=lstatSync(p);if(s.isDirectory())walk(p);else out[relative(root,p)]={mode:s.mode,bytes:s.isSymbolicLink()?'symlink':readFileSync(p).toString('base64')};}}walk(root);return out;}
function fixture(t,installed=true){
 const home=createTestTemp(t,'codex-doctor-'),options={home,env:{},packageRoot:resolve('.')};
 if(installed)assert.equal(setupHosts(options).status,'complete');
 const config=join(home,'.codex/config.toml'),ledger=join(home,'.codex/aptly/state/ledger.json');
 const modify=(fn:(entry:any)=>void)=>{const c=parse(readFileSync(config,'utf8')) as any;fn(c.mcp_servers.aptly);writeFileSync(config,stringify(c));};
 const result=()=>collectDoctor(options);
 return {home,options,config,ledger,modify,result};
}
const empty=()=>({version:1,calls:0,estimated_usd:0,days:{},requests:{}});
test('doctor completes genuine absence and never creates a state directory',posix,t=>{
 const f=fixture(t,false),before=tree(f.home),r=f.result();assert.equal(r.kind,'aptly-doctor');assert.equal(r.status,'complete');assert.ok(r.clients.every(c=>c.registration==='unconfigured'));assert.deepEqual(tree(f.home),before);
});
test('standard Node server registration, absent first-use ledger and runtime unknowns',posix,t=>{
 const f=fixture(t),before=tree(f.home),r=f.result();assert.equal(r.status,'complete',JSON.stringify(r));
 for(const c of r.clients){assert.equal(c.registered_package?.version,VERSION);assert.equal(c.ledger?.status,'absent');assert.equal(c.ledger?.counts,null);for(const k of ['connected_mcp_version','hook_trust','hook_execution','restart_required','retry_ticket_usage','credential_validity'])assert.equal(c[k],'unknown');}
 assert.deepEqual(tree(f.home),before);
});
test('validated ledger counts use the same archival outcome rules as the existing loader',posix,t=>{
 const f=fixture(t),s=empty() as any;
 s.requests.done={digest:'a'.repeat(64),state:'complete',result:{status:'recommended',reason:'allowed_profile',application:'advisory_only',policy_version:'old',catalog_version:'old',profile_id:'codex-routine',profile:{id:'codex-routine',client:'codex',model:'gpt-6.1-sol',reasoning_effort:'low'}}};s.requests.uncertain={digest:'b'.repeat(64),state:'unknown'};
 writeFileSync(f.ledger,JSON.stringify(s),{mode:0o600});const before=tree(f.home),r=f.result();assert.equal(r.status,'complete');assert.deepEqual(r.clients[0].ledger?.counts,{total:2,complete:1,unknown:1});
 const router=new Router({provider:async()=>{throw Error('provider forbidden')},ledgerPath:f.ledger});router.load({readOnly:true});assert.deepEqual(router.state,s);assert.deepEqual(tree(f.home),before);
});
for(const type of ['bad-json','bad-result','bad-state','bad-counters','unsafe-mode','symlink'] as const)test(`doctor rejects ledger ${type} without rewriting it`,posix,t=>{
 const f=fixture(t),s=empty() as any;
 if(type==='bad-result')s.requests.x={digest:'a'.repeat(64),state:'complete',result:{status:'recommended'}};
 if(type==='bad-state')s.requests.x={digest:'a'.repeat(64),state:'pending'};
 if(type==='bad-counters')s.calls=1;
 writeFileSync(f.ledger,type==='bad-json'?'{oops':JSON.stringify(s),{mode:0o600});
 if(type==='unsafe-mode')chmodSync(f.ledger,0o644);
 if(type==='symlink'){renameSync(f.ledger,f.ledger+'.target');symlinkSync(f.ledger+'.target',f.ledger);}
 const before=tree(f.home),r=f.result();assert.equal(r.status,'partial');assert.equal(r.clients[0].status,'partial');assert.equal(r.clients[1].status,'complete');assert.deepEqual(tree(f.home),before);assert.equal(r.clients[0].ledger,undefined);
});
test('4 MiB boundary is scanned, larger ledger is metadata-only and not opened',posix,t=>{
 const f=fixture(t);const body=JSON.stringify(empty());writeFileSync(f.ledger,body+' '.repeat(DOCTOR_LEDGER_SCAN_LIMIT-body.length),{mode:0o600});assert.equal(f.result().clients[0].ledger?.status,'validated_bounded_snapshot');
 writeFileSync(f.ledger,'x'.repeat(DOCTOR_LEDGER_SCAN_LIMIT+1));
 const old=fs.openSync;let opened=false;(fs as any).openSync=(p,...args)=>{if(p===f.ledger){opened=true;throw Error('must not open oversize');}return old(p,...args);};syncBuiltinESMExports();
 try{const r=f.result();assert.equal(r.status,'complete');assert.equal(r.clients[0].ledger?.status,'scan_skipped_size_limit');assert.equal(r.clients[0].ledger?.bytes,DOCTOR_LEDGER_SCAN_LIMIT+1);assert.equal(opened,false);}finally{fs.openSync=old;syncBuiltinESMExports();}
});
for(const kind of ['grow','rename'] as const)test(`ledger ${kind} during observation never finalizes stale counts`,posix,t=>{
 const f=fixture(t);writeFileSync(f.ledger,JSON.stringify(empty()),{mode:0o600});
 const old=QuerySnapshot.prototype.verify;let changed=false;
 QuerySnapshot.prototype.verify=function(){if(!changed){changed=true;if(kind==='grow')writeFileSync(f.ledger,'x'.repeat(DOCTOR_LEDGER_SCAN_LIMIT+1));else{renameSync(f.ledger,f.ledger+'.old');writeFileSync(f.ledger,JSON.stringify(empty()),{mode:0o600});}}old.call(this);};
 try{const r=f.result();assert.equal(r.status,'partial');assert.equal(r.clients[0].code,'changed_during_observation');assert.equal(r.clients[0].ledger,undefined);}finally{QuerySnapshot.prototype.verify=old;}
});
test('size observation is checked and retains private-parent protection for missing files',posix,t=>{
 const f=fixture(t),view=new QuerySnapshot();assert.equal(view.size(f.ledger,{privateFile:true}),null);writeFileSync(f.ledger,'new',{mode:0o600});assert.throws(()=>view.verify(),/concurrent_configuration_change/);
 const unsafe=join(f.home,'unsafe');mkdirSync(unsafe,{mode:0o755});assert.throws(()=>new QuerySnapshot().size(join(unsafe,'absent'),{privateFile:true}));
});
test('custom launcher is not executed or assigned a package/runtime version',posix,t=>{
 const f=fixture(t),marker=join(f.home,'MUST_NOT_EXIST');f.modify(e=>{e.command='/bin/sh';e.args=['-c','touch '+marker];});const before=tree(f.home),r=f.result();assert.equal(r.status,'complete');assert.equal(r.clients[0].registration,'custom_or_remote_launcher');assert.equal(r.clients[0].registered_package?.version,null);assert.deepEqual(tree(f.home),before);
});
test('forwarded values missing in CLI are unknown; codex-home selects CLI default without requiring terminal override',posix,t=>{
 const f=fixture(t);assert.equal(setPolicySource({...f.options,clients:['codex']},false).status,'complete');f.modify(e=>{delete e.env.ROUTER_LEDGER_PATH;e.env_vars=[...e.env_vars,'ROUTER_LEDGER_PATH'];});const r=f.result();assert.equal(r.status,'complete',JSON.stringify(r));assert.equal(r.clients[0].policy?.source_kind,'codex_home');assert.equal(r.clients[0].ledger?.status,'runtime_value_unobserved');
 f.modify(e=>{e.env_vars=e.env_vars.filter(k=>k!=='CODEX_HOME');});assert.equal(f.result().clients[0].code,'invalid_policy_binding');
});
test('Claude selected config home uses its separate MCP file location',posix,t=>{
 const f=fixture(t,false),dir=join(f.home,'claude-override'),opts={...f.options,env:{CLAUDE_CONFIG_DIR:dir},clients:['claude'] as ['claude']};assert.equal(setupHosts(opts).status,'complete');const r=collectDoctor(opts);assert.equal(r.status,'complete');assert.equal(r.clients[0].selected_home_source,'override');assert.equal(r.clients[0].registration,'standard_node_registration');
});
test('arbitrary SemVer suffix, inline key and private metadata never leak through output',posix,t=>{
 const f=fixture(t),pkg=join(f.home,'package');mkdirSync(join(pkg,'src'),{recursive:true});writeFileSync(join(pkg,'src/server.ts'),'throw Error("DO_NOT_EXECUTE")');writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'aptly',version:'0.1.12-private_SENTINEL',description:f.home}));
 f.modify(e=>{e.args=[join(pkg,'src/server.ts')];e.env.OPENAI_API_KEY='SYNTHETIC_SECRET_SENTINEL';});const r=f.result(),text=JSON.stringify(r);assert.equal(r.status,'complete');assert.equal(r.clients[0].registered_package?.status,'unsupported_version_metadata');assert.doesNotMatch(text,/private_SENTINEL|SYNTHETIC_SECRET_SENTINEL/);assert.ok(!text.includes(f.home));
});
for(const kind of ['config','policy','hooks','home'] as const)test(`known invalid ${kind} is partial with only a safe code`,posix,t=>{
 const f=fixture(t);if(kind==='config')writeFileSync(f.config,'[broken');if(kind==='policy')unlinkSync(join(f.home,'.codex/aptly/auto-policy.json'));if(kind==='hooks')unlinkSync(join(f.home,'.codex/hooks.json'));
 const r=collectDoctor({...f.options,...(kind==='home'?{env:{CODEX_HOME:'relative_PRIVATE_SENTINEL'}}:{})});assert.equal(r.status,'partial');assert.equal(r.clients[1].status,'complete');assert.ok(!JSON.stringify(r).includes(f.home));assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SENTINEL|Error:|ENOENT/);
});
test('doctor CLI/help have no external calls, notifications, writes or credential lookup',posix,t=>{
 const f=fixture(t),guard=join(f.home,'guard.mjs');writeFileSync(guard,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';globalThis.fetch=()=>{throw Error('NETWORK_SENTINEL')};for(const k of ['spawnSync','execFileSync','spawn','exec','execSync','execFile'])cp[k]=()=>{process.stderr.write('EXTERNAL_SENTINEL');throw Error('CHILD_SENTINEL')};syncBuiltinESMExports();`);
 const run=(args:string[])=>spawnSync(process.execPath,['--import',guard,resolve('bin/aptly.ts'),...args],{env:{HOME:f.home,USERPROFILE:f.home,PATH:process.env.PATH,ROUTER_PROVIDER:'decisions',APTLY_SECRET_BACKEND:'os',APTLY_SECRET_CLIENT:'codex'},encoding:'utf8',timeout:15000});
 const before=tree(f.home);let r=run(['doctor']);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).kind,'aptly-doctor');assert.deepEqual(tree(f.home),before);
 r=run(['doctor','--help']);assert.equal(r.status,0);assert.match(r.stdout,/aptly doctor/);assert.equal(r.stderr,'');
 for(const args of [['doctor','--bad'],['doctor','--client','bad'],['doctor','--client','codex','--client','all']]){r=run(args);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'aptly: doctor_invalid_options\n');}
 unlinkSync(join(f.home,'.codex/hooks.json'));r=run(['doctor']);assert.equal(r.status,1);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).status,'partial');
});
test('visible terminal passthrough values are not treated as future host configuration',posix,t=>{
 const f=fixture(t);f.modify(e=>{delete e.env.ROUTER_LEDGER_PATH;delete e.env.APTLY_HOOK_POLICY_PATH;e.env_vars=[...e.env_vars,'ROUTER_LEDGER_PATH','APTLY_HOOK_POLICY_PATH'];});
 const wrong=join(f.home,'wrong-account');mkdirSync(wrong,{mode:0o700});writeFileSync(join(wrong,'ledger.json'),'not valid',{mode:0o600});
 const r=collectDoctor({...f.options,env:{APTLY_HOOK_POLICY_PATH:join(wrong,'missing-policy.json'),ROUTER_LEDGER_PATH:join(wrong,'ledger.json')}});assert.equal(r.status,'complete');assert.equal(r.clients[0].ledger?.status,'runtime_value_unobserved');assert.equal(r.clients[0].policy?.source_kind,'runtime_value_unobserved');assert.equal(r.clients[0].policy?.status,'runtime_value_unobserved');
});
for(const type of ['different-node','wrong-package','missing-package','custom-policy'] as const)test(`ambiguous launcher remains unobserved: ${type}`,posix,t=>{
 const f=fixture(t),pkg=join(f.home,'other-package');mkdirSync(join(pkg,'src'),{recursive:true});writeFileSync(join(pkg,'src/server.ts'),'throw Error("MUST_NOT_RUN")');
 if(type==='wrong-package')writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'other',version:'1.2.3'}));
 f.modify(e=>{if(type==='different-node')e.command=join(f.home,'node');else if(type==='custom-policy'){e.command='/bin/custom';e.env.APTLY_HOOK_POLICY_PATH=join(f.home,'MISSING');}else e.args=[join(pkg,'src/server.ts')];});
 const r=f.result();assert.equal(r.status,'complete');assert.equal(r.clients[0].registration,'custom_or_remote_launcher');assert.equal(r.clients[0].policy?.status,'custom_launcher_unobserved');assert.equal(r.clients[0].ledger?.status,'custom_launcher_unobserved');
});
for(const type of ['grow','rename','symlink'] as const)test(`size to read ${type} race reports changed observation`,posix,t=>{
 const f=fixture(t);writeFileSync(f.ledger,JSON.stringify(empty()),{mode:0o600});
 const old=fs.openSync;let changed=false;(fs as any).openSync=(p,...args)=>{if(p===f.ledger&&!changed){changed=true;if(type==='grow')writeFileSync(f.ledger,'x'.repeat(DOCTOR_LEDGER_SCAN_LIMIT+1));else{renameSync(f.ledger,f.ledger+'.old');if(type==='symlink')symlinkSync(f.ledger+'.old',f.ledger);else writeFileSync(f.ledger,JSON.stringify(empty()),{mode:0o600});}}return old(p,...args);};syncBuiltinESMExports();
 try{const r=f.result();assert.equal(changed,true);assert.equal(r.clients[0].code,'changed_during_observation');assert.equal(r.clients[0].ledger,undefined);}finally{fs.openSync=old;syncBuiltinESMExports();}
});
test('missing an owned MCP registration is a query failure, not a genuine first use',posix,t=>{
 const f=fixture(t);const c=parse(readFileSync(f.config,'utf8')) as any;delete c.mcp_servers.aptly;writeFileSync(f.config,stringify(c));assert.equal(f.result().clients[0].status,'partial');
});
