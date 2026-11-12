import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createTestTemp, temporaryRoot } from '../test-support/temp.ts';
import { materializeStableRuntime, planStableRuntime, stableObserverCommand, stableRuntimeLimits, stableReference, validateStableRegistration } from '../src/stable-runtime.ts';
function unsafeTestAncestry(){let path=temporaryRoot().root;while(!existsSync(path))path=dirname(path);for(;;){const observed=lstatSync(path),stat=observed.isSymbolicLink()?statSync(path):observed;if((stat.mode&0o022)&&!(stat.uid===0&&stat.isDirectory()&&(stat.mode&0o1000)))return true;const next=dirname(path);if(next===path)return false;path=next;}}
const posix={skip:process.platform==='win32'?'POSIX opt-in only':unsafeTestAncestry()?'Selected temporary volume has unsafe writable ancestry; no live-execution proof is claimed.':false};
function save(path,text,mode=0o644){mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,text,{mode});}
function fixture(t){
 const home=createTestTemp(t,'codex-stable-runtime-'),pkg=join(home,'old-prefix','lib','node_modules','aptly');
 save(join(pkg,'package.json'),JSON.stringify({name:'aptly',version:'0.1.13',type:'module',dependencies:{'fixture-dep':'1.0.0'}}));save(join(pkg,'LICENSE'),'fixture public license');
 save(join(pkg,'dist/src/server.js'),"import {value} from 'fixture-dep';export async function serve(){process.stdout.write(JSON.stringify({value,options:process.env.NODE_OPTIONS??null,repl:process.env.NODE_REPL_EXTERNAL_MODULE??null,exec:process.execPath}));}\n");
 save(join(pkg,'dist/bin/aptly-observe.js'),"import {value} from 'fixture-dep';if(value!=='public dependency')throw Error('fixture');\n");
 save(join(pkg,'node_modules/fixture-dep/package.json'),JSON.stringify({name:'fixture-dep',version:'1.0.0',type:'module',exports:'./index.js'}));save(join(pkg,'node_modules/fixture-dep/index.js'),"export const value='public dependency';\n");
 save(join(pkg,'node_modules/dev-only/package.json'),JSON.stringify({name:'dev-only',version:'1'}));save(join(pkg,'node_modules/dev-only/index.js'),'throw Error("must not copy dev toolchain")');
 const node=join(home,'old-prefix','bin','node');save(node,'#!/bin/sh\nexit 1\n',0o700);
 return{home,pkg,node,plan:()=>planStableRuntime({home,packageRoot:pkg,nodePath:node})};
}

// Read-only unit adapter for source validation on the intentionally unsupported
// writable external mount. Fixture materialization is not a live launcher trust
// proof; these adapter checks never execute the generated payload.
function unitSourceMetadata(pkg,fn){
 const original=fs.lstatSync,mask=new Set();let at=dirname(pkg);
 while(true){const stat=original(at);if(stat.mode&0o022)mask.add(at);const next=dirname(at);if(next===at)break;at=next;}
 fs.lstatSync=((path,...args)=>{const stat=original(path,...args);if(!mask.has(String(path)))return stat;return new Proxy(stat,{get(target,key){if(key==='mode')return target.mode&~0o022;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});});
 syncBuiltinESMExports();try{return fn();}finally{fs.lstatSync=original;syncBuiltinESMExports();}
}

const error=code=>e=>e instanceof Error&&e.message===code;
function installSafeAlternative(plan){
 const base=join(plan.manifest.home,'.nvm/versions/node');
 const available=existsSync(base)&&fs.readdirSync(base).some(v=>existsSync(join(base,v,'bin/node')));
 if(!available){const target=join(base,'v'+process.versions.node,'bin/node');mkdirSync(dirname(target),{recursive:true,mode:0o700});copyFileSync(process.execPath,target);chmodSync(target,0o700);}
}
function run(plan,mode='serve',extra={}){installSafeAlternative(plan);return spawnSync(plan.command,[mode],{env:{PATH:dirname(process.execPath),...extra},encoding:'utf8',timeout:5000});}

test('planning and planned observer command are read-only and snapshot only production closure',posix,t=>{
 const f=fixture(t),plan=f.plan();assert.equal(existsSync(join(f.home,'.local')),false);
 const command=stableObserverCommand(plan,'codex',join(f.home,'policy.json'));
 assert.ok(command.includes("'observe'"));assert.equal(existsSync(join(f.home,'.local')),false);
 assert.ok(plan.manifest.files.some(f=>f.path==='node_modules/fixture-dep/index.js'));assert.ok(!plan.manifest.files.some(f=>f.path.includes('dev-only')));
 assert.throws(()=>stableObserverCommand({...plan},'codex',join(f.home,'policy.json')),error('stable_runtime_unverified'));
 assert.throws(()=>materializeStableRuntime({...plan}),error('stable_plan_unverified'));
});

test('immutable runtime survives deleted Node and npm prefix and strips injection options before probing',posix,t=>{
 const f=fixture(t),plan=f.plan();materializeStableRuntime(plan);materializeStableRuntime(plan);
 assert.equal(validateStableRegistration(plan.descriptor,{home:f.home}).integrity,'full');
 rmSync(join(f.home,'old-prefix'),{recursive:true});
 const result=run(plan,'serve',{NODE_OPTIONS:'--require /missing/never-execute.cjs',NODE_PATH:'/missing',NODE_REPL_EXTERNAL_MODULE:'/missing'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');const output=JSON.parse(result.stdout);assert.deepEqual({value:output.value,options:output.options,repl:output.repl},{value:'public dependency',options:null,repl:null});assert.equal(typeof output.exec,'string');
 const observe=run(plan,'observe');assert.equal(observe.status,0,observe.stderr);assert.equal(observe.stdout,'');assert.equal(observe.stderr,'');
});

test('nvm numeric installed release fallback works with empty PATH after the original prefix disappears',posix,t=>{
 const f=fixture(t),plan=f.plan();materializeStableRuntime(plan);
 let ancestor=f.home;while(true){const stat=lstatSync(ancestor);if((stat.mode&0o022)&&!(stat.uid===0&&(stat.mode&0o1000))){t.skip('Fixture mount has writable non-sticky ancestry; candidate qualification intentionally refuses it.');return;}const parent=dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
 const alternative=join(f.home,'.nvm/versions/node/v24.99.1/bin/node');mkdirSync(dirname(alternative),{recursive:true,mode:0o700});copyFileSync(process.execPath,alternative);chmodSync(alternative,0o700);
 rmSync(join(f.home,'old-prefix'),{recursive:true});
 const result=run(plan,'serve',{PATH:''});assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);assert.equal(output.value,'public dependency');
 if(output.exec!==realpathSync(alternative)){
  const fixed=['/opt/homebrew/bin/node','/usr/local/bin/node','/usr/bin/node'].filter(existsSync).map(p=>realpathSync(p));assert.ok(fixed.includes(output.exec));
  t.skip('A higher-priority standard runtime was selected; nvm-only fallback was not exercised on this host.');
 }
});

test('metadata-only validation never claims payload integrity and full validation rejects mutation',posix,t=>{
 const f=fixture(t),plan=f.plan();materializeStableRuntime(plan);
 writeFileSync(join(plan.payloadRoot,'dist/src/server.js'),'throw Error("mutated")');
 assert.equal(validateStableRegistration(plan.descriptor,{home:f.home,metadataOnly:true}).integrity,'metadata');
 assert.throws(()=>validateStableRegistration(plan.descriptor,{home:f.home}),error('stable_runtime_unverified'));
 const serve=run(plan);assert.equal(serve.status,1);assert.equal(serve.stdout,'');assert.equal(serve.stderr,'aptly: stable_runtime_unavailable\n');
 const observe=run(plan,'observe');assert.equal(observe.status,0);assert.equal(observe.stdout,'');assert.equal(observe.stderr,'');
});

test('symlinks, extra payload files, insecure modes and manifest/template drift fail closed without repair',posix,t=>{
 for(const mutate of [
  p=>{const file=join(p.payloadRoot,'dist/src/server.js');rmSync(file);symlinkSync('/dev/null',file);},
  p=>save(join(p.payloadRoot,'unowned.js'),'public but unmanifested',0o600),
  p=>chmodSync(join(p.payloadRoot,'package.json'),0o644),
  p=>writeFileSync(join(p.runtimeRoot,'manifest.json'),'{}'),
  p=>writeFileSync(join(p.runtimeRoot,'launch'),'#!/bin/sh\nexit 0\n'),
 ]){const f=fixture(t),p=f.plan();materializeStableRuntime(p);mutate(p);assert.throws(()=>validateStableRegistration(p.descriptor,{home:f.home}),error('stable_runtime_unverified'));assert.throws(()=>materializeStableRuntime(p),error('stable_runtime_unverified'));}
});

test('source changes after planning refuse before generation publication',posix,t=>{
 const f=fixture(t),plan=f.plan();writeFileSync(join(f.pkg,'dist/src/server.js'),'export function serve(){}');
 assert.throws(()=>materializeStableRuntime(plan),error('stable_source_changed'));assert.equal(existsSync(plan.runtimeRoot),false);
});

test('unverified source dependency escape missing required dep and oversized source are refused',posix,t=>{
 const a=fixture(t);rmSync(join(a.pkg,'node_modules/fixture-dep'),{recursive:true});assert.throws(()=>a.plan(),error('stable_source_unverified'));
 const b=fixture(t);const source=join(b.pkg,'node_modules/fixture-dep/index.js');rmSync(source);symlinkSync('/dev/null',source);assert.throws(()=>b.plan(),error('stable_source_unverified'));
 const c=fixture(t);writeFileSync(join(c.pkg,'dist/src/oversized.js'),Buffer.alloc(stableRuntimeLimits.fileBytes+1));assert.throws(()=>c.plan(),error('stable_source_unverified'));
});

test('legacy registrations are untouched while attempted stable descriptors and unsupported modes refuse',posix,t=>{
 const f=fixture(t),plan=f.plan();assert.equal(validateStableRegistration({command:process.execPath,args:['server.js']},{home:f.home}),null);
 assert.throws(()=>validateStableRegistration({...plan.descriptor,args:['operator-command']},{home:f.home}),error('stable_runtime_unverified'));
 materializeStableRuntime(plan);for(const transport of [{url:'https://example.invalid/mcp'},{type:'http'},{type:'sse'}])assert.throws(()=>validateStableRegistration({...plan.descriptor,...transport},{home:f.home}),error('stable_runtime_unverified'));const bad=run(plan,'update');assert.equal(bad.status,1);assert.equal(bad.stdout,'');assert.equal(bad.stderr,'aptly: stable_runtime_unavailable\n');
});


test('startup rejects corrupted bootstrap before Node and keeps observer failures silent',posix,t=>{
 const f=fixture(t),plan=f.plan();materializeStableRuntime(plan);
 writeFileSync(join(plan.runtimeRoot,'bootstrap.cjs'),'process.stdout.write("must not execute")');
 const serve=run(plan);assert.equal(serve.status,1);assert.equal(serve.stdout,'');assert.equal(serve.stderr,'aptly: stable_runtime_unavailable\n');
 const observe=run(plan,'observe');assert.equal(observe.status,0);assert.equal(observe.stdout,'');assert.equal(observe.stderr,'');
});

test('Windows opt-in is unsupported while ordinary legacy recognition stays untouched',t=>{
 const descriptor=Object.getOwnPropertyDescriptor(process,'platform');
 Object.defineProperty(process,'platform',{value:'win32'});
 try{assert.equal(validateStableRegistration({command:'legacy',args:[]}),null);assert.throws(()=>planStableRuntime({packageRoot:'/fixture'}),error('stable_launcher_platform_unsupported'));}
 finally{Object.defineProperty(process,'platform',descriptor);}
});


test('planning rejects writable home ancestry before creating runtime or host state',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);chmodSync(f.home,0o770);
 assert.throws(()=>f.plan(),error('stable_runtime_unverified'));
 assert.equal(existsSync(join(f.home,'.local')),false);
});


test('native addon artifacts explicitly refuse Node-version-independent source snapshots',{skip:process.platform==='win32'},t=>{
 for(const artifact of ['dist/src/addon.node','binding.gyp','node_modules/fixture-dep/prebuilds/linux-x64/addon.js']){
  const f=fixture(t);save(join(f.pkg,artifact),'native artifact sentinel');
  // Read-only planning against a synthetic, never-created home under the safe
  // root isolates source validation from this machine's writable fixture mount.
  const syntheticHome='/aptly-stable-readonly-fixture-never-created';
  assert.equal(existsSync(syntheticHome),false);
  unitSourceMetadata(f.pkg,()=>assert.throws(()=>planStableRuntime({packageRoot:f.pkg,home:syntheticHome,nodePath:f.node}),error('stable_source_unverified')));
  assert.equal(existsSync(syntheticHome),false);
 }
});

test('version probes cannot consume the MCP stdin stream',posix,t=>{
 const f=fixture(t),probeLog=join(f.home,'probe-input');
 const q=value=>"'"+value.replaceAll("'","'\\''")+"'";
 writeFileSync(f.node,`#!/bin/sh\nif [ "$1" = -e ]; then /bin/cat > ${q(probeLog)}; fi\nexec ${q(process.execPath)} "$@"\n`);
 writeFileSync(join(f.pkg,'dist/src/server.js'),"import {readFileSync} from 'node:fs';export async function serve(){process.stdout.write(JSON.stringify({stdin:readFileSync(0,'utf8')}));}\n");
 const plan=f.plan();materializeStableRuntime(plan);
 const result=spawnSync(plan.command,['serve'],{env:{PATH:''},input:'fixture stdin sentinel',encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(probeLog,'utf8'),'');assert.deepEqual(JSON.parse(result.stdout),{stdin:'fixture stdin sentinel'});
});
test('locally hoisted dependencies are explicitly refused instead of silently omitted',{skip:process.platform==='win32'},t=>{
 const f=fixture(t),syntheticHome='/aptly-stable-readonly-fixture-never-created';assert.equal(existsSync(syntheticHome),false);
 unitSourceMetadata(f.pkg,()=>assert.ok(planStableRuntime({packageRoot:f.pkg,home:syntheticHome,nodePath:f.node})));
 const dependency=join(f.pkg,'node_modules/fixture-dep'),hoisted=join(dirname(f.pkg),'fixture-dep');mkdirSync(hoisted,{mode:0o700});
 writeFileSync(join(hoisted,'package.json'),readFileSync(join(dependency,'package.json')));writeFileSync(join(hoisted,'index.js'),readFileSync(join(dependency,'index.js')));rmSync(dependency,{recursive:true});
 unitSourceMetadata(f.pkg,()=>assert.throws(()=>planStableRuntime({packageRoot:f.pkg,home:syntheticHome,nodePath:f.node}),error('stable_source_unverified')));assert.equal(existsSync(syntheticHome),false);
});


test('shape-only reference ignores unrelated custom paths and never reads old generations',()=>{
 const home='/aptly-shape-only-fixture',base=join(home,'.local/share/aptly/runtimes'),generation='a'.repeat(64);
 assert.equal(stableReference({command:'/custom/aptly/runtimes/launcher',args:['--custom']},{home}),null);
 const reference=stableReference({command:join(base,generation,'launch'),args:['serve']},{home});assert.equal(reference.generation,generation);assert.equal(existsSync(home),false);
 assert.throws(()=>stableReference({command:join(base,generation,'launch'),args:['update']},{home}),error('stable_runtime_unverified'));
});

test('read-only source planning rejects writable source directories',{skip:process.platform==='win32'},t=>{
 const f=fixture(t),home='/aptly-readonly-plan-fixture';
 unitSourceMetadata(f.pkg,()=>{const plan=planStableRuntime({packageRoot:f.pkg,home,nodePath:f.node});assert.equal(plan.manifest.home,home);assert.equal(existsSync(home),false);});
 chmodSync(join(f.pkg,'dist'),0o770);
 unitSourceMetadata(f.pkg,()=>assert.throws(()=>planStableRuntime({packageRoot:f.pkg,home,nodePath:f.node}),error('stable_source_unverified')));
});

test('Darwin allowed home alias canonicalizes without creating missing suffixes',{skip:process.platform!=='darwin'},t=>{
 const f=fixture(t),home='/var/aptly-alias-readonly-fixture-never-created';
 unitSourceMetadata(f.pkg,()=>{const p=planStableRuntime({packageRoot:f.pkg,home,nodePath:f.node});assert.equal(p.manifest.home,'/private/var/aptly-alias-readonly-fixture-never-created');assert.equal(existsSync(home),false);assert.equal(stableReference(p.descriptor,{home}).command,p.command);});
});

test('loader rejects an absent optional dependency later installed outside the immutable payload',posix,t=>{
 const f=fixture(t);const metadata=JSON.parse(readFileSync(join(f.pkg,'package.json'),'utf8'));metadata.optionalDependencies={'outside-optional':'1.0.0'};writeFileSync(join(f.pkg,'package.json'),JSON.stringify(metadata));
 writeFileSync(join(f.pkg,'dist/src/server.js'),"export async function serve(){await import('outside-optional');process.stdout.write('must not load outside payload');}\n");
 const plan=f.plan();materializeStableRuntime(plan);
 save(join(plan.runtimeRoot,'node_modules/outside-optional/package.json'),JSON.stringify({name:'outside-optional',version:'1.0.0',type:'module',exports:'./index.js'}));save(join(plan.runtimeRoot,'node_modules/outside-optional/index.js'),"process.stdout.write('must not execute outside payload');\n",0o600);
 const result=run(plan);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'aptly: stable_runtime_unavailable\n');
});

test('valid generation is reused despite a retained lock without deleting it',posix,t=>{
 const f=fixture(t),p=f.plan();materializeStableRuntime(p);const lock=join(dirname(p.runtimeRoot),'.'+p.generation+'.lock');writeFileSync(lock,'retained fixture lock',{mode:0o600});materializeStableRuntime(p);assert.equal(readFileSync(lock,'utf8'),'retained fixture lock');
});


test('protected app parent0755 is preserved while runtime directories remain private',posix,t=>{
 const f=fixture(t),app=join(f.home,'.local/share/aptly');mkdirSync(app,{recursive:true,mode:0o755});chmodSync(app,0o755);
 const p=f.plan();materializeStableRuntime(p);assert.equal(lstatSync(app).mode&0o777,0o755);assert.equal(lstatSync(dirname(p.runtimeRoot)).mode&0o777,0o700);assert.ok(validateStableRegistration(p.descriptor,{home:f.home}));
});

test('generated shell and bootstrap parse in a metadata-adapter unit fixture without executing payload',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);let plan;
 unitSourceMetadata(f.pkg,()=>{plan=f.plan();materializeStableRuntime(plan);});
 const shell=spawnSync('/bin/sh',['-n',plan.command],{encoding:'utf8',timeout:5000});assert.equal(shell.status,0,shell.stderr);
 const node=spawnSync(process.execPath,['--check',join(plan.runtimeRoot,'bootstrap.cjs')],{encoding:'utf8',timeout:5000,env:{PATH:dirname(process.execPath)}});assert.equal(node.status,0,node.stderr);
 // This fixture deliberately simulates permission metadata. It is not a live
 // launcher success test; ordinary validation still refuses the real mount.
 if(unsafeTestAncestry())assert.throws(()=>validateStableRegistration(plan.descriptor,{home:f.home}),error('stable_runtime_unverified'));
});


test('observer supervision preserves event stdin and suppresses successful payload noise',posix,t=>{
 const f=fixture(t),record=join(f.home,'observer-event');
 writeFileSync(join(f.pkg,'dist/bin/aptly-observe.js'),"import {readFileSync,writeFileSync} from 'node:fs';writeFileSync("+JSON.stringify(record)+",readFileSync(0));process.stdout.write('suppressed');process.stderr.write('suppressed');\n");
 const p=f.plan();materializeStableRuntime(p);installSafeAlternative(p);const r=spawnSync(p.command,['observe'],{env:{PATH:dirname(process.execPath)},input:'fixture observer event',encoding:'utf8',timeout:5000});
 assert.equal(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');assert.equal(readFileSync(record,'utf8'),'fixture observer event');
});

test('observer stays silent zero when selected runtime disappears after its successful probe',posix,t=>{
 const f=fixture(t);writeFileSync(f.node,'#!/bin/sh\nif [ "$1" = -e ]; then /bin/rm "$0"; exit 0; fi\nexit 91\n');
 const p=f.plan();materializeStableRuntime(p);installSafeAlternative(p);const r=spawnSync(p.command,['observe'],{env:{PATH:''},input:'fixture event',encoding:'utf8',timeout:5000});
 assert.equal(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');assert.equal(existsSync(f.node),false);
});

test('loader guards createRequire as well as ESM imports against unlisted ancestor packages',posix,t=>{
 const f=fixture(t);const metadata=JSON.parse(readFileSync(join(f.pkg,'package.json'),'utf8'));metadata.optionalDependencies={'outside-cjs-optional':'1.0.0'};writeFileSync(join(f.pkg,'package.json'),JSON.stringify(metadata));
 writeFileSync(join(f.pkg,'dist/src/server.js'),"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);export async function serve(){require('outside-cjs-optional');process.stdout.write('must not execute');}\n");
 const p=f.plan();materializeStableRuntime(p);save(join(p.runtimeRoot,'node_modules/outside-cjs-optional/package.json'),JSON.stringify({name:'outside-cjs-optional',version:'1.0.0',main:'index.cjs'}));save(join(p.runtimeRoot,'node_modules/outside-cjs-optional/index.cjs'),"process.stdout.write('outside executed');module.exports={};\n",0o600);
 const result=run(p);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'aptly: stable_runtime_unavailable\n');
});
test('production candidate loop orders numeric nvm releases and filters PATH without executing runtimes',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);let p;unitSourceMetadata(f.pkg,()=>{p=f.plan();materializeStableRuntime(p);});
 for(const v of ['v24.2.0','v24.10.0','v26.1.0','v26.2.0-rc.1','v23.99.0'])save(join(f.home,'.nvm/versions/node',v,'bin/node'),'fixture candidate');
 const source=readFileSync(p.command,'utf8'),begin=source.indexOf('# APTLY_CANDIDATES_BEGIN'),end=source.indexOf('# APTLY_CANDIDATES_END');assert.ok(begin>=0&&end>begin);
 const script="try_node() { [ \"$2\" = serve ] || exit 9; printf '%s\\n' \"$1\"; return 1; }\n"+source.slice(begin,end)+'\nexit 0\n';
 const r=spawnSync('/bin/sh',['-c',script,'fixture','serve'],{env:{PATH:'/first/bin::relative:.:/path with spaces/bin'},encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');
 assert.deepEqual(r.stdout.trim().split('\n'),[f.node,'/opt/homebrew/bin/node','/usr/local/bin/node','/usr/bin/node',...['v26.1.0','v24.10.0','v24.2.0'].map(v=>join(f.home,'.nvm/versions/node',v,'bin/node')),'/first/bin/node','/path with spaces/bin/node']);
});
