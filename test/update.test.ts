import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,symlinkSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {updateGlobalInstallation} from '../src/update.ts';
import {createTestTemp} from '../test-support/temp.ts';

function fixture(t){
 const home=createTestTemp(t,'codex-global-update-');
 const node=join(home,'node-runtime',process.platform==='win32'?'node.exe':'bin/node');
 const npm=process.platform==='win32'?join(dirname(node),'node_modules/npm/bin/npm-cli.js'):resolve(dirname(node),'../lib/node_modules/npm/bin/npm-cli.js');
 const prefix=join(home,'custom-prefix'),root=process.platform==='win32'?join(prefix,'node_modules'):join(prefix,'lib/node_modules'),target=join(root,'aptly');
 const write=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,value);};
 write(node,'synthetic executable, never run');write(npm,'synthetic npm, never run');write(join(dirname(dirname(npm)),'package.json'),JSON.stringify({name:'npm'}));
 const packageData={name:'aptly',version:'0.1.2',bin:{aptly:'dist/bin/aptly.js'}};
 write(join(target,'package.json'),JSON.stringify(packageData));write(join(target,'dist/bin/aptly.js'),'synthetic CLI, never run');
 const calls=[];const config={version:'11.19.1',root,prefix,installError:false};
 const run=(exe,args,timeout)=>{
  calls.push({exe,args:[...args],timeout});assert.equal(exe,node);assert.equal(args[0],npm);
  if(args[1]==='--version')return config.version+'\n';
  if(args[1]==='prefix')return config.prefix+'\n';
  if(args[1]==='root')return config.root+'\n';
  if(args[1]==='config'){assert.deepEqual(args.slice(1),['config','get','dry-run','--global','--prefix',prefix]);return 'false\n';}
  assert.equal(args[1],'install');if(config.installError)throw Error('private synthetic error with credential-like data');
  write(join(target,'package.json'),JSON.stringify({...packageData,version:'0.1.3'}));return 'ignored npm output';
 };
 return{home,node,npm,prefix,root,target,write,config,calls,run,update:(packageRoot=target)=>updateGlobalInstallation({packageRoot},{nodePath:node,run})};
}
test('global updater pins latest Aptly to verified custom prefix through sibling npm without shell or lifecycle',t=>{
 const f=fixture(t),settings=join(f.home,'settings.json');f.write(settings,'preserved configuration');
 const r=f.update();assert.deepEqual(r,{status:'complete',codes:['package_updated','host_configuration_preserved','setup_required','mcp_restart_required'],version:'0.1.3'});
 assert.equal(readFileSync(settings,'utf8'),'preserved configuration');
 assert.deepEqual(f.calls.map(c=>c.args.slice(1)),[['--version'],['prefix','--global'],['root','--global'],['config','get','dry-run','--global','--prefix',f.prefix],['install','-g','aptly@latest','--ignore-scripts','--prefix',f.prefix]]);
 assert.ok(f.calls.every(c=>c.exe===f.node&&c.timeout>0&&c.timeout<=120000));assert.ok(f.calls.every(c=>!c.args.includes('setup')));
});
test('source and local package roots are rejected without an install',t=>{
 const f=fixture(t);for(const root of [resolve('.'),join(f.home,'local-source')]){
  const r=f.update(root);assert.equal(r.status,'error');assert.deepEqual(r.codes,['update_global_install_unverified']);
 }
 assert.equal(f.calls.some(c=>c.args[1]==='install'),false);
});
test('global linked source and ambiguous prefix/root mappings are rejected',t=>{
 const f=fixture(t);f.config.root=f.home;assert.equal(f.update().status,'error');f.config.root=f.root;
 const linked=join(f.home,'linked-source');rmSync(f.target,{recursive:true});mkdirSync(linked);symlinkSync(linked,f.target,process.platform==='win32'?'junction':'dir');
 assert.equal(f.update(linked).status,'error');assert.equal(f.calls.some(c=>c.args[1]==='install'),false);
});
test('malformed npm versions require manual fallback and never install',t=>{
 const f=fixture(t);for(const version of ['not npm','11.19.1\nextra','999999999999999999999.1.1']){
  f.config.version=version;assert.deepEqual(f.update(),{status:'error',codes:['update_npm_unsupported']});
 }
 assert.equal(f.calls.some(c=>c.args[1]==='install'),false);
 for(const version of ['10.9.0','11.18.9','11.19.1','12.0.0']){f.config.version=version;assert.equal(f.update().status,'complete');}
});
test('missing sibling npm and mismatched package metadata cannot use PATH as a fallback',t=>{
 const f=fixture(t);rmSync(f.npm);assert.equal(f.update().status,'error');assert.equal(f.calls.length,0);
 f.write(f.npm,'synthetic');f.write(join(f.target,'package.json'),JSON.stringify({name:'different',version:'1.0.0',bin:{aptly:'dist/bin/aptly.js'}}));
 assert.equal(f.update().status,'error');assert.equal(f.calls.some(c=>c.args[1]==='install'),false);
});
test('npm failure is sanitized and does not claim successful update or rollback',t=>{
 const f=fixture(t);f.config.installError=true;const r=f.update();assert.deepEqual(r,{status:'error',codes:['update_install_failed']});
 assert.doesNotMatch(JSON.stringify(r),/private|credential|synthetic|prefix|runtime/);assert.equal(JSON.parse(readFileSync(join(f.target,'package.json'),'utf8')).version,'0.1.2');
});
test('malformed root output and missing compiled CLI refuse update before npm installation',t=>{
 const f=fixture(t);f.config.root=f.root+'\nprivate';assert.equal(f.update().status,'error');f.config.root=f.root;
 rmSync(join(f.target,'dist/bin/aptly.js'));assert.equal(f.update().status,'error');assert.equal(f.calls.some(c=>c.args[1]==='install'),false);
});
test('unexpected installation result never reports verified success',t=>{
 const f=fixture(t);const run=(exe,args,timeout)=>{const out=f.run(exe,args,timeout);if(args[1]==='install')rmSync(join(f.target,'dist/bin/aptly.js'));return out;};
 const r=updateGlobalInstallation({packageRoot:f.target},{nodePath:f.node,run});assert.deepEqual(r,{status:'error',codes:['update_result_unverified']});
});

test('CLI update help and invalid arguments cannot start an installation',async t=>{
 const {spawnSync}=await import('node:child_process');const home=createTestTemp(t,'codex-update-cli-');
 const run=args=>spawnSync(process.execPath,[resolve('bin/aptly.ts'),'update',...args],{env:{PATH:process.env.PATH,HOME:home,USERPROFILE:home,CI:'true'},encoding:'utf8',timeout:15000});
 const help=run(['--help']);assert.equal(help.status,0);assert.match(help.stdout,/Stop other hosts/);
 const invalid=run(['--prefix','other']);assert.equal(invalid.status,1);assert.match(invalid.stderr,/update_invalid_options/);
});
