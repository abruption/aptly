import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtime } from '../src/runtime.ts';
import { Router, defaultPolicy } from '../src/core.ts';
import { resolveCatalog } from '../src/catalog.ts';
import { decisionsProvider } from '../src/provider.ts';
import { hookOutput } from '../src/hook.ts';
import { createTestTemp } from '../test-support/temp.ts';
const request=(id='catalog-task',client='codex')=>({request_id:id,client,task:{summary:'Sort supplied numbers [3,1,2].',operation:'analysis',context_sufficient:true}});

test('runtime candidate filters and empty client lists do not call a provider or grant Hook authority',async()=>{
 const {router,disabledClients}=runtime({APTLY_CODEX_MODELS:'["gpt-6.1-sol"]',APTLY_CLAUDE_MODELS:'[]'});
 assert.deepEqual(disabledClients,['claude']);assert.deepEqual(router.capabilities().profiles,[{id:'codex-deep',client:'codex',model:'gpt-6.1-sol',reasoning_effort:'medium'}]);
 let calls=0;router.provider=async()=>{calls++;return {choice:'codex-deep'};};
 assert.equal((await router.advise(request('disabled','claude'))).reason,'no_candidates');assert.equal(calls,0);
 assert.equal((await router.advise(request('selected'))).profile.model,'gpt-6.1-sol');assert.equal(calls,1);
 assert.deepEqual(hookOutput({client:'codex',event:{},recommendation:await router.advise(request('selected')),policy:router.policy}),{});
 const empty=runtime({APTLY_CODEX_MODELS:'[]',APTLY_CLAUDE_MODELS:'[]'}).router;
 empty.provider=async()=>assert.fail('disabled provider must not run');assert.equal((await empty.advise(request('empty'))).reason,'no_candidates');
 assert.equal((await empty.advise({client:'codex'})).reason,'invalid_input');
});

test('effective official descriptions enter the provider choices as model/effort data, within configured candidates',async()=>{
 const catalog=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6-luna"]',APTLY_CLAUDE_MODELS:'[]'},[{client:'codex',model:'gpt-6-luna',description:'Official focused-task capability text.'}]);let body;
 const provider=decisionsProvider({key:'fixture-only',descriptions:catalog.descriptions,fetchImpl:async(_url,opts)=>{body=JSON.parse(opts.body);return Response.json({answers:[{name:'profile',type:'choice',choice:'codex-simple',confidence:0.9}],usage:{input_tokens:3,output_tokens:0,total_tokens:3}});}});
 const router=new Router({policy:{...defaultPolicy,profiles:catalog.profiles,profile_descriptions:catalog.descriptions,catalog_version:catalog.version},provider});
 const r=await router.advise(request());assert.equal(r.profile.model,'gpt-6-luna');assert.equal(r.profile.reasoning_effort,'max');
 const choices=body.questions[0].choices;assert.deepEqual(choices.map(c=>c.value),['codex-simple','keep_current','needs_context']);
 assert.match(choices[0].description,/gpt-6-luna/);assert.match(choices[0].description,/max/);assert.match(choices[0].description,/Official focused-task/);
 assert.equal(body.model,'gpt-6-luna');assert(!JSON.stringify(body).includes('fixture-only'));
});

test('changed model descriptions invalidate cache identity without retrying an uncertain paid request',async t=>{
 const dir=createTestTemp(t,'codex-catalog-runtime-'),ledgerPath=join(dir,'ledger.json');let calls=0;
 const make=(text,provider)=>{const c=resolveCatalog({},[{client:'codex',model:'gpt-6-luna',description:text}]);return new Router({policy:{...defaultPolicy,profiles:c.profiles,profile_descriptions:c.descriptions,catalog_version:c.version},provider,ledgerPath});};
 const first=make('First official description.',async()=>{calls++;throw Object.assign(new Error('private error'),{code:'network'});});
 assert.equal((await first.advise(request('same-id'))).reason,'network');
 const second=make('Changed official description.',async()=>{calls++;return {choice:'codex-simple'};});
 assert.equal((await second.advise(request('same-id'))).reason,'request_conflict');assert.equal(calls,1);
});

test('CLI exposes catalog configuration errors without reflecting raw environment values',()=>{
 const raw='["untrusted-private-value"]';
 const r=spawnSync(process.execPath,['bin/aptly.ts','catalog'],{encoding:'utf8',env:{PATH:process.env.PATH,APTLY_CODEX_MODELS:raw}});
 assert.equal(r.status,1);assert.match(r.stderr,/catalog_configuration_invalid/);assert(!r.stderr.includes('untrusted-private-value'));
 const both=spawnSync(process.execPath,['bin/aptly.ts','catalog'],{encoding:'utf8',env:{PATH:process.env.PATH,APTLY_CODEX_MODELS:'[]',CODEX_MODELS:'[]'}});assert.match(both.stderr,/catalog_configuration_conflict/);
});


test('Hook independently rejects injected profiles even when given a matching forged policy',()=>{
 const profile={id:'codex-routine',client:'codex',model:'untrusted-model',reasoning_effort:'high'};
 const policy={...defaultPolicy,profiles:[profile]};
 const recommendation={status:'recommended',profile_id:profile.id,profile,policy_version:policy.version,catalog_version:policy.catalog_version};
 const event={hook_event_name:'PreToolUse',tool_name:'collaborationspawn_agent',session_id:'fixture',tool_use_id:'call',tool_input:{task_name:'Sort numbers',fork_turns:'none'}};
 assert.deepEqual(hookOutput({client:'codex',event,recommendation,policy,mode:'apply',compatibilityVerified:true}),{});
});
