import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync,readdirSync,mkdirSync,chmodSync } from 'node:fs';
import { createTestTemp } from '../test-support/temp.ts';
const entry=fileURLToPath(new URL('../bin/aptly.ts',import.meta.url));
const run=(dir,args,extra={})=>spawnSync(process.execPath,[entry,'report',...args],{cwd:dir,encoding:'utf8',env:{...process.env,ROUTER_PROVIDER:'fixture',ROUTER_CONFIG_PATH:'',ROUTER_LEDGER_PATH:'',OPENAI_API_KEY:'PRIVATE_KEY_SENTINEL',...extra}});
test('report CLI defaults to paired attachments with safe stdout and matching identity',t=>{
 const dir=createTestTemp(t,'codex-report-cli-'),result=run(dir,[]);assert.equal(result.status,0);assert.equal(result.stderr,'');
 const response=JSON.parse(result.stdout);assert.equal(response.files.length,2);assert.ok(!result.stdout.includes(dir));
 const files=readdirSync(join(dir,'reports'));assert.deepEqual(files.sort(),response.files.toSorted());
 const data=JSON.parse(readFileSync(join(dir,'reports',response.files.find(x=>x.endsWith('.json'))),'utf8'));
 const md=readFileSync(join(dir,'reports',response.files.find(x=>x.endsWith('.md'))),'utf8');
 assert.equal(data.report_id,response.report_id);assert.ok(md.includes(data.report_id));assert.doesNotMatch(result.stdout+md+JSON.stringify(data),/PRIVATE_KEY_SENTINEL/);
});
test('format selection works and diagnostic error states still produce attachable files',t=>{
 for(const format of ['json','md']){
  const dir=createTestTemp(t,'codex-report-format-'),result=run(dir,['--format',format,'--output-dir','attachments'],{ROUTER_PROVIDER:'decisions',OPENAI_API_KEY:''});
  assert.equal(result.status,0);const data=JSON.parse(result.stdout);assert.equal(data.files.length,1);assert.ok(data.files[0].endsWith('.'+format));assert.ok(data.summary.error>0);
 }
});
test('invalid arguments and report help create no attachments',t=>{
 for(const args of [['--format','xml'],['--format'],['--output-dir'],['--other','x'],['--format','md','--format','json']]){
  const dir=createTestTemp(t,'codex-report-invalid-'),result=run(dir,args);assert.equal(result.status,1);assert.match(result.stderr,/report_invalid_options/);assert.deepEqual(readdirSync(dir),[]);
 }
 const dir=createTestTemp(t,'codex-report-help-'),result=run(dir,['--help']);assert.equal(result.status,0);assert.match(result.stdout,/Usage:/);assert.deepEqual(readdirSync(dir),[]);
});
test('refusing a nonprivate output directory preserves its permissions and suppresses the path',t=>{
 const dir=createTestTemp(t,'codex-report-permissions-'),out=join(dir,'attachments');mkdirSync(out);chmodSync(out,0o755);
 const result=run(dir,['--output-dir',out]);assert.equal(result.status,1);assert.match(result.stderr,/report_output_unavailable/);assert.ok(!result.stderr.includes(out));assert.deepEqual(readdirSync(out),[]);
});
