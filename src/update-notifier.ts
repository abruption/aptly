// Optional interactive CLI hint only. Never used by MCP, routing, or provider code.
import {mkdirSync,lstatSync,openSync,closeSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {dirname,join,isAbsolute,parse} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {assertNoRedirectedAncestors,assertPrivateStatePath,readRegularFile} from './files.ts';
import {protectNewWindowsPrivateDirectory} from './windows-private.ts';

const registry='https://registry.npmjs.org/aptly/latest';
const ttl=24*60*60*1000,cooldown=60*60*1000,maximumBody=16*1024,timeout=800;
type Cache={schema_version:1;checked_at:number;latest:string|null;failed:boolean};
export interface UpdateNotificationOptions {
 command:string;
 args:readonly string[];
 env:NodeJS.ProcessEnv;
 stderrIsTTY:boolean;
 stdoutIsTTY?:boolean;
 stdinIsTTY:boolean;
 currentVersion:string;
 cachePath?:string;
 fetch?:typeof globalThis.fetch;
 now?:number;
}
function version(value:unknown):number[]|null {
 if(typeof value!=='string'||value.length>64||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))return null;
 const parts=value.split('.').map(Number);return parts.every(Number.isSafeInteger)?parts:null;
}
function newer(candidate:string,current:string):boolean {
 const a=version(candidate)!,b=version(current)!;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
function eligible(o:UpdateNotificationOptions):boolean {
 return o.stdinIsTTY&&o.stderrIsTTY&&o.stdoutIsTTY!==false&&!o.env.CI&&o.env.APTLY_NO_UPDATE_NOTIFIER!=='1'&&!!version(o.currentVersion)&&
  ['--version','config','setup','remove','set','report'].includes(o.command)&&!o.args.some(arg=>arg==='--help'||arg==='-h')&&!o.args.includes('--automatic')&&!(o.command==='set'&&o.args[0]==='transmission'&&o.args.includes('--show'));
}
function directory(path:string):void {
 if(!isAbsolute(path))throw Error('cache_path');
 const parent=dirname(path);
 if(parent!==path){try{assertNoRedirectedAncestors(parent);}catch(error:any){if(error.code!=='ENOENT')throw error;directory(parent);}}
 let created=false;try{mkdirSync(path,{mode:0o700});created=true;}catch(error:any){if(error.code!=='EEXIST')throw error;}
 assertNoRedirectedAncestors(path);if(!lstatSync(path).isDirectory())throw Error('cache_path');
 if(created&&process.platform==='win32')protectNewWindowsPrivateDirectory(path);
}
function readCache(path:string,now:number):Cache|null {
 assertPrivateStatePath(path);
 try{
  const c=JSON.parse(readRegularFile(path,{privateFile:true,maxBytes:1024}).toString('utf8'));
  if(!c||Array.isArray(c)||Object.keys(c).sort().join(',')!=='checked_at,failed,latest,schema_version'||c.schema_version!==1||
   !Number.isSafeInteger(c.checked_at)||c.checked_at<0||c.checked_at>now||typeof c.failed!=='boolean'||
   (c.latest!==null&&!version(c.latest))||(!c.failed&&c.latest===null))return null;
  return c;
 }catch(error:any){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}
function writeCache(path:string,c:Cache):void {
 let stage:string|undefined;
 try{
  assertPrivateStatePath(path);
  stage=join(dirname(path),'.aptly-update-'+randomUUID());
  const fd=openSync(stage,'wx',0o600);try{writeFileSync(fd,JSON.stringify(c)+'\n');}finally{closeSync(fd);}
  assertPrivateStatePath(stage);assertPrivateStatePath(path);renameSync(stage,path);stage=undefined;
 }finally{if(stage)try{unlinkSync(stage);}catch{ /* Best-effort cleanup of our stage only. */ }}
}
async function latestStable(fetcher:typeof globalThis.fetch):Promise<string> {
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const work=async()=>{
  const response=await fetcher(registry,{signal:controller.signal,redirect:'error',credentials:'omit',headers:{accept:'application/json'}});
  if(!response.ok||!response.body)throw Error('registry_response');
  const size=response.headers.get('content-length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>maximumBody))throw Error('registry_size');
  reader=response.body.getReader();let total=0;const chunks:Uint8Array[]=[];
  for(;;){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>maximumBody)throw Error('registry_size');chunks.push(chunk.value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!metadata||metadata.name!=='aptly'||!version(metadata.version))throw Error('registry_metadata');
  return metadata.version as string;
 };
 try{
  return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('registry_timeout'));},timeout);})]);
 }finally{
  if(timer)clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});
 }
}
/** Returns one stderr hint; never prints, reads credentials, or changes installed code. */
export async function updateNotification(options:UpdateNotificationOptions):Promise<string|null> {
 if(!eligible(options))return null;
 const now=options.now??Date.now();if(!Number.isSafeInteger(now)||now<0)return null;
 const path=options.cachePath??join(homedir(),'.cache','aptly','update-check.json');
 let cached:Cache|null;
 try{if(!isAbsolute(path)||parse(path).root===path)return null;directory(dirname(path));cached=readCache(path,now);}catch{return null;}
 if(cached&&now-cached.checked_at<(cached.failed?cooldown:ttl))return !cached.failed&&cached.latest&&newer(cached.latest,options.currentVersion)?hint(cached.latest,options.currentVersion):null;
 try{
  const latest=await latestStable(options.fetch??globalThis.fetch);
  try{writeCache(path,{schema_version:1,checked_at:now,latest,failed:false});}catch{ /* Notification must not make CLI commands fail. */ }
  return newer(latest,options.currentVersion)?hint(latest,options.currentVersion):null;
 }catch{
  try{writeCache(path,{schema_version:1,checked_at:now,latest:null,failed:true});}catch{ /* Silent best effort; no provider/ledger fallback. */ }
  return null;
 }
}
function hint(latest:string,current:string):string {return `Aptly ${latest} is available (installed: ${current}). Run aptly update to update this global installation; use the installation guide for local installs.`;}
