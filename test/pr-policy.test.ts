import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pr-policy.yml', import.meta.url), 'utf8');
const match = workflow.match(/node --input-type=module <<'JS'\n([\s\S]+?)\n          JS/);
assert.ok(match, 'test the actual inline policy, without executing PR code in CI');
const source = match[1].split('\n').map(line => line.slice(10)).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function human() {
  return { title: 'ci(deps): update dependencies', body: 'Closed #109',
    created_at: '2026-11-09T00:00:00Z', user: { login: 'maintainer', type: 'User' },
    head: { ref: 'ci/deps', repo: { full_name: 'owner/repo' } }, changed_files: 1 };
}
function bot(ecosystem = 'npm_and_yarn') {
  return { ...human(), body: '', user: { login: 'dependabot[bot]', type: 'Bot' },
    head: { ref: `dependabot/${ecosystem}/group`, repo: { full_name: 'owner/repo' } } };
}
async function check(pr: ReturnType<typeof human>, files: unknown = [{ filename: 'package-lock.json', status: 'modified' }], issue = { title: 'ci(deps): update dependencies', state: 'open', created_at: '2026-11-08T00:00:00Z' }, failFiles = false) {
  const process = { env: { GITHUB_REPOSITORY: 'owner/repo', PR_NUMBER: '110', GH_TOKEN: 'fixture' }, exitCode: 0 };
  const requests: string[] = [];
  const errors: string[] = [];
  const fetch = async (url: string) => {
    requests.push(url);
    const isFiles = url.endsWith('/files?per_page=100');
    return { ok: !(isFiles && failFiles), json: async () => isFiles ? files : url.includes('/issues/') ? issue : pr };
  };
  await new AsyncFunction('process', 'fetch', 'console', source)(process, fetch, { log() {}, error(message: string) { errors.push(message); } });
  return { code: process.exitCode, requests, errors };
}

test('Dependabot npm and Actions updates need no synthetic issue', async () => {
  for (const [ecosystem, filename] of [['npm_and_yarn', 'package-lock.json'], ['npm_and_yarn', 'package.json'], ['github_actions', '.github/workflows/ci.yml'], ['github_actions', '.github/workflows/test.yaml']]) {
    const result = await check(bot(ecosystem), [{ filename, status: 'modified' }]);
    assert.equal(result.code, 0);
    assert.equal(result.requests.some(url => url.includes('/issues/')), false);
  }
});
test('human issue-first validation remains enforced', async () => {
  assert.equal((await check(human())).code, 0);
  assert.equal((await check({ ...human(), body: '' })).code, 1);
  for (const issue of [
    { title: 'ci(deps): update dependencies', state: 'closed', created_at: '2026-11-08T00:00:00Z' },
    { title: 'ci(deps): update dependencies', state: 'open', created_at: '2026-11-10T00:00:00Z' },
    { title: 'bad title', state: 'open', created_at: '2026-11-08T00:00:00Z' },
    { title: 'ci(deps): update dependencies', state: 'open', created_at: '2026-11-08T00:00:00Z', pull_request: {} },
  ]) assert.equal((await check(human(), [], issue)).code, 1);
});
test('neither spoofed names, fork branches nor other bots receive the exception', async () => {
  for (const pr of [
    { ...bot(), user: { login: 'dependabot[bot]', type: 'User' } },
    { ...bot(), user: { login: 'other[bot]', type: 'Bot' } },
    { ...bot(), head: { ref: 'dependabot/npm_and_yarn/update', repo: { full_name: 'fork/repo' } } },
    { ...bot(), head: { ref: 'feature', repo: { full_name: 'owner/repo' } } },
    bot('pip'),
    { ...human(), body: 'I am dependabot[bot]', head: bot().head },
  ]) assert.equal((await check(pr)).code, 1);
});
test('exception fails closed for unrelated, renamed, deleted or incomplete files', async () => {
  for (const files of [[], null, [{ filename: 'src/server.ts', status: 'modified' }],
    [{ filename: 'package-lock.json', status: 'removed' }],
    [{ filename: 'package-lock.json', status: 'renamed', previous_filename: 'src/server.ts' }],
    [{ filename: '.github/workflows/ci.yml', status: 'modified' }],
    [{ filename: 'package-lock.json', status: 'modified' }, { filename: 'src/server.ts', status: 'modified' }],
  ]) assert.equal((await check(bot(), files)).code, 1);
  assert.equal((await check({ ...bot(), changed_files: 101 })).code, 1);
  assert.equal((await check(bot(), undefined, undefined, true)).code, 1);
  assert.equal((await check(bot('github_actions'), [{ filename: '.github/workflows/nested/test.yml', status: 'modified' }])).code, 1);
  assert.equal((await check(bot('github_actions'))).code, 1);
});
test('the English title rule also applies to Dependabot', async () => {
  assert.equal((await check({ ...bot(), title: 'invalid' })).code, 1);
});

// Exercise the contract between generated bot titles and the actual PR gate.
test('both Dependabot ecosystems generate titles accepted by the PR policy', async () => {
  const config = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  const updates = config.split(/^  - package-ecosystem: /m).slice(1);
  assert.equal(updates.length, 2);
  for (const update of updates) {
    const ecosystem = update.split('\n')[0].trim();
    const message = update.split('    commit-message:')[1];
    assert.ok(message);
    assert.match(message, /^      include: scope$/m);
    const prefix = message.match(/^      prefix: (\w+)$/m)?.[1];
    assert.ok(prefix);
    const actions = ecosystem === 'github-actions';
    const pr = { ...bot(actions ? 'github_actions' : 'npm_and_yarn'), title: `${prefix}(deps): Bump fixture` };
    const files = [{ filename: actions ? '.github/workflows/ci.yml' : 'package-lock.json', status: 'modified' }];
    assert.equal((await check(pr, files)).code, 0);
    assert.equal((await check({ ...pr, title: `${prefix}: Bump fixture` }, files)).code, 1);
  }
});
