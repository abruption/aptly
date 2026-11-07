import test from 'node:test';
import assert from 'node:assert/strict';
import { SpawnContexts } from '../src/spawn-context.ts';
const event=()=>({hook_event_name:'PreToolUse',session_id:'synthetic-session',tool_use_id:'synthetic-call',tool_name:'spawn_agent',tool_input:{task_name:'cleanup_merged_worktrees',message:'gAAAAA'+'A'.repeat(96),fork_turns:'all'}});
const description='Review three synthetic merged worktrees. Return a cleanup plan, do not execute commands.';
test('context association includes client, session, call and original invocation; duplicate registration is immutable',()=>{
 const contexts=new SpawnContexts(),ev=event();
 assert.equal(contexts.register('codex',ev,description,4000).status,'registered');
 assert.equal(contexts.register('codex',ev,description,4000).status,'registered');
 assert.equal(contexts.register('codex',ev,description+' More details.',4000).reason,'context_conflict');
 for(const patch of [{tool_input:{...ev.tool_input,model:'changed'}},{cwd:'/synthetic'},{tool_name:'collaborationspawn_agent'}]){
  assert.equal(contexts.lookup('codex',{...ev,...patch})?.reason,'context_mismatch');
 }
 assert.equal(contexts.lookup('codex',{...ev,session_id:'another'}),undefined);
 assert.equal(contexts.lookup('codex',{...ev,tool_use_id:'another'}),undefined);
 assert.equal(contexts.lookup('claude',ev)?.reason,'invalid_event');
 assert.equal(contexts.cancel('codex',{...ev,tool_input:{}}).reason,'context_not_found');
 assert.match(contexts.lookup('codex',ev).summary,/Review three synthetic/);
});
test('context size, secrets and incomplete descriptions reject locally',()=>{
 const contexts=new SpawnContexts(),ev=event();
 for(const text of ['', 'Do it', 'x'.repeat(4001),'😀'.repeat(1000)])assert.equal(contexts.register('codex',ev,text,4000).reason,'insufficient_context');
 for(const text of ['Review token sk-syntheticonly12345678 safely','Review Bearer synthetic_token_123 safely'])assert.equal(contexts.register('codex',ev,text,4000).reason,'sensitive_input');
 assert.equal(contexts.register('codex',ev,description,80).reason,'insufficient_context');
 assert.equal(contexts.lookup('codex',ev),undefined);
});
test('expiry and cancellation retain tombstones; capacity never evicts an association',()=>{
 let now=0;const contexts=new SpawnContexts(()=>now),ev=event();
 contexts.register('codex',ev,description,4000);now=300000;
 assert.equal(contexts.lookup('codex',ev).reason,'context_expired');
 assert.equal(contexts.register('codex',ev,description,4000).reason,'context_expired');
 for(let i=1;i<128;i++)assert.equal(contexts.register('codex',{...ev,tool_use_id:String(i)},description,4000).status,'registered');
 assert.equal(contexts.register('codex',{...ev,tool_use_id:'overflow'},description,4000).reason,'context_capacity');
 assert.equal(contexts.cancel('codex',ev).status,'cancelled');
 assert.equal(contexts.lookup('codex',ev).reason,'context_cancelled');
});

test('prepared context accepts descriptive multilingual text but rejects padded vagueness', async () => {
 const {descriptiveTasks, vagueTasks} = await import('../test-support/language-context.ts');
 for (const text of descriptiveTasks) assert.equal(new SpawnContexts().register('codex',event(),text,4000).status,'registered');
 for (const text of vagueTasks) assert.equal(new SpawnContexts().register('codex',event(),text,4000).reason,'insufficient_context');
});
