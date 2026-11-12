import { lstatSync,readlinkSync,openSync,fstatSync,readSync,closeSync,constants } from 'node:fs';
import { dirname,isAbsolute,resolve } from 'node:path';
import { errorCode } from './types.ts';
import { assertWindowsPrivatePath } from './windows-private.ts';

// macOS root-owned compatibility aliases are part of the OS filesystem layout,
// not operator/config redirects. Arbitrary user-owned symlinks stay forbidden.
export function systemAliasAllowed(path: string,stat: {uid: number},target: string,platform: string=process.platform): boolean{
 const aliases: Record<string,string>={'/tmp':'private/tmp','/var':'private/var','/etc':'private/etc'};
 return platform==='darwin'&&stat.uid===0&&Object.hasOwn(aliases,path)&&aliases[path]===target;
}
export function assertNoRedirectedAncestors(path: unknown): asserts path is string {
 if(typeof path!=='string'||!isAbsolute(path))throw new Error('unsafe_path');
 let current=resolve(path);
 while(true){
  const stat=lstatSync(current);
  if(stat.isSymbolicLink()&&!systemAliasAllowed(current,stat,readlinkSync(current)))throw new Error('unsafe_path');
  const parent=dirname(current);if(parent===current)break;current=parent;
 }
}
export function assertPrivateStatePath(path: unknown): asserts path is string {
 if(typeof path!=='string'||!isAbsolute(path))throw new Error('private_state_path_required');
 assertNoRedirectedAncestors(dirname(path));
 const parent=lstatSync(dirname(path));
 if(!parent.isDirectory()||(process.platform!=='win32'&&((parent.mode&0o077)||(process.getuid&&parent.uid!==process.getuid()))))throw new Error('private_state_directory_required');
 if(process.platform==='win32')assertWindowsPrivatePath(dirname(path));
 try{
  const file=lstatSync(path);
  if(!file.isFile()||file.isSymbolicLink()||(process.platform!=='win32'&&process.getuid&&file.uid!==process.getuid()))throw new Error('private_state_file_required');
  if(process.platform==='win32')assertWindowsPrivatePath(path);
 }catch(error){if(errorCode(error)!=='ENOENT')throw error;}
}

/** Bounded nonblocking read; no raw path or parser message is part of its error. */
export function readRegularFile(path: unknown,{privateFile=false,maxBytes=65536}: {privateFile?: boolean;maxBytes?: number}={}): Buffer {
 let fd: number | undefined;
 try{
  assertNoRedirectedAncestors(path);
  const before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink()||before.size>maxBytes)throw new Error('unsafe_file');
  fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  const stat=fstatSync(fd);
  if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||stat.size>maxBytes||
   (privateFile&&process.platform!=='win32'&&((stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))))throw new Error('unsafe_file');
  if(privateFile&&process.platform==='win32')assertWindowsPrivatePath(path);
  const buffer=Buffer.alloc(Math.min(maxBytes+1,stat.size+1));let size=0;
  while(size<buffer.length){const count=readSync(fd,buffer,size,buffer.length-size,null);if(!count)break;size+=count;}
  if(size>maxBytes||size>stat.size||fstatSync(fd).size!==stat.size)throw new Error('unsafe_file');
  return buffer.subarray(0,size);
 }finally{if(fd!==undefined)closeSync(fd);}
}
