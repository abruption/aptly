/** Checked, bounded observations for read-only CLI queries; never an atomic multi-file snapshot. */
import {lstatSync,readlinkSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {assertPrivateStatePath,readRegularFile,systemAliasAllowed} from './files.ts';
import {assertWindowsPrivatePath} from './windows-private.ts';

interface Options {privateFile?:boolean;directory?:boolean;singleLink?:boolean;identityOnly?:boolean;maxBytes?:number}
interface Metadata {dev:number;ino:number;mode:number;uid:number;gid:number;nlink:number;size:number;mtime:number;ctime:number;directory:boolean}
interface Observation {metadata:Metadata|null;options:Options;bytes?:Buffer}
function metadata(path:string):Metadata|null {
 try {
  const s=lstatSync(path);
  if(s.isSymbolicLink()&&!systemAliasAllowed(path,s,readlinkSync(path)))throw new Error('unsafe_configuration_file');
  return {dev:s.dev,ino:s.ino,mode:s.mode,uid:s.uid,gid:s.gid,nlink:s.nlink,size:s.size,mtime:s.mtimeMs,ctime:s.ctimeMs,directory:s.isDirectory()};
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
function signature(value:Metadata|null,identityOnly=false):string {
 if(value===null)return 'absent';
 const {dev,ino,mode,uid,gid,nlink,size,mtime,ctime,directory}=value;
 return JSON.stringify(directory?{dev,ino,mode,uid,gid,directory}:identityOnly?{dev,ino,mode,uid,gid,nlink,directory}:{dev,ino,mode,uid,gid,nlink,size,mtime,ctime,directory});
}
export class QuerySnapshot {
 private observations=new Map<string,Observation>();
 private remember(path:string,value:Metadata|null,options:Options={}) {
  const old=this.observations.get(path);
  if(old&&signature(old.metadata,old.options.identityOnly)!==signature(value,old.options.identityOnly))throw new Error('concurrent_configuration_change');
  if(!old)this.observations.set(path,{metadata:value,options:{...options}});
  else old.options={...old.options,...options,privateFile:old.options.privateFile||options.privateFile,singleLink:old.options.singleLink||options.singleLink};
 }
 track(path:string,options:Options={}):boolean {
  if(typeof path!=='string'||!isAbsolute(path))throw new Error('unsafe_configuration_file');
  path=resolve(path);const value=metadata(path);this.remember(path,value,options);
  for(let parent=dirname(path);;parent=dirname(parent)){
   this.remember(parent,metadata(parent),{directory:true,identityOnly:true});if(dirname(parent)===parent)break;
  }
  if(value===null){
   // Missing content does not make an existing insecure private parent safe.
   if(options.privateFile&&!options.directory&&this.observations.get(dirname(path))?.metadata!==null)assertPrivateStatePath(path);
   return false;
  }
  if(options.directory?!value.directory:value.directory||(value.mode&0o170000)!==0o100000)throw new Error('unsafe_configuration_file');
  if(options.singleLink&&!value.directory&&value.nlink!==1)throw new Error('unsafe_configuration_file');
  if(options.privateFile){
   if(options.directory){
    if(process.platform==='win32')assertWindowsPrivatePath(path);
    else if((value.mode&0o077)||(process.getuid&&value.uid!==process.getuid()))throw new Error('private_directory_permissions');
   }else assertPrivateStatePath(path);
   if(!options.directory&&process.platform!=='win32'&&((value.mode&0o077)||(process.getuid&&value.uid!==process.getuid())))throw new Error('private_file_permissions');
  }
  return true;
 }
 read(path:string,options:Options={}):Buffer|null {
  if(typeof path!=='string'||!isAbsolute(path))throw new Error('unsafe_configuration_file');
  path=resolve(path);if(!this.track(path,options))return null;
  const bytes=readRegularFile(path,{privateFile:options.privateFile,maxBytes:options.maxBytes??4*1024*1024});
  const observed=this.observations.get(path)!;
  if(signature(observed.metadata)!==signature(metadata(path)))throw new Error('concurrent_configuration_change');
  if(observed.bytes&&!observed.bytes.equals(bytes))throw new Error('concurrent_configuration_change');
  observed.bytes=bytes;observed.options={...observed.options,...options};return bytes;
 }
 verify():void {
  for(const [path,observation]of this.observations){
   if(signature(observation.metadata,observation.options.identityOnly)!==signature(metadata(path),observation.options.identityOnly))throw new Error('concurrent_configuration_change');
   if(observation.bytes){
    const bytes=readRegularFile(path,{privateFile:observation.options.privateFile,maxBytes:observation.options.maxBytes??4*1024*1024});
    if(!observation.bytes.equals(bytes)||signature(observation.metadata)!==signature(metadata(path)))throw new Error('concurrent_configuration_change');
   }
  }
 }
}
