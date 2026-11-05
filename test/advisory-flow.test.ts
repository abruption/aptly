import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Router } from '../src/core.ts';
import { decisionsProvider } from '../src/provider.ts';

const task = { summary:'Sort supplied numbers [3,1,2] ascending. No files or network.',operation:'analysis',context_sufficient:true };
const request = id => ({request_id:id,client:'codex',task:{...task}});
const data = r => r.structuredContent ?? JSON.parse(r.content[0].text);

test('real provider parser and advisory router compose with full, missing, partial and inconsistent usage', async () => {
  for(const [usage,expected] of [
    [{input_tokens:12,output_tokens:0,total_tokens:12},'recommended'],
    [undefined,'keep_current'],[{input_tokens:12},'keep_current'],
    [{input_tokens:12,output_tokens:0,total_tokens:11},'keep_current'],
  ]){
    let calls=0;
    const provider=decisionsProvider({key:'fixture-only',fetchImpl:async(url,opts)=>{
      calls++;assert.equal(url,'https://api.openai.com/v1/decisions');
      const body=JSON.parse(opts.body);assert.equal(body.model,'gpt-6-luna');
      assert.deepEqual(JSON.parse(body.input),{task,client:'codex'});
      return Response.json({answers:[{type:'choice',name:'profile',choice:'codex-routine',confidence:0.8}],...(usage?{usage}:{})});
    }});
    const r=new Router({provider});const input=request('usage-case');
    const result=await r.advise(input);assert.equal(result.status,expected);
    if(expected==='recommended')assert.deepEqual(result.usage,usage);else assert.equal(result.reason,'invalid_response');
    assert.equal((await r.advise(input)).cached,true);assert.equal(calls,1);
    assert.doesNotMatch(JSON.stringify(result),/fixture-only|Authorization|api\.openai/);
  }
});

test('product MCP advisory needs no host proof and cannot enable Hook input replacement', async t => {
  const client=new Client({name:'advisory-product-test',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.ts',import.meta.url))],env:{PATH:process.env.PATH,ROUTER_PROVIDER:'fixture',OPENAI_API_KEY:'',ROUTER_LEDGER_PATH:'',ROUTER_CONFIG_PATH:''},stderr:'pipe'});
  let stderrBytes=0;transport.stderr?.on('data',b=>stderrBytes+=b.length);
  await client.connect(transport);t.after(async()=>{await client.close();assert.equal(stderrBytes,0);});
  const call=async(name,args)=>data(await client.callTool({name,arguments:args}));
  const result=await call('recommend_agent',request('mcp-advisory'));
  assert.equal(result.status,'recommended');assert.equal(result.provider,'fixture');assert.equal(result.application,'advisory_only');
  assert.equal((await call('recommend_agent',request('mcp-advisory'))).cached,true);
  const caps=await call('get_routing_capabilities',{});assert.equal(caps.recommendation.host_evidence_required,false);assert.equal(caps.hook_mode,'shadow');
  const legacy={...request('legacy-false'),constraints:{provenance_verified:false}};
  assert.equal((await call('recommend_agent',legacy)).status,'recommended');
  assert.equal((await call('recommend_agent',{...request('pinned'),constraints:{model_pinned:true}})).status,'keep_current');
  const event={hook_event_name:'PreToolUse',tool_name:'collaborationspawn_agent',session_id:'fixture-session',cwd:'/synthetic',tool_use_id:'fixture-call',tool_input:{task_name:'Sort numbers',fork_turns:'none',message:'private message'},context:{evidence_verified:true},provenance_verified:true};
  assert.deepEqual(await call('route_spawn_hook',{client:'codex',event,task}),{});
  const precedence=await call('get_routing_precedence',{client:'codex',event});assert.equal(precedence.status,'unknown');
});

test('source CLI minimal advisory stdin, constraints, insufficient context and help work without a key', () => {
  const bin=fileURLToPath(new URL('../bin/aptly.ts',import.meta.url));
  const run=(args,input)=>spawnSync(process.execPath,[bin,...args],{input:input?JSON.stringify(input):undefined,encoding:'utf8',env:{PATH:process.env.PATH,ROUTER_PROVIDER:'fixture',OPENAI_API_KEY:'',ROUTER_CONFIG_PATH:'',ROUTER_LEDGER_PATH:''}});
  for(const [input,status] of [[request('cli-minimal'),'recommended'],[{...request('cli-pin'),constraints:{effort_pinned:true}},'keep_current'],[{...request('cli-context'),task:{...task,context_sufficient:false}},'needs_context']]){
    const r=run(['recommend'],input);assert.equal(r.status,0);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).status,status);
  }
  const help=run(['recommend','--help']);assert.equal(help.status,0);assert.match(help.stdout,/no host settings are inspected/i);
});
