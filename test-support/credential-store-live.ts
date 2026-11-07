import { windowsPowerShellPath } from '../src/windows-powershell.ts';
// Explicit CI-only native check. Uses a unique synthetic item and always deletes it.
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {storeSecret,loadSecret,deleteSecret} from '../src/secret-store.ts';
import {readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {release} from 'node:os';
import {parse} from 'smol-toml';
import {createTestTemp} from './temp.ts';
import {setDefaults,setEnvironment,removeSetup,migrateLauncher} from '../src/setup.ts';
import {setApiKey,prepareApiKey} from '../src/credential-setup.ts';
import {runtime} from '../src/runtime.ts';
import {protectNewWindowsPrivateDirectory} from '../src/windows-private.ts';
if(process.env.CI!=='true'||process.env.APTLY_TEST_CREDENTIAL_STORE!=='1'||process.platform!=='win32')throw new Error('native_credential_probe_not_enabled');
const options={service:'dev.aptly.ci.'+randomUUID(),account:'synthetic'};
const value='synthetic-not-an-api-key-'+randomUUID();
let cleanup=false;
let cleanupDirectory=()=>{};
const root=createTestTemp({after:fn=>{cleanupDirectory=fn;}},'codex-windows-secret-');
const home=join(root,'한글 home');mkdirSync(home);
const backend={
 loadSecret:({account})=>loadSecret({...options,account}),
 storeSecret:(value,{account})=>storeSecret(value,{...options,account}),
 deleteSecret:({account})=>deleteSecret({...options,account})
};
function fileAcl(path:string,restrict=false):string{
 const script=String.raw`$ErrorActionPreference='Stop'
 [Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
 $r=[Console]::In.ReadToEnd()|ConvertFrom-Json
 if($r.restrict){
  $acl=[Security.AccessControl.FileSecurity]::new()
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))
  [IO.File]::SetAccessControl([string]$r.path,$acl)
 }
 [Console]::Out.Write([IO.File]::GetAccessControl([string]$r.path).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access))`;
 return execFileSync(windowsPowerShellPath(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify({path,restrict}),encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']});
}
try{
 console.log(JSON.stringify({phase:'runtime',node:process.version,platform:process.platform,arch:process.arch,os_release:release()}));
 // Exercise two fresh directories sequentially: first without explicit warm-up,
 // then a warm invocation. Never retry an ACL mutation after failure.
 for (const phase of ['cold_preflight','warm_preflight']) {
  const aclProbe=join(home,phase);mkdirSync(aclProbe);
  const started=Date.now();
  try {
   protectNewWindowsPrivateDirectory(aclProbe);
   console.log(JSON.stringify({phase,elapsed_ms:Date.now()-started,result:'pass'}));
  } catch (error) {
   const failure=error as Error & {category?: string; elapsed_ms?: number};
   console.error(JSON.stringify({phase,elapsed_ms:failure.elapsed_ms ?? Date.now()-started,category:failure.category ?? 'unknown',result:'fail'}));
   throw new Error('native_windows_acl_preflight_failed');
  }
 }
 storeSecret(value,options);
 if(loadSecret(options)!==value)throw Error('native_credential_roundtrip_failed');
 storeSecret(value+'-updated',options);
 if(loadSecret(options)!==value+'-updated')throw Error('native_credential_update_failed');
 deleteSecret(options);
 if(loadSecret(options)!==null)throw Error('native_credential_delete_failed');
 const defaults=setDefaults({home,env:{},packageRoot:join(home,'retired-install')});
 if(defaults.status!=='complete'){console.log(JSON.stringify(defaults));throw Error('native_windows_defaults_failed');}
 const configPath=join(home,'.codex','config.toml');
 const originalAcl=fileAcl(configPath,true);
 if(setEnvironment('ROUTER_PROVIDER','decisions',{home,env:{},clients:['codex']}).status!=='complete')throw Error('native_windows_environment_failed');
 if(fileAcl(configPath)!==originalAcl)throw Error('native_windows_file_acl_changed');
 const preflight=prepareApiKey({home,env:{}});
 if(preflight.result.status!=='partial'||!preflight.result.clients.every(c=>c.codes.includes('launcher_migration_available')))throw Error('native_windows_preflight_failed');
 for(const client of ['codex','claude'] as const){
  if(migrateLauncher({home,env:{},clients:[client]},true).status!=='complete')throw Error('native_windows_migration_preview_failed');
  if(migrateLauncher({home,env:{},clients:[client]}).status!=='complete')throw Error('native_windows_migration_failed');
 }
 if(fileAcl(configPath)!==originalAcl)throw Error('native_windows_migration_acl_changed');
 const syntheticKey='sk-synthetic-'+randomUUID();
 const configuredKey=setApiKey(syntheticKey,{home,env:{}},backend);
 if(configuredKey.status!=='complete'){console.log(JSON.stringify(configuredKey));throw Error('native_windows_key_setup_failed');}
 const config=parse(readFileSync(join(home,'.codex','config.toml'),'utf8')) as any;
 const env=config.mcp_servers.aptly.env;
 if(JSON.stringify(config).includes(syntheticKey))throw Error('native_windows_plaintext_key');
 if(runtime(env,{secretLoader:backend.loadSecret}).credentialStatus!=='os_store')throw Error('native_windows_runtime_reference_failed');
 if(removeSetup({home,env:{}}).status!=='complete')throw Error('native_windows_remove_failed');
}finally{
 try{deleteSecret(options);for(const account of ['codex:OPENAI_API_KEY','claude:OPENAI_API_KEY'])deleteSecret({...options,account});cleanup=true;}
 finally{cleanupDirectory();}
}
console.log(JSON.stringify({native_windows_credential_store:true,roundtrip:true,update:true,delete:true,isolated_host_defaults:true,launcher_preflight:true,explicit_launcher_migration:true,environment:true,os_reference_runtime:true,remove:true,synthetic_item_only:true,cleanup}));
