import { createHmac } from 'node:crypto';
import { closeSync, existsSync, fstatSync, lstatSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { assertPrivateStatePath, readRegularFile } from './files.ts';
import { isRecord, type Client } from './types.ts';
import { QuerySnapshot } from './query-snapshot.ts';

export const STATISTICS_CONFIG_FILE = 'stats-config.json';
export const STATISTICS_KEY_FILE = 'stats-key';
export const STATISTICS_DATABASE_FILE = 'stats.sqlite';
export const STATISTICS_DB_FILE = STATISTICS_DATABASE_FILE;
export const STATISTICS_CONFIG_VERSION = 1;
export interface StatisticsConfig { schema_version: 1; enabled_clients: Client[]; codex_native_metadata?: boolean; codex_home?: string }
export interface StatisticsOptions { stateDirectory: string; now?: () => number; maxDelegations?: number; maxChildren?: number }
export type StatisticsHash = (domain: 'session'|'tool'|'child'|'task_path'|'request', client: Client, value: string) => string;
export interface StatisticsBridge { parentSessionHash: string; taskPathHash: string }
export interface StatisticsRecommendation {
 client: Client; sessionId?: string; toolUseId?: string; requestId?: string;
 disposition: 'auto'|'advisory'|'blocked'|'explicit_preserved'|'unbound';
 expected?: { profileId: string; model: string; effort?: string; catalogVersion?: string };
}
export type StatisticsResult = { status: 'recorded'|'ignored'|'unavailable'; reason?: string };
const require = createRequire(import.meta.url);
const APP_ID = 0x41505354;
const CAPACITY = 10_000;
const hashPattern = /^[a-f0-9]{64}$/;
const validClient = (v: unknown): v is Client => v === 'codex' || v === 'claude';
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !v.includes('\0') && !v.includes('${');
const secretLike = (v: string) => /(?:sk-|bearer(?:[ _.:-]|$)|api[_-]?key|access[_-]?token|secret[_-]?key)/i.test(v);
const model = (v: unknown): v is string => typeof v === 'string' && !secretLike(v) && /^(?:(?:gpt|claude)-[a-z0-9][a-z0-9.-]{0,79}|haiku|sonnet|opus|fable)$/.test(v);
const safeToken = (v: unknown): v is string => typeof v === 'string' && !secretLike(v) && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(v);
const effort = (v: unknown): v is string => typeof v === 'string' && /^(none|minimal|low|medium|high|xhigh|max|ultra)$/.test(v);
const ignored = (reason: string): StatisticsResult => ({status:'ignored', reason});
export function parseStatisticsConfig(value: unknown): StatisticsConfig | null {
 if (!isRecord(value) || value.schema_version !== 1 || !Array.isArray(value.enabled_clients) || value.enabled_clients.length > 2 ||
  !value.enabled_clients.every(validClient) || new Set(value.enabled_clients).size !== value.enabled_clients.length ||
  Object.keys(value).some(k => !['schema_version','enabled_clients','codex_native_metadata','codex_home'].includes(k)) ||
  (value.codex_native_metadata !== undefined && typeof value.codex_native_metadata !== 'boolean') ||
  (value.codex_home !== undefined && (typeof value.codex_home !== 'string' || !isAbsolute(value.codex_home) || value.codex_home.includes('\0'))) ||
  (value.codex_native_metadata === true && value.codex_home === undefined)) return null;
 return value as unknown as StatisticsConfig;
}
export function serializeStatisticsConfig(value: StatisticsConfig): string {
 if (!parseStatisticsConfig(value)) throw new Error('statistics_config_invalid');
 return JSON.stringify(value, null, 2) + '\n';
}
export function loadStatisticsConfig(options: StatisticsOptions): StatisticsConfig | null {
 try { const path=join(options.stateDirectory,STATISTICS_CONFIG_FILE);privateFile(path);return parseStatisticsConfig(JSON.parse(readRegularFile(path,{privateFile:true,maxBytes:8192}).toString('utf8'))); }
 catch { return null; }
}
export function statisticsHash(key: string, domain: Parameters<StatisticsHash>[0], client: Client, value: string): string {
 if (!hashPattern.test(key) || !id(value) || !validClient(client)) throw new Error('statistics_hash_invalid');
 return createHmac('sha256',Buffer.from(key,'hex')).update(JSON.stringify(['aptly-stats-v1',domain,client,value])).digest('hex');
}
export function loadStatisticsHash(options: StatisticsOptions): StatisticsHash | null {
 try {
  privateFile(join(options.stateDirectory,STATISTICS_KEY_FILE));
  const key = readRegularFile(join(options.stateDirectory,STATISTICS_KEY_FILE),{privateFile:true,maxBytes:65}).toString('utf8');
  if (!/^[a-f0-9]{64}\n$/.test(key)) return null;
  return (domain,client,value) => statisticsHash(key.trim(),domain,client,value);
 } catch { return null; }
}
function privateFile(path: string, absent = false) {
 assertPrivateStatePath(path);
 try {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error('statistics_private_file');
  return stat;
 } catch (error) { if (absent && isRecord(error) && error.code === 'ENOENT') return; throw error; }
}
function checkSidecars(path: string) {
 if (existsSync(path+'-wal') || existsSync(path+'-shm')) throw new Error('statistics_wal_unsupported');
 privateFile(path+'-journal',true);
}
function initialize(path: string) {
 // Exclusive reservation never overwrites an existing file and has no hard-link
 // publication window. Incomplete/crashed initialization is deliberately left
 // unavailable for manual review; observers never remove or reinitialize it.
 let fd:number;
 try { fd=openSync(path,'wx',0o600); }
 catch(error) { if(isRecord(error)&&error.code==='EEXIST')return;throw error; }
 const reserved=fstatSync(fd);closeSync(fd);
 const before=privateFile(path)!;
 if(reserved.dev!==before.dev||reserved.ino!==before.ino)throw new Error('statistics_identity_changed');
 const {DatabaseSync: Database} = require('node:sqlite') as typeof import('node:sqlite');
 const db = new Database(path);
 try {
   const after=privateFile(path)!;
   if(before.dev!==after.dev||before.ino!==after.ino)throw new Error('statistics_identity_changed');
   db.exec(`PRAGMA busy_timeout=50; PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE;
    PRAGMA application_id=${APP_ID}; PRAGMA user_version=1;
    CREATE TABLE delegations(id TEXT PRIMARY KEY, client TEXT NOT NULL, session TEXT, created INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE children(id TEXT PRIMARY KEY, client TEXT NOT NULL, session TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE metadata(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT INTO metadata VALUES ('capacity_reached',0); COMMIT;`);
 } finally { db.close(); }
}
function connection(options: StatisticsOptions, write: boolean): DatabaseSync | null {
 const path = join(options.stateDirectory,STATISTICS_DATABASE_FILE);
 if (!write && !existsSync(path)) return null;
 assertPrivateStatePath(path);
 if (!existsSync(path)) { if (!write) return null; initialize(path); }
 const before = privateFile(path)!; checkSidecars(path);
 const {DatabaseSync: Database} = require('node:sqlite') as typeof import('node:sqlite');
 const db = new Database(path,{readOnly:!write,enableDoubleQuotedStringLiterals:false});
 try {
  const after = privateFile(path)!;
  if (before.dev !== after.dev || before.ino !== after.ino) throw new Error('statistics_identity_changed');
  db.exec('PRAGMA busy_timeout=50');
  if (db.prepare('PRAGMA application_id').get()?.application_id !== APP_ID || db.prepare('PRAGMA user_version').get()?.user_version !== 1 ||
   db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete') throw new Error('statistics_database_invalid');
  if (write) db.exec('PRAGMA max_page_count=8192; PRAGMA secure_delete=ON; BEGIN IMMEDIATE');
  return db;
 } catch(error) { db.close(); throw error; }
}
type Disposition = StatisticsRecommendation['disposition'];
interface Expected { profileId: string; model: string; effort?: string; catalogHash?: string }
interface Delegation { disposition?: Disposition; expected?: Expected; child?: string; path?: string; conflict?: boolean; applied?: string[]; appliedUnknown?: boolean; toolObserved?: boolean }
interface Child { path?: string; started?: boolean; stopped?: boolean; complete?: boolean; models?: string[]; conflict?: boolean; unknownModel?: boolean }
type Row<T> = { id:string; client:Client; session:string; created:number; data:T };
function rows<T>(db: DatabaseSync, table: 'delegations'|'children'): Row<T>[] {
 return db.prepare(`SELECT * FROM ${table} ORDER BY created,id`).all().map(row=>({...row,data:JSON.parse(String(row.data))})) as unknown as Row<T>[];
}
function limit(value: number | undefined) { if (value === undefined) return CAPACITY; if (!Number.isInteger(value) || value < 1 || value > CAPACITY) throw new Error('statistics_capacity_invalid'); return value; }
function get<T>(db: DatabaseSync,table:'delegations'|'children',key:string):T|null { const row=db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(key); return row?JSON.parse(String(row.data)) as T:null; }
function save(db: DatabaseSync,table:'delegations'|'children',key:string,client:Client,session:string,data:object,options:StatisticsOptions) {
 if (get(db,table,key) !== null) { db.prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(JSON.stringify(data),key); return; }
 const cap = limit(table==='delegations'?options.maxDelegations:options.maxChildren);
 if (Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n) >= cap) { db.prepare("UPDATE metadata SET value=1 WHERE key='capacity_reached'").run(); return; }
 db.prepare(`INSERT INTO ${table}(id,client,session,created,data) VALUES(?,?,?,?,?)`).run(key,client,session,Math.floor((options.now??Date.now)()),JSON.stringify(data));
}
function transact(options:StatisticsOptions,client:Client,fn:(db:DatabaseSync,hash:StatisticsHash)=>void):StatisticsResult {
 if (!loadStatisticsConfig(options)?.enabled_clients.includes(client)) return ignored('collection_disabled');
 const hash=loadStatisticsHash(options); if (!hash) return {status:'unavailable',reason:'statistics_key_unavailable'};
 let db:DatabaseSync|null=null;
 try { db=connection(options,true); fn(db!,hash); db!.exec('COMMIT'); return {status:'recorded'}; }
 catch { if(db)try{db.exec('ROLLBACK');}catch{} return {status:'unavailable',reason:'statistics_store_unavailable'}; }
 finally { try{db?.close();}catch{} }
}
const combined=(hash:StatisticsHash,client:Client,kind:'tool'|'child',session:string,value:string)=>hash(kind,client,JSON.stringify([hash('session',client,session),hash(kind,client,value)]));
function expectedValue(input:StatisticsRecommendation,hash:StatisticsHash):Expected|undefined {
 const e=input.expected;
 if (!e || !safeToken(e.profileId) || !model(e.model) || (e.effort !== undefined && !effort(e.effort)) || (e.catalogVersion !== undefined && !id(e.catalogVersion))) return;
 return {profileId:e.profileId,model:e.model,...(e.effort?{effort:e.effort}:{}),...(e.catalogVersion?{catalogHash:hash('request',input.client,e.catalogVersion)}:{})};
}
export function recordStatisticsRecommendation(options:StatisticsOptions,input:StatisticsRecommendation):StatisticsResult {
 if(!validClient(input.client)||!['auto','advisory','blocked','explicit_preserved','unbound'].includes(input.disposition))return ignored('invalid_recommendation');
 const bound=id(input.sessionId)&&id(input.toolUseId)&&input.disposition!=='unbound';
 if(!bound&&!id(input.requestId))return ignored('missing_binding');
 return transact(options,input.client,(db,hash)=>{
  const key=bound?combined(hash,input.client,'tool',input.sessionId!,input.toolUseId!):hash('request',input.client,input.requestId!);
  const value=get<Delegation>(db,'delegations',key)??{};
  const disposition=bound?input.disposition:'unbound';
  const expected=expectedValue(input,hash);
  if (['auto','advisory'].includes(disposition)&&!expected)throw new Error('statistics_expected_invalid');
  if(value.disposition&&(value.disposition!==disposition||JSON.stringify(value.expected)!==JSON.stringify(expected)))value.conflict=true;
  else {value.disposition=disposition;value.expected=expected;}
  save(db,'delegations',key,input.client,bound?hash('session',input.client,input.sessionId!):'',value,options);
 });
}
function union(values:string[]|undefined,value:string):string[]{return [...new Set([...(values??[]),value])].sort();}
function modelEvidence(child:Child,value:unknown){if(model(value)){const next=union(child.models,value);if(next.length>16)child.conflict=true;else child.models=next;}else child.unknownModel=true;}
function toolResponse(value:unknown):Record<string,unknown>|null {
 if(isRecord(value))return value;
 if(typeof value==='string'&&Buffer.byteLength(value)<=32768)try{const parsed=JSON.parse(value);return isRecord(parsed)?parsed:null;}catch{}
 return null;
}
export function observeStatistics(options:StatisticsOptions,input:{client:Client;event:unknown},bridge?:StatisticsBridge):StatisticsResult {
 const {client,event}=input;
 if(!validClient(client)||!isRecord(event)||!id(event.session_id))return ignored('invalid_event');
 const session=event.session_id;
 const name=event.hook_event_name;
 const tool=name==='PostToolUse';
 if(tool&&event.tool_use_id!==undefined&&event.tool_call_id!==undefined&&event.tool_use_id!==event.tool_call_id)return ignored('conflicting_tool_binding');
 const toolId=event.tool_use_id??event.tool_call_id;
 const phase=name==='SubagentStart'?'start':name==='SubagentStop'?'stop':client==='codex'&&name==='PostModelRequest'?'request':null;
 if(tool&&(!id(toolId)||!(client==='claude'?event.tool_name==='Agent'||event.tool_name==='Task':event.tool_name==='collaborationspawn_agent'||event.tool_name==='spawn_agent'||event.tool_name==='collaboration.spawn_agent')))return ignored('unsupported_tool');
 if(!tool&&(!phase||!id(event.agent_id)))return ignored('unsupported_event');
 return transact(options,client,(db,hash)=>{
  const sessionHash=hash('session',client,session);
  if(tool){
   const response=toolResponse(event.tool_response);
   const key=combined(hash,client,'tool',session,toolId as string);
   const value=get<Delegation>(db,'delegations',key)??{};
   value.toolObserved=true;
   const actualChild=client==='claude'?response?.agentId:response?.agent_id;
   if(id(actualChild)){const childKey=combined(hash,client,'child',session,actualChild);if(value.child&&value.child!==childKey)value.conflict=true;else value.child=childKey;}
   if(client==='codex'&&id(response?.task_name)) {const path=hash('task_path',client,response.task_name);if(value.path&&value.path!==path)value.conflict=true;else value.path=path;}
   // Fingerprint only allowed model/effort fields, never retain original arguments.
   const args=isRecord(event.tool_input)?event.tool_input:null;
   const actualModel=args?.model;
   const actualEffort=args?.reasoning_effort!==undefined?args.reasoning_effort:args?.effort;
   const conflictingEfforts=args&&args.reasoning_effort!==undefined&&args.effort!==undefined&&args.reasoning_effort!==args.effort;
   if(response&&!conflictingEfforts&&model(actualModel)&&(actualEffort===undefined||effort(actualEffort)))value.applied=union(value.applied,JSON.stringify([actualModel,actualEffort??null]));
   else value.appliedUnknown=true;
   if((value.applied?.length??0)>4){value.applied=value.applied!.slice(0,4);value.conflict=true;}
   save(db,'delegations',key,client,sessionHash,value,options);
   if(client==='claude'&&value.child&&response){
    const child=get<Child>(db,'children',value.child)??{};
    if(response.status==='completed'){
     child.complete=true;modelEvidence(child,response.resolvedModel);
     if(Array.isArray(response.modelsUsed)) {if(response.modelsUsed.length>16)child.conflict=true;for(const m of response.modelsUsed.slice(0,16))modelEvidence(child,m);}
     else if(response.modelsUsed!==undefined)child.unknownModel=true;
    }else if(response.status==='async_launched')child.started=true;
    save(db,'children',value.child,client,sessionHash,child,options);
   }
  } else {
   const key=combined(hash,client,'child',session,event.agent_id as string);
   const value=get<Child>(db,'children',key)??{};
   if(phase==='start')value.started=true;
   if(phase==='stop')value.stopped=true;
   if(phase==='request'&&event.status==='completed'&&(event.error===null||event.error===undefined)){value.complete=true;modelEvidence(value,event.model);}
   if(bridge&&client==='codex'){
    if(!hashPattern.test(bridge.parentSessionHash)||!hashPattern.test(bridge.taskPathHash)||bridge.parentSessionHash!==sessionHash)value.conflict=true;
    else if(value.path&&value.path!==bridge.taskPathHash)value.conflict=true;
    else value.path=bridge.taskPathHash;
   }
   save(db,'children',key,client,sessionHash,value,options);
  }
 });
}
export type ModelState='model_match'|'model_mismatch'|'model_changed'|'unknown'|'pending'|'expired_pending'|'application_unconfirmed';
const emptyCounts=():Record<ModelState,number>=>({model_match:0,model_mismatch:0,model_changed:0,unknown:0,pending:0,expired_pending:0,application_unconfirmed:0});
function confirmed(d:Delegation){return !d.appliedUnknown&&!!d.expected&&d.applied?.length===1&&d.applied[0]===JSON.stringify([d.expected.model,d.expected.effort??null]);}
function modelState(d:Delegation,c:Child|undefined,ambiguous:boolean,created:number,now:number):ModelState{
 if(d.conflict||ambiguous||c?.conflict)return 'unknown';
 if(d.disposition==='auto'&&!confirmed(d))return !d.toolObserved&&!c?(now-created>86400000?'expired_pending':'pending'):'application_unconfirmed';
 if(!c?.complete)return c?.stopped?'unknown':now-created>86400000?'expired_pending':'pending';
 if((c.models?.length??0)>1)return 'model_changed';
 if(c.unknownModel||!c.models?.length||!d.expected)return 'unknown';
 const expected=d.expected.model,actual=c.models[0];
 // No family-prefix guessing: aliases are not versioned execution evidence.
 if(['haiku','sonnet','opus','fable'].includes(expected)||['haiku','sonnet','opus','fable'].includes(actual))return 'unknown';
 return expected===actual?'model_match':'model_mismatch';
}
type StatisticsFilter = {client?:Client|'all';today?:boolean};
function readStatisticsInternal(options:StatisticsOptions,filter:StatisticsFilter,snapshot?:QuerySnapshot){
 const now=(options.now??Date.now)();
 const output={status:'ok',scope:'retained_records',semantics:'retained_routing_records_not_user_acceptance_or_execution_total',observation_completeness:'best_effort_not_full_execution_history',today_basis:'UTC_binding_creation',filter:{client:filter.client??'all',today:filter.today===true},
  collection:{codex:false,claude:false},capacity:{delegations:limit(options.maxDelegations),children:limit(options.maxChildren),reached:false},
  delegations:0,auto:emptyCounts(),advisory:emptyCounts(),blocked:0,explicit_preserved:0,unbound:0,
  effort_actual_unknown:0,application_confirmed:0,unknown_alias_count:0,model_observed:0,model_comparable:0,model_match_denominator:0,observation_denominator:0,
  usage_scope:'not_collected',model_alias_scope:'exact_canonical_model_ids_only',counts_are_lifetime:false};
 let failed=false;
 let config:StatisticsConfig|null=null;
 let configAbsent=false;
 if(snapshot){
  try {
   const bytes=snapshot.read(join(options.stateDirectory,STATISTICS_CONFIG_FILE),{privateFile:true,maxBytes:8192,singleLink:true});
   if(bytes===null)configAbsent=true;
   else {config=parseStatisticsConfig(JSON.parse(bytes.toString('utf8')));if(!config)failed=true;}
  }catch{failed=true;}
 }else config=loadStatisticsConfig(options);
 for(const client of config?.enabled_clients??[])output.collection[client]=true;
 if(snapshot&&configAbsent)try{
  if(snapshot.track(join(options.stateDirectory,STATISTICS_KEY_FILE),{privateFile:true,singleLink:true,identityOnly:true}))failed=true;
 }catch{failed=true;}
 const collectionExpected=!!config?.enabled_clients.some(client=>!filter.client||filter.client==='all'||filter.client===client);
 let db:DatabaseSync|null=null;
 try{
  if(snapshot){
   let present:boolean|undefined;
   try{present=snapshot.track(join(options.stateDirectory,STATISTICS_DATABASE_FILE),{privateFile:true,singleLink:true,identityOnly:true});}
   catch{failed=true;}
   if(present===false){if(collectionExpected)failed=true;return {result:output,failed};}
   if(present&&configAbsent)failed=true;
  }
  db=connection(options,false);if(!db){if(snapshot&&collectionExpected)failed=true;return {result:output,failed};}
  // All projection inputs must come from one SQLite snapshot. Separate implicit
  // SELECT transactions can otherwise combine old bindings with new child facts.
  db.exec('BEGIN');
  output.capacity.reached=db.prepare("SELECT value FROM metadata WHERE key='capacity_reached'").get()?.value===1;
  const delegates=rows<Delegation>(db,'delegations');const children=rows<Child>(db,'children');
  // Index retained metadata once: a bounded store must also have bounded query work.
  const childrenById=new Map(children.map(row=>[row.id,row]));
  const childrenByPath=new Map<string,Row<Child>[]>();
  const delegationsByPath=new Map<string,Set<string>>();
  const delegationsByChild=new Map<string,Set<string>>();
  const pathKey=(client:Client,session:string,path:string)=>JSON.stringify([client,session,path]);
  for(const child of children)if(child.data.path){const key=pathKey(child.client,child.session,child.data.path);const list=childrenByPath.get(key)??[];list.push(child);childrenByPath.set(key,list);}
  for(const row of delegates){
   if(row.data.path){const key=pathKey(row.client,row.session,row.data.path);const set=delegationsByPath.get(key)??new Set<string>();set.add(row.id);delegationsByPath.set(key,set);}
   if(row.data.child){const set=delegationsByChild.get(row.data.child)??new Set<string>();set.add(row.id);delegationsByChild.set(row.data.child,set);}
  }
  const today=new Date(now).toISOString().slice(0,10);
  for(const row of delegates){
   const d=row.data;if(!d.disposition||(filter.client&&filter.client!=='all'&&row.client!==filter.client)||(filter.today&&new Date(row.created).toISOString().slice(0,10)!==today))continue;
   output.delegations++;
   if(d.disposition==='unbound'||d.disposition==='blocked'||d.disposition==='explicit_preserved'){output[d.disposition]++;continue;}
   const direct=d.child?childrenById.get(d.child):undefined;
   const matches=d.child?(direct&&direct.client===row.client&&direct.session===row.session?[direct]:[]):d.path?childrenByPath.get(pathKey(row.client,row.session,d.path))??[]:[];
   const child=matches.length===1?matches[0]:undefined;
   // A reused canonical path or child cannot retroactively certify either call.
   const contenders=new Set<string>();
   const add=(ids:Set<string>|undefined)=>{for(const id of ids??[])if(id!==row.id)contenders.add(id);};
   if(d.path)add(delegationsByPath.get(pathKey(row.client,row.session,d.path)));
   if(d.child)add(delegationsByChild.get(d.child));
   if(child){add(delegationsByChild.get(child.id));if(child.data.path)add(delegationsByPath.get(pathKey(row.client,row.session,child.data.path)));}
   const pathConflict=!!(d.path&&child?.data.path&&d.path!==child.data.path);
   const childPathAmbiguous=!!(child?.data.path&&(childrenByPath.get(pathKey(row.client,row.session,child.data.path))?.length??0)>1);
   const otherPathChild=!!(d.child&&d.path&&childrenByPath.get(pathKey(row.client,row.session,d.path))?.some(other=>other.id!==d.child));
   const ambiguous=matches.length>1||contenders.size>0||pathConflict||childPathAmbiguous||otherPathChild;
   const validEvidence=!ambiguous&&!d.conflict&&!!child&&!child.data.conflict&&child.data.complete===true&&!child.data.unknownModel&&!!child.data.models?.length;
   const state=modelState(d,child?.data,ambiguous,row.created,now);
   output[d.disposition][state]++;output.effort_actual_unknown++;
   if(state==='unknown'&&validEvidence&&child!.data.models!.length===1&&d.expected&&
    (d.disposition!=='auto'||confirmed(d))&&[d.expected.model,child!.data.models![0]].some(m=>['haiku','sonnet','opus','fable'].includes(m)))output.unknown_alias_count++;
   if(d.disposition==='auto'){
    output.observation_denominator++;
    if(confirmed(d)&&!d.conflict)output.application_confirmed++;
    if(validEvidence)output.model_observed++;
    if(state==='model_match'||state==='model_mismatch'){output.model_comparable++;output.model_match_denominator++;}
   }
  }
  return {result:output,failed};
 }catch{output.status='unavailable';return {result:output,failed:true};}finally{try{db?.exec('ROLLBACK');}catch{}try{db?.close();}catch{}}
}

/** Existing best-effort projection, including its historical status semantics. */
export function readStatistics(options:StatisticsOptions,filter:StatisticsFilter={}){
 return readStatisticsInternal(options,filter).result;
}

/** Read the same projection while reporting query failures separately. */
export function readStatisticsQuery(options:StatisticsOptions,filter:StatisticsFilter={},snapshot?:QuerySnapshot){
 const owned=snapshot===undefined;
 const view=snapshot??new QuerySnapshot();
 const outcome=readStatisticsInternal(options,filter,view);
 if(owned)try{view.verify();}catch{outcome.failed=true;}
 return outcome;
}
