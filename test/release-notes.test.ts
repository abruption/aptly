import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createTestTemp } from '../test-support/temp.ts';
import { renderReleaseBody } from '../scripts/release-notes.ts';

const tag='v0.1.16',evidence='a'.repeat(40);
const source=`# Aptly 0.1.16
[명시적으로 갱신](../guide/ko/configuration.md#guide-stable-launcher)
[설치·업데이트 안내](../guide/ko/installation.md#guide-package-updates)
[게시 기록](../releases/0.1.16.md)
`;
function fixture() {
  const files=new Map([
    [tag+':docs/guide/ko/configuration.md','<a id="guide-stable-launcher"></a>\n# 설정'],
    [tag+':docs/guide/ko/installation.md','<a id="guide-package-updates"></a>\n# 설치'],
    [evidence+':docs/releases/0.1.16.md','# 게시 기록'],
  ]);
  const reads:string[]=[];
  const options={releaseTag:tag,evidenceRef:evidence,readFile:(ref:string,path:string)=>{const key=ref+':'+path;reads.push(key);return files.get(key);}};
  return {files,reads,options};
}

test('three publication links use the release tag for guides and the post-tag evidence commit',()=>{
  const f=fixture(),{body,links}=renderReleaseBody(source,f.options);
  const expected=[
    'https://github.com/abruption/aptly/blob/v0.1.16/docs/guide/ko/configuration.md#guide-stable-launcher',
    'https://github.com/abruption/aptly/blob/v0.1.16/docs/guide/ko/installation.md#guide-package-updates',
    `https://github.com/abruption/aptly/blob/${evidence}/docs/releases/0.1.16.md`,
  ];
  assert.deepEqual(links.map(link=>link.href),expected);
  for(const href of expected)assert.ok(body.includes(href));
  assert.ok(source.includes('(../guide/'));
  assert.equal(f.reads.some(key=>key===tag+':docs/releases/0.1.16.md'),false);
});

test('missing evidence, missing tag files and absent anchors fail before any body is returned',()=>{
  for(const missing of ['evidence','guide','anchor']){
    const f=fixture();
    if(missing==='evidence')f.files.delete(evidence+':docs/releases/0.1.16.md');
    if(missing==='guide')f.files.delete(tag+':docs/guide/ko/installation.md');
    if(missing==='anchor')f.files.set(tag+':docs/guide/ko/configuration.md','# Changed heading');
    assert.throws(()=>renderReleaseBody(source,f.options),{message:missing==='anchor'?'release_notes_missing_anchor':'release_notes_missing_file'});
  }
});

test('unsafe refs and paths are rejected without consulting a file reader',()=>{
  const f=fixture();
  for(const patch of [{releaseTag:'main'},{releaseTag:'--help'},{evidenceRef:'main'},{evidenceRef:'a'.repeat(40)+'\n'}])assert.throws(()=>renderReleaseBody(source,{...f.options,...patch}),{message:'release_notes_invalid_ref'});
  for(const target of ['../../../../secret.md','%2e%2e/%2e%2e/%2e%2e/secret.md','../guide/%00.md','javascript:alert','//outside.example/path'])assert.throws(()=>renderReleaseBody(`[bad](${target})`,f.options));
  assert.equal(f.reads.length,0);
});

test('code blocks and inline code remain unchanged; external links are not fetched',()=>{
  const f=fixture(),text='```md\n[example](../absent.md)\n```\n`[example](../absent.md)`\n[external](https://example.com/)\n[mail](mailto:example@example.com)';
  assert.equal(renderReleaseBody(text,f.options).body,text);assert.equal(f.reads.length,0);
  const double='`` ` [example](../absent.md) ` ``';
  assert.equal(renderReleaseBody(double,f.options).body,double);
  const nested='```md\n```not-a-closing-fence\n[example](../absent.md)\n```';
  assert.equal(renderReleaseBody(nested,f.options).body,nested);
  assert.throws(()=>renderReleaseBody('```md\nunfinished',f.options),{message:'release_notes_unclosed_fence'});
});

test('unsupported relative forms are rejected instead of leaking into a published body',()=>{
  const f=fixture();
  for(const text of ['[x](guide(file).md)','[x](../guide(file).md)','[x][ref]\n[ref]: ../guide.md','<a href=../foo>foo</a>','<a href="../foo">foo</a>','\\` [x](../foo.md) \\`'])assert.throws(()=>renderReleaseBody(text,f.options),{message:'release_notes_unsupported_link'});
});

test('heading and local-fragment anchors are validated with the documentation checker',()=>{
  const f=fixture();f.files.set(tag+':docs/guide/ko/installation.md','# Package updates');
  const text='# Local heading\n[local](#local-heading)\n[guide](../guide/ko/installation.md#package-updates)';
  assert.ok(renderReleaseBody(text,f.options).body.includes('#package-updates'));
  assert.throws(()=>renderReleaseBody('[bad](#absent)',f.options),{message:'release_notes_missing_anchor'});
});

test('documented publish command cannot publish after rendering fails', {skip:process.platform==='win32'}, t=>{
  const dir=createTestTemp(t,'codex-release-command-'),bin=join(dir,'bin');mkdirSync(bin);
  const doc=readFileSync(new URL('../docs/RELEASING.md',import.meta.url),'utf8');
  const block=doc.match(/```sh\n(aptly_release_version=X\.Y\.Z[\s\S]*?)\n```/)![1];
  const q=(v:string)=>"'"+v.replaceAll("'","'\\''")+"'";
  const body=join(dir,'body.md'),receipt=join(dir,'posted');
  const command=block.replaceAll('/absolute/private/release-evidence/release-body.md',q(body));
  writeFileSync(join(bin,'gh'),'#!/bin/sh\nprintf posted > "$SMOKE_RECEIPT"\n',{mode:0o700});
  const run=()=>spawnSync('/bin/sh',['-c',command],{cwd:dir,env:{PATH:bin+':/usr/bin:/bin',SMOKE_RECEIPT:receipt},encoding:'utf8',timeout:5000});
  writeFileSync(join(bin,'node'),'#!/bin/sh\nexit 1\n',{mode:0o700});
  assert.equal(run().status,1);assert.equal(existsSync(receipt),false);
  writeFileSync(join(bin,'node'),'#!/bin/sh\nprintf "fixture body\\n"\n',{mode:0o700});
  assert.equal(run().status,0);assert.equal(readFileSync(receipt,'utf8'),'posted');
  assert.equal(readFileSync(body,'utf8'),'fixture body\n');
});
