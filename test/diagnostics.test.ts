import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectDiagnostics } from '../src/diagnostics.ts';
import { renderDiagnosticMarkdown } from '../src/report.ts';
import { VERSION } from '../src/version.ts';
import { createTestTemp } from '../test-support/temp.ts';
const check=(value,id)=>value.checks.find(c=>c.id===id);
test('local diagnostics are allowlisted and never probe an API, CLI, or key validity',()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('unexpected_network');};
 try{
  const value=collectDiagnostics({env:{ROUTER_PROVIDER:'fixture',OPENAI_API_KEY:'PRIVATE_SENTINEL',OTHER_SECRET:'PRIVATE_SENTINEL'}});
  assert.equal(value.tool.version,VERSION);assert.equal(check(value,'api_key').code,'key_not_required');
  assert.equal(check(value,'host_cli_versions').code,'host_cli_not_probed');
  assert.equal(value.network_requests,0);assert.equal(value.paid_calls,0);
  assert.equal(Object.values(value.summary).reduce((a,b)=>a+b,0),7);
  assert.doesNotMatch(JSON.stringify(value)+renderDiagnosticMarkdown(value),/PRIVATE_SENTINEL|OTHER_SECRET/);
 }finally{globalThis.fetch=original;}
});
test('live key presence stays unverified and ledger inspection is metadata-only',t=>{
 const dir=createTestTemp(t,'codex-diagnostics-'),ledger=join(dir,'ledger.json');
 writeFileSync(ledger,'PRIVATE_RAW_CONTENT not JSON',{mode:0o600});
 const value=collectDiagnostics({env:{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:'PRIVATE_KEY_SENTINEL',ROUTER_LEDGER_PATH:ledger}});
 assert.equal(check(value,'api_key').status,'unknown');assert.equal(check(value,'api_key').code,'key_present_unverified');
 assert.equal(check(value,'ledger_location').code,'ledger_private_location_ready');
 const rendered=JSON.stringify(value)+renderDiagnosticMarkdown(value);
 assert.ok(!rendered.includes(dir));assert.doesNotMatch(rendered,/PRIVATE_RAW_CONTENT|PRIVATE_KEY_SENTINEL/);
});
test('configuration errors and missing live prerequisites produce safe codes, not raw values',t=>{
 const dir=createTestTemp(t,'codex-diagnostic-errors-'),path=join(dir,'router.json');
 writeFileSync(path,'PRIVATE_BROKEN_CONFIG',{mode:0o600});
 const value=collectDiagnostics({env:{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:'',ROUTER_CONFIG_PATH:path,ROUTER_LEDGER_PATH:'PRIVATE_BAD_PATH'}});
 assert.equal(check(value,'api_key').code,'key_missing');assert.equal(check(value,'operator_configuration').code,'configuration_unavailable');
 assert.equal(check(value,'ledger_location').code,'ledger_location_unavailable');
 assert.ok(!JSON.stringify(value).includes(path));assert.doesNotMatch(JSON.stringify(value),/PRIVATE_/);
 for(const provider of ['','PRIVATE_PROVIDER'])assert.equal(check(collectDiagnostics({env:{ROUTER_PROVIDER:provider}}),'classification_provider').code,'provider_invalid');
});
test('host context is only loaded, never certified for a nonexistent current tool call',t=>{
 const dir=createTestTemp(t,'codex-diagnostic-evidence-'),path=join(dir,'context.json'),config=join(dir,'router.json');
 writeFileSync(path,JSON.stringify({schema_version:1,authority:'effective-host-settings-v1',context:{private:'PRIVATE_VALUE'},sources:[]}),{mode:0o600});
 writeFileSync(config,JSON.stringify({schema_version:1,mode:'apply',context_path:path}),{mode:0o600});
 const value=collectDiagnostics({env:{ROUTER_CONFIG_PATH:config}});
 assert.equal(check(value,'host_evidence').code,'host_evidence_loaded_unverified');assert.equal(check(value,'host_evidence').status,'unknown');
 assert.ok(!JSON.stringify(value).includes(dir));assert.doesNotMatch(JSON.stringify(value),/PRIVATE_VALUE|effective-host-settings/);
});
test('unrecognized platform/node and environment accessors cannot leak injected values',()=>{
 let invoked=0;const env={};Object.defineProperty(env,'OPENAI_API_KEY',{get(){invoked++;throw new Error('PRIVATE_ERROR');}});
 const value=collectDiagnostics({env,node:'PRIVATE_NODE',platform:'PRIVATE_PLATFORM',arch:'PRIVATE_ARCH'});
 assert.equal(invoked,0);assert.equal(value.environment.node,'0.0.0');assert.equal(value.environment.platform,'unknown');assert.equal(value.environment.arch,'unknown');
 assert.equal(check(value,'node_runtime').code,'node_unsupported');assert.doesNotMatch(JSON.stringify(value),/PRIVATE_/);
});
