// Explicit public-document refresh only. No credentials, host discovery or paid calls.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fchmodSync, fsyncSync, lstatSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { assertPrivateStatePath, readRegularFile } from './files.ts';
import { errorCode } from './types.ts';

export interface ModelFact { client: 'codex'|'claude'; model: string; description: string; }
export interface ModelInfoSnapshot {
  schema_version: 1;
  fetched_at: string;
  sources: Array<{url:string;sha256:string}>;
  facts: ModelFact[];
}
export type ModelInfoStatus = 'bundled'|'fresh'|'stale'|'unavailable'|'invalid';
export interface LoadedModelInfo { facts: ModelFact[]; status: ModelInfoStatus; }
export const modelInfoUrls = Object.freeze([
  'https://code.claude.com/docs/en/model-config.md',
  'https://learn.chatgpt.com/docs/models.md',
] as const);
const aliases = ['haiku','sonnet','opus','fable'] as const;
const codexModels = ['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol','gpt-6-astra'] as const;
const maximumBody = 256 * 1024, maximumSnapshot = 32 * 1024, ttl = 7 * 24 * 60 * 60 * 1000;
const fail = (code:string) => Object.assign(new Error(code),{code});
const own = (v:object,k:PropertyKey) => Object.hasOwn(v,k);
function exact(value:unknown,keys:readonly string[]): value is Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const d=Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(d).length===keys.length&&keys.every(k=>own(d,k)&&own(d[k],'value')&&d[k].enumerable);
}
const safeDescription = (value:unknown): value is string => typeof value==='string'&&value===value.trim()&&value.length>0&&Buffer.byteLength(value)<=800&&
  !/[\x00-\x1f\x7f]/.test(value)&&!(/\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}|\/(?:Users|home)\/[A-Za-z0-9._-]+\//i.test(value));
function validate(value:unknown): ModelInfoSnapshot {
  if(!exact(value,['schema_version','fetched_at','sources','facts'])||value.schema_version!==1||typeof value.fetched_at!=='string'||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.fetched_at)||!Number.isFinite(Date.parse(value.fetched_at))||
    new Date(value.fetched_at).toISOString()!==value.fetched_at||!Array.isArray(value.sources)||value.sources.length!==2||
    !Array.isArray(value.facts)||value.facts.length!==8)throw fail('model_info_invalid');
  const sources=value.sources.map((s:unknown,i:number)=>{
    if(!exact(s,['url','sha256'])||typeof s.url!=='string'||s.url!==modelInfoUrls[i]||typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256))throw fail('model_info_invalid');
    return {url:s.url,sha256:s.sha256};
  });
  const seen=new Set<string>();
  const facts=value.facts.map((f:unknown)=>{
    if(!exact(f,['client','model','description'])||typeof f.model!=='string'||!safeDescription(f.description)||
      !(f.client==='claude'&&(aliases as readonly string[]).includes(f.model)||f.client==='codex'&&(codexModels as readonly string[]).includes(f.model)))throw fail('model_info_invalid');
    const key=f.client+':'+f.model;if(seen.has(key))throw fail('model_info_invalid');seen.add(key);
    return {client:f.client as ModelFact['client'],model:f.model,description:f.description};
  });
  const snapshot:ModelInfoSnapshot={schema_version:1,fetched_at:value.fetched_at,sources,facts};
  if(Buffer.byteLength(JSON.stringify(snapshot))>maximumSnapshot)throw fail('model_info_invalid');
  return snapshot;
}
function clean(text:string):string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`]/g,'').replace(/<[^>]*>/g,'')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
function parseClaude(markdown:string):ModelFact[] {
  const section=/^### Model aliases\s*\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/m.exec(markdown)?.[1];
  if(!section)throw fail('model_info_parse_failed');
  return aliases.map(model=>{
    const rows=section.split('\n').filter(line=>new RegExp('^\\|\\s*(?:\\*\\*)?`'+model+'`(?:\\*\\*)?\\s*\\|').test(line));
    if(rows.length!==1)throw fail('model_info_parse_failed');
    const cells=rows[0].split('|');const description=clean(cells[2]??'');
    if(!safeDescription(description))throw fail('model_info_parse_failed');
    return {client:'claude' as const,model,description};
  });
}
function parseCodex(markdown:string):ModelFact[] {
  const section=/^## Recommended models\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(markdown)?.[1];
  if(!section)throw fail('model_info_parse_failed');
  const blocks=section.match(/<ModelDetails\b[\s\S]*?\n\s*\/>/g)??[];
  return codexModels.map(model=>{
    const entries=blocks.filter(b=>new RegExp('\\bname="'+model.replaceAll('.','\\.')+'"').test(b));
    if(entries.length!==1)throw fail('model_info_parse_failed');
    const values=[...entries[0].matchAll(/\bdescription="([^"\r\n]*)"/g)];
    const description=values.length===1?clean(values[0][1]):'';
    if(!safeDescription(description))throw fail('model_info_parse_failed');
    return {client:'codex' as const,model,description};
  });
}
async function getMarkdown(url:string,fetchImpl:typeof fetch,timeoutMs:number):Promise<string> {
  const controller=new AbortController();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;let stream:ReadableStream<Uint8Array>|null|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const body=async()=>{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',signal:controller.signal,headers:{Accept:'text/markdown, text/plain;q=0.9'}});
    stream=response.body;
    if(controller.signal.aborted){if(stream)void stream.cancel().catch(()=>{});throw fail('model_info_timeout');}
    if(!response.ok||response.redirected||(response.url&&response.url!==url)||!response.body)throw fail('model_info_fetch_failed');
    if(!/^text\/(?:markdown|plain)(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw fail('model_info_fetch_failed');
    reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,result='';
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximumBody)throw fail('model_info_too_large');result+=decoder.decode(value,{stream:true});}
    result+=decoder.decode();return result;
  };
  try {
    return await Promise.race([body(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fail('model_info_timeout'));},timeoutMs);})]);
  }catch(error){
    const code=errorCode(error);throw fail(code&&['model_info_fetch_failed','model_info_too_large','model_info_timeout'].includes(code)?code:'model_info_fetch_failed');
  }finally{clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});else if(stream)void stream.cancel().catch(()=>{});}
}
/** Fixed endpoints only. Refresh is explicit; request-time recommendation never fetches pages. */
export async function fetchModelInfo({fetchImpl=fetch,now=Date.now(),timeoutMs=8000}:{fetchImpl?:typeof fetch;now?:number;timeoutMs?:number}={}):Promise<ModelInfoSnapshot> {
  if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(new Date(now).valueOf())||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('model_info_options_invalid');
  const documents:string[]=[];
  for(const url of modelInfoUrls)documents.push(await getMarkdown(url,fetchImpl,timeoutMs));
  return validate({schema_version:1,fetched_at:new Date(now).toISOString(),sources:modelInfoUrls.map((url,i)=>({url,sha256:createHash('sha256').update(documents[i]).digest('hex')})),facts:[...parseClaude(documents[0]),...parseCodex(documents[1])]});
}
/** Unknown cache data never becomes execution authority; unusable caches use bundled facts. */
export function loadModelInfo(path:unknown,{now=Date.now()}:{now?:number}={}):LoadedModelInfo {
  if(path===undefined||path===null)return {facts:[],status:'bundled'};
  if(typeof path!=='string'||!isAbsolute(path)||!path||!Number.isSafeInteger(now)||now<0)return {facts:[],status:'invalid'};
  let snapshot:ModelInfoSnapshot;
  try {snapshot=validate(JSON.parse(readRegularFile(path,{privateFile:true,maxBytes:maximumSnapshot}).toString('utf8')));}
  catch(error){return {facts:[],status:errorCode(error)==='ENOENT'?'bundled':errorCode(error)==='model_info_invalid'||error instanceof SyntaxError?'invalid':'unavailable'};}
  const issued=Date.parse(snapshot.fetched_at);
  if(issued>now)return {facts:[],status:'invalid'};
  if(now-issued>ttl)return {facts:[],status:'stale'};
  return {facts:snapshot.facts.map(f=>({...f})),status:'fresh'};
}
/** Atomic replacement in an existing owner-private directory; unrelated files are never overwritten. */
export function saveModelInfo(path:string,snapshot:ModelInfoSnapshot):void {
  const value=validate(snapshot);let fd:number|undefined;let temporary:string|undefined;let identity:{dev:number;ino:number}|undefined;
  try {
    assertPrivateStatePath(path);
    let before:ReturnType<typeof lstatSync>|undefined;let beforeHash:string|undefined;
    try {before=lstatSync(path);const bytes=readRegularFile(path,{privateFile:true,maxBytes:maximumSnapshot});validate(JSON.parse(bytes.toString('utf8')));beforeHash=createHash('sha256').update(bytes).digest('hex');}
    catch(error){if(errorCode(error)!=='ENOENT')throw fail('model_info_save_failed');}
    temporary=join(dirname(path),'.'+basename(path)+'.write-'+randomUUID());
    fd=openSync(temporary,'wx',0o600);fchmodSync(fd,0o600);const stat=lstatSync(temporary);identity={dev:stat.dev,ino:stat.ino};
    writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);closeSync(fd);fd=undefined;
    assertPrivateStatePath(path);
    let after:ReturnType<typeof lstatSync>|undefined;
    try{after=lstatSync(path);}catch(error){if(errorCode(error)!=='ENOENT')throw error;}
    if(Boolean(before)!==Boolean(after)||(before&&after&&(before.dev!==after.dev||before.ino!==after.ino)))throw fail('model_info_save_failed');
    if(after&&createHash('sha256').update(readRegularFile(path,{privateFile:true,maxBytes:maximumSnapshot})).digest('hex')!==beforeHash)throw fail('model_info_save_failed');
    renameSync(temporary,path);temporary=undefined;
  }catch{throw fail('model_info_save_failed');}
  finally{
    if(fd!==undefined)closeSync(fd);
    if(temporary&&identity){try{const stat=lstatSync(temporary);if(stat.dev===identity.dev&&stat.ino===identity.ino&&!stat.isSymbolicLink())unlinkSync(temporary);}catch{/* best effort for this operation's own temporary only */}}
  }
}
