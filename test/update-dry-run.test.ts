import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {updateGlobalInstallation} from '../src/update.ts';
import {createTestTemp} from '../test-support/temp.ts';

function fixture(t){
 const home=createTestTemp(t,'codex-update-dry-run-');
 const node=join(home,'synthetic-runtime',process.platform==='win32'?'node.exe':'bin/node');
 const siblingNpm=process.platform==='win32'?join(dirname(node),'node_modules/npm/bin/npm-cli.js'):resolve(dirname(node),'../lib/node_modules/npm/bin/npm-cli.js');
 const actualNpm=process.platform==='win32'?join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'):resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
 const prefix=join(home,'global-prefix'),root=process.platform==='win32'?join(prefix,'node_modules'):join(prefix,'lib/node_modules'),target=join(root,'aptly');
 const write=(path,text)=>{mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,text,{mode:0o600});};
 write(siblingNpm,'synthetic npm; never executed');write(join(dirname(dirname(siblingNpm)),'package.json'),JSON.stringify({name:'npm'}));
 const packagePath=join(target,'package.json'),originalPackage=JSON.stringify({name:'aptly',version:'0.1.2',bin:{aptly:'dist/bin/aptly.js'}});
 write(packagePath,originalPackage);write(join(target,'dist/bin/aptly.js'),'synthetic compiled CLI; never executed');
 const settings=join(home,'settings.json');write(settings,'unchanged host settings');
 const userconfig=join(home,'user.npmrc'),globalconfig=join(home,'global.npmrc');write(userconfig,'');write(globalconfig,'');
 const env={PATH:process.env.PATH,HOME:home,USERPROFILE:home,TMPDIR:home,TMP:home,TEMP:home,
  ...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),
  npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig,npm_config_cache:join(home,'npm-cache'),npm_config_update_notifier:'false'};
 let installs=0,configReads=0;let configResponse:undefined|string|Error;
 const run=(executable,args,timeout)=>{
  assert.equal(executable,node);assert.equal(args[0],siblingNpm);
  if(args[1]==='--version')return '11.19.1\n';
  if(args[1]==='prefix')return prefix+'\n';
  if(args[1]==='root')return root+'\n';
  if(args[1]==='config'){
   configReads++;assert.deepEqual(args.slice(1),['config','get','dry-run','--global','--prefix',prefix]);
   if(configResponse instanceof Error)throw configResponse;
   if(configResponse!==undefined)return configResponse;
   // The only real npm invocation is read-only config resolution, with an isolated home/config/cache.
   return execFileSync(process.execPath,[actualNpm,...args.slice(1)],{cwd:home,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout,maxBuffer:65536,windowsHide:true});
  }
  // An installation is always a fake. Never delegate this branch to npm.
  assert.deepEqual(args.slice(1),['install','-g','aptly@latest','--ignore-scripts','--prefix',prefix]);installs++;
  write(packagePath,JSON.stringify({name:'aptly',version:'0.1.3',bin:{aptly:'dist/bin/aptly.js'}}));return '';
 };
 return{home,target,env,userconfig,globalconfig,write,run,node,settings,packagePath,originalPackage,
  installs:()=>installs,configReads:()=>configReads,setConfigResponse:value=>{configResponse=value;},
  update:()=>updateGlobalInstallation({packageRoot:target},{nodePath:node,run}),
  unchanged:()=>{assert.equal(readFileSync(packagePath,'utf8'),originalPackage);assert.equal(readFileSync(settings,'utf8'),'unchanged host settings');}};
}

for(const source of ['environment','user config','global config'])test(`effective npm dry-run from ${source} refuses installation without claiming package_updated`,t=>{
 const f=fixture(t);
 if(source==='environment')f.env.npm_config_dry_run='true';
 else f.write(source==='user config'?f.userconfig:f.globalconfig,'dry-run=true\n');
 assert.deepEqual(f.update(),{status:'error',codes:['update_dry_run_enabled']});
 assert.equal(f.configReads(),1);assert.equal(f.installs(),0);f.unchanged();
});

test('effective false from the real npm parser permits only the mocked installation',t=>{
 const f=fixture(t);f.write(f.userconfig,'dry-run=true\n');f.env.npm_config_dry_run='false';
 const result=f.update();assert.equal(result.status,'complete');assert.equal(result.version,'0.1.3');assert.ok(result.codes.includes('package_updated'));
 assert.equal(f.configReads(),1);assert.equal(f.installs(),1);assert.equal(readFileSync(f.settings,'utf8'),'unchanged host settings');
});

test('unreadable or malformed dry-run configuration cannot proceed or expose raw errors',t=>{
 const f=fixture(t);
 for(const response of ['', 'null\n', 'false\nprivate extra output', 'TRUE\n', new Error('synthetic private configuration error')]){
  f.setConfigResponse(response);const result=f.update();assert.deepEqual(result,{status:'error',codes:['update_configuration_unverified']});
  assert.doesNotMatch(JSON.stringify(result),/private|synthetic/);assert.equal(f.installs(),0);f.unchanged();
 }
});
