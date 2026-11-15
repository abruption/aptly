import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTestTemp } from '../test-support/temp.ts';
import { StableSmokeDiagnostics, stableSmokeWrapperSource, formatSmokeRunnerFailure } from '../scripts/stable-smoke-diagnostics.ts';

function fixture(t) {
  const dir = createTestTemp(t, 'codex-smoke-diagnostics-');
  const wrapper = join(dir, 'wrapper.mjs');
  const status = join(dir, 'status.json');
  writeFileSync(wrapper, stableSmokeWrapperSource, { mode: 0o600 });
  return { dir, wrapper, status };
}
function statusAt(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function runWrapper(f, command, args = [], options = {}) {
  return spawnSync(process.execPath, [f.wrapper, f.status, command, ...args], { encoding: 'utf8', timeout: 5000, ...options });
}

test('first failure phase and pre-cleanup child exit survive later cleanup', t => {
  const f = fixture(t);
  writeFileSync(f.status, JSON.stringify({ exit_code: 23, signal: null, spawn_error: null }), { mode: 0o600 });
  const d = new StableSmokeDiagnostics(f.status);
  d.phase = 'capabilities';
  d.captureStderr('aptly: stable_runtime_');
  d.captureStderr(Buffer.from('unavailable\n'));
  d.fail(new Error('Connection closed'));
  d.phase = 'cleanup';
  writeFileSync(f.status, JSON.stringify({ exit_code: 0, signal: null, spawn_error: null }));
  d.finishCleanup(new Error('secondary private /path'));
  const report = d.report();
  assert.equal(report.kind, 'aptly-stable-smoke');
  assert.equal(report.phase, 'capabilities');
  assert.equal(report.stderr_class, 'stable_runtime_unavailable');
  assert.equal(report.child_exit, 23);
  assert.equal(report.exit_observation, 'before_cleanup');
  assert.doesNotMatch(JSON.stringify(report), /secondary private|\/path/);
});

test('cleanup can observe a later exit without replacing the primary failure', t => {
  const f = fixture(t);
  const d = new StableSmokeDiagnostics(f.status);
  d.phase = 'validation';
  d.fail(new Error('private primary /path'));
  writeFileSync(f.status, JSON.stringify({ exit_code: 17, signal: null, spawn_error: null }), { mode: 0o600 });
  d.phase = 'cleanup';
  d.finishCleanup(new Error('private cleanup'));
  const report = d.report();
  assert.equal(report.phase, 'validation');
  assert.equal(report.error_class, 'other');
  assert.equal(report.child_exit, 17);
  assert.equal(report.exit_observation, 'during_cleanup');
  assert.doesNotMatch(JSON.stringify(report), /private|\/path/);
});

test('stderr classification is exact, bounded, and never reports content', t => {
  const f = fixture(t);
  for (const [parts, expected, size] of [
    [[], 'empty', '0'],
    [['aptly: stable_runtime_', 'unavailable\n'], 'stable_runtime_unavailable', '1_256'],
    [['aptly: stable_runtime_unavailable\nsecret /private/key'], 'other', '1_256'],
    [['aptly: server_configuration_', 'error\n'], 'server_configuration_error', '1_256'],
    [['x'.repeat(257)], 'other', '257_4096'],
    [['s'.repeat(4097), 'secret /private/key'], 'truncated', 'over_4096'],
  ]) {
    const d = new StableSmokeDiagnostics(f.status);
    for (const part of parts) d.captureStderr(part);
    d.fail(new Error('secret /private/key'));
    d.finishCleanup();
    const report = d.report();
    assert.equal(report.stderr_class, expected);
    assert.equal(report.stderr_size, size);
    assert.doesNotMatch(JSON.stringify(report), /secret|\/private\/key|s{30}/);
  }
});

test('a failure discovered after cleanup never labels the exit as pre-cleanup', t => {
  const f=fixture(t), d=new StableSmokeDiagnostics(f.status);
  writeFileSync(f.status,JSON.stringify({exit_code:0,signal:null,spawn_error:null}),{mode:0o600});
  d.captureStderr('late private stderr');d.finishCleanup();
  d.phase='cleanup';d.fail(new Error('unexpected stderr'));
  assert.equal(d.report().phase,'cleanup');
  assert.equal(d.report().exit_observation,'during_cleanup');
  assert.equal(d.report().child_exit,0);
});

test('failure and untrusted child status use finite safe classes', t => {
  const f = fixture(t);
  for (const [code, expected] of [[-32000, 'connection_closed'], [-32001, 'request_timeout'], ['ERR_ASSERTION', 'assertion'], ['secret /private/key', 'other']]) {
    writeFileSync(f.status, JSON.stringify({ exit_code: 999, signal: 'secret /private/key', spawn_error: null }));
    const d = new StableSmokeDiagnostics(f.status);
    d.fail({ code });
    d.finishCleanup();
    const report = d.report();
    assert.equal(report.error_class, expected);
    assert.equal(report.child_exit, null);
    assert.equal(report.child_signal, null);
    assert.equal(report.exit_observation, 'unavailable');
    assert.doesNotMatch(JSON.stringify(report), /secret|\/private\/key/);
  }
});

test('runner formatting accepts only validated diagnostic records and never raw stderr', () => {
  const prefix = 'APTLY_STABLE_SMOKE_DIAGNOSTIC ';
  const valid = { kind: 'aptly-stable-smoke', phase: 'validation', elapsed_bucket: 'lt_1s', error_class: 'other', stderr_class: 'empty', stderr_size: '0', child_exit: 1, child_signal: null, spawn_error: null, exit_observation: 'before_cleanup' };
  for (const stderr of [
    'secret /private/key',
    prefix + '{broken secret /private/key',
    prefix + JSON.stringify({ ...valid, phase: 'secret /private/key' }),
    prefix + JSON.stringify({ ...valid, child_signal: 'secret /private/key' }),
    prefix + JSON.stringify({ ...valid, child_exit: 9999 }),
    prefix + JSON.stringify({ ...valid, extra: 'secret /private/key' }),
  ]) {
    const output = formatSmokeRunnerFailure({ status: 1, signal: null, stderr });
    assert.doesNotMatch(output, /secret|\/private\/key|broken/);
  }
  const safe = formatSmokeRunnerFailure({ status: 1, signal: null, stderr: Buffer.from(prefix + JSON.stringify(valid) + '\n') });
  assert.deepEqual(JSON.parse(safe), valid);
  assert.doesNotMatch(safe, /secret|\/private\/key/);
});

test('real wrapper preserves env, injects NODE_OPTIONS, inherits output and records normal exit privately', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t);
  const result = runWrapper(f, '/bin/sh', ['-c', 'printf "%s|%s" "$SMOKE_FIXTURE" "$NODE_OPTIONS"; exit 19'], { env: { ...process.env, SMOKE_FIXTURE: 'present', NODE_OPTIONS: '' } });
  assert.equal(result.status, 19);
  assert.equal(result.stdout, 'present|--unsupported-injection-fixture');
  assert.deepEqual(statusAt(f.status), { exit_code: 19, signal: null, spawn_error: null });
  assert.equal(statSync(f.status).mode & 0o077, 0);
});

test('real wrapper records a spawn failure', t => {
  const f = fixture(t);
  const result = runWrapper(f, join(f.dir, 'missing-command'));
  assert.equal(result.status, 1);
  assert.deepEqual(statusAt(f.status), { exit_code: null, signal: null, spawn_error: 'ENOENT' });
});

test('signal received during spawn is forwarded when its child handle becomes available', t => {
  const f=fixture(t);
  // Controlled synchronous spawn boundary, not a claim about the historical CI run.
  const shim=`import {EventEmitter} from 'node:events';
function spawn(){
 for(const signal of ['SIGTERM','SIGINT','SIGHUP'])if(process.listenerCount(signal)===0)throw Error('signal_handler_not_ready');
 const child=new EventEmitter();
 child.kill=signal=>{queueMicrotask(()=>child.emit('close',null,signal));return true;};
 process.emit('SIGTERM');return child;
}`;
  assert.ok(stableSmokeWrapperSource.includes("import {spawn} from 'node:child_process';"));
  writeFileSync(f.wrapper,stableSmokeWrapperSource.replace("import {spawn} from 'node:child_process';",shim));
  const result=runWrapper(f,'synthetic-command');
  assert.equal(result.status,1);
  assert.deepEqual(statusAt(f.status),{exit_code:null,signal:'SIGTERM',spawn_error:null});
});

test('real wrapper forwards termination and records child signal', { skip: process.platform === 'win32',timeout:10000 }, async t => {
  const f = fixture(t);
  const child = spawn(process.execPath, [f.wrapper, f.status, '/bin/sh', '-c', 'echo ready; exec sleep 30'], { stdio: ['ignore', 'pipe', 'pipe'],detached:true });
  const closed=once(child,'close');
  t.after(async() => {
    // Only this fixture's new process group, including descendants left by a failed wrapper.
    try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    await closed;
  });
  await Promise.race([
    once(child.stdout, 'data'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('wrapper fixture startup timed out')), 5000).unref()),
  ]);
  child.kill('SIGTERM');
  const [code,signal] = await closed;
  assert.equal(code, 1);
  assert.equal(signal,null);
  assert.deepEqual(statusAt(f.status), { exit_code: null, signal: 'SIGTERM', spawn_error: null });
});

for (const failurePhase of ['connect', 'capabilities'] as const) {
  test(`real MCP ${failurePhase} failure reports the child exit and redacts stderr`, {skip:process.platform==='win32'}, async t => {
    const f=fixture(t), server=join(f.dir,'server.mjs');
    writeFileSync(server, failurePhase==='connect'
      ? `process.stderr.write('synthetic private /path sentinel');process.exit(37);`
      : `import {createInterface} from 'node:readline';
createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);
 if(r.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result:{protocolVersion:r.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}})+'\\n');
 if(r.method==='tools/call'){process.stderr.write('aptly: stable_runtime_unavailable\\n');process.exit(41);}
});`);
    const diagnostics=new StableSmokeDiagnostics(f.status);
    const transport=new StdioClientTransport({command:process.execPath,
      args:[f.wrapper,f.status,'/bin/sh','-c','unset NODE_OPTIONS; exec "$@"','fixture',process.execPath,server],
      env:{NODE_OPTIONS:''},stderr:'pipe'});
    transport.stderr?.on('data',chunk=>diagnostics.captureStderr(chunk));
    const client=new Client({name:'diagnostic-fixture',version:'1'});
    let failed=false;
    try {
      diagnostics.phase='connect';await client.connect(transport);
      diagnostics.phase='capabilities';await client.callTool({name:'fixture',arguments:{}});
    } catch(error) { failed=true;diagnostics.fail(error); }
    finally { await client.close();diagnostics.finishCleanup(); }
    assert.equal(failed,true);
    const report=diagnostics.report();
    assert.equal(report.phase,failurePhase);
    assert.equal(report.error_class,'connection_closed');
    assert.equal(report.child_exit,failurePhase==='connect'?37:41);
    assert.equal(report.exit_observation,'before_cleanup');
    assert.equal(report.stderr_class,failurePhase==='connect'?'other':'stable_runtime_unavailable');
    assert.doesNotMatch(JSON.stringify(report),/synthetic|private|sentinel|\/path/);
  });
}
