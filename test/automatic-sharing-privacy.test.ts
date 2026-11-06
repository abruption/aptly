import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SpawnContexts} from '../src/spawn-context.ts';
import {automaticHook} from '../src/automatic-hook.ts';
import {Router,defaultPolicy} from '../src/core.ts';
import {decisionsProvider} from '../src/provider.ts';
import {collectDiagnostics} from '../src/diagnostics.ts';
import {exportDiagnosticReport} from '../src/report.ts';
import {createTestTemp} from '../test-support/temp.ts';
import {setupHosts,setDefaults,removeSetup} from '../src/setup.ts';

const label='SYNTHETIC_LABEL_SENTINEL';
const first='Review SYNTHETIC_FIRST_PARAGRAPH_SENTINEL for a missing configuration guard.';
const later='SYNTHETIC_SECOND_PARAGRAPH_SENTINEL must stay outside the shared excerpt.';
const auth='synthetic-auth-header-only';
const metadata=['SYNTHETIC_SESSION_SENTINEL','SYNTHETIC_CALL_SENTINEL','SYNTHETIC_CWD_SENTINEL','SYNTHETIC_HISTORY_SENTINEL'];
function native(client='codex'){
 return {hook_event_name:'PreToolUse',tool_name:client==='codex'?'collaborationspawn_agent':'Agent',
  session_id:metadata[0],tool_use_id:metadata[1],cwd:'/synthetic/'+metadata[2],
  tool_input:client==='codex'?{task_name:label,message:first+'\n\n'+later,fork_turns:'none',history:metadata[3]}:
   {description:label,prompt:first+'\n\n'+later,subagent_type:'general-purpose',history:metadata[3]}};
}
function fixture(t,options={}){
 const dir=createTestTemp(t,'codex-sharing-privacy-'),state=join(dir,'state');mkdirSync(state,{mode:0o700});
 const path=join(dir,'policy.json'),ledgerPath=join(state,'ledger.json');
 const policy={schema_version:1,kind:'aptly-auto-hook',mode:'defaults',issuer:'operator_installation',enabled:true,state_directory:state,...options.policy};
 const write=()=>writeFileSync(path,JSON.stringify(policy),{mode:0o600});write();
 const sent=[];
 const provider=decisionsProvider({key:auth,descriptions:defaultPolicy.profile_descriptions,fetchImpl:async(url,request)=>{
  const body=JSON.parse(request.body);sent.push({url,request,body});
  return options.response?options.response():Response.json({answers:[{type:'choice',name:'profile',choice:body.questions[0].choices[0].value,confidence:0.9}],usage:{input_tokens:3,output_tokens:0,total_tokens:3}});
 }});
 const router=new Router({ledgerPath,policy:{...defaultPolicy,provider_id:'decisions',...options.routerPolicy},provider});
 return {dir,state,path,ledgerPath,policy,write,sent,router,run:(client='codex',event=native(client))=>automaticHook({client,event,router,policyPath:path})};
}
function noSentinels(text,sentinels){for(const sentinel of sentinels)assert.equal(text.includes(sentinel),false,`unexpected synthetic sentinel ${sentinel}`);}

for(const client of ['codex','claude'])test(`${client}: native sharing sends only the bounded excerpt and catalog contract`,async t=>{
 const f=fixture(t),event=native(client),before=structuredClone(event),result=await f.run(client,event);
 assert.equal(result.observation.status,'arguments_updated');assert.equal(f.sent.length,1);assert.deepEqual(event,before);
 const {url,request,body}=f.sent[0];
 assert.equal(url,'https://api.openai.com/v1/decisions');assert.equal(request.method,'POST');assert.equal(request.redirect,'error');
 assert.deepEqual(Object.keys(body).sort(),['input','model','questions']);
 assert.deepEqual(JSON.parse(body.input),{task:{summary:`Task: ${label}\n${first}`,operation:'analysis',context_sufficient:true},client});
 assert.deepEqual(Object.keys(request.headers).sort(),['Authorization','Content-Type','X-Client-Request-Id']);
 assert.equal(request.headers.Authorization,`Bearer ${auth}`);assert.equal(request.headers['Content-Type'],'application/json');
 assert.match(request.headers['X-Client-Request-Id'],/^[a-f0-9]{64}$/);
 assert.equal(request.headers['X-Client-Request-Id'],result.observation.request_id);
 const question=body.questions[0];assert.equal(body.questions.length,1);
 assert.deepEqual(Object.keys(question).sort(),['choices','instructions','name','type']);
 assert.equal(question.type,'choice');assert.equal(question.name,'profile');assert.equal(typeof question.instructions,'string');
 const expected=f.router.policy.profiles.filter(p=>p.client===client).map(p=>({value:p.id,description:f.router.policy.profile_descriptions[p.id]}));
 assert.deepEqual(question.choices.slice(0,-2),expected);
 assert.deepEqual(question.choices.slice(-2).map(c=>c.value),['keep_current','needs_context']);
 noSentinels(request.body,[later,auth,...metadata]);
 // The host must retain its original task locally; that is distinct from the outbound classifier payload.
 const bodyField=client==='codex'?'message':'prompt';
 assert.equal(result.output.hookSpecificOutput.updatedInput[bodyField],event.tool_input[bodyField]);
 const localMetadata=readFileSync(f.ledgerPath,'utf8')+JSON.stringify(result.observation)+
  readdirSync(f.state).filter(name=>name.startsWith('hook-call-')).map(name=>readFileSync(join(f.state,name),'utf8')).join('');
 noSentinels(localMetadata,[label,first,later,auth,...metadata]);
 const diagnostic=collectDiagnostics({env:{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:auth,ROUTER_LEDGER_PATH:f.ledgerPath,UNRELATED_TASK_TEXT:first}});
 const outputDir=join(f.dir,'reports'),report=exportDiagnosticReport({diagnostic,outputDir});
 const attachments=report.files.map(name=>readFileSync(join(outputDir,name),'utf8')).join('');
 noSentinels(attachments,[label,first,later,auth,...metadata,f.dir]);
 assert.equal(diagnostic.network_requests,0);assert.equal(diagnostic.paid_calls,0);
 await f.run(client,event);assert.equal(f.sent.length,1,'same-call cache must not create an extra transmission');
});

test('disabled automatic policy performs no transport or state writes; advisory still shares',async t=>{
 const disabled=fixture(t,{policy:{enabled:false}}),before=readFileSync(disabled.path,'utf8');
 const result=await disabled.run();assert.deepEqual(result.output,{});assert.equal(result.observation.reason,'automatic_policy_disabled');
 assert.equal(disabled.sent.length,0);assert.deepEqual(readdirSync(disabled.state),[]);assert.equal(readFileSync(disabled.path,'utf8'),before);
 const advisory=fixture(t,{policy:{mode:'advisory'}}),advice=await advisory.run();
 assert.equal(advice.observation.status,'advisory');assert.equal(advisory.sent.length,1);
 assert.equal(JSON.parse(advisory.sent[0].body.input).task.summary,`Task: ${label}\n${first}`);
 assert.equal(Object.hasOwn(advice.output.hookSpecificOutput,'updatedInput'),false);
});

test('disabling an owned policy stops sharing and ownership-conflicting setup or removal preserves that choice',async t=>{
 const home=createTestTemp(t,'codex-sharing-optout-'),options={home,env:{},clients:['claude']};
 assert.equal(setupHosts(options).status,'complete');
 const directory=join(home,'.claude','aptly'),path=join(directory,'auto-policy.json');
 const policy=JSON.parse(readFileSync(path,'utf8'));policy.enabled=false;
 writeFileSync(path,JSON.stringify(policy),{mode:0o600});
 const paths=[join(home,'.claude.json'),join(home,'.claude','settings.json'),path,join(directory,'setup-ownership.json')];
 const before=paths.map(p=>readFileSync(p,'utf8'));
 let calls=0;
 const router=new Router({ledgerPath:join(directory,'state','ledger.json'),policy:{...defaultPolicy,provider_id:'decisions'},provider:decisionsProvider({key:auth,fetchImpl:async()=>{calls++;throw Error('unexpected_synthetic_transport');}})});
 const result=await automaticHook({client:'claude',event:native('claude'),router,policyPath:path});
 assert.equal(result.observation.reason,'automatic_policy_disabled');assert.equal(calls,0);
 for(const [command,code] of [[setupHosts,'policy_conflict'],[setDefaults,'policy_conflict'],[removeSetup,'managed_policy_changed']]){
  const rejected=command(options);assert.equal(rejected.status,'partial');assert.ok(rejected.clients[0].codes.includes(code));
  assert.deepEqual(paths.map(p=>readFileSync(p,'utf8')),before);
 }
 assert.deepEqual(readdirSync(join(directory,'state')),[]);
});

for(const client of ['codex','claude'])test(`${client}: unsupported explicit model/effort and fixed roles never transmit`,async t=>{
 const f=fixture(t);
 for(const field of ['model','reasoning_effort','role']){
  const event=native(client);
  if(field==='inherit_history')event.tool_input.inherit_history=true;else event.tool_input[field]='explicit-synthetic-selection';
  assert.deepEqual((await f.run(client,event)).output,{});
 }
 assert.equal(f.sent.length,0);assert.deepEqual(readdirSync(f.state),[]);
});

test('opaque Codex messages are never decoded or forwarded; visible task labels remain shared data',async t=>{
 const f=fixture(t),event=native();event.tool_input.task_name='review_synthetic_module_for_missing_configuration_guard';
 event.tool_input.message='gAAAA'+'a'.repeat(100);
 const result=await f.run('codex',event);assert.equal(result.observation.status,'arguments_updated');assert.equal(f.sent.length,1);
 assert.deepEqual(JSON.parse(f.sent[0].body.input).task,{summary:'Task summary from visible task_name only; opaque message not inspected: review synthetic module for missing configuration guard',operation:'analysis',context_sufficient:true});
 noSentinels(f.sent[0].request.body,[event.tool_input.message,...metadata]);
});

test('automatic excerpts obey UTF-8 byte bounds and never split a Unicode code point',async t=>{
 for(const limit of [96,4000,64000]){
  const f=fixture(t,{routerPolicy:{max_summary_bytes:limit}}),event=native();event.tool_input.task_name='Review';
  const paragraph='Review these symbols '+'😀한'.repeat(1100);event.tool_input.message=paragraph+'\n\n'+later;
  const result=await f.run('codex',event);assert.equal(result.observation.status,'arguments_updated');
  const summary=JSON.parse(f.sent[0].body.input).task.summary,prefix='Task: Review\n',cap=Math.min(4000,limit);
  assert.ok(Buffer.byteLength(summary)<=cap);assert.equal(summary.includes('\uFFFD'),false);
  assert.equal(summary.startsWith(prefix),true);assert.equal(paragraph.startsWith(summary.slice(prefix.length)),true);
  const next=[...paragraph.slice(summary.length-prefix.length)][0];
  assert.ok(Buffer.byteLength(summary)+Buffer.byteLength(next)>cap);
  noSentinels(f.sent[0].request.body,[later]);
 }
});

for(const client of ['codex','claude'])test(`${client}: sensitive patterns in labels or beyond the shared excerpt prevent transmission`,async t=>{
 const f=fixture(t),bodyField=client==='codex'?'message':'prompt',labelField=client==='codex'?'task_name':'description';
 for(const synthetic of ['sk-synthetic-placeholder-123456','Bearer synthetic-placeholder-123456']){
  for(const location of ['label','second-paragraph','after-byte-limit']){
   const event=native(client);
   if(location==='label')event.tool_input[labelField]=synthetic;
   else event.tool_input[bodyField]=location==='second-paragraph'?first+'\n\n'+synthetic:first+' '+'.'.repeat(5000)+synthetic;
   const result=await f.run(client,event);assert.deepEqual(result.output,{});assert.equal(result.observation.reason,'sensitive_input');
  }
 }
 assert.equal(f.sent.length,0);assert.deepEqual(readdirSync(f.state),[]);
});

test('provider error text never reaches automatic observations, ledgers or diagnostic attachments',async t=>{
 const raw='SYNTHETIC_PROVIDER_ERROR_SENTINEL',f=fixture(t,{response:()=>new Response(raw,{status:401})});
 const result=await f.run();assert.equal(result.observation.reason,'unauthorized');assert.equal(f.sent.length,1);
 const diagnostic=collectDiagnostics({env:{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:auth,ROUTER_LEDGER_PATH:f.ledgerPath}});
 const outputDir=join(f.dir,'reports'),report=exportDiagnosticReport({diagnostic,outputDir});
 noSentinels(JSON.stringify(result.observation)+readFileSync(f.ledgerPath,'utf8')+report.files.map(name=>readFileSync(join(outputDir,name),'utf8')).join(''),[raw,first,label,auth]);
});

test('classification does not log task, authentication, host metadata or raw provider errors',async t=>{
 const raw='SYNTHETIC_RAW_LOG_SENTINEL',f=fixture(t,{response:()=>new Response(raw,{status:401})});
 const logged=[];
 for(const method of ['log','info','warn','error','debug'])t.mock.method(console,method,(...values)=>{
  logged.push(values.map(value=>typeof value==='string'?value:value instanceof Error?value.message:JSON.stringify(value)).join(' '));
 });
 const result=await f.run();assert.equal(result.observation.reason,'unauthorized');
 noSentinels(logged.join('\n'),[raw,first,later,label,auth,...metadata]);
});

test('direct operator-authored summaries share the supplied bounded text and reject oversized text locally',async t=>{
 const f=fixture(t,{routerPolicy:{max_summary_bytes:96}}),summary='Review the synthetic API contract for a missing guard.';
 const input={request_id:'operator-authored-synthetic',client:'codex',task:{summary,operation:'review',context_sufficient:true}};
 assert.equal((await f.router.advise(input)).status,'recommended');
 assert.deepEqual(JSON.parse(f.sent[0].body.input),{task:input.task,client:'codex'});
 assert.equal(f.sent[0].request.headers['X-Client-Request-Id'],input.request_id);
 assert.equal((await f.router.advise({...input,request_id:'oversized-synthetic',task:{...input.task,summary:'x'.repeat(97)}})).reason,'invalid_input');
 assert.equal(f.sent.length,1);
});

for(const client of ['codex','claude'])test(`${client}: history constraints retain minimal sharing but block application`,async t=>{
 const f=fixture(t),event=native(client);event.tool_input.inherit_history=true;
 const result=await f.run(client,event);assert.equal(f.sent.length,1);assert.equal(result.observation.application,'blocked');
 assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'updatedInput'),false);
 const task=JSON.parse(f.sent[0].body.input).task;assert.equal(task.summary,`Task: ${label}\n${first}`);
 noSentinels(JSON.stringify(task),[later,...metadata]);
});

test('original short opaque inherited shape shares only its label through mocked HTTP', async t => {
 const f=fixture(t),event=native();
 event.tool_input.task_name='cleanup_merged_worktrees';
 event.tool_input.message='gAAAAA'+'a'.repeat(100);
 event.tool_input.fork_turns='all';
 const before=structuredClone(event);
 const result=await f.run('codex',event);
 assert.equal(result.observation.reason,'inherited_context_application_unverified');
 assert.equal(f.sent.length,1);
 assert.equal(JSON.parse(f.sent[0].body.input).task.summary,'Task summary from visible task_name only; opaque message not inspected: cleanup merged worktrees');
 noSentinels(f.sent[0].request.body,[event.tool_input.message,...metadata]);
 assert.deepEqual(event,before);
 assert.equal(Object.hasOwn(result.output.hookSpecificOutput,'updatedInput'),false);
});

test('registered opaque context sends only the explicit bounded description through mocked Decisions HTTP',async t=>{
 const f=fixture(t),event=native();event.tool_input.message='gAAAAA'+'A'.repeat(96);event.tool_input.fork_turns='all';
 const contexts=new SpawnContexts(),description='Review three synthetic merged worktrees. Produce a cleanup proposal without deleting anything.';
 contexts.register('codex',event,description,4000);
 const result=await automaticHook({client:'codex',event,router:f.router,policyPath:f.path,context:()=>contexts.lookup('codex',event)});
 assert.equal(f.sent.length,1);
 assert.deepEqual(JSON.parse(f.sent[0].body.input),{client:'codex',task:{summary:'Caller-supplied task description (untrusted task data; opaque body not inspected): '+description,operation:'analysis',context_sufficient:true}});
 noSentinels(f.sent[0].request.body,[event.tool_input.message,label,first,later,...metadata]);
 assert.equal(result.observation.reason,'inherited_context_application_unverified');
 const stored=readFileSync(f.ledgerPath,'utf8')+readdirSync(f.state).filter(n=>n.startsWith('hook-call-')).map(n=>readFileSync(join(f.state,n),'utf8')).join('');
 noSentinels(stored,[description,event.tool_input.message,...metadata]);
});
