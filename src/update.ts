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

/** Update first, then migrate only the explicitly selected host using the verified installed CLI. */
export function updateGlobalAndMigrate(options:{packageRoot:string;client:'codex'|'claude'},dependencies:UpdateDependencies & {platform?:NodeJS.Platform}={}):UpdateResult & {migration?:{client:'codex'|'claude';status:string;codes:string[];requires_hook_review?:boolean}} {
  if((dependencies.platform??process.platform)==='win32')return {status:'error',codes:['npx_launcher_platform_unsupported']};
  const updated=updateGlobalInstallation(options,dependencies);
  if(updated.status!=='complete')return updated;
  const errorResult=(code:string):UpdateResult=>({status:'error',version:updated.version,codes:['package_updated',code,'mcp_restart_required']});
  try {
    if(lstatSync(options.packageRoot).isSymbolicLink()||verifyPackage(options.packageRoot)!==updated.version)failed('update_result_unverified');
  }catch{return errorResult('update_result_unverified');}
  try {
    // Use the invoker's host environment, including CODEX_HOME or CLAUDE_CONFIG_DIR.
    // The verified CLI performs its own per-client ownership checks.
    const cli=join(options.packageRoot,'dist','bin','aptly.js');
    const raw=(dependencies.run??runNpm)(dependencies.nodePath??process.execPath,[cli,'setup','--client',options.client,'--migrate-launcher','--launcher','npx'],120000);
    if(Buffer.byteLength(raw)>65536)throw new Error('invalid result');
    const result:unknown=JSON.parse(raw);
    if(!result||typeof result!=='object')throw new Error('invalid result');
    const value=result as {status?:unknown;clients?:unknown};
    if(value.status!=='complete'||!Array.isArray(value.clients)||value.clients.length!==1)throw new Error('invalid result');
    const client=value.clients[0];
    if(!client||client.client!==options.client||!['configured','unchanged'].includes(client.status)||!Array.isArray(client.codes)||client.codes.length>64||!client.codes.every((code:unknown)=>typeof code==='string'&&/^[a-z0-9_]{1,100}$/.test(code))||!client.codes.includes('launcher_migrated')||(client.requires_hook_review!==undefined&&typeof client.requires_hook_review!=='boolean'))throw new Error('invalid result');
    return {status:'complete',version:updated.version,codes:['package_updated','launcher_migrated','mcp_restart_required'],migration:{client:options.client,status:client.status,codes:client.codes,...(client.requires_hook_review!==undefined?{requires_hook_review:client.requires_hook_review}:{})}};
  } catch(error) {
    const reason=error&&typeof error==='object'&&'code' in error&&error.code==='ETIMEDOUT'?'launcher_migration_unverified':'launcher_migration_failed';
    return errorResult(reason);
  }
}
