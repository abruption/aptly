import test from 'node:test';
import assert from 'node:assert/strict';
import {RoutingObservations} from '../src/routing-observations.ts';
import {initialHookObservation} from '../src/automatic-hook.ts';
const event=(id='private-call')=>({hook_event_name:'PreToolUse',session_id:'private-session',tool_use_id:id,tool_name:'spawn_agent',cwd:'/private-directory',tool_input:{message:'Private synthetic task text',task_name:'private-label',fork_turns:'all'}});
test('observations require the exact session, call and input and never disclose their raw values',()=>{
 const records=new RoutingObservations(),ev=event();assert.equal(records.lookup('codex',ev).preflight,'not_observed');
 records.begin('codex',ev);const observed=records.lookup('codex',ev);assert.equal(observed.preflight,'observed');assert.equal(observed.status,'pending');assert.equal(observed.execution,'not_observed');
 assert.match(observed.correlation_id,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(observed),/private|Private|task_name|fork_turns/);
 for(const changed of [{...ev,session_id:'another'},{...ev,tool_use_id:'another'},{...ev,cwd:'/another'},{...ev,tool_input:{...ev.tool_input,fork_turns:'none'}}])assert.equal(records.lookup('codex',changed).preflight,'not_observed');
 observed.status='arguments_updated';assert.equal(records.lookup('codex',ev).status,'pending');
 assert.equal(new RoutingObservations().lookup('codex',ev).preflight,'not_observed');
});
test('observations expire and evict at bounded capacity; lookup cannot create evidence',()=>{
 let now=0;const records=new RoutingObservations(()=>now);
 for(let i=0;i<129;i++)records.record({...initialHookObservation('codex',event(String(i))),status:'preserved',reason:'explicit_model'});
 assert.equal(records.lookup('codex',event('0')).preflight,'not_observed');assert.equal(records.lookup('codex',event('1')).preflight,'observed');
 now=600_000;assert.equal(records.lookup('codex',event('128')).preflight,'not_observed');assert.equal(records.lookup('codex',{}).reason,'invalid_event');
});
test('retry ID lookup separates original preflight, classified recovery and rejected duplicates',()=>{
 const records=new RoutingObservations(),ev=event(),retry_id='a'.repeat(64);
 records.record({...initialHookObservation('codex',ev),status:'awaiting_context',reason:'insufficient_context',retry_id});
 records.recordRetry(retry_id,{status:'recommended',reason:'allowed_profile',request_id:retry_id,profile_id:'codex-simple',latency_ms:10,
  profile:{model:'PRIVATE_MODEL_SENTINEL'},description:'PRIVATE_DESCRIPTION_SENTINEL',seed:{private:'PRIVATE_SEED_SENTINEL'},spawn_application:{status:'blocked'}});
 const result=records.lookupRetry(retry_id);assert.equal(result.status,'awaiting_context');assert.equal(result.reason,'insufficient_context');
 assert.equal(result.context_retry.outcome.status,'recommended');assert.equal(result.context_retry.outcome.application,'blocked');
 assert.equal(result.context_retry.outcome.profile_id,'codex-simple');assert.equal(result.execution,'not_observed');
 assert.equal(result.context_retry.outcome.classification,'provider_requested');
 records.recordRetry(retry_id,{status:'unavailable',reason:'context_retry_conflict',description:'PRIVATE_DUPLICATE_SENTINEL'});
 const after=records.lookup('codex',ev);assert.equal(after.context_retry.outcome.status,'recommended');assert.equal(after.context_retry.last_attempt.reason,'context_retry_conflict');
 assert.doesNotMatch(JSON.stringify(after),/PRIVATE_|private-call|Private|private-session/);
 assert.equal(new RoutingObservations().lookupRetry(retry_id).preflight,'not_observed');
});
test('retry observations do not renew lifetime or fabricate absent preflight',()=>{
 let now=0;const records=new RoutingObservations(()=>now),retry_id='b'.repeat(64);
 records.recordRetry(retry_id,{status:'recommended',request_id:retry_id});assert.equal(records.lookupRetry(retry_id).preflight,'not_observed');
 records.record({...initialHookObservation('codex',event()),status:'awaiting_context',retry_id});now=590000;
 records.recordRetry(retry_id,{status:'unavailable',reason:'context_retry_expired'});assert.equal(records.lookupRetry(retry_id).context_retry.last_attempt.reason,'context_retry_expired');
 now=600000;assert.equal(records.lookupRetry(retry_id).preflight,'not_observed');
});
