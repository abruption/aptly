import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,chmodSync,symlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {updateNotification} from '../src/update-notifier.ts';
import {createTestTemp} from '../test-support/temp.ts';
import {protectNewWindowsPrivateDirectory} from '../src/windows-private.ts';
function fixture(t){
 const home=createTestTemp(t,'codex-update-notifier-'),cacheDir=join(home,'private');mkdirSync(cacheDir,{mode:0o700});if(process.platform==='win32')protectNewWindowsPrivateDirectory(cacheDir);
 const cachePath=join(cacheDir,'update-check.json');let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://registry.npmjs.org/aptly/latest');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{accept:'application/json'});assert.equal(options.body,undefined);return Response.json({name:'aptly',version:'0.2.0'});};
 const options={command:'--version',args:[],env:{},stderrIsTTY:true,stdinIsTTY:true,currentVersion:'0.1.2',cachePath,fetch:fetcher,now:100000000};
 return{home,cacheDir,cachePath,options,calls:()=>calls};
}
test('only explicit eligible interactive commands can request a bounded public update check',async t=>{
 const f=fixture(t);
 for(const changes of [
  ...['serve','','recommend','inspect','catalog','capabilities','update','unknown'].map(command=>({command})),
  {stdinIsTTY:false},{stderrIsTTY:false},{stdoutIsTTY:false},{env:{CI:'true'}},{env:{CI:'1'}},{env:{APTLY_NO_UPDATE_NOTIFIER:'1'}},
  {command:'setup',args:['--automatic']},{command:'set',args:['transmission','--show']},{currentVersion:'1.2.3-preview.1'}
 ])assert.equal(await updateNotification({...f.options,...changes}),null);
 assert.equal(f.calls(),0);assert.deepEqual(readdirSync(f.cacheDir),[]);
 for(const command of ['help','--help','-h','--version','config','setup','remove','set','report']){
  const hint=await updateNotification({...f.options,command});assert.match(hint,/Aptly 0\.2\.0 is available/);
 }
 assert.equal(f.calls(),1);
});
test('valid stable latest metadata is cached for 24 hours without copying registry fields or environment secrets',async t=>{
 const f=fixture(t),o={...f.options,env:{OPENAI_API_KEY:'synthetic-secret-do-not-use'},fetch:async()=>Response.json({name:'aptly',version:'0.2.0',description:'untrusted metadata'})};
 assert.match(await updateNotification(o),/aptly update/);
 const text=readFileSync(f.cachePath,'utf8');assert.doesNotMatch(text,/synthetic-secret|untrusted metadata|OPENAI/);
 assert.deepEqual(JSON.parse(text),{schema_version:1,checked_at:o.now,latest:'0.2.0',failed:false});
 const never=()=>assert.fail('fresh cache must not fetch');
 assert.match(await updateNotification({...o,now:o.now+24*3600000-1,fetch:never}),/0\.2\.0/);
 let calls=0;assert.equal(await updateNotification({...o,now:o.now+24*3600000,fetch:async()=>{calls++;return Response.json({name:'aptly',version:'0.1.2'});}}),null);assert.equal(calls,1);
});
test('versions use numeric stable semver ordering and never render unvalidated registry strings',async t=>{
 const f=fixture(t);
 for(const [candidate,expected] of [['0.1.2',false],['0.1.1',false],['0.0.99',false],['0.10.0',true],['1.0.0',true],['0.1.10',true]]){
  const cachePath=join(f.cacheDir,'version-'+candidate+'.json');
  const hint=await updateNotification({...f.options,cachePath,fetch:async()=>Response.json({name:'aptly',version:candidate})});assert.equal(!!hint,expected);
 }
 for(const [i,metadata] of [
  {name:'foreign',version:'9.0.0'},{name:'aptly',version:'9.0.0-beta.1'},{name:'aptly',version:'9.0.0+build'},
  {name:'aptly',version:'09.0.0'},{name:'aptly',version:'9007199254740992.0.0'},{name:'aptly',version:'9.0.0\nrun bad'},null,[],{name:'aptly'},
 ].entries()){
  const cachePath=join(f.cacheDir,'invalid-'+i+'.json');assert.equal(await updateNotification({...f.options,cachePath,fetch:async()=>Response.json(metadata)}),null);
  assert.equal(JSON.parse(readFileSync(cachePath,'utf8')).latest,null);
 }
});
test('failed checks enter a one-hour cooldown and cannot reuse stale success as a fresh hint',async t=>{
 const f=fixture(t);assert.ok(await updateNotification(f.options));let calls=0;
 const failed={...f.options,now:f.options.now+24*3600000,fetch:async()=>{calls++;throw Error('synthetic-private-error');}};
 assert.equal(await updateNotification(failed),null);assert.equal(calls,1);
 assert.deepEqual(JSON.parse(readFileSync(f.cachePath,'utf8')),{schema_version:1,checked_at:failed.now,latest:null,failed:true});
 assert.equal(await updateNotification({...failed,now:failed.now+3600000-1}),null);assert.equal(calls,1);
 assert.equal(await updateNotification({...failed,now:failed.now+3600000}),null);assert.equal(calls,2);
});
test('body limit is enforced while streaming and HTTP failures or invalid UTF-8 remain silent',async t=>{
 const f=fixture(t);let cancelled=false;
 const cases=[
  ()=>new Response('bad',{status:503}),()=>new Response('{}',{headers:{'content-length':'16385'}}),
  ()=>new Response('bad json'),()=>new Response(Uint8Array.from([0xff,0xfe])),
  ()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(16000));c.enqueue(new Uint8Array(500));},cancel(){cancelled=true;}})),
 ];
 for(const [i,response] of cases.entries())assert.equal(await updateNotification({...f.options,cachePath:join(f.cacheDir,'body-'+i+'.json'),fetch:async()=>response()}),null);
 assert.equal(cancelled,true);
});
test('800ms timeout bounds both a fetch that ignores abort and a stalled response body',async t=>{
 const f=fixture(t);
 for(const [i,fetch] of [()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}))].entries()){
  const start=Date.now();assert.equal(await updateNotification({...f.options,cachePath:join(f.cacheDir,'timeout-'+i+'.json'),fetch}),null);
  assert.ok(Date.now()-start<1500);assert.ok(Date.now()-start>=700);
 }
});
test('invalid, future-dated and oversized caches cannot inject text or suppress fresh metadata indefinitely',async t=>{
 const f=fixture(t);
 for(const content of ['not-json',JSON.stringify({schema_version:1,checked_at:f.options.now+1,latest:'999.0.0',failed:false}),JSON.stringify({schema_version:1,checked_at:f.options.now,latest:'9.0.0\nmalicious',failed:false})]){
  writeFileSync(f.cachePath,content,{mode:0o600});assert.match(await updateNotification(f.options),/0\.2\.0/);
 }
 const before=f.calls();writeFileSync(f.cachePath,'x'.repeat(1100));assert.equal(await updateNotification(f.options),null);assert.equal(f.calls(),before);
});
test('cache failures do not make commands fail, and unsafe symlink/private-directory paths are never followed',async t=>{
 const f=fixture(t);
 assert.equal(await updateNotification({...f.options,cachePath:'relative-cache.json'}),null);assert.equal(f.calls(),0);
 if(process.platform!=='win32'){
  chmodSync(f.cacheDir,0o755);assert.equal(await updateNotification(f.options),null);assert.equal(f.calls(),0);chmodSync(f.cacheDir,0o700);
  const target=join(f.home,'target');writeFileSync(target,'preserve',{mode:0o600});symlinkSync(target,f.cachePath);
  assert.equal(await updateNotification(f.options),null);assert.equal(readFileSync(target,'utf8'),'preserve');assert.equal(f.calls(),0);
 }
 assert.equal(existsSync(join(f.home,'ledger.json')),false);
});

test('CLI interactive hints use stderr only; JSON stdout, failures and noninteractive commands stay clean',async t=>{
 const {spawnSync}=await import('node:child_process');const {pathToFileURL}=await import('node:url');const {resolve}=await import('node:path');
 const home=createTestTemp(t,'codex-update-hint-cli-');
 const run=(args,tty,extra={})=>{
  const code=`for(const stream of [process.stdin,process.stdout,process.stderr])Object.defineProperty(stream,'isTTY',{value:${tty}});
  globalThis.fetch=async()=>Response.json({name:'aptly',version:'99.0.0'});
  process.argv=['node','aptly',...${JSON.stringify(args)}];await import(${JSON.stringify(pathToFileURL(resolve('bin/aptly.ts')).href)});`;
  return spawnSync(process.execPath,['--input-type=module','-e',code],{env:{PATH:process.env.PATH,HOME:home,USERPROFILE:home,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),...extra},encoding:'utf8',timeout:15000});
 };
 const human=run(['config','claude'],true);assert.equal(human.status,0,human.stderr);assert.ok(JSON.parse(human.stdout).mcpServers.aptly);assert.match(human.stderr,/Aptly 99\.0\.0 is available.*aptly update/);
 for(const [args,tty,env] of [[['--version'],false,{}],[['config','claude'],true,{CI:'true'}],[['--version'],true,{APTLY_NO_UPDATE_NOTIFIER:'1'}]]){
  const r=run(args,tty,env);assert.equal(r.status,0);assert.equal(r.stderr,'');
 }
 const invalid=run(['not-a-command'],true);assert.equal(invalid.status,2);assert.doesNotMatch(invalid.stderr,/available|99\.0\.0/);
});
