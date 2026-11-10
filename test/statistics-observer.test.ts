import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTestTemp } from '../test-support/temp.ts';
import { setupHosts, setStatisticsCollection } from '../src/setup.ts';
import { recordStatisticsRecommendation, readStatistics } from '../src/statistics.ts';

const posix={skip:process.platform==='win32'?'statistics collection is unsupported on Windows':false};
const parent='00000000-0000-4000-8000-000000000001';
const child='00000000-0000-4000-8000-000000000002';
const other='00000000-0000-4000-8000-000000000003';
const task='/root/sort_fixture';
function fixture(t,native=true) {
 const home=createTestTemp(t,'codex-stats-observer-');
 const options={home,env:{},packageRoot:resolve('.'),clients:['codex']};
 assert.equal(setupHosts(options).status,'complete');
 assert.equal(setStatisticsCollection(true,{...options,codexNativeMetadata:native}).status,'complete');
 const codexHome=join(home,'.codex'), stateDirectory=join(codexHome,'aptly','state');
 const receipt=JSON.parse(readFileSync(join(codexHome,'aptly','stats-ownership.json'),'utf8'));
 const nativeDb=new DatabaseSync(join(codexHome,'state_5.sqlite'));
 nativeDb.exec('CREATE TABLE threads(id TEXT PRIMARY KEY, source TEXT NOT NULL, agent_path TEXT)');
 nativeDb.close();
 assert.equal(recordStatisticsRecommendation({stateDirectory},{client:'codex',sessionId:parent,toolUseId:'tool-fixture',disposition:'auto',expected:{profileId:'codex-simple',model:'gpt-6-luna',effort:'max'}}).status,'recorded');
 const send=(event)=>{
  const command=receipt.hooks[event.hook_event_name].hooks[0].command;
  const result=spawnSync('/bin/sh',['-c',command],{input:JSON.stringify(event),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,HOME:home}});
  assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
 };
 const insert=(sourceParent=parent,path=task,columnPath=path)=>{
  const db=new DatabaseSync(join(codexHome,'state_5.sqlite'));
  db.prepare('INSERT INTO threads VALUES(?,?,?)').run(child,JSON.stringify({subagent:{thread_spawn:{parent_thread_id:sourceParent,depth:1,agent_path:path}}}),columnPath);
  db.close();
 };
 const post=()=>send({hook_event_name:'PostToolUse',session_id:parent,tool_use_id:'tool-fixture',tool_name:'collaborationspawn_agent',tool_input:{model:'gpt-6-luna',reasoning_effort:'max'},tool_response:JSON.stringify({task_name:task})});
 const request=()=>send({hook_event_name:'PostModelRequest',session_id:parent,agent_id:child,turn_id:'child-turn',status:'completed',error:null,model:'gpt-6-luna'});
 const stop=()=>send({hook_event_name:'SubagentStop',session_id:parent,agent_id:child,turn_id:'child-turn',model:'gpt-6-luna'});
 return {insert,post,request,stop,view:()=>readStatistics({stateDirectory})};
}
test('registered observer joins task-name-only response to exact native child',posix,t=>{
 const f=fixture(t); f.insert(); f.post(); f.request(); f.stop();
 const v=f.view();assert.equal(v.auto.model_match,1);assert.equal(v.delegations,1);assert.equal(v.effort_actual_unknown,1);
});
test('stop retries exact metadata after native row becomes available',posix,t=>{
 const f=fixture(t);f.post();f.request();assert.equal(f.view().auto.model_match,0);
 f.insert();f.stop();assert.equal(f.view().auto.model_match,1);
});
test('no bridge when native metadata is disabled',posix,t=>{
 const f=fixture(t,false);f.insert();f.post();f.request();f.stop();
 assert.equal(f.view().auto.model_match,0);
});
test('wrong native parent or path never joins task-name response',posix,t=>{
 for(const [sourceParent,path,column] of [[other,task,task],[parent,'/root/other','/root/other'],[parent,task,'/root/other']]){
  const f=fixture(t);f.insert(sourceParent,path,column);f.post();f.request();f.stop();
  assert.equal(f.view().auto.model_match,0);assert.equal(f.view().auto.model_mismatch,0);
 }
});
