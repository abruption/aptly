import {execFileSync} from 'node:child_process';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';

export interface UpdateResult {status:'complete'|'error';codes:string[];version?:string}
export interface UpdateDependencies {
  nodePath?:string;
  run?:(executable:string,args:readonly string[],timeout:number)=>string;
}
const failed=(code:string):never=>{throw new Error(code);};
const runNpm=(executable:string,args:readonly string[],timeout:number)=>execFileSync(executable,[...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout,maxBuffer:1024*1024,windowsHide:true});
const metadata=(root:string)=>JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const canonical=(path:string)=>realpathSync(path);
function absoluteOutput(output:string):string {
  const path=output.trim();
  if(!path||!isAbsolute(path)||/[\r\n\0]/.test(path))failed('update_global_install_unverified');
  return resolve(path);
}
function verifyPackage(root:string) {
  const pkg=metadata(root);
  if(pkg.name!=='aptly'||typeof pkg.version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)||pkg.bin?.aptly!=='dist/bin/aptly.js')failed('update_global_install_unverified');
  const cli=join(root,'dist','bin','aptly.js');
  if(!lstatSync(cli).isFile()||canonical(cli)!==join(canonical(root),'dist','bin','aptly.js'))failed('update_global_install_unverified');
  return pkg.version as string;
}
/** Explicit global-only update. Never invokes a shell, PATH npm, setup, or an existing host launcher. */
export function updateGlobalInstallation(options:{packageRoot:string},dependencies:UpdateDependencies={}):UpdateResult {
  let stage='update_global_install_unverified';
  try {
    const node=dependencies.nodePath??process.execPath, run=dependencies.run??runNpm;
    if(!isAbsolute(node)||!isAbsolute(options.packageRoot))failed(stage);
    const nodeDirectory=dirname(node);
    const npm=process.platform==='win32'?join(nodeDirectory,'node_modules','npm','bin','npm-cli.js'):resolve(nodeDirectory,'..','lib','node_modules','npm','bin','npm-cli.js');
    if(!lstatSync(npm).isFile()||metadata(dirname(dirname(npm))).name!=='npm')failed(stage);
    const invoke=(args:readonly string[],timeout=15000)=>run(node,[npm,...args],timeout);
    const npmVersion=invoke(['--version']).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if(!npmVersion||!npmVersion.slice(1).every(part=>Number.isSafeInteger(Number(part))))failed('update_npm_unsupported');
    const prefix=absoluteOutput(invoke(['prefix','--global'])),root=absoluteOutput(invoke(['root','--global']));
    const expectedRoot=process.platform==='win32'?join(prefix,'node_modules'):join(prefix,'lib','node_modules');
    if(canonical(root)!==canonical(expectedRoot))failed(stage);
    const target=join(root,'aptly');
    if(lstatSync(target).isSymbolicLink()||!lstatSync(target).isDirectory()||canonical(target)!==canonical(options.packageRoot))failed(stage);
    verifyPackage(target);
    // Query the same effective global npm configuration used for installation.
    // A successful dry-run does not prove the on-disk package was updated.
    stage='update_configuration_unverified';
    const dryRun=invoke(['config','get','dry-run','--global','--prefix',prefix]).trim();
    if(dryRun==='true')failed('update_dry_run_enabled');
    if(dryRun!=='false')failed(stage);
    // Explicit prefix pins the operation to the verified installation, including custom prefixes.
    // Lifecycle scripts remain disabled: updating code must not rewrite host registration or trust.
    stage='update_install_failed';
    invoke(['install','-g','aptly@latest','--ignore-scripts','--prefix',prefix],120000);
    stage='update_result_unverified';
    if(lstatSync(target).isSymbolicLink()||canonical(target)!==canonical(options.packageRoot))failed(stage);
    const version=verifyPackage(target);
    return {status:'complete',codes:['package_updated','host_configuration_preserved','setup_required','mcp_restart_required'],version};
  } catch(error) {
    const code=error instanceof Error&&['update_global_install_unverified','update_npm_unsupported','update_dry_run_enabled'].includes(error.message)?error.message:stage;
    return {status:'error',codes:[code]};
  }
}

type UpdateClient = 'codex'|'claude';
type MigrationResult = {client:UpdateClient;status:'configured'|'unchanged'|'skipped'|'error';codes:string[];requires_hook_review?:boolean};
type UpdateMigrationResult = UpdateResult & {migration?:MigrationResult;migrations?:MigrationResult[]};

function readMigration(raw:unknown,client:UpdateClient,exitedWithError:boolean):MigrationResult|undefined {
  if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)return;
  try {
    const value=JSON.parse(raw);
    if(!value||!Array.isArray(value.clients)||value.clients.length!==1)return;
    const result=value.clients[0];
    if(!result||result.client!==client||!Array.isArray(result.codes)||result.codes.length>64||
      !result.codes.every((code:unknown)=>typeof code==='string'&&/^[a-z0-9_]{1,100}$/.test(code))||
      (result.requires_hook_review!==undefined&&typeof result.requires_hook_review!=='boolean'))return;
    const valid=exitedWithError
      ? value.status==='partial'&&result.status==='error'&&result.codes.length>0
      : value.status==='complete'&&['configured','unchanged'].includes(result.status)&&result.codes.includes('launcher_migrated');
    if(!valid)return;
    return {client,status:result.status,codes:result.codes,...(result.requires_hook_review!==undefined?{requires_hook_review:result.requires_hook_review}:{})};
  }catch{return;}
}

function runMigration(cli:string,client:UpdateClient,dependencies:UpdateDependencies,automatic:boolean):MigrationResult {
  const failure=(code:string):MigrationResult=>({client,status:'error',codes:[code]});
  let raw:unknown,exitedWithError=false;
  try {
    // Inherit the caller's selected host homes. The new CLI revalidates ownership.
    raw=(dependencies.run??runNpm)(dependencies.nodePath??process.execPath,[cli,'setup','--client',client,'--migrate-launcher','--launcher','npx'],120000);
  }catch(error){
    const child=error as {code?:unknown;signal?:unknown;status?:unknown;stdout?:unknown}|null;
    if(child?.code==='ETIMEDOUT'||child?.code==='ENOBUFS'||typeof child?.signal==='string')return failure('launcher_migration_unverified');
    if(child?.status!==1)return failure('launcher_migration_failed');
    exitedWithError=true;
    raw=child.stdout;
  }
  const result=readMigration(raw,client,exitedWithError);
  if(!result)return failure('launcher_migration_failed');
  if(automatic&&result.status==='error'&&result.codes.length===1&&['launcher_migration_not_owned','launcher_migration_not_standard'].includes(result.codes[0]))return {...result,status:'skipped'};
  return result;
}

/** Update first, then let the verified fresh CLI migrate the selected or existing owned hosts. */
export function updateGlobalAndMigrate(options:{packageRoot:string;client?:UpdateClient},dependencies:UpdateDependencies & {platform?:NodeJS.Platform}={}):UpdateMigrationResult {
  const supported=['darwin','linux'].includes(dependencies.platform??process.platform);
  if(!supported&&options.client)return {status:'error',codes:['npx_launcher_platform_unsupported']};
  const updated=updateGlobalInstallation(options,dependencies);
  if(updated.status!=='complete'||!supported)return updated;
  const errorResult=(code:string):UpdateResult=>({status:'error',version:updated.version,codes:['package_updated',code,'mcp_restart_required']});
  const migrate=(client:UpdateClient,automatic:boolean):MigrationResult=>{
    try {
      if(lstatSync(options.packageRoot).isSymbolicLink()||verifyPackage(options.packageRoot)!==updated.version)failed('update_result_unverified');
    }catch{return {client,status:'error',codes:['update_result_unverified']};}
    return runMigration(join(options.packageRoot,'dist','bin','aptly.js'),client,dependencies,automatic);
  };

  if(options.client){
    const migration=migrate(options.client,false);
    if(migration.status==='error'){
      const [first]=migration.codes;
      return errorResult(['update_result_unverified','launcher_migration_unverified'].includes(first)?first:'launcher_migration_failed');
    }
    return {status:'complete',version:updated.version,codes:['package_updated','launcher_migrated','mcp_restart_required'],migration};
  }
  const clients:UpdateClient[]=['codex','claude'];
  const migrations=clients.map(client=>migrate(client,true));
  const errors=migrations.filter(result=>result.status==='error');
  if(errors.length){
    const codes=new Set(errors.map(result=>['update_result_unverified','launcher_migration_unverified'].includes(result.codes[0])?result.codes[0]:'launcher_migration_failed'));
    return {status:'error',version:updated.version,codes:['package_updated',...codes,'mcp_restart_required'],migrations};
  }
  if(migrations.every(result=>result.status==='skipped'))return {...updated,migrations};
  return {status:'complete',version:updated.version,codes:['package_updated','launcher_migrated','mcp_restart_required'],migrations};
}
