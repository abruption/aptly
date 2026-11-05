import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWindowsPrivatePath, protectNewWindowsPrivateDirectory, copyWindowsFilePermissions } from '../src/windows-private.ts';

test('Windows ACL inspection uses a fixed system script and stdin-only literal path', () => {
 const path = 'C:\\fixture\\private \' $(); ü', calls = [];
 assertWindowsPrivatePath(path,{ execute(executable,args,input) {
  calls.push({executable,args,input}); return 'private';
 }});
 assert.equal(calls.length,1);
 const call = calls[0], script = Buffer.from(call.args.at(-1),'base64').toString('utf16le');
 assert.match(call.executable,/System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
 assert.equal(call.args.includes(path),false);
 assert.deepEqual(JSON.parse(call.input),{path,action:'assert-private'});
 assert.equal(script.includes(path),false);
 assert.match(script,/Get-Acl -LiteralPath \$path/);
 assert.match(script,/GetAccessRules\(\$true, \$true, \$sidType\)/);
 assert.match(script,/GetOwner\(\$sidType\)/);
 assert.match(script,/WindowsIdentity\]::GetCurrent\(\)\.User/);
 assert.match(script,/'S-1-5-18', 'S-1-5-32-544'/);
 assert.match(script,/\$null -eq \$descriptor.DiscretionaryAcl/);
 assert.match(script,/AccessControlType\]::Allow -and \$allowed -notcontains \$rule.IdentityReference.Value/);
 assert.match(script,/ReparsePoint/);
});

test('insecure ACL, malformed output and failed PowerShell expose only a fixed error', () => {
 for (const execute of [() => 'rejected', () => '{"owner":"private-owner","path":"private-path"}', () => { throw new Error('raw-private-path-and-owner'); }]) {
  assert.throws(() => assertWindowsPrivatePath('C:\\fixture',{execute}), error => error.message === 'windows_private_permissions');
 }
 assert.throws(() => assertWindowsPrivatePath('',{execute:() => assert.fail('must not execute')}), /windows_private_permissions/);
});

test('new private directory protection removes inherited rules and grants only trusted SIDs', () => {
 let protectScript, request;
 protectNewWindowsPrivateDirectory('C:\\new-directory',{execute(_exe,args,input) {
  protectScript = Buffer.from(args.at(-1),'base64').toString('utf16le'); request=JSON.parse(input); return 'private';
 }});
 assert.equal(request.action,'protect-new-directory');
 assert.match(protectScript,/if \(\$request.action -eq 'protect-new-directory'\)/);
 assert.match(protectScript,/DirectorySecurity\]::new\(\)/);
 assert.match(protectScript,/SetOwner\(\$current\)/);
 assert.match(protectScript,/SetAccessRuleProtection\(\$true, \$false\)/);
 assert.match(protectScript,/foreach \(\$sid in \$allowed\)/);
 assert.match(protectScript,/ContainerInherit/);
 assert.match(protectScript,/ObjectInherit/);
 assert.match(protectScript,/Set-Acl -LiteralPath \$path -AclObject \$acl/);
 assert.ok(protectScript.indexOf('Set-Acl') < protectScript.indexOf('Get-Acl'));
 assert.throws(() => protectNewWindowsPrivateDirectory('C:\\new-directory',{execute:() => 'rejected'}), /windows_private_permissions/);
});

test('private file and state reads require Windows ACL authorization instead of POSIX mode bits', async t => {
 const childProcess=(await import('node:child_process')).default;
 const {syncBuiltinESMExports}=await import('node:module');
 const {writeFileSync,chmodSync}=await import('node:fs');
 const {join}=await import('node:path');
 const {createTestTemp}=await import('../test-support/temp.ts');
 const {assertPrivateStatePath,readRegularFile}=await import('../src/files.ts');
 const directory=createTestTemp(t,'codex-windows-private-test-'), path=join(directory,'metadata.json');
 writeFileSync(path,'{}',{mode:0o644}); chmodSync(directory,0o755);
 const originalExec=childProcess.execFileSync, platform=Object.getOwnPropertyDescriptor(process,'platform');
 let reject=false; const calls=[];
 childProcess.execFileSync=(_exe,_args,options) => {calls.push(JSON.parse(options.input)); return reject?'rejected':'private';};
 Object.defineProperty(process,'platform',{value:'win32'});syncBuiltinESMExports();
 try {
  assertPrivateStatePath(path);
  assert.equal(readRegularFile(path,{privateFile:true}).toString(),'{}');
  assert.ok(calls.some(call=>call.path===directory)); assert.ok(calls.some(call=>call.path===path));
  reject=true;
  assert.throws(()=>assertPrivateStatePath(path),/windows_private_permissions/);
  assert.throws(()=>readRegularFile(path,{privateFile:true}),/windows_private_permissions/);
  assert.equal(readRegularFile(path).toString(),'{}','non-private public files retain normal read behavior');
 } finally {childProcess.execFileSync=originalExec;Object.defineProperty(process,'platform',platform);syncBuiltinESMExports();}
});


test('existing Windows file DACL is copied to stage with its protected inheritance and verified', () => {
 const source='C:\\fixture\\config.toml', target='C:\\fixture\\.aptly-stage-fixture';
 let request,script;
 copyWindowsFilePermissions(source,target,{execute(_exe,args,input){request=JSON.parse(input);script=Buffer.from(args.at(-1),'base64').toString('utf16le');return 'private';}});
 assert.deepEqual(request,{source,target});
 assert.equal(script.includes(source),false);
 assert.match(script,/AccessControlSections\]::Access/);
 assert.match(script,/\[IO.File\]::GetAccessControl\(\$source, \$sections\)/);
 assert.match(script,/\[IO.File\]::SetAccessControl\(\$target, \$acl\)/);
 assert.match(script,/GetSecurityDescriptorSddlForm\(\$sections\)/);
 assert.match(script,/\$expected -cne \$actual/);
 assert.match(script,/GetDirectoryName/);
 for(const execute of [()=> 'rejected',()=>{throw new Error('raw-acl-private-source');}])
  assert.throws(()=>copyWindowsFilePermissions(source,target,{execute}),error=>error.message==='windows_private_permissions');
});
