import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createTestTemp } from '../test-support/temp.ts';
import { linuxStoreReadiness } from '../src/linux-store-readiness.ts';

function fixture(t) {
 const root=createTestTemp(t,'codex-linux-readiness-'),bin=join(root,'bin');mkdirSync(bin);
 const add=(name)=>{const path=join(bin,name);writeFileSync(path,'fixture');chmodSync(path,0o700);};
 const env={PATH:bin,DBUS_SESSION_BUS_ADDRESS:'unix:abstract=fixture',OPENAI_API_KEY:'synthetic-private-key',DISPLAY:'private-display'};
 const calls=[];
 const probe=(outputs,overrides={})=>linuxStoreReadiness({platform:'linux',env,execute:(command,args,opts)=>{calls.push({command,args,opts});return outputs.shift() ?? {status:1,stdout:'private error'};},...overrides});
 return {root,bin,add,env,calls,probe};
}
test('Linux preflight locates executable without running it and preserves other platforms',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);assert.equal(f.probe([]).code,'secure_store_secret_tool_missing');assert.equal(f.calls.length,0);
 f.add('secret-tool');chmodSync(join(f.bin,'secret-tool'),0o600);assert.equal(f.probe([]).status,'unavailable');
 assert.equal(f.probe([],{platform:'darwin'}),undefined);assert.equal(f.probe([],{platform:'win32'}),undefined);
});
test('only explicit safe bus metadata is queried and results stay unverified or fail closed',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);f.add('secret-tool');f.add('gdbus');
 for(const address of ['', 'autolaunch:', 'tcp:host=example', 'unix:path=/private;unix:abstract=x', 'unix:path=relative/socket']) {f.env.DBUS_SESSION_BUS_ADDRESS=address;assert.equal(f.probe([]).code,'secure_store_bus_unverified');}
 assert.equal(f.calls.length,0);f.env.DBUS_SESSION_BUS_ADDRESS='unix:abstract=fixture';
 assert.equal(f.probe([{status:0,stdout:'(true,)'}]).code,'secure_store_service_present_unverified');
 assert.equal(f.probe([{status:0,stdout:'(false,)'},{status:0,stdout:"(['org.freedesktop.secrets'],)"}]).code,'secure_store_service_activatable_unverified');
 assert.equal(f.probe([{status:0,stdout:'(false,)'},{status:0,stdout:'(@as [],)'}]).code,'secure_store_service_missing');
 assert.equal(f.probe([{status:0,stdout:'(false,)'},{status:0,stdout:"(['org.example.Other'],)"}]).status,'unavailable');
 assert.equal(f.probe([{status:0,error:{code:'ENOBUFS'},stdout:'(true,)'}]).code,'secure_store_bus_unverified');
 assert.equal(f.probe([{status:0,stdout:'(false,)'},{status:0,stdout:"(['org.freedesktop.secrets.extra'],)"}]).code,'secure_store_service_missing');
 assert.equal(f.probe([{status:1,stdout:'private data'}]).code,'secure_store_bus_unverified');
 assert.equal(f.probe([{status:0,stdout:'(false,)'},{status:0,stdout:'private data'}]).status,'unverified');
 for(const call of f.calls){assert.equal(call.command,join(f.bin,'gdbus'));assert.ok(call.args.includes('org.freedesktop.DBus'));assert.equal(call.args.includes('--session'),false);assert.ok(call.args.includes('--address'));assert.equal(call.opts.timeout,2000);assert.deepEqual(call.opts.env,{PATH:f.bin,LC_ALL:'C'});}
 assert.doesNotMatch(JSON.stringify(f.probe([{status:1,stdout:'private data'}])),/private data|fixture/);
});
test('missing socket and missing probe are distinct without accessing a credential store',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);f.add('secret-tool');f.env.DBUS_SESSION_BUS_ADDRESS='unix:path=/codex-aptly-readiness-absent-socket';assert.equal(f.probe([]).code,'secure_store_bus_missing');
 f.env.DBUS_SESSION_BUS_ADDRESS='unix:abstract=fixture';assert.equal(f.probe([]).code,'secure_store_probe_unavailable');assert.equal(f.calls.length,0);
});

test('metadata helper is never executed from relative or empty PATH entries',{skip:process.platform==='win32'},t=>{
 const f=fixture(t);f.add('secret-tool');f.add('gdbus');
 // The first entry can establish secret-tool presence, but cannot supply gdbus.
 f.env.PATH=relative(process.cwd(),f.bin)+':';
 assert.equal(f.probe([]).code,'secure_store_probe_unavailable');assert.equal(f.calls.length,0);
 const moduleUrl=pathToFileURL(join(process.cwd(),'src/linux-store-readiness.ts')).href;
 const code=`import {linuxStoreReadiness} from ${JSON.stringify(moduleUrl)}; let called=false; const result=linuxStoreReadiness({platform:'linux',env:{PATH:':',DBUS_SESSION_BUS_ADDRESS:'unix:abstract=fixture'},execute(){called=true;throw Error('unexpected');}}); process.stdout.write(JSON.stringify({result,called}));`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:f.bin,encoding:'utf8',timeout:5000});
 assert.equal(child.status,0);assert.deepEqual(JSON.parse(child.stdout),{result:{status:'unverified',code:'secure_store_probe_unavailable'},called:false});
});
