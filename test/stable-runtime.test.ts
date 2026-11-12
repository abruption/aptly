import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTestTemp, temporaryRoot } from '../test-support/temp.ts';
import { materializeStableRuntime, planStableRuntime, stableObserverCommand, stableRuntimeLimits, validateStableRegistration } from '../src/stable-runtime.ts';
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
const error=code=>e=>e instanceof Error&&e.message===code;
function run(plan,mode='serve',extra={}){return spawnSync(plan.command,[mode],{env:{PATH:dirname(process.execPath),...extra},encoding:'utf8',timeout:5000});}

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
  assert.throws(()=>planStableRuntime({packageRoot:f.pkg,home:syntheticHome,nodePath:f.node}),error('stable_source_unverified'));
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
 assert.ok(planStableRuntime({packageRoot:f.pkg,home:syntheticHome,nodePath:f.node}));
 const dependency=join(f.pkg,'node_modules/fixture-dep'),hoisted=join(dirname(f.pkg),'fixture-dep');mkdirSync(hoisted,{mode:0o700});
 writeFileSync(join(hoisted,'package.json'),readFileSync(join(dependency,'package.json')));writeFileSync(join(hoisted,'index.js'),readFileSync(join(dependency,'index.js')));rmSync(dependency,{recursive:true});
 assert.throws(()=>planStableRuntime({packageRoot:f.pkg,home:syntheticHome,nodePath:f.node}),error('stable_source_unverified'));assert.equal(existsSync(syntheticHome),false);
});
