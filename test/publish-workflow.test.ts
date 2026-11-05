import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');

// This contract deliberately accepts only the workflow's literal block form.
// actionlint checks full YAML syntax; rejecting indirection here prevents aliases
// or alternative job/step syntax from bypassing these trust-boundary checks.
function releaseJobs(source: string): Record<string, string> {
  assert.doesNotMatch(source, /(?:^|\s)[&*][A-Za-z0-9_-]+|^\s*<<\s*:/m);
  const section = source.split(/^jobs:\s*$/m)[1];
  assert.ok(section, 'literal jobs mapping required');
  const matches = [...section.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)];
  const jobs = Object.fromEntries(matches.map((match, index) => [match[1], section.slice(match.index! + match[0].length, matches[index + 1]?.index)]));
  assert.deepEqual(Object.keys(jobs).sort(), ['package-smoke', 'prepare', 'publish']);
  for (const job of Object.values(jobs)) assert.match(job, /^    steps:\s*$/m);
  return jobs;
}

function steps(job: string): string[] {
  const body = job.split(/^    steps:\s*$/m)[1];
  const parts = body.split(/^      - /m);
  assert.equal(parts.shift()!.trim(), '', 'literal step list required');
  assert.ok(parts.length > 0);
  return parts;
}

function isolationContract(source: string): void {
  const jobs = releaseJobs(source), smoke = jobs['package-smoke'], prepare = jobs.prepare, publish = jobs.publish;
  const smokeSteps = steps(smoke), prepareSteps = steps(prepare);

  assert.match(smoke, /^    runs-on: ubuntu-latest$/m);
  assert.match(smoke, /^    permissions:\n      contents: read\n/m);
  assert.doesNotMatch(smoke, /^    (?:outputs|environment|needs):|id-token:|GITHUB_OUTPUT|needs\./m);
  const smokeActions = smokeSteps.flatMap(step => [...step.matchAll(/(?:^|\n)\s*uses:\s*(\S+)/g)].map(match => match[1]));
  assert.equal(smokeActions.length, 2);
  assert.match(smokeActions[0], /^actions\/checkout@[a-f0-9]{40}$/);
  assert.match(smokeActions[1], /^actions\/setup-node@[a-f0-9]{40}$/);
  assert.match(smokeSteps[0], /ref: refs\/tags\/\$\{\{ inputs.release_tag \|\| github.ref_name \}\}/);
  assert.match(smokeSteps[0], /persist-credentials: false/);
  assert.match(smokeSteps[1], /package-manager-cache: false/);
  assert.match(smoke, /run: npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(smoke, /run: npm run build/);
  assert.match(smoke, /run: npm run test:package/);
  assert.doesNotMatch(smoke, /upload-artifact|download-artifact|actions\/cache|npm publish|artifact[_-]id/);

  assert.match(prepare, /^    needs: package-smoke$/m);
  assert.match(prepare, /^    runs-on: ubuntu-latest$/m);
  assert.doesNotMatch(prepare, /^    if:|test:package|package-smoke\.outputs|download-artifact|actions\/cache/m);
  const checkout = prepareSteps.findIndex(step => /uses: actions\/checkout@/.test(step));
  const install = prepareSteps.findIndex(step => /run: npm ci --ignore-scripts/.test(step));
  const build = prepareSteps.findIndex(step => /run: npm run typecheck && npm run build/.test(step));
  const pack = prepareSteps.findIndex(step => /npm pack --ignore-scripts/.test(step));
  const upload = prepareSteps.findIndex(step => /uses: actions\/upload-artifact@/.test(step));
  assert.ok(checkout >= 0 && checkout < install && install < build && build < pack && pack < upload,
    'fresh checkout and locked script-free install/build must precede release archive upload');
  assert.match(prepareSteps[checkout], /ref: refs\/tags\/\$\{\{ inputs.release_tag \|\| github.ref_name \}\}/);
  assert.match(prepareSteps[checkout], /persist-credentials: false/);
  assert.match(prepare, /package-manager-cache: false/);
  assert.match(prepare, /artifact_id: \$\{\{ steps.upload.outputs.artifact-id \}\}/);

  assert.match(publish, /^    needs: prepare$/m);
  assert.match(publish, /ref: \$\{\{ needs.prepare.outputs.source_sha \}\}/);
  assert.match(publish, /artifact-ids: \$\{\{ needs.prepare.outputs.artifact_id \}\}/);
  assert.doesNotMatch(publish, /package-smoke|actions\/cache/);
}

test('release smoke scripts cannot supply the fresh packaging job or publish artifact', () => {
  isolationContract(workflow);
});

test('release isolation rejects moving smoke into packaging or transferring smoke artifacts', () => {
  const mutations = [
    workflow.replace('    needs: package-smoke\n', ''),
    workflow.replace('      - name: Audit public package contents', '      - run: npm run test:package\n      - name: Audit public package contents'),
    workflow.replace('    name: Smoke-test package in a disposable runner', '    outputs:\n      artifact_id: fake\n    name: Smoke-test package in a disposable runner'),
    workflow.replace('      artifact-ids: ${{ needs.prepare.outputs.artifact_id }}', '      artifact-ids: ${{ needs.package-smoke.outputs.artifact_id }}'),
    workflow.replace('    name: Validate and pack release', '    if: always()\n    name: Validate and pack release'),
    workflow.replace('run: npm ci --ignore-scripts --no-audit --no-fund', 'run: npm ci --no-audit --no-fund'),
  ];
  for (const mutation of mutations) assert.throws(() => isolationContract(mutation));
});
