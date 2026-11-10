import { isAbsolute, join } from 'node:path';
import { assertPrivateStatePath, readRegularFile } from './files.ts';
import { isRecord } from './types.ts';
/** Metadata-only policy reader; deliberately has no provider or credential dependency. */
export function statisticsState(path: unknown): string | null {
 try {
  assertPrivateStatePath(path);
  const value:unknown=JSON.parse(readRegularFile(path,{privateFile:true,maxBytes:4096}).toString('utf8'));
  if(!isRecord(value)||![1,2].includes(value.schema_version as number)||value.kind!=='aptly-auto-hook'||value.issuer!=='operator_installation'||typeof value.enabled!=='boolean'||!['defaults','advisory'].includes(String(value.mode))||typeof value.state_directory!=='string'||!isAbsolute(value.state_directory))return null;
  const keys=['schema_version','kind','mode','issuer','enabled','state_directory',...(value.schema_version===2?['transmission']:[])];
  if(Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||value.schema_version===2&&!['none','description','excerpt','unselected'].includes(String(value.transmission)))return null;
  assertPrivateStatePath(join(value.state_directory,'.stats-check'));return value.state_directory;
 }catch{return null;}
}
