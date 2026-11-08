#!/usr/bin/env node
// Offline only: recompute the frozen pilot without reading credentials or calling a provider.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const corpusBytes = readFileSync(new URL('../test-support/confidence-evaluation-cases.json', import.meta.url));
const corpus = JSON.parse(corpusBytes.toString());
const evidence = JSON.parse(readFileSync(new URL('../docs/CONFIDENCE_EVALUATION.json', import.meta.url), 'utf8'));
assert.equal(createHash('sha256').update(corpusBytes).digest('hex'), evidence.corpus_sha256);
assert.equal(evidence.schema_version, 1);
assert.equal(evidence.rows.length, corpus.cases.length * corpus.repetitions);
const seen = new Set<string>();
for (const row of evidence.rows) {
  const entry = corpus.cases.find((item: { id: string }) => item.id === row.case_id);
  assert.ok(entry, 'unknown case');
  assert.ok(Number.isInteger(row.round) && row.round >= 1 && row.round <= corpus.repetitions);
  const key = `${row.case_id}:${row.round}`;
  assert.ok(!seen.has(key), 'duplicate case/round'); seen.add(key);
  assert.equal(row.cached, false, 'paid samples must not include local cache replays');
  assert.ok(['recommended', 'needs_context', 'keep_current'].includes(row.status));
  assert.ok(Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1);
  assert.ok(Number.isFinite(row.latency_ms) && row.latency_ms >= 0);
  assert.ok(Number.isFinite(row.wall_latency_ms) && row.wall_latency_ms >= 0);
  for (const field of ['input_tokens', 'output_tokens', 'total_tokens']) assert.ok(Number.isSafeInteger(row.usage[field]) && row.usage[field] >= 0);
  assert.equal(row.usage.total_tokens, row.usage.input_tokens + row.usage.output_tokens);
  if (row.status === 'recommended') assert.ok(row.profile_id?.startsWith(entry.client + '-'));
}
const choice = (row: { status: string; profile_id?: string }) => row.status === 'recommended' ? row.profile_id : row.status;
const matches = (row: { case_id: string; status: string; profile_id?: string }) => corpus.cases.find((item: { id: string }) => item.id === row.case_id).expected.includes(choice(row));
const recommended = evidence.rows.filter((row: { status: string }) => row.status === 'recommended');
const sum = (field: string) => evidence.rows.reduce((total: number, row: { usage: Record<string, number> }) => total + row.usage[field], 0);
const latency = evidence.rows.map((row: { latency_ms: number }) => row.latency_ms).sort((a: number, b: number) => a - b);
const wall = evidence.rows.map((row: { wall_latency_ms: number }) => row.wall_latency_ms).sort((a: number, b: number) => a - b);
const median = (values: number[]) => (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
const groups = corpus.cases.map((item: { id: string }) => evidence.rows.filter((row: { case_id: string }) => row.case_id === item.id));
console.log(JSON.stringify({
  corpus_sha256: evidence.corpus_sha256,
  unique_cases: corpus.cases.length, paid_samples: evidence.rows.length,
  author_rubric_matches: evidence.rows.filter(matches).length,
  stable_choice_case_pairs: groups.filter((group: { status: string; profile_id?: string }[]) => new Set(group.map(choice)).size === 1).length,
  recommended_samples: recommended.length,
  context_or_abstention_samples: evidence.rows.length - recommended.length,
  usage: { input_tokens: sum('input_tokens'), output_tokens: sum('output_tokens'), total_tokens: sum('total_tokens') },
  uncached_input_equivalent_usd: sum('input_tokens') * evidence.pricing.uncached_input_usd_per_million / 1_000_000,
  provider_path_latency_ms: { min: latency[0], median: median(latency), max: latency.at(-1) },
  mcp_wall_latency_ms: { min: wall[0], median: median(wall), max: wall.at(-1) },
  // Post-hoc descriptive cutoffs, NOT validated deployment policies or measured quality gains.
  post_hoc_cutoff_counts: [0, 0.25, 0.5, 0.75, 0.9].map(cutoff => {
    const retained = recommended.filter((row: { confidence: number }) => row.confidence >= cutoff);
    return { cutoff, retained: retained.length, excluded: recommended.length - retained.length,
      retained_author_rubric_matches: retained.filter(matches).length,
      excluded_author_rubric_matches: recommended.filter((row: { confidence: number }) => row.confidence < cutoff).filter(matches).length };
  }),
  no_policy_change: true, no_child_execution: true,
}, null, 2));
