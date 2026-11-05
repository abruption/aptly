import test from 'node:test';
import assert from 'node:assert/strict';
import { storeSecret, loadSecret, deleteSecret } from '../src/secret-store.ts';

const secret = 'synthetic-not-an-api-key-123';
const errorCode = expected => e => e instanceof Error && e.message === expected && !e.message.includes(secret);
test('macOS stores a secret only in stdin and uses per-host account identifiers', () => {
 const calls = [];
 const exec = (command, args, options) => { calls.push({ command, args, options }); return { status: 0, stdout: '{"status":0,"value":null}' }; };
 storeSecret(secret, { platform: 'darwin', account: 'codex:OPENAI_API_KEY', exec });
 assert.equal(calls[0].command, '/usr/bin/osascript');
 assert.equal(JSON.stringify(calls[0].args).includes(secret), false);
 assert.equal(JSON.parse(calls[0].options.input).value, secret);
 assert.equal(JSON.parse(calls[0].options.input).account, 'codex:OPENAI_API_KEY');
 assert.equal(calls[0].options.timeout, 15000);
 assert.deepEqual(calls[0].options.stdio, ['pipe', 'pipe', 'pipe']);
});
test('macOS loads internally and treats missing reads and deletion as idempotent', () => {
 const exec = (_c, _a, o) => ({ status: 0, stdout: JSON.stringify({ status: JSON.parse(o.input).action === 'load' ? 0 : -25300, value: secret }) });
 assert.equal(loadSecret({ platform: 'darwin', exec }), secret);
 assert.equal(deleteSecret({ platform: 'darwin', exec }), undefined);
 assert.equal(loadSecret({ platform: 'darwin', exec: () => ({ status: 0, stdout: '{"status":-25300,"value":null}' }) }), null);
});
test('macOS OS failures become fixed errors without raw tool text', () => {
 for(const [status, code] of [[-128,'secure_store_cancelled'],[-25293,'secure_store_denied'],[-25308,'secure_store_locked'],[-34018,'secure_store_unavailable'],[-50,'secure_store_failed']]) {
  assert.throws(() => loadSecret({ platform:'darwin',exec:()=>({status:0,stdout:JSON.stringify({status,value:secret}),stderr:secret}) }), errorCode(code));
 }
 for(const result of [{status:1,stderr:secret},{status:0,stdout:secret},{status:0,stdout:'[]'}])assert.throws(()=>loadSecret({platform:'darwin',exec:()=>result}),errorCode('secure_store_failed'));
 assert.throws(()=>storeSecret(secret,{platform:'darwin',exec:()=>({status:0,stdout:'{"status":-25300,"value":null}'})}),errorCode('secure_store_unavailable'));
});
test('Linux secret-tool uses stdin and never receives secret argv', () => {
 const calls=[];const exec=(command,args,options)=>{calls.push({command,args,options});return{status:0,stdout:secret+'\n'};};
 storeSecret(secret,{platform:'linux',exec});assert.equal(calls[0].command,'secret-tool');assert.equal(JSON.stringify(calls[0].args).includes(secret),false);assert.equal(calls[0].options.input,secret+'\n');
 assert.equal(loadSecret({platform:'linux',exec}),secret);deleteSecret({platform:'linux',exec});
 assert.equal(calls[1].args[0],'lookup');assert.equal(calls[2].args[0],'clear');
 assert.equal(loadSecret({platform:'linux',exec:()=>({status:1,stdout:'',stderr:''})}),null);
 assert.equal(deleteSecret({platform:'linux',exec:()=>({status:1,stderr:''})}),undefined);
 assert.throws(()=>loadSecret({platform:'linux',exec:()=>({status:1,stderr:secret})}),errorCode('secure_store_failed'));
});
test('missing OS tools, timeout, process failures and unsupported platforms do not fall back to plaintext', () => {
 for(const [error, code] of [[{code:'ENOENT'},'secure_store_unavailable'],[{code:'ETIMEDOUT'},'secure_store_timeout'],[{code:'EIO'},'secure_store_failed']])assert.throws(()=>loadSecret({platform:'linux',exec:()=>({status:null,error})}),errorCode(code));
 assert.throws(()=>storeSecret(secret,{platform:'darwin',exec:()=>{throw Error(secret);}}),errorCode('secure_store_failed'));
 assert.throws(()=>loadSecret({platform:'freebsd'}),errorCode('secure_store_unsupported_platform'));
});
test('Windows Credential Manager receives secrets only on stdin and uses a constant native API script', () => {
 const calls=[];const exec=(command,args,options)=>{calls.push({command,args,options});return{status:0,stdout:JSON.stringify({status:0,value:secret})};};
 storeSecret(secret,{platform:'win32',service:'dev.aptly.mcp',account:'codex:OPENAI_API_KEY',exec});
 assert.equal(loadSecret({platform:'win32',account:'claude:OPENAI_API_KEY',exec}),secret);
 assert.equal(deleteSecret({platform:'win32',exec}),undefined);
 const call=calls[0];assert.equal(call.command,'powershell.exe');
 assert.deepEqual(call.args.slice(0,3),['-NoProfile','-NonInteractive','-Command']);
 assert.equal(JSON.stringify(call.args).includes(secret),false);
 assert.deepEqual(JSON.parse(call.options.input),{action:'store',service:'dev.aptly.mcp',account:'codex:OPENAI_API_KEY',value:secret});
 assert.equal(JSON.parse(calls[1].options.input).account,'claude:OPENAI_API_KEY');
 assert.equal(JSON.parse(calls[2].options.input).action,'delete');
 assert.equal(call.args[3],calls[1].args[3]);assert.equal(call.args[3],calls[2].args[3]);
 for(const fragment of ['CredWriteW','CredReadW','CredDeleteW','CredFree','credential.Type = 1','credential.Persist = 2','Marshal.FreeHGlobal(blob)','Array.Clear(bytes','[Console]::InputEncoding','[Console]::OutputEncoding',"[string]$request.service + ':' + [string]$request.account"]){assert.ok(call.args[3].includes(fragment));}
 assert.equal('env' in call.options,false);assert.deepEqual(call.options.stdio,['pipe','pipe','pipe']);
 assert.equal(JSON.parse(calls[1].options.input).value,undefined);
});
test('Windows missing entries are idempotent and native errors are fixed and redacted', () => {
 const result=status=>({status:0,stdout:JSON.stringify({status,value:secret}),stderr:secret});
 assert.equal(loadSecret({platform:'win32',exec:()=>result(1168)}),null);
 assert.equal(deleteSecret({platform:'win32',exec:()=>result(1168)}),undefined);
 for(const [status,code] of [[5,'secure_store_denied'],[1223,'secure_store_cancelled'],[1312,'secure_store_unavailable'],[50,'secure_store_unavailable'],[-1,'secure_store_failed'],[87,'secure_store_failed']])assert.throws(()=>loadSecret({platform:'win32',exec:()=>result(status)}),errorCode(code));
 assert.throws(()=>storeSecret(secret,{platform:'win32',exec:()=>result(1168)}),errorCode('secure_store_failed'));
 for(const result of [{status:1,stderr:secret},{status:0,stdout:secret},{status:0,stdout:'[]'},{status:0,stdout:'{}'}])assert.throws(()=>loadSecret({platform:'win32',exec:()=>result}),errorCode('secure_store_failed'));
 assert.throws(()=>loadSecret({platform:'win32',exec:()=>({status:null,error:{code:'ENOENT'}})}),errorCode('secure_store_unavailable'));
});
test('Windows generic credential blobs enforce the 2560 UTF-8 byte API limit', () => {
 let invoked=false;const exec=()=>{invoked=true;return{status:0,stdout:'{"status":0}'};};
 assert.throws(()=>storeSecret('x'.repeat(2561),{platform:'win32',exec}),errorCode('secure_store_invalid_value'));
 assert.throws(()=>storeSecret('한'.repeat(854),{platform:'win32',exec}),errorCode('secure_store_invalid_value'));
 assert.equal(invoked,false);
 storeSecret('x'.repeat(2560),{platform:'win32',exec});assert.equal(invoked,true);
 assert.throws(()=>loadSecret({platform:'win32',exec:()=>({status:0,stdout:JSON.stringify({status:0,value:'x'.repeat(2561)})})}),errorCode('secure_store_invalid_value'));
});
test('invalid labels and secret values fail before invoking an OS tool', () => {
 let invoked=false;const exec=()=>{invoked=true;return{status:0};};
 for(const service of ['', '../escape', 'a\ncommand', 'a'.repeat(256)])assert.throws(()=>storeSecret(secret,{service,exec}),errorCode('secure_store_invalid_options'));
 for(const value of ['', ' leading', 'trailing ', 'two\nlines', 'nul\0value', 'x'.repeat(8193)])assert.throws(()=>storeSecret(value,{exec}),errorCode('secure_store_invalid_value'));
 assert.equal(invoked,false);
 assert.throws(()=>loadSecret({platform:'darwin',exec:()=>({status:0,stdout:'{"status":0,"value":""}'})}),errorCode('secure_store_invalid_value'));
});
