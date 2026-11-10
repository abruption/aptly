import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createTestTemp } from '../test-support/temp.ts';
import { STATISTICS_CONFIG_FILE, STATISTICS_DATABASE_FILE, STATISTICS_KEY_FILE, loadStatisticsHash, observeStatistics, parseStatisticsConfig, readStatistics, recordStatisticsRecommendation, serializeStatisticsConfig, type StatisticsOptions } from '../src/statistics.ts';

const posix={skip:process.platform==='win32'};
function fixture(t,extra={}){
 const stateDirectory=createTestTemp(t,'codex-statistics-');
 const options:StatisticsOptions={stateDirectory,...extra};
 writeFileSync(join(stateDirectory,STATISTICS_CONFIG_FILE),serializeStatisticsConfig({schema_version:1,enabled_clients:['codex','claude']}),{mode:0o600});
 writeFileSync(join(stateDirectory,STATISTICS_KEY_FILE),randomBytes(32).toString('hex')+'\n',{mode:0o600});
 return options;
}
const expected={profileId:'codex-simple',model:'gpt-6-luna',effort:'max'};
function recommend(o:StatisticsOptions,tool='tool-one',disposition:'auto'|'advisory'='auto'){
 return recordStatisticsRecommendation(o,{client:'codex',sessionId:'parent-private',toolUseId:tool,disposition,expected});
}
function post(o:StatisticsOptions,tool='tool-one',path='/root/private_task',child?:string){
 return observeStatistics(o,{client:'codex',event:{hook_event_name:'PostToolUse',session_id:'parent-private',tool_use_id:tool,tool_name:'collaborationspawn_agent',tool_input:{model:expected.model,reasoning_effort:'max',message:'DO NOT PERSIST THIS TASK'},tool_response:JSON.stringify({task_name:path,...(child?{agent_id:child}:{})})}});
}
function request(o:StatisticsOptions,child='private-child',actual='gpt-6-luna',path='/root/private_task'){
 const hash=loadStatisticsHash(o)!;
 return observeStatistics(o,{client:'codex',event:{hook_event_name:'PostModelRequest',session_id:'parent-private',agent_id:child,status:'completed',error:null,model:actual,token_usage:{input_tokens:999}}},{parentSessionHash:hash('session','codex','parent-private'),taskPathHash:hash('task_path','codex',path)});
}
test('statistics absent/disabled reads create nothing and invalid config fails closed',posix,t=>{
 const stateDirectory=createTestTemp(t,'codex-statistics-'); const o={stateDirectory};
 assert.equal(readStatistics(o).delegations,0);assert.deepEqual(readdirSync(stateDirectory),[]);
 assert.equal(recommend(o).reason,'collection_disabled');assert.deepEqual(readdirSync(stateDirectory),[]);
 assert.equal(parseStatisticsConfig({schema_version:1,enabled_clients:['codex','codex']}),null);
 assert.equal(parseStatisticsConfig({schema_version:1,enabled_clients:['codex'],codex_native_metadata:true}),null);
});
test('out-of-order exact path bridge survives restart and repeated callbacks once',posix,t=>{
 const o=fixture(t);
 assert.equal(request(o).status,'recorded');post(o);recommend(o);
 for(let i=0;i<3;i++){request({...o});post({...o});recommend({...o});}
 const r=readStatistics({...o});assert.equal(r.delegations,1);assert.equal(r.auto.model_match,1);
 assert.equal(r.effort_actual_unknown,1);assert.equal(r.model_match_denominator,1);assert.equal(r.usage_scope,'not_collected');
 assert.equal(r.application_confirmed,1);assert.equal(r.semantics,'retained_routing_records_not_user_acceptance_or_execution_total');
 const db=readFileSync(join(o.stateDirectory,STATISTICS_DATABASE_FILE));
 for(const secret of ['parent-private','private-child','/root/private_task','DO NOT PERSIST THIS TASK','input_tokens'])assert.equal(db.includes(Buffer.from(secret)),false,secret);
 assert.equal(db.includes(Buffer.from('gpt-6-luna')),true);
 assert.equal(readStatistics(o,{client:'claude'}).delegations,0);
});
test('multiple actual requests preserve mismatch and model change instead of last-write wins',posix,t=>{
 const o=fixture(t);recommend(o);post(o);request(o,'private-child','gpt-6-sol');
 assert.equal(readStatistics(o).auto.model_mismatch,1);
 request(o);assert.equal(readStatistics(o).auto.model_changed,1);assert.equal(readStatistics(o).auto.model_match,0);
});
test('applied arguments must confirm immutable expected model and effort',posix,t=>{
 const o=fixture(t);recommend(o);request(o);
 observeStatistics(o,{client:'codex',event:{hook_event_name:'PostToolUse',session_id:'parent-private',tool_use_id:'tool-one',tool_name:'collaborationspawn_agent',tool_response:'{"task_name":"/root/private_task"}'}});
 assert.equal(readStatistics(o).auto.application_unconfirmed,1);
 post(o);assert.equal(readStatistics(o).auto.application_unconfirmed,1);
 recordStatisticsRecommendation(o,{client:'codex',sessionId:'parent-private',toolUseId:'tool-one',disposition:'auto',expected:{...expected,model:'gpt-6-sol'}});
 assert.equal(readStatistics(o).auto.unknown,1);
});
test('same parent and canonical path reused invalidates both previously and newly bound calls',posix,t=>{
 const o=fixture(t);recommend(o);post(o);request(o);assert.equal(readStatistics(o).auto.model_match,1);
 recommend(o,'tool-two');post(o,'tool-two');
 assert.equal(readStatistics(o).auto.unknown,2);assert.equal(readStatistics(o).auto.model_match,0);
 assert.equal(readStatistics(o).model_observed,0);
});
test('duplicate child identity and conflicting bridge never certify an execution',posix,t=>{
 const o=fixture(t);recommend(o);post(o,'tool-one','/root/one','same-child');request(o,'same-child','gpt-6-luna','/root/one');
 recommend(o,'tool-two');post(o,'tool-two','/root/two','same-child');
 assert.equal(readStatistics(o).auto.unknown,2);
 assert.equal(readStatistics(o).model_observed,0);
 request(o,'same-child','gpt-6-luna','/root/conflict');assert.equal(readStatistics(o).auto.model_match,0);
});
test('Claude completion is model-only, alias uncertain, modelsUsed changes remain visible',posix,t=>{
 const o=fixture(t);
 const rec=(tool,selected)=>recordStatisticsRecommendation(o,{client:'claude',sessionId:'claude-session',toolUseId:tool,disposition:'auto',expected:{profileId:'claude-simple',model:selected}});
 const event=(tool,selected,modelsUsed?)=>observeStatistics(o,{client:'claude',event:{hook_event_name:'PostToolUse',session_id:'claude-session',tool_use_id:tool,tool_name:'Agent',tool_input:{model:selected},tool_response:{status:'completed',agentId:tool+'-child',resolvedModel:'claude-haiku-5-5',...(modelsUsed?{modelsUsed}:{}),usage:{input_tokens:9999}}}});
 rec('alias','haiku');event('alias','haiku');assert.equal(readStatistics(o).auto.unknown,1);
 rec('optional-alias','fable');event('optional-alias','fable');assert.equal(readStatistics(o).auto.unknown,2);assert.equal(readStatistics(o).unknown_alias_count,2);
 rec('canonical','claude-haiku-5-5');event('canonical','claude-haiku-5-5');assert.equal(readStatistics(o).auto.model_match,1);
 rec('changed','claude-haiku-5-5');event('changed','claude-haiku-5-5',['claude-haiku-5-5','claude-sonnet-5-5']);assert.equal(readStatistics(o).auto.model_changed,1);
 assert.equal(readStatistics(o).effort_actual_unknown,4);
});
test('background launch and stop without completed model evidence are not model matches',posix,t=>{
 const o=fixture(t);recordStatisticsRecommendation(o,{client:'claude',sessionId:'session',toolUseId:'tool',disposition:'auto',expected:{profileId:'claude-simple',model:'claude-haiku-5-5'}});
 observeStatistics(o,{client:'claude',event:{hook_event_name:'PostToolUse',session_id:'session',tool_use_id:'tool',tool_name:'Agent',tool_input:{model:'claude-haiku-5-5'},tool_response:{status:'async_launched',agentId:'child',resolvedModel:'claude-haiku-5-5'}}});
 assert.equal(readStatistics(o).auto.pending,1);
 observeStatistics(o,{client:'claude',event:{hook_event_name:'SubagentStop',session_id:'session',agent_id:'child'}});
 assert.equal(readStatistics(o).auto.unknown,1);
});
test('advisory, blocked, explicit and unbound have separate denominators',posix,t=>{
 const o=fixture(t);recommend(o,'advice','advisory');post(o,'advice');request(o);
 for(const disposition of ['blocked','explicit_preserved'] as const)recordStatisticsRecommendation(o,{client:'codex',sessionId:'parent-private',toolUseId:disposition,disposition});
 recordStatisticsRecommendation(o,{client:'codex',requestId:'manual-request',disposition:'unbound',expected});
 const r=readStatistics(o);assert.equal(r.advisory.model_match,1);assert.equal(r.blocked,1);assert.equal(r.explicit_preserved,1);assert.equal(r.unbound,1);assert.equal(r.observation_denominator,0);assert.equal(r.model_match_denominator,0);
});
test('capacity freezes new identities, allows old merges, and UTC today uses immutable creation',posix,t=>{
 let now=Date.UTC(2026,10,10,23,59);const o=fixture(t,{now:()=>now,maxDelegations:1,maxChildren:1});
 recommend(o);post(o);now+=120000;request(o);recommend(o,'second');
 const r=readStatistics(o);assert.equal(r.delegations,1);assert.equal(r.auto.model_match,1);assert.equal(r.capacity.reached,true);
 assert.equal(readStatistics(o,{today:true}).delegations,0);assert.equal(r.counts_are_lifetime,false);
});
test('pending expiry is a projection and repeated recommendation does not renew its age',posix,t=>{
 let now=Date.UTC(2026,10,10);const o=fixture(t,{now:()=>now});recommend(o);
 assert.equal(readStatistics(o).auto.pending,1);now+=86400001;recommend(o);
 assert.equal(readStatistics(o).auto.expired_pending,1);assert.equal(readStatistics(o).delegations,1);
});
test('Codex start/stop configured models and failed requests do not become actual model evidence',posix,t=>{
 const o=fixture(t);recommend(o);post(o,'tool-one','/root/private_task','private-child');
 for(const hook_event_name of ['SubagentStart','SubagentStop'])observeStatistics(o,{client:'codex',event:{hook_event_name,session_id:'parent-private',agent_id:'private-child',model:'gpt-6-luna'}});
 observeStatistics(o,{client:'codex',event:{hook_event_name:'PostModelRequest',session_id:'parent-private',agent_id:'private-child',model:'gpt-6-luna',status:'failed',error:{message:'RAW FAILURE MUST NOT PERSIST'}}});
 const r=readStatistics(o);assert.equal(r.auto.unknown,1);assert.equal(r.model_observed,0);
 assert.equal(readFileSync(join(o.stateDirectory,STATISTICS_DATABASE_FILE)).includes(Buffer.from('RAW FAILURE')),false);
});
test('missing/private-invalid key or foreign database fails softly without replacing it',posix,t=>{
 const o=fixture(t);chmodSync(join(o.stateDirectory,STATISTICS_KEY_FILE),0o644);assert.equal(recommend(o).status,'unavailable');assert.equal(existsSync(join(o.stateDirectory,STATISTICS_DATABASE_FILE)),false);
 chmodSync(join(o.stateDirectory,STATISTICS_KEY_FILE),0o600);
 const path=join(o.stateDirectory,STATISTICS_DATABASE_FILE);writeFileSync(path,'foreign database',{mode:0o600});
 assert.equal(recommend(o).status,'unavailable');assert.equal(readStatistics(o).status,'unavailable');assert.equal(readFileSync(path,'utf8'),'foreign database');
});
test('unsafe hardlinked database is rejected and installation HMAC domains differ',posix,t=>{
 const o=fixture(t);recommend(o);const hash=loadStatisticsHash(o)!;
 assert.notEqual(hash('session','codex','a'),hash('task_path','codex','a'));
 assert.notEqual(hash('session','codex','a'),loadStatisticsHash(fixture(t))!('session','codex','a'));
 linkSync(join(o.stateDirectory,STATISTICS_DATABASE_FILE),join(o.stateDirectory,'db-alias'));
 assert.equal(recommend(o).status,'unavailable');assert.equal(readStatistics(o).status,'unavailable');
});
test('hardlinked config or key is rejected and disabled collection never initializes storage',posix,t=>{
 const configLinked=fixture(t);linkSync(join(configLinked.stateDirectory,STATISTICS_CONFIG_FILE),join(configLinked.stateDirectory,'config-alias'));
 assert.equal(recommend(configLinked).reason,'collection_disabled');assert.equal(existsSync(join(configLinked.stateDirectory,STATISTICS_DATABASE_FILE)),false);
 const keyLinked=fixture(t);linkSync(join(keyLinked.stateDirectory,STATISTICS_KEY_FILE),join(keyLinked.stateDirectory,'key-alias'));
 assert.equal(recommend(keyLinked).reason,'statistics_key_unavailable');assert.equal(loadStatisticsHash(keyLinked),null);
 const disabled=fixture(t);writeFileSync(join(disabled.stateDirectory,STATISTICS_CONFIG_FILE),serializeStatisticsConfig({schema_version:1,enabled_clients:[]}));
 assert.equal(recommend(disabled).reason,'collection_disabled');assert.equal(existsSync(join(disabled.stateDirectory,STATISTICS_DATABASE_FILE)),false);
});
test('secret-shaped model and profile metadata cannot persist as plaintext',posix,t=>{
 const o=fixture(t);
 for(const [profileId,selected] of [['sk-private-profile','gpt-6-luna'],['codex-simple','gpt-sk-private-model'],['Bearer.private','gpt-6-luna']]){
  assert.equal(recordStatisticsRecommendation(o,{client:'codex',sessionId:'session',toolUseId:profileId,disposition:'auto',expected:{profileId,model:selected}}).status,'unavailable');
 }
 recommend(o);post(o);request(o,'private-child','gpt-sk-private-hostmodel');
 assert.equal(readStatistics(o).auto.unknown,1);
 const bytes=readFileSync(join(o.stateDirectory,STATISTICS_DATABASE_FILE));
 for(const secret of ['sk-private-profile','gpt-sk-private-model','Bearer.private','gpt-sk-private-hostmodel'])assert.equal(bytes.includes(Buffer.from(secret)),false);
});
test('repeated missing or invalid applied arguments permanently invalidate confirmation',posix,t=>{
 for(const badInput of [undefined,{}, {model:'gpt-6-luna',reasoning_effort:'max',effort:'high'}, {model:'gpt-6-luna',reasoning_effort:null}, {model:'gpt-sk-private-model'}]){
  const o=fixture(t);recommend(o);post(o);request(o);assert.equal(readStatistics(o).auto.model_match,1);
  observeStatistics(o,{client:'codex',event:{hook_event_name:'PostToolUse',session_id:'parent-private',tool_use_id:'tool-one',tool_name:'spawn_agent',tool_input:badInput,tool_response:{task_name:'/root/private_task'}}});
  post(o);const r=readStatistics(o);assert.equal(r.auto.model_match,0);assert.equal(r.auto.application_unconfirmed,1);assert.equal(r.application_confirmed,0);
 }
});
test('tool_call_id fallback matches server bindings while conflicting IDs fail closed',posix,t=>{
 const o=fixture(t);recommend(o);request(o);
 const base={hook_event_name:'PostToolUse',session_id:'parent-private',tool_name:'spawn_agent',tool_input:{model:'gpt-6-luna',reasoning_effort:'max'},tool_response:{task_name:'/root/private_task'}};
 assert.equal(observeStatistics(o,{client:'codex',event:{...base,tool_call_id:'tool-one'}}).status,'recorded');assert.equal(readStatistics(o).auto.model_match,1);
 assert.equal(observeStatistics(o,{client:'codex',event:{...base,tool_use_id:'tool-one',tool_call_id:'different'}}).reason,'conflicting_tool_binding');
 assert.equal(readStatistics(o).delegations,1);
});
test('literal template IDs cannot bind or create observed children',posix,t=>{
 const o=fixture(t);
 assert.equal(recordStatisticsRecommendation(o,{client:'codex',sessionId:'${SESSION}',toolUseId:'tool',disposition:'auto',expected}).reason,'missing_binding');
 assert.equal(observeStatistics(o,{client:'codex',event:{hook_event_name:'SubagentStart',session_id:'parent',agent_id:'${CHILD}'}}).reason,'unsupported_event');
 assert.equal(existsSync(join(o.stateDirectory,STATISTICS_DATABASE_FILE)),false);
});
test('unknown alias count requires solely alias uncertainty in valid single-model evidence',posix,t=>{
 const o=fixture(t);
 for(const tool of ['alias-one','alias-two'])recordStatisticsRecommendation(o,{client:'codex',sessionId:'parent-private',toolUseId:tool,disposition:'auto',expected:{profileId:'alias-profile',model:'haiku'}});
 const args={model:'haiku'};
 const toolEvent=(tool)=>({hook_event_name:'PostToolUse',session_id:'parent-private',tool_use_id:tool,tool_name:'spawn_agent',tool_input:args,tool_response:{task_name:'/root/alias_task'}});
 observeStatistics(o,{client:'codex',event:toolEvent('alias-one')});
 assert.equal(readStatistics(o).unknown_alias_count,0);
 const hash=loadStatisticsHash(o)!;
 observeStatistics(o,{client:'codex',event:{hook_event_name:'PostModelRequest',session_id:'parent-private',agent_id:'child-alias',status:'completed',model:'claude-haiku-5-5'}},{parentSessionHash:hash('session','codex','parent-private'),taskPathHash:hash('task_path','codex','/root/alias_task')});
 assert.equal(readStatistics(o).unknown_alias_count,1);
 observeStatistics(o,{client:'codex',event:toolEvent('alias-two')});
 const r=readStatistics(o);assert.equal(r.auto.unknown,2);assert.equal(r.unknown_alias_count,0);assert.equal(r.model_observed,0);
});
test('a direct child binding cannot override contradictory canonical path evidence',posix,t=>{
 const o=fixture(t);recommend(o);post(o,'tool-one','/root/private_task','direct-child');
 observeStatistics(o,{client:'codex',event:{hook_event_name:'PostModelRequest',session_id:'parent-private',agent_id:'direct-child',status:'completed',model:'gpt-6-luna'}});
 request(o,'other-child');const r=readStatistics(o);assert.equal(r.auto.unknown,1);assert.equal(r.model_observed,0);assert.equal(r.auto.model_match,0);
});
test('initialization uses a single-link exclusive file and never repairs unknown incomplete storage',posix,t=>{
 const o=fixture(t);recommend(o);const path=join(o.stateDirectory,STATISTICS_DATABASE_FILE);
 assert.equal(lstatSync(path).nlink,1);assert.equal(readdirSync(o.stateDirectory).some(name=>name.includes('.init-')),false);
 const incomplete=fixture(t);const incompletePath=join(incomplete.stateDirectory,STATISTICS_DATABASE_FILE);writeFileSync(incompletePath,'',{mode:0o600});
 assert.equal(recommend(incomplete).status,'unavailable');assert.equal(readStatistics(incomplete).status,'unavailable');assert.equal(readFileSync(incompletePath).length,0);assert.equal(lstatSync(incompletePath).nlink,1);
});
test('one read transaction prevents mixing old delegations with newer conflicting child facts',posix,t=>{
 const o=fixture(t);recommend(o);post(o);
 const original=DatabaseSync.prototype.prepare;
 const interleaved:string[]=[];let injected=false;
 DatabaseSync.prototype.prepare=function(sql){
  const statement=original.call(this,sql);
  if(sql==='SELECT * FROM delegations ORDER BY created,id'){
   const all=statement.all;
   statement.all=function(...args){
    const snapshot=all.apply(this,args);
    if(!injected){
     injected=true;
     // Each collector call opens a separate SQLite connection. Without a read
     // transaction these would commit between the delegation/child SELECTs,
     // producing a match from a view that never contained the competing call.
     interleaved.push(recommend(o,'tool-two').status);
     interleaved.push(post(o,'tool-two').status);
     interleaved.push(request(o).status);
    }
    return snapshot;
   };
  }
  return statement;
 };
 let view;
 try{view=readStatistics(o);}finally{DatabaseSync.prototype.prepare=original;}
 assert.equal(injected,true);assert.deepEqual(interleaved,['unavailable','unavailable','unavailable']);
 assert.equal(view.status,'ok');assert.equal(view.delegations,1);assert.equal(view.auto.pending,1);assert.equal(view.auto.model_match,0);
 // The view releases its snapshot even on the read-only path, allowing later
 // callbacks to commit and expose the now genuinely ambiguous two-call state.
 recommend(o,'tool-two');post(o,'tool-two');request(o);
 assert.equal(readStatistics(o).auto.unknown,2);
});
test('successful concurrent process observations count once, while bounded contention may decline capture',posix,async t=>{
 const o=fixture(t);recommend(o);post(o);
 const source=new URL('../src/statistics.ts',import.meta.url).href;
 const script=`import {observeStatistics,loadStatisticsHash} from ${JSON.stringify(source)};
 const o=JSON.parse(process.argv[1]);const hash=loadStatisticsHash(o);
 const result=observeStatistics(o,{client:'codex',event:{hook_event_name:'PostModelRequest',session_id:'parent-private',agent_id:'private-child',status:'completed',model:'gpt-6-luna'}},{parentSessionHash:hash('session','codex','parent-private'),taskPathHash:hash('task_path','codex','/root/private_task')});
 process.stdout.write(result.status);`;
 const statuses=await Promise.all(Array.from({length:4},()=>new Promise<string>((resolve,reject)=>{
  const child=spawn(process.execPath,['--no-warnings','--input-type=module','-e',script,JSON.stringify(o)],{stdio:'pipe'});
  let output='';child.stdout.on('data',part=>{output+=part;});
  child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error('concurrent writer failed')));
 })));
 assert.ok(statuses.every(status=>status==='recorded'||status==='unavailable'));assert.ok(statuses.includes('recorded'));
 assert.equal(readStatistics(o).auto.model_match,1);assert.equal(readStatistics(o).delegations,1);
});
