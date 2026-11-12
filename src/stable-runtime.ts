// POSIX, opt-in, immutable MCP/observer runtime snapshots. No host configuration,
// credential access, Node installation, lifecycle scripts, or mutable current pointer.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, parse as parsePath, relative, resolve, sep } from 'node:path';
import { assertNoRedirectedAncestors, readRegularFile, systemAliasAllowed } from './files.ts';

export const stableRuntimeLimits=Object.freeze({files:12000,totalBytes:128*1024*1024,fileBytes:8*1024*1024,manifestBytes:2*1024*1024});
export interface StableFile {readonly path:string;readonly size:number;readonly sha256:string}
export interface StableManifest {readonly schema_version:1;readonly kind:'aptly-stable-runtime';readonly version:string;readonly home:string;readonly node_path:string;readonly launcher_revision:1;readonly bootstrap_sha256:string;readonly launcher_sha256:string;readonly files:readonly StableFile[];readonly generation:string}
export interface StableRegistration {readonly command:string;readonly args:readonly ['serve'];readonly packageRoot:string;readonly runtimeRoot:string;readonly version:string;readonly generation:string;readonly manifest:StableManifest;readonly integrity:'full'|'metadata'}
export interface StableRuntimePlan extends StableRegistration {readonly descriptor:{readonly command:string;readonly args:readonly ['serve']};readonly payloadRoot:string}
type CapturedFile={path:string;source:string;size:number;sha256:string;identity:string};
const plans=new WeakMap<StableRuntimePlan,{root:string;files:CapturedFile[]}>();
function fail(code:string):never{throw new Error(code);}
const digest=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const uid=()=>process.getuid?.();
const within=(path:string,root:string)=>path===root||path.startsWith(root+sep);
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:readonly string[])=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const cleanAbsolute=(v:unknown):v is string=>typeof v==='string'&&isAbsolute(v)&&resolve(v)===v&&!/[\x00-\x1f\x7f]/.test(v);
const safeRelative=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=1024&&!v.includes('\\')&&!/[\x00-\x1f\x7f]/.test(v)&&v.split('/').every(p=>p&&p!=='.'&&p!=='..');
const baseFor=(home:string)=>join(home,'.local','share','aptly','runtimes');
const identity=(path:string)=>{const s=lstatSync(path);return [s.dev,s.ino,s.uid,s.nlink,s.mode,s.size,s.mtimeMs,s.ctimeMs].join(':');};
const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
function canonicalAllowed(path:string):string{
 const absolute=resolve(path);let current:string=parsePath(absolute).root;for(const part of absolute.slice(current.length).split(sep).filter(Boolean)){
  const next=join(current,part);try{const stat=lstatSync(next);if(stat.isSymbolicLink()){
   const target=readlinkSync(next);if(!systemAliasAllowed(next,stat,target))fail('stable_runtime_unverified');current=resolve(dirname(next),target);
  }else current=next;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')current=next;else throw error;}
 }return current;
}
export interface StableReference {readonly command:string;readonly args:readonly ['serve'];readonly generation:string;readonly runtimeRoot:string}
/** Shape only. Reads OS alias metadata, never runtime bytes or credentials. */
export function stableReference(entry:unknown,{home=homedir()}:{home?:string}={}):StableReference|null{
 const command=object(entry)?entry.command:undefined;if(typeof command!=='string')return null;
 const lexicalHome=resolve(home),aliasHome=process.platform==='darwin'?lexicalHome.replace(/^\/(tmp|var|etc)(?=\/|$)/,'/private/$1'):lexicalHome,candidate=resolve(command);
 if(![baseFor(lexicalHome),baseFor(aliasHome)].some(base=>within(candidate,base)))return null;
 const canonicalHome=process.platform==='win32'?lexicalHome:canonicalAllowed(lexicalHome),bases=[baseFor(lexicalHome),baseFor(canonicalHome)],base=bases.find(base=>within(candidate,base));if(!base)fail('stable_runtime_unverified');
 if(!cleanAbsolute(command)||Object.hasOwn(entry as object,'url')||((entry as any).type!==undefined&&(entry as any).type!=='stdio')||!Array.isArray((entry as any).args)||(entry as any).args.length!==1||(entry as any).args[0]!=='serve')fail('stable_runtime_unverified');
 const suffix=relative(base,candidate).split(sep);if(suffix.length!==2||!/^[a-f0-9]{64}$/.test(suffix[0])||suffix[1]!=='launch')fail('stable_runtime_unverified');
 const runtimeRoot=join(baseFor(canonicalHome),suffix[0]);return frozen({command:join(runtimeRoot,'launch'),args:['serve'] as ['serve'],generation:suffix[0],runtimeRoot});
}
function platform(){if(process.platform==='win32')fail('stable_launcher_platform_unsupported');}
function safeAncestors(path:string){
 let current=resolve(path);while(!existsSync(current)){const parent=dirname(current);if(parent===current)fail('stable_runtime_unverified');current=parent;}
 assertNoRedirectedAncestors(current);
 for(;;){const observed=lstatSync(current),stat=observed.isSymbolicLink()?statSync(current):observed;const sticky=stat.isDirectory()&&stat.uid===0&&(stat.mode&0o1000)!==0;
  if((uid()!==undefined&&stat.uid!==uid()&&stat.uid!==0)||((stat.mode&0o022)!==0&&!sticky))fail('stable_runtime_unverified');
  const parent=dirname(current);if(parent===current)break;current=parent;
 }
}
function privatePath(path:string,directory:boolean){
 safeAncestors(path);assertNoRedirectedAncestors(path);const s=lstatSync(path);
 if(s.isSymbolicLink()||(directory?!s.isDirectory():!s.isFile()||s.nlink!==1)||(s.mode&0o077)||(uid()!==undefined&&s.uid!==uid()))fail('stable_runtime_unverified');
}
function checkedRoot(runtimeRoot:string,home:string){
 const base=baseFor(home);if(dirname(runtimeRoot)!==base||!/^\w{64}$/.test(basename(runtimeRoot)))fail('stable_runtime_unverified');
 safeAncestors(dirname(base));for(const path of [base,runtimeRoot,join(runtimeRoot,'payload')])privatePath(path,true);
}
function readPrivate(path:string,maxBytes:number){privatePath(path,false);return readRegularFile(path,{privateFile:true,maxBytes});}
function frozen<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))frozen(child);}return value;}

// No interpolation from host events or secrets. The launcher checks these exact
// bootstrap bytes before Node execution; this is integrity, not publisher authentication.
const bootstrap=String.raw`'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,mode=process.argv[2],quiet=mode==='observe';
function bad(){throw Error('stable_runtime_unverified');}
function hash(v){return crypto.createHash('sha256').update(v).digest('hex');}
function privatePath(p,dir){const s=fs.lstatSync(p);if(s.isSymbolicLink()||(dir?!s.isDirectory():!s.isFile()||s.nlink!==1)||(s.mode&63)||(process.getuid&&s.uid!==process.getuid()))bad();}
function read(p,max){privatePath(p,false);const before=fs.lstatSync(p);const fd=fs.openSync(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));try{const s=fs.fstatSync(fd);if(!s.isFile()||s.dev!==before.dev||s.ino!==before.ino||s.size>max||s.nlink!==1||(s.mode&63)||(process.getuid&&s.uid!==process.getuid()))bad();const buffer=Buffer.alloc(Math.min(max+1,s.size+1));let size=0;while(size<buffer.length){const count=fs.readSync(fd,buffer,size,buffer.length-size,null);if(!count)break;size+=count;}if(size>s.size||size>max)bad();privatePath(p,false);const after=fs.lstatSync(p);if(after.dev!==s.dev||after.ino!==s.ino)bad();return buffer.subarray(0,size);}finally{fs.closeSync(fd);}}
function safe(p){return typeof p==='string'&&p.length>0&&p.length<=1024&&!p.includes('\\')&&!/[\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');}
async function main(){
 if(!/^v(?:2[4-9]|[3-9][0-9]|[1-9][0-9]{2,})\.\d+\.\d+$/.test(process.version))bad();
 if(mode!=='serve'&&mode!=='observe')bad();if(mode==='serve'&&process.argv.length!==3)bad();
 const m=JSON.parse(read(path.join(root,'manifest.json'),2097152).toString('utf8'));
 const body={schema_version:m.schema_version,kind:m.kind,version:m.version,home:m.home,node_path:m.node_path,launcher_revision:m.launcher_revision,bootstrap_sha256:m.bootstrap_sha256,launcher_sha256:m.launcher_sha256,files:m.files};
 if(Object.keys(m).sort().join(',')!=='bootstrap_sha256,files,generation,home,kind,launcher_revision,launcher_sha256,node_path,schema_version,version')bad();
 if(m.schema_version!==1||m.kind!=='aptly-stable-runtime'||m.launcher_revision!==1||!Array.isArray(m.files)||m.files.length>12000||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(m.version))bad();
 if(root!==path.join(m.home,'.local','share','aptly','runtimes',m.generation)||hash(JSON.stringify(body))!==m.generation)bad();
 for(const p of [path.dirname(root),root,path.join(root,'payload')])privatePath(p,true);
 let at=root;while(true){let s=fs.lstatSync(at);if(s.isSymbolicLink()&&!((at==='/var'&&fs.readlinkSync(at)==='private/var'||at==='/tmp'&&fs.readlinkSync(at)==='private/tmp'||at==='/etc'&&fs.readlinkSync(at)==='private/etc')&&process.platform==='darwin'&&s.uid===0))bad();if(s.isSymbolicLink())s=fs.statSync(at);if((process.getuid&&s.uid!==process.getuid()&&s.uid!==0)||((s.mode&18)&&!(s.isDirectory()&&s.uid===0&&(s.mode&512))))bad();const next=path.dirname(at);if(next===at)break;at=next;}
 if(hash(read(path.join(root,'bootstrap.cjs'),65536))!==m.bootstrap_sha256||hash(read(path.join(root,'launch'),65536))!==m.launcher_sha256)bad();
 const expected=new Map();let total=0,previous='';for(const f of m.files){if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).sort().join(',')!=='path,sha256,size'||!safe(f.path)||f.path<=previous||expected.has(f.path)||!Number.isSafeInteger(f.size)||f.size<0||f.size>8388608||!/^[a-f0-9]{64}$/.test(f.sha256))bad();total+=f.size;if(total>134217728)bad();expected.set(f.path,f);previous=f.path;}
 const directories=new Set(['']);for(const key of expected.keys()){const parts=key.split('/');parts.pop();while(parts.length){directories.add(parts.join('/'));parts.pop();}}
 const seen=new Set();function walk(dir,rel){privatePath(dir,true);for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),key=rel?rel+'/'+name:name,s=fs.lstatSync(file);if(s.isDirectory()){if(!directories.has(key))bad();walk(file,key);}else{const f=expected.get(key);if(!f||seen.has(key))bad();const bytes=read(file,8388608);if(bytes.length!==f.size||hash(bytes)!==f.sha256)bad();seen.add(key);}}}
 walk(path.join(root,'payload'),'');if(seen.size!==expected.size)bad();
 const pkg=JSON.parse(read(path.join(root,'payload','package.json'),65536).toString('utf8'));if(pkg.name!=='aptly'||pkg.version!==m.version||pkg.type!=='module')bad();
 // Synchronous hooks also cover require/createRequire in this thread. This is
 // a module-resolution boundary, not a sandbox for trusted payload programs.
 const modules=require('node:module'),urls=require('node:url'),payload=fs.realpathSync(path.join(root,'payload'));
 if(typeof modules.registerHooks!=='function')bad();
 modules.registerHooks({resolve(specifier,context,nextResolve){
  if(modules.isBuiltin(specifier))return nextResolve(specifier,context);
  const result=nextResolve(specifier,context);if(modules.isBuiltin(result.url))return result;
  let target;try{target=fs.realpathSync(urls.fileURLToPath(result.url));}catch{bad();}
  const relative=path.relative(payload,target).split(path.sep).join('/');
  if(!relative||relative.startsWith('../')||path.isAbsolute(relative)||!expected.has(relative))bad();
  privatePath(target,false);return result;
 }});
 if(mode==='serve'){const server=await import(require('node:url').pathToFileURL(path.join(root,'payload','dist','src','server.js')).href);await server.serve();}
 else{const target=path.join(root,'payload','dist','bin','aptly-observe.js');process.argv=[process.execPath,target,...process.argv.slice(3)];await import(require('node:url').pathToFileURL(target).href);}
}
main().catch(()=>{if(!quiet){process.stderr.write('aptly: stable_runtime_unavailable\n');process.exitCode=1;}});
`;
const bootstrapHash=digest(bootstrap);

function sourceFiles(packageRoot:string):{files:CapturedFile[];version:string}{
 const root=canonicalAllowed(packageRoot),files:CapturedFile[]=[];let bytes=0;
 try{safeAncestors(root);assertNoRedirectedAncestors(root);}catch{fail('stable_source_unverified');}if(!lstatSync(root).isDirectory())fail('stable_source_unverified');
 if(readdirSync(root).some(name=>name.toLowerCase()==='binding.gyp'||name.toLowerCase().endsWith('.node')||name.toLowerCase()==='prebuilds'&&lstatSync(join(root,name)).isDirectory()))fail('stable_source_unverified');
 function add(path:string){
  if(path.toLowerCase().endsWith('.node')||basename(path).toLowerCase()==='binding.gyp')fail('stable_source_unverified');
  const source=join(root,path);assertNoRedirectedAncestors(source);const s=lstatSync(source);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>stableRuntimeLimits.fileBytes||(s.mode&0o022)||(uid()!==undefined&&s.uid!==uid()&&s.uid!==0))fail('stable_source_unverified');
  const before=identity(source),data=readRegularFile(source,{maxBytes:stableRuntimeLimits.fileBytes});
  if(before!==identity(source))fail('stable_source_changed');
  bytes+=data.length;if(bytes>stableRuntimeLimits.totalBytes||files.length>=stableRuntimeLimits.files)fail('stable_runtime_limit');
  files.push({path,source,size:data.length,sha256:digest(data),identity:before});
 }
 function walk(directory:string,skipModules=false){
  const absolute=join(root,directory);try{safeAncestors(absolute);assertNoRedirectedAncestors(absolute);}catch{fail('stable_source_unverified');}if(!lstatSync(absolute).isDirectory())fail('stable_source_unverified');
  for(const name of readdirSync(absolute).sort()){
   if(name==='.bin'||name==='node_modules'&&skipModules)continue;
   if(['.git','.npmrc','.env','credentials.json','auth.json'].includes(name)||name.startsWith('.env.'))fail('stable_source_unverified');
   const path=directory+'/'+name;if(!safeRelative(path))fail('stable_source_unverified');const s=lstatSync(join(root,path));
   if(s.isSymbolicLink()||s.isDirectory()&&name.toLowerCase()==='prebuilds')fail('stable_source_unverified');if(s.isDirectory())walk(path,skipModules);else add(path);
  }
 }
 add('package.json');add('LICENSE');walk('dist/src');walk('dist/bin');
 const metadata=JSON.parse(readRegularFile(join(root,'package.json'),{maxBytes:65536}).toString('utf8'));
 if(metadata.name!=='aptly'||metadata.type!=='module'||typeof metadata.version!=='string'||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(metadata.version)||!existsSync(join(root,'dist/src/server.js'))||!existsSync(join(root,'dist/bin/aptly-observe.js')))fail('stable_source_unverified');
 const modules=join(root,'node_modules'),seen=new Set<string>();
 function dependencies(current:string,pkg:Record<string,any>){
  const required={...(pkg.dependencies??{}),...(pkg.peerDependencies??{})};const optional={...(pkg.optionalDependencies??{})};
  for(const [name,meta]of Object.entries(pkg.peerDependenciesMeta??{}))if(object(meta)&&meta.optional===true&&Object.hasOwn(required,name)){optional[name]=required[name];delete required[name];}
  for(const name of Object.keys(optional))delete required[name];
  const require=createRequire(join(current,'package.json'));
  for(const name of [...new Set([...Object.keys(required),...Object.keys(optional)])].sort()){
   if(!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name))fail('stable_source_unverified');
   let dependency:string|undefined;
   for(const search of require.resolve.paths(name)??[]){const possible=join(search,name);if(existsSync(join(possible,'package.json'))){dependency=resolve(possible);break;}}
   if(!dependency){if(Object.hasOwn(optional,name))continue;fail('stable_source_unverified');}
   if(!within(dependency!,modules))fail('stable_source_unverified');
   assertNoRedirectedAncestors(dependency!);if(seen.has(dependency!))continue;seen.add(dependency!);
   const data=JSON.parse(readRegularFile(join(dependency!,'package.json'),{maxBytes:65536}).toString('utf8'));if(data.name!==name)fail('stable_source_unverified');
   walk(relative(root,dependency!).split(sep).join('/'),true);dependencies(dependency!,data);
  }
 }
 dependencies(root,metadata);
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 if(new Set(files.map(f=>f.path)).size!==files.length)fail('stable_source_unverified');
 return{files,version:metadata.version};
}
function manifestBody(manifest:Omit<StableManifest,'generation'>|StableManifest){return{schema_version:manifest.schema_version,kind:manifest.kind,version:manifest.version,home:manifest.home,node_path:manifest.node_path,launcher_revision:manifest.launcher_revision,bootstrap_sha256:manifest.bootstrap_sha256,launcher_sha256:manifest.launcher_sha256,files:manifest.files};}
function readManifest(root:string,home:string):StableManifest{
 const value=JSON.parse(readPrivate(join(root,'manifest.json'),stableRuntimeLimits.manifestBytes).toString('utf8'));
 if(!exact(value,['schema_version','kind','version','home','node_path','launcher_revision','bootstrap_sha256','launcher_sha256','files','generation'])||value.schema_version!==1||value.kind!=='aptly-stable-runtime'||value.launcher_revision!==1||value.home!==home||!cleanAbsolute(value.node_path)||typeof value.version!=='string'||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(value.version)||value.bootstrap_sha256!==bootstrapHash||!Array.isArray(value.files)||value.files.length>stableRuntimeLimits.files)fail('stable_runtime_unverified');
 const expectedLauncher=launcher(value.node_path,home);
 if(value.launcher_sha256!==digest(expectedLauncher)||readPrivate(join(root,'launch'),65536).toString('utf8')!==expectedLauncher||readPrivate(join(root,'bootstrap.cjs'),65536).toString('utf8')!==bootstrap||(lstatSync(join(root,'launch')).mode&0o100)===0)fail('stable_runtime_unverified');
 let bytes=0,previous='';for(const f of value.files){
  if(!exact(f,['path','size','sha256'])||!safeRelative(f.path)||f.path<=previous||!Number.isSafeInteger(f.size)||f.size<0||f.size>stableRuntimeLimits.fileBytes||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256))fail('stable_runtime_unverified');previous=f.path;bytes+=f.size;
 }
 if(bytes>stableRuntimeLimits.totalBytes||digest(JSON.stringify(manifestBody(value)))!==value.generation||basename(root)!==value.generation)fail('stable_runtime_unverified');
 return value as StableManifest;
}
function validatePayload(root:string,manifest:StableManifest,metadataOnly:boolean){
 const expected=new Map(manifest.files.map(f=>[f.path,f]));
 const pkgBytes=readPrivate(join(root,'payload/package.json'),65536),entry=expected.get('package.json');
 const pkg=JSON.parse(pkgBytes.toString('utf8'));
 if(!entry||digest(pkgBytes)!==entry.sha256||pkgBytes.length!==entry.size||pkg.name!=='aptly'||pkg.version!==manifest.version||pkg.type!=='module')fail('stable_runtime_unverified');
 if(metadataOnly)return;
 const directories=new Set(['']);for(const key of expected.keys()){const parts=key.split('/');parts.pop();while(parts.length){directories.add(parts.join('/'));parts.pop();}}
 const seen=new Set<string>();function walk(directory:string,path:string){
  privatePath(directory,true);for(const name of readdirSync(directory)){
   const target=join(directory,name),rel=path?path+'/'+name:name,s=lstatSync(target);if(s.isSymbolicLink())fail('stable_runtime_unverified');
   if(s.isDirectory()){if(!directories.has(rel))fail('stable_runtime_unverified');walk(target,rel);}else{const f=expected.get(rel);if(!f||seen.has(rel))fail('stable_runtime_unverified');const b=readPrivate(target,stableRuntimeLimits.fileBytes);if(b.length!==f.size||digest(b)!==f.sha256)fail('stable_runtime_unverified');seen.add(rel);}
  }
 }walk(join(root,'payload'),'');if(seen.size!==expected.size)fail('stable_runtime_unverified');
}
export function planStableRuntime(options:{packageRoot:string;home?:string;nodePath?:string}):StableRuntimePlan{
 platform();try{
  const root=canonicalAllowed(options.packageRoot),home=canonicalAllowed(options.home??homedir()),nodePath=options.nodePath??process.execPath;
  if(!cleanAbsolute(home)||!cleanAbsolute(nodePath)||!cleanAbsolute(options.packageRoot))fail('stable_source_unverified');
  // Existing parents may be absent in a dry run; never create them here.
  safeAncestors(home);
  let existing=baseFor(home);while(!existsSync(existing)){const parent=dirname(existing);if(parent===existing)fail('stable_runtime_unverified');existing=parent;}safeAncestors(existing);assertNoRedirectedAncestors(existing);if(existsSync(baseFor(home)))privatePath(baseFor(home),true);
  const captured=sourceFiles(root),body:Omit<StableManifest,'generation'>={schema_version:1,kind:'aptly-stable-runtime',version:captured.version,home,node_path:nodePath,launcher_revision:1,bootstrap_sha256:bootstrapHash,launcher_sha256:digest(launcher(nodePath,home)),files:captured.files.map(({path,size,sha256})=>({path,size,sha256}))};
  const generation=digest(JSON.stringify(body)),runtimeRoot=join(baseFor(home),generation),manifest:StableManifest={...body,generation};
  if(Buffer.byteLength(JSON.stringify(manifest)+'\n')>stableRuntimeLimits.manifestBytes)fail('stable_runtime_limit');
  const plan=frozen({command:join(runtimeRoot,'launch'),args:['serve'] as ['serve'],packageRoot:join(runtimeRoot,'payload'),payloadRoot:join(runtimeRoot,'payload'),runtimeRoot,version:captured.version,generation,manifest,integrity:'full' as const,descriptor:{command:join(runtimeRoot,'launch'),args:['serve'] as ['serve']}});
  if(existsSync(runtimeRoot)&&!validateStableRegistration(plan.descriptor,{home}))fail('stable_runtime_unverified');
  plans.set(plan,{root,files:captured.files});return plan;
 }catch(error){if(error instanceof Error&&['stable_source_changed','stable_runtime_limit','stable_runtime_unverified'].includes(error.message))throw error;fail('stable_source_unverified');}
}
function ensureDirectory(path:string,privateDirectory=false){
 safeAncestors(path);
 if(!existsSync(path)){const parent=dirname(path);if(parent!==path)ensureDirectory(parent);mkdirSync(path,{mode:0o700});}
 assertNoRedirectedAncestors(path);if(!lstatSync(path).isDirectory())fail('stable_runtime_unverified');if(privateDirectory)privatePath(path,true);
}
function assertSource(plan:StableRuntimePlan,capture:{root:string;files:CapturedFile[]}){
 const now=sourceFiles(capture.root);
 if(now.version!==plan.version||JSON.stringify(now.files)!==JSON.stringify(capture.files))fail('stable_source_changed');
}
function writeDurable(path:string,bytes:string|Buffer,mode:number){const fd=openSync(path,'wx',mode);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
function syncDirectory(path:string){const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_DIRECTORY??0));try{fsyncSync(fd);}finally{closeSync(fd);}}
function syncTree(path:string){for(const name of readdirSync(path)){const child=join(path,name);if(lstatSync(child).isDirectory())syncTree(child);}syncDirectory(path);}
export function materializeStableRuntime(plan:StableRuntimePlan):void{
 platform();const captured=plans.get(plan);if(!captured)fail('stable_plan_unverified');
 const base=dirname(plan.runtimeRoot),stage=join(base,'.aptly-runtime-stage-'+randomUUID()),lock=join(base,'.'+plan.generation+'.lock');let lockFd:number|undefined,lockIdentity:string|undefined,madeStage=false;
 try{
  assertSource(plan,captured!);ensureDirectory(dirname(base));ensureDirectory(base,true);
  if(existsSync(plan.runtimeRoot)){const existing=validateStableRegistration(plan.descriptor,{home:plan.manifest.home});if(!existing||existing.generation!==plan.generation)fail('stable_runtime_unverified');return;}
  try{lockFd=openSync(lock,'wx',0o600);const held=fstatSync(lockFd);lockIdentity=[held.dev,held.ino].join(':');}catch{fail('stable_runtime_busy');}
  if(existsSync(plan.runtimeRoot)){const current=validateStableRegistration(plan.descriptor,{home:plan.manifest.home});if(!current||current.generation!==plan.generation)fail('stable_runtime_unverified');return;}
  mkdirSync(stage,{mode:0o700});madeStage=true;mkdirSync(join(stage,'payload'),{mode:0o700});
  for(const file of captured!.files){
   const data=readRegularFile(file.source,{maxBytes:stableRuntimeLimits.fileBytes});if(identity(file.source)!==file.identity||data.length!==file.size||digest(data)!==file.sha256)fail('stable_source_changed');
   const target=join(stage,'payload',file.path);ensureDirectory(dirname(target),true);writeDurable(target,data,0o600);
  }
  writeDurable(join(stage,'bootstrap.cjs'),bootstrap,0o600);writeDurable(join(stage,'launch'),launcher(plan.manifest.node_path,plan.manifest.home),0o700);writeDurable(join(stage,'manifest.json'),JSON.stringify(plan.manifest)+'\n',0o600);
  validatePayload(stage,plan.manifest,false);assertSource(plan,captured!);syncTree(stage);syncDirectory(base);
  // Private lock serializes product writers. Same-UID hostile writers remain
  // outside the authentication boundary; no signature/OS sandbox is claimed.
  if(existsSync(plan.runtimeRoot))fail('stable_runtime_unverified');renameSync(stage,plan.runtimeRoot);madeStage=false;syncDirectory(base);
  if(!validateStableRegistration(plan.descriptor,{home:plan.manifest.home}))fail('stable_runtime_unverified');
 }catch(error){if(error instanceof Error&&['stable_source_changed','stable_runtime_limit','stable_runtime_busy','stable_plan_unverified'].includes(error.message))throw error;fail('stable_runtime_unverified');}
 finally{let cleanupFailed=false;try{if(madeStage)rmSync(stage,{recursive:true,force:true});}catch{cleanupFailed=true;}if(lockFd!==undefined){try{const held=lstatSync(lock);if([held.dev,held.ino].join(':')!==lockIdentity)cleanupFailed=true;else unlinkSync(lock);}catch{cleanupFailed=true;}finally{try{closeSync(lockFd);}catch{cleanupFailed=true;}}}if(cleanupFailed)fail('stable_runtime_unverified');}
}
export function validateStableRegistration(entry:unknown,{home=homedir(),metadataOnly=false}:{home?:string;metadataOnly?:boolean}={}):StableRegistration|null{
 const reference=stableReference(entry,{home});if(!reference)return null;
 platform();try{
  const selectedHome=canonicalAllowed(home),{command,runtimeRoot}=reference;checkedRoot(runtimeRoot,selectedHome);
  const before=identity(join(runtimeRoot,'manifest.json')),manifest=readManifest(runtimeRoot,selectedHome);validatePayload(runtimeRoot,manifest,metadataOnly);
  if(before!==identity(join(runtimeRoot,'manifest.json')))fail('stable_runtime_unverified');
  return frozen({command,args:['serve'] as ['serve'],packageRoot:join(runtimeRoot,'payload'),runtimeRoot,version:manifest.version,generation:manifest.generation,manifest,integrity:metadataOnly?'metadata' as const:'full' as const});
 }catch{fail('stable_runtime_unverified');}
}
export function stableObserverCommand(registration:StableRegistration,client:'codex'|'claude',policyPath:string):string{
 platform();try{
  if(!['codex','claude'].includes(client)||!cleanAbsolute(policyPath)||registration.integrity!=='full')fail('stable_runtime_unverified');
  const captured=plans.get(registration as StableRuntimePlan);
  if(captured)assertSource(registration as StableRuntimePlan,captured);
  else if(!validateStableRegistration({command:registration.command,args:registration.args},{home:registration.manifest.home}))fail('stable_runtime_unverified');
  return[registration.command,'observe','--client',client,'--policy-path',policyPath].map(quote).join(' ');
 }catch{fail('stable_runtime_unverified');}
}

function launcher(nodePath:string,home:string):string {
 return `#!/bin/sh
# Aptly immutable stable launcher v1. No login profiles or shell evaluation.
quiet=0
case "\${1-}" in observe) quiet=1;; serve) :;; *) printf '%s\\n' 'aptly: stable_runtime_unavailable' >&2; exit 1;; esac
stop() { if [ "$quiet" -eq 0 ]; then printf '%s\\n' 'aptly: stable_runtime_unavailable' >&2; exit 1; fi; exit 0; }
unset NODE_OPTIONS NODE_PATH NODE_REPL_EXTERNAL_MODULE
for utility in /usr/bin/env /usr/bin/uname /usr/bin/id /usr/bin/stat /usr/bin/sort /usr/bin/readlink /bin/date /bin/sleep; do
 [ -x "$utility" ] || stop
done
case "$0" in /*/launch) root=\${0%/launch};; *) stop;; esac
kernel=$(/usr/bin/uname -s) || stop
case "$kernel" in Darwin|Linux) :;; *) stop;; esac
owner=$(/usr/bin/id -u) || stop
started=$(/bin/date +%s) || stop
limit=10; probe_seconds=2
if [ "$quiet" -eq 1 ]; then limit=3; probe_seconds=1; fi
budget() { now=$(/bin/date +%s) || return 1; elapsed=$((now-started)); [ "$elapsed" -ge 0 ] && [ "$elapsed" -lt "$limit" ]; }
stat_item() {
 if [ "$kernel" = Darwin ]; then
  if [ "$2" = link ]; then info=$(/usr/bin/stat -f '%u:%Mp%Lp:%l' "$1" 2>/dev/null) || return 1
  else info=$(/usr/bin/stat -L -f '%u:%Mp%Lp:%l' "$1" 2>/dev/null) || return 1; fi
 else
  if [ "$2" = link ]; then info=$(/usr/bin/stat -c '%u:%a:%h' "$1" 2>/dev/null) || return 1
  else info=$(/usr/bin/stat -L -c '%u:%a:%h' "$1" 2>/dev/null) || return 1; fi
 fi
 user=\${info%%:*}; rest=\${info#*:}; bits=\${rest%%:*}; links=\${rest#*:}
 case "$bits" in ''|*[!0-7]*) return 1;; esac
}
qualify_chain() {
 item=$1
 while :; do
  if [ -L "$item" ]; then
   case "$item" in /tmp|/var|/etc)
    [ "$kernel" = Darwin ] || return 1
    [ "$(/usr/bin/readlink "$item")" = "private/\${item#/}" ] || return 1
    stat_item "$item" link || return 1; [ "$user" = 0 ] || return 1;;
    *) return 1;;
   esac
  fi
  stat_item "$item" follow || return 1
  [ "$user" = "$owner" ] || [ "$user" = 0 ] || return 1
  if [ "$((0$bits & 022))" -ne 0 ]; then
   [ -d "$item" ] && [ "$user" = 0 ] && [ "$((0$bits & 01000))" -ne 0 ] || return 1
  fi
  [ "$item" = / ] && break
  item=\${item%/*}; [ -n "$item" ] || item=/
 done
}
qualify_file() {
 [ -f "$1" ] && [ -r "$1" ] || return 1
 resolved=$1
 if [ -L "$1" ]; then
  [ "$2" = standard ] || return 1
  case "$1" in /opt/homebrew/bin/node|/usr/local/bin/node|/usr/bin/node) :;; *) return 1;; esac
  lexical=\${1%/*}; [ -n "$lexical" ] || lexical=/
  qualify_chain "$lexical" || return 1
  stat_item "$1" link || return 1
  [ "$user" = "$owner" ] || [ "$user" = 0 ] || return 1
  [ -x /usr/bin/realpath ] || return 1
  resolved=$(/usr/bin/realpath "$1" 2>/dev/null) || return 1
  case "$resolved" in /*) :;; *) return 1;; esac
  [ -f "$resolved" ] && [ ! -L "$resolved" ] || return 1
 fi
 qualify_chain "$resolved"
}
private_file() {
 [ -f "$1" ] && [ ! -L "$1" ] || return 1
 qualify_file "$1" private || return 1
 stat_item "$1" link || return 1
 [ "$user" = "$owner" ] && [ "$((0$bits & 077))" -eq 0 ] && [ "$links" = 1 ]
}
# Reject directories/FIFOs/links and unsafe ancestry BEFORE opening hash input.
private_file "$root/launch" && [ -x "$root/launch" ] || stop
private_file "$root/bootstrap.cjs" || stop
if [ -x /usr/bin/sha256sum ]; then sum=$(/usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C /usr/bin/sha256sum "$root/bootstrap.cjs" 2>/dev/null) || stop
elif [ -x /usr/bin/shasum ]; then sum=$(/usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C /usr/bin/shasum -a 256 "$root/bootstrap.cjs" 2>/dev/null) || stop
else stop; fi
[ "\${sum%% *}" = ${quote(bootstrapHash)} ] || stop
count=0
seen=
try_node() {
 candidate=$1; shift
 budget || stop
 case "$candidate" in /*) :;; *) return 1;; esac
 case "$candidate" in */../*|*/./*|*//*|*/..|*/.) return 1;; esac
 qualify_file "$candidate" standard || return 1
 candidate=$resolved
 [ -x "$candidate" ] || return 1
 case "$seen" in *"|$candidate|"*) return 1;; esac
 seen="$seen|$candidate|"
 [ "$count" -lt 6 ] || return 1
 budget || stop
 count=$((count+1))
 "$candidate" -e 'var v=process.version.match(/^v(\\d+)\\.\\d+\\.\\d+$/);process.exit(v&&Number(v[1])>=24?0:1)' </dev/null >/dev/null 2>&1 & probe=$!
 (
  sleeper=
  cleanup() { trap - TERM INT HUP; child=$sleeper; if [ -z "$child" ]; then child=$(jobs -p); fi; case "$child" in ''|*[!0-9]*) exit 0;; esac; kill "$child" 2>/dev/null; wait "$child" 2>/dev/null; exit 0; }
  trap cleanup TERM INT HUP
  /bin/sleep "$probe_seconds" & sleeper=$!
  wait "$sleeper" 2>/dev/null
  trap - TERM INT HUP
  kill -KILL "$probe" 2>/dev/null
 ) >/dev/null 2>&1 & watchdog=$!
 wait "$probe" 2>/dev/null; status=$?
 kill "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null
 budget || stop
 [ "$status" -eq 0 ] || return 1
 if [ "$quiet" -eq 1 ]; then
  observer_child=
  observer_cleanup() {
   trap - HUP INT TERM
   if [ -z "$observer_child" ]; then observer_child=$(jobs -p); fi
   case "$observer_child" in ''|*[!0-9]*) exit 0;; esac
   kill "$observer_child" 2>/dev/null
   wait "$observer_child" 2>/dev/null
   exit 0
  }
  trap observer_cleanup HUP INT TERM
  "$candidate" --no-warnings "$root/bootstrap.cjs" "$@" <&0 >/dev/null 2>&1 & observer_child=$!
  wait "$observer_child" 2>/dev/null
  trap - HUP INT TERM
  exit 0
 fi
 exec "$candidate" --no-warnings "$root/bootstrap.cjs" "$@"
}
# APTLY_CANDIDATES_BEGIN
# Installer -> fixed standard -> descending stable numeric nvm -> safe PATH.
try_node ${quote(nodePath)} "$@"
try_node /opt/homebrew/bin/node "$@"
try_node /usr/local/bin/node "$@"
try_node /usr/bin/node "$@"
savedIFS=$IFS
set +f
nvm_nodes=$(
 for node in ${quote(join(home,'.nvm','versions','node'))}/v*/bin/node; do
  version=\${node%/bin/node}; version=\${version##*/v}
  major=\${version%%.*}; rest=\${version#*.}; minor=\${rest%%.*}; patch=\${rest#*.}
  case "$major:$minor:$patch" in (*[!0-9:]*|:*|*::*|*:) continue ;; esac
  [ "$version" = "$major.$minor.$patch" ] || continue
  [ "$major" -ge 24 ] 2>/dev/null || continue
  printf '%s:%s:%s:%s\\n' "$major" "$minor" "$patch" "$node"
 done | /usr/bin/sort -t : -k1,1nr -k2,2nr -k3,3nr
)
IFS='\n'
set -f
for record in $nvm_nodes; do candidate=\${record#*:*:*:}; try_node "$candidate" "$@"; done
IFS=$savedIFS
IFS=:
set -f
for directory in \${PATH-}; do
 IFS=$savedIFS
 case "$directory" in /*) try_node "$directory/node" "$@";; esac
 IFS=:
done
IFS=$savedIFS
# APTLY_CANDIDATES_END
stop
`;
}
