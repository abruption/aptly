import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
async function readChunks(t, chunks) {
  const moduleUrl = new URL('../src/cli-input.ts', import.meta.url).href;
  const script = `
    import { readEnvironmentValue } from ${JSON.stringify(moduleUrl)};
    import { createHash } from 'node:crypto';
    const original = process.stdin[Symbol.asyncIterator].bind(process.stdin);
    process.stdin[Symbol.asyncIterator] = async function* () {
      for await (const chunk of original()) {
        yield chunk;
        process.send({kind:'consumed'});
      }
    };
    const reading = readEnvironmentValue({key:'ROUTER_LEDGER_PATH',fromStdin:true});
    process.send({kind:'ready'});
    try {
      const value = await reading;
      process.stdout.write(JSON.stringify({hash:createHash('sha256').update(value).digest('hex'),bytes:Buffer.byteLength(value)}));
    } catch (error) {
      process.stdout.write(JSON.stringify({error:error.message}));
    } finally { process.disconnect(); }
  `;
  const child = spawn(process.execPath, ['--input-type=module','-e',script], {
    env:{PATH:process.env.PATH}, stdio:['pipe','pipe','pipe','ipc'],
  });
  t.after(()=>child.kill());
  let stdout='',stderr='';
  child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
  const closed=once(child,'close');
  assert.equal((await once(child,'message'))[0].kind,'ready');
  // Wait until the consumer processed each write, so byte fragments cannot
  // coalesce into one chunk and accidentally hide the original decoding bug.
  for(let i=0;i<chunks.length;i++) {
    const consumed=i<chunks.length-1?once(child,'message'):null;
    child.stdin.write(chunks[i]);
    if(consumed)assert.equal((await consumed)[0].kind,'consumed');
  }
  child.stdin.end();
  const [code]=await closed;
  assert.equal(code,0);assert.equal(stderr,'');
  return JSON.parse(stdout);
}

test('stdin preserves split Korean and four-byte Unicode with split CRLF', {timeout:10000}, async t => {
  const value='/synthetic/한글/문서-😀';
  const chunks=Array.from(Buffer.from(value+'\r\n'),byte=>Buffer.from([byte]));
  assert.deepEqual(await readChunks(t,chunks),{hash:digest(value),bytes:Buffer.byteLength(value)});
});
test('stdin retains the byte limit and removes only one trailing newline', {timeout:10000}, async t => {
  const value='한'.repeat(2730)+'ab'; // exactly 8192 bytes
  const bytes=Buffer.from(value);
  assert.deepEqual(await readChunks(t,[bytes.subarray(0,1),bytes.subarray(1)]),{hash:digest(value),bytes:8192});
  assert.deepEqual(await readChunks(t,[Buffer.alloc(8192,97),Buffer.from('\n')]),{error:'set_value_too_large'});
  assert.deepEqual(await readChunks(t,[Buffer.from('synthetic\n\n')]),{hash:digest('synthetic\n'),bytes:10});
});
test('stdin flushes incomplete UTF-8 at EOF and still bounds decoded output', {timeout:10000}, async t => {
  assert.deepEqual(await readChunks(t,[Buffer.from([0xed])]),{hash:digest('\ufffd'),bytes:3});
  assert.deepEqual(await readChunks(t,[Buffer.alloc(8192,0xff)]),{error:'set_value_too_large'});
});
