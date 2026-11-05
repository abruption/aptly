import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchModelInfo, loadModelInfo, saveModelInfo, modelInfoUrls } from '../src/model-info.ts';
import { createTestTemp } from '../test-support/temp.ts';

const now=Date.parse('2026-11-05T00:00:00.000Z');
const claude=`# Model configuration
### Model aliases
| Model alias | Behavior |
| - | - |
| **\`default\`** | not a model alias |
| **\`haiku\`** | Fast and efficient for simple tasks |
| **\`sonnet\`** | Daily coding tasks |
| **\`opus\`** | Complex reasoning tasks |
| **\`fable\`** | Uses the [Fable model](#resolution) for long tasks |
### Work with Fable
Ignored text and unrelated examples.
`;
const codex=`# Models
## Recommended models
${['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol','gpt-6-astra'].map(model=>`<ModelDetails
  client:load
  name="${model}"
  slug="${model}"
  description="Description for ${model}."
  data={{irrelevant: true}}
/>`).join('\n')}
## Choosing a model
Ignored text.
`;
const responses=(mutate=x=>x)=>async url=>new Response(mutate(url===modelInfoUrls[0]?claude:codex,url),{headers:{'Content-Type':'text/markdown; charset=utf-8'}});
const snapshot=()=>fetchModelInfo({fetchImpl:responses(),now});
const code=(expected)=>e=>e.code===expected&&e.message===expected;

test('explicit refresh reads only fixed public Markdown endpoints, keeps only normalized known model facts',async()=>{
  const calls=[];
  const r=await fetchModelInfo({fetchImpl:async(url,opts)=>{calls.push({url,opts});return responses()(url);},now});
  assert.deepEqual(calls.map(c=>c.url),[...modelInfoUrls]);
  for(const {opts}of calls){assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');assert.equal(Object.keys(opts.headers).includes('Authorization'),false);}
  assert.equal(r.fetched_at,new Date(now).toISOString());assert.equal(r.facts.length,8);
  assert.equal(r.facts.find(f=>f.model==='fable').description,'Uses the Fable model for long tasks');
  assert(r.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));
  assert(!JSON.stringify(r).includes('irrelevant'));assert(!JSON.stringify(r).includes('default'));
});

test('missing duplicate or unsafe descriptions refuse refresh rather than manufacture a complete catalog',async()=>{
  for(const mutate of [
    (s,url)=>url===modelInfoUrls[0]?s.replace('| **`opus`** | Complex reasoning tasks |',''):s,
    (s,url)=>url===modelInfoUrls[0]?s.replace('### Work with Fable','| **`haiku`** | Duplicate entry |\n### Work with Fable'):s,
    (s,url)=>url===modelInfoUrls[1]?s.replace('name="gpt-6-luna"','name="unknown-model"'):s,
    (s,url)=>url===modelInfoUrls[1]?s.replace('Description for gpt-6-luna.','sk-fixture-sensitive-sentinel'):s,
    (s,url)=>url===modelInfoUrls[0]?s.replace('Fast and efficient for simple tasks','x'.repeat(801)):s,
  ])await assert.rejects(fetchModelInfo({fetchImpl:responses(mutate),now}),code('model_info_parse_failed'));
});

test('redirects, non-Markdown content and raw transport errors produce fixed errors with no response content',async()=>{
  for(const fetchImpl of [
    async()=>new Response('private raw response',{status:302,headers:{Location:'https://untrusted.invalid'}}),
    async()=>new Response('<html>untrusted-content</html>',{headers:{'Content-Type':'text/html'}}),
    async()=>{throw new Error('/synthetic/private/credential-value');},
  ])await assert.rejects(fetchModelInfo({fetchImpl,now}),code('model_info_fetch_failed'));
});

test('oversized streamed bodies and timeout cancel the reader and abort the request',async()=>{
  let cancelled=false,signal;
  await assert.rejects(fetchModelInfo({now,fetchImpl:async(url,opts)=>{signal=opts.signal;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(256*1024+1));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/markdown'}});}}),code('model_info_too_large'));
  assert.equal(cancelled,true);assert.equal(signal.aborted,true);
  cancelled=false;
  await assert.rejects(fetchModelInfo({now,timeoutMs:10,fetchImpl:async(url,opts)=>{signal=opts.signal;return new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/markdown'}});}}),code('model_info_timeout'));
  assert.equal(cancelled,true);assert.equal(signal.aborted,true);
  await assert.rejects(fetchModelInfo({now,timeoutMs:10,fetchImpl:()=>new Promise(()=>{})}),code('model_info_timeout'));
});

test('early HTTP and content-type failures cancel bodies without awaiting hostile cancellation',async()=>{
  for(const [status,contentType] of [[503,'text/markdown'],[200,'text/html'],[302,'text/markdown']]){
    let cancelled=false;
    await assert.rejects(fetchModelInfo({now,timeoutMs:20,fetchImpl:async()=>new Response(new ReadableStream({
      cancel(){cancelled=true;return new Promise(()=>{});}
    }),{status,headers:{'Content-Type':contentType}})}),code('model_info_fetch_failed'));
    assert.equal(cancelled,true);
  }
});

test('a fetch resolving after timeout still cancels its late response body',async()=>{
  let resolveLate,cancelled=false;
  const pending=fetchModelInfo({now,timeoutMs:10,fetchImpl:()=>new Promise(resolve=>{resolveLate=resolve;})});
  await assert.rejects(pending,code('model_info_timeout'));
  resolveLate(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/markdown'}}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);
});

test('private snapshot save/load preserves the old cache on invalid updates and uses a seven-day TTL',async t=>{
  const root=createTestTemp(t,'codex-model-info-'),path=join(root,'model-info.json'),r=await snapshot();
  assert.deepEqual(loadModelInfo(undefined,{now}),{facts:[],status:'bundled'});
  assert.deepEqual(loadModelInfo(path,{now}),{facts:[],status:'bundled'});
  saveModelInfo(path,r);assert.equal(lstatSync(path).mode&0o777,0o600);
  const loaded=loadModelInfo(path,{now});assert.equal(loaded.status,'fresh');assert.deepEqual(loaded.facts,r.facts);
  loaded.facts[0].description='modified';assert.notEqual(loadModelInfo(path,{now}).facts[0].description,'modified');
  assert.equal(loadModelInfo(path,{now:now+7*24*60*60*1000}).status,'fresh');
  assert.equal(loadModelInfo(path,{now:now+7*24*60*60*1000+1}).status,'stale');
  assert.equal(loadModelInfo(path,{now:now-1}).status,'invalid');
  const before=readFileSync(path,'utf8');const invalid=structuredClone(r);invalid.facts[0].extra='private';
  assert.throws(()=>saveModelInfo(path,invalid),code('model_info_invalid'));assert.equal(readFileSync(path,'utf8'),before);
  const next=structuredClone(r);next.fetched_at=new Date(now+1000).toISOString();saveModelInfo(path,next);assert.equal(loadModelInfo(path,{now:now+1000}).status,'fresh');
  assert.deepEqual(readdirSync(root),['model-info.json']);
});

test('cache schema rejects arbitrary sources, model names, duplicates, raw fields and invalid dates',async t=>{
  const root=createTestTemp(t,'codex-model-info-'),path=join(root,'model-info.json'),r=await snapshot();
  for(const mutate of [
    x=>{x.sources[0].url='https://attacker.invalid';},x=>{x.sources[0].sha256='invalid';},
    x=>{x.facts[0].model='unlisted-model';},x=>{x.facts[0]={...x.facts[1]};},
    x=>{x.raw_body='private';},x=>{x.fetched_at='2026-02-31T00:00:00.000Z';},
    x=>{x.facts[0].description=['','home','fixture-user','settings.json'].join('/');},
    x=>{x.facts[0].description='가'.repeat(267);},
  ]){const bad=structuredClone(r);mutate(bad);writeFileSync(path,JSON.stringify(bad),{mode:0o600});assert.deepEqual(loadModelInfo(path,{now}),{facts:[],status:'invalid'});}
  writeFileSync(path,'not JSON',{mode:0o600});assert.equal(loadModelInfo(path,{now}).status,'invalid');
  writeFileSync(path,'x'.repeat(32*1024+1),{mode:0o600});assert.equal(loadModelInfo(path,{now}).status,'unavailable');
});

test('unsafe directories symlinks permissions and unrelated existing files are never replaced',async t=>{
  const root=createTestTemp(t,'codex-model-info-'),r=await snapshot();
  const publicDir=join(root,'public');mkdirSync(publicDir,{mode:0o755});chmodSync(publicDir,0o755);
  assert.throws(()=>saveModelInfo(join(publicDir,'info.json'),r),code('model_info_save_failed'));
  const target=join(root,'existing.json');writeFileSync(target,'{"unrelated":"retained"}',{mode:0o600});
  assert.throws(()=>saveModelInfo(target,r),code('model_info_save_failed'));assert.equal(readFileSync(target,'utf8'),'{"unrelated":"retained"}');
  const linked=join(root,'linked.json');symlinkSync(target,linked);
  assert.equal(loadModelInfo(linked,{now}).status,'unavailable');assert.throws(()=>saveModelInfo(linked,r),code('model_info_save_failed'));
  const privateFile=join(root,'cache.json');saveModelInfo(privateFile,r);chmodSync(privateFile,0o644);
  assert.equal(loadModelInfo(privateFile,{now}).status,'unavailable');assert.throws(()=>saveModelInfo(privateFile,r),code('model_info_save_failed'));assert.equal(lstatSync(privateFile).mode&0o777,0o644);
  assert.equal(loadModelInfo('relative.json',{now}).status,'invalid');assert.equal(existsSync(join(root,'info.json')),false);
});
