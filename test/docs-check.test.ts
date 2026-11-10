import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDocumentation, auditGuideContent, type DocumentationInput } from '../scripts/docs-check.ts';
import { guideLocales, guideTopics } from '../scripts/guide-contract.ts';

function fixture(): DocumentationInput {
  const files: Record<string, string> = {
    'README.md': '# Readme\n', 'README.en.md': '# Readme\n', 'README.ja.md': '# Readme\n', 'README.zh-CN.md': '# Readme\n',
    'docs/ADVISORY_USAGE.md': '# Advisory\n', 'docs/SPAWN_CONTEXT.md': '# Context\n', 'docs/DRAFT_0_1_0.md': '# Draft\n',
  };
  for (const locale of guideLocales) {
    files[`docs/guide/${locale}.md`] = `# Guide\n<a id="old-install"></a>\n[Installation](${locale}/installation.md#install)\n` + guideTopics.slice(1).map(topic => `[${topic}](${locale}/${topic}.md)`).join('\n');
    for (const topic of guideTopics) {
      const links = guideLocales.filter(other => other !== locale).map(other => `[${other}](../${other}/${topic}.md)`).join(' ');
      files[`docs/guide/${locale}/${topic}.md`] = `# ${topic}\n${links}\n[Guide](../${locale}.md)\n<a id="install"></a>\n\`\`\`sh\naptly --version\n\`\`\`\n`;
    }
  }
  return { files, packageFiles: Object.keys(files), legacyAnchors: { source_commit: 'abc', locales: Object.fromEntries(guideLocales.map(locale => [locale, [{ id: 'old-install', topic: 'installation', target: 'install' }]])) } };
}
const codes = (input: DocumentationInput) => auditDocumentation(input).map(error => error.code);

test('a complete linked and packaged multilingual guide passes', () => assert.deepEqual(auditDocumentation(fixture()), []));
test('detects absent files and files missing from the package', () => {
  const input = fixture(); delete input.files['docs/guide/en/budget.md']; input.packageFiles = input.packageFiles.filter(file => file !== 'docs/guide/ja/routing.md');
  const errors = auditDocumentation(input);
  assert.ok(errors.some(error => error.code === 'missing-file' && error.path === 'docs/guide/en/budget.md'));
  assert.ok(errors.some(error => error.code === 'missing-package-file' && error.path === 'docs/guide/ja/routing.md'));
});
test('detects broken fragments and anchor collisions but ignores fenced content', () => {
  const input = fixture(); input.files['README.md'] += '[bad](docs/guide/en/installation.md#missing)\n';
  input.files['docs/guide/en/installation.md'] += '<a id="installation"></a>\n';
  input.files['docs/guide/ja/installation.md'] += '```md\n# installation\n<a id="install"></a>\n```\n';
  const errors = auditDocumentation(input);
  assert.ok(errors.some(error => error.code === 'broken-fragment' && error.path === 'README.md'));
  assert.ok(errors.some(error => error.code === 'anchor-collision' && error.path === 'docs/guide/en/installation.md'));
  assert.ok(!errors.some(error => error.code === 'anchor-collision' && error.path === 'docs/guide/ja/installation.md'));
});
test('detects missing language links and changed executable examples', () => {
  const input = fixture(); const file = 'docs/guide/en/budget.md';
  input.files[file] = input.files[file].replace('[ja](../ja/budget.md)', '').replace('aptly --version', 'aptly update');
  assert.ok(codes(input).includes('language-navigation')); assert.ok(codes(input).includes('fence-parity'));
});
test('detects orphan topics and legacy anchors pointing to the wrong target', () => {
  const input = fixture(); input.files['docs/guide/en.md'] = input.files['docs/guide/en.md'].replace('[budget](en/budget.md)', '').replace('en/installation.md#install', 'en/routing.md#install') + '\n[unrelated](en/installation.md#install)\n';
  const errors = auditDocumentation(input);
  assert.ok(errors.some(error => error.code === 'unreachable-topic' && error.path === 'docs/guide/en/budget.md'));
  assert.ok(errors.some(error => error.code === 'legacy-anchor' && error.path === 'docs/guide/en.md'));
});

test('duplicate headings receive GitHub suffixes and local file URLs are rejected', () => {
  const input = fixture();
  input.files['docs/guide/en/routing.md'] += '\n## Details\n## Details\n';
  input.files['README.en.md'] += '[second](docs/guide/en/routing.md#details-1)\n';
  assert.deepEqual(auditDocumentation(input), []);
  input.files['README.en.md'] += '[invalid](file:///outside.md)\n';
  assert.ok(auditDocumentation(input).some(error => error.code === 'broken-link' && error.path === 'README.en.md'));
});


test('detects missing landing links, mismatched TOML, and unclosed fences', () => {
  const input = fixture();
  for (const locale of guideLocales) input.files[`docs/guide/${locale}/configuration.md`] += '\n```toml\nkey = "value"\n```\n';
  const file = 'docs/guide/en/configuration.md';
  input.files[file] = input.files[file].replace('[Guide](../en.md)', '').replace('key = "value"', 'key = "different"');
  input.files['docs/guide/ja/routing.md'] += '\n```text\nunclosed\n';
  const errors = auditDocumentation(input);
  assert.ok(errors.some(error => error.code === 'missing-landing-link' && error.path === file));
  assert.ok(errors.some(error => error.code === 'fence-parity' && error.path === file));
  assert.ok(errors.some(error => error.code === 'unclosed-fence' && error.path === 'docs/guide/ja/routing.md'));
});

test('invalid JSON cannot pass through language parity and README stays compact', () => {
  const input=fixture();
  for (const locale of guideLocales) input.files[`docs/guide/${locale}/routing.md`]+='\n```json\n{invalid}\n```\n';
  input.files['README.en.md']+='\n'.repeat(71)+'[end](docs/guide/en.md)\n';
  assert.ok(codes(input).includes('invalid-json-example'));
  assert.ok(codes(input).includes('readme-not-minimal'));
});
test('historical figures and models must remain in their canonical topics', () => {
  const files:Record<string,string>={};
  for(const locale of guideLocales){
    files[`docs/guide/${locale}/benchmarks.md`]='$0.03229 $0.01354 58.05% $0.11254 $0.05363 52.35% $0.0000756';
    files[`docs/guide/${locale}/configuration.md`]='`gpt-6-luna` `gpt-6.1-terra` `gpt-6.1-sol` `haiku` `sonnet` `opus`';
  }
  assert.deepEqual(auditGuideContent(files),[]);
  files['README.md']=files['docs/guide/en/benchmarks.md'];
  files['docs/guide/en/benchmarks.md']='58%';
  files['docs/guide/ja/configuration.md']=files['docs/guide/ja/configuration.md'].replace('`haiku`','`other`');
  const errors=auditGuideContent(files);
  assert.ok(errors.some(e=>e.code==='benchmark-content'&&e.path==='docs/guide/en/benchmarks.md'));
  assert.ok(errors.some(e=>e.code==='model-content'&&e.path==='docs/guide/ja/configuration.md'));
});
