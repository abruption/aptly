import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionsProvider } from '../src/provider.ts';
const args={input:{request_id:'test-1',client:'codex',task:{summary:'synthetic task',operation:'analysis',context_sufficient:true}},profiles:[{id:'codex-routine'}],signal:new AbortController().signal};
test('official fixed choice contract and minimal input',async()=>{
 let sent;
 const p=decisionsProvider({key:'test-secret',fetchImpl:async(url,opts)=>{sent={url,...opts};return Response.json({answers:[{type:'choice',name:'profile',choice:'codex-routine',confidence:.8}],usage:{input_tokens:123}});}});
 const result=await p(args);assert.equal(result.choice,'codex-routine');
 assert.equal(sent.url,'https://api.openai.com/v1/decisions');const body=JSON.parse(sent.body);
 assert.equal(body.model,'gpt-6-luna');assert.equal(body.questions[0].type,'choice');
 assert.deepEqual(JSON.parse(body.input),{task:args.input.task,client:'codex'});assert.equal(sent.redirect,'error');
 assert.ok(!sent.body.includes('test-secret'));assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('HTTP/raw errors and malformed answers are never returned',async()=>{
 for(const [resp,code] of [[new Response('private sk-secret',{status:401}),'unauthorized'],[new Response('private',{status:429}),'rate_limited'],[new Response('private'),'invalid_json'],[Response.json({answers:[{type:'refusal',name:'profile'}]}),'refused'],[Response.json({answers:[{type:'choice',name:'profile',choice:'arbitrary-model',confidence:.9}]}),'invalid_json']]){
 const p=decisionsProvider({key:'test',fetchImpl:async()=>resp});await assert.rejects(()=>p(args),e=>e.code===code&&!String(e).includes('private'));
 }
});
