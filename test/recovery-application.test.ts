import test from 'node:test';
import assert from 'node:assert/strict';
import { validRecoveryApplication } from '../src/recovery-application.ts';

function fixture(){return {status:'recommended',application:'advisory_only',profile:{id:'codex-deep',client:'codex',model:'gpt-6.1-sol',reasoning_effort:'medium'},
 spawn_application:{status:'caller_review_required',reason:'native_execution_not_observed',required_fields:['model','reasoning_effort'],on_unavailable:'stop_and_report',next_action:'apply_returned_defaults'},
 next_call:{tool:'spawn_agent',set_if_unspecified:{model:'gpt-6.1-sol',reasoning_effort:'medium'},preserve:'all_other_arguments_and_history'}};}
test('retry and partial pins have exactly the returned missing fields',()=>{
 const v=fixture();assert.equal(validRecoveryApplication(v,'codex'),true);
 delete v.next_call.set_if_unspecified.model;v.spawn_application.required_fields=['reasoning_effort'];
 assert.equal(validRecoveryApplication(v,'codex',['model']),true);
 assert.equal(validRecoveryApplication(v,'codex',['reasoning_effort']),false);
});
test('malformed application combinations fail instead of gaining apply instructions',()=>{
 const edits=[
  v=>delete v.next_call.set_if_unspecified.model,
  v=>{v.spawn_application.required_fields=['model','model'];},
  v=>{v.spawn_application.permission_granted=true;},
  v=>{v.next_call.set_if_unspecified.model=undefined;},
  v=>{v.next_call.set_if_unspecified.reasoning_effort='secret /path';},
  v=>{v.next_call.set_if_unspecified.model='different';},
  v=>{v.status='needs_context';},
  v=>{v.spawn_application={status:'blocked',reason:'inherited_context_application_unverified'};},
  v=>delete v.next_call,
 ];
 for(const edit of edits){const v=fixture();edit(v);assert.equal(validRecoveryApplication(v,'codex'),false);}
});
test('blocked and non-recommended outcomes have no apply data',()=>{
 for(const status of ['recommended','needs_context','unavailable','keep_current']){
  const v={status,application:'advisory_only',spawn_application:{status:'blocked',reason:'history_semantics_unverified'}};
  assert.equal(validRecoveryApplication(v,'codex'),true);
 }
 const v={status:'needs_context',application:'advisory_only',spawn_application:{status:'caller_review_required',reason:'native_execution_not_observed'}};
 assert.equal(validRecoveryApplication(v,'codex'),true);
});
test('Claude cannot receive effort or a Codex native call',()=>{
 const v=fixture();v.profile={id:'claude-simple',client:'claude',model:'haiku'};
 v.next_call={tool:'Agent',set_if_unspecified:{model:'haiku'},preserve:'all_other_arguments_and_history'};
 v.spawn_application.required_fields=['model'];assert.equal(validRecoveryApplication(v,'claude'),true);
 v.next_call.set_if_unspecified.reasoning_effort='medium';v.spawn_application.required_fields.push('reasoning_effort');
 assert.equal(validRecoveryApplication(v,'claude'),false);
});
test('fresh call requires standalone history, full profile and unobserved execution',()=>{
 const v=fixture();v.status='prepared';v.execution='not_observed';v.spawn_application.reason='explicit_profile_arguments_required';v.spawn_application.next_action='submit_prepared_call';
 v.next_call={tool:'spawn_agent',arguments:{task_name:'synthetic_review',message:'Review only supplied synthetic code.',fork_turns:'none',model:'gpt-6.1-sol',reasoning_effort:'medium'}};
 assert.equal(validRecoveryApplication(v,'codex'),true);
 v.next_call.arguments.fork_turns='all';assert.equal(validRecoveryApplication(v,'codex'),false);
});
