import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guideFiles, guideLocales, guideTopics } from './guide-contract.ts';

export type LegacyAnchors = { source_commit: string; locales: Record<string, { id: string; topic: string; target: string }[]> };
export type DocumentationInput = { files: Record<string, string>; packageFiles: string[]; legacyAnchors?: LegacyAnchors };
export type DocumentationError = { code: string; path: string };

const readmes = ['README.md', 'README.en.md', 'README.zh-CN.md', 'README.ja.md'];
const extraDocs = ['docs/ADVISORY_USAGE.md', 'docs/SPAWN_CONTEXT.md', 'docs/DRAFT_0_1_0.md'];
const roots = [...readmes, ...guideFiles, ...extraDocs];
const topicPath = (locale: string, topic: string) => `docs/guide/${locale}/${topic}.md`;

type Link = { destination: string; file: string; fragment: string };
type Parsed = { anchors: Set<string>; collisions: boolean; unclosedFence: boolean; invalidJson: boolean; links: Link[]; fences: string[] };

function resolveLink(source: string, destination: string): Link | undefined {
  const raw = destination.trim().replace(/^<|>$/g, '');
  if (!raw || /^(?:https?:|mailto:)/i.test(raw)) return;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) return { destination: raw, file: '..', fragment: '' };
  const [location, fragment = ''] = raw.split('#', 2);
  try {
    const decoded = decodeURIComponent(location.split('?')[0]);
    const file = decoded ? path.posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(source), decoded)) : source;
    if (file === '..' || file.startsWith('../')) return { destination: raw, file: '..', fragment: '' };
    return { destination: raw, file, fragment: decodeURIComponent(fragment) };
  } catch { return { destination: raw, file: '..', fragment: '' }; }
}

function headingId(text: string): string {
  return text.toLowerCase().replace(/<[^>]*>/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').trim().replace(/\s/g, '-');
}

function parse(source: string, content: string): Parsed {
  const anchors = new Set<string>(); const links: Link[] = []; const fences: string[] = [];
  let collisions = false; let invalidJson = false; let marker = ''; let fenceTag = ''; let body: string[] = [];
  const headings = new Set<string>(); const explicit = new Set<string>();
  const addExplicit = (id: string) => { if (anchors.has(id)) collisions = true; explicit.add(id); anchors.add(id); };
  const addHeading = (base: string) => {
    let id = base; let suffix = 0;
    while (headings.has(id)) id = `${base}-${++suffix}`;
    headings.add(id); if (explicit.has(id)) collisions = true; anchors.add(id);
  };
  for (const line of content.split(/\r?\n/)) {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})([^`]*)$/);
    if (marker) {
      if (fence && fence[1][0] === marker[0] && fence[1].length >= marker.length && !fence[2].trim()) {
        if (/^json$/i.test(fenceTag)) { try { JSON.parse(body.join('\n')); } catch { invalidJson = true; } }
        if (/^(?:sh|bash|shell|console|json|toml)$/i.test(fenceTag)) fences.push(`${fenceTag.toLowerCase()}\n${body.join('\n')}`);
        marker = ''; body = []; continue;
      }
      body.push(line); continue;
    }
    if (fence) { marker = fence[1]; fenceTag = fence[2].trim().split(/\s+/)[0]; continue; }
    for (const m of line.matchAll(/<a\s+[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)) addExplicit(m[1]);
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) addHeading(headingId(heading[1]));
    // Links use the repository's inline Markdown conventions, including optional titles.
    for (const m of line.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g)) {
      const link = resolveLink(source, m[1]); if (link) links.push(link);
    }
    for (const m of line.matchAll(/\[[^\]]+\]:\s*(<[^>]+>|[^\s]+)/g)) {
      const link = resolveLink(source, m[1]); if (link) links.push(link);
    }
  }
  return { anchors, collisions, unclosedFence: Boolean(marker), invalidJson, links, fences };
}

export function auditDocumentation(input: DocumentationInput): DocumentationError[] {
  const errors: DocumentationError[] = []; const seen = new Set<string>();
  const report = (code: string, file: string) => { const key = `${code}\0${file}`; if (!seen.has(key)) { seen.add(key); errors.push({ code, path: file }); } };
  const packaged = new Set(input.packageFiles); const parsed = new Map<string, Parsed>();
  for (const file of roots) {
    if (!(file in input.files)) report('missing-file', file);
    if (!packaged.has(file)) report('missing-package-file', file);
  }
  for (const [file, content] of Object.entries(input.files)) {
    if (!/\.md$/i.test(file)) continue;
    const doc = parse(file, content); parsed.set(file, doc);
    if (doc.collisions) report('anchor-collision', file);
    if (doc.unclosedFence) report('unclosed-fence', file);
    if (doc.invalidJson) report('invalid-json-example', file);
  }
  for (const [file, doc] of parsed) {
    for (const link of doc.links) {
      if (!(link.file in input.files)) { report('broken-link', file); continue; }
      if (packaged.has(file) && !packaged.has(link.file)) report('unpackaged-link', file);
      if (link.fragment && !parsed.get(link.file)?.anchors.has(link.fragment)) report('broken-fragment', file);
    }
  }
  const readmeBaseline = parsed.get(readmes[0]);
  for (const file of readmes) {
    if ((input.files[file]??'').trimEnd().split(/\r?\n/).length>70) report('readme-not-minimal',file);
    const doc=parsed.get(file);
    if (doc&&readmeBaseline&&JSON.stringify(doc.fences)!==JSON.stringify(readmeBaseline.fences)) report('fence-parity',file);
  }
  for (const topic of guideTopics) {
    const baseline = parsed.get(topicPath(guideLocales[0], topic));
    for (const locale of guideLocales) {
      const file = topicPath(locale, topic); const doc = parsed.get(file); if (!doc) continue;
      if (!doc.links.some(link => link.file === `docs/guide/${locale}.md`)) report('missing-landing-link', file);
      for (const other of guideLocales) {
        if (other !== locale && !doc.links.some(link => link.file === topicPath(other, topic))) report('language-navigation', file);
      }
      if (baseline && JSON.stringify(doc.fences) !== JSON.stringify(baseline.fences)) report('fence-parity', file);
    }
  }
  for (const locale of guideLocales) {
    const landing = `docs/guide/${locale}.md`; const visited = new Set<string>(); const queue = [landing];
    while (queue.length) {
      const current = queue.shift()!; if (visited.has(current)) continue; visited.add(current);
      for (const link of parsed.get(current)?.links ?? []) {
        if ((link.file === landing || link.file.startsWith(`docs/guide/${locale}/`)) && !visited.has(link.file)) queue.push(link.file);
      }
    }
    for (const topic of guideTopics) if (!visited.has(topicPath(locale, topic))) report('unreachable-topic', topicPath(locale, topic));
    for (const legacy of input.legacyAnchors?.locales[locale] ?? []) {
      const doc = parsed.get(landing); const target = topicPath(locale, legacy.topic);
      const lines = (input.files[landing] ?? '').split(/\r?\n/);
      const anchorLine = lines.findIndex(line => [...line.matchAll(/<a\s+[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)].some(match => match[1] === legacy.id));
      const next = anchorLine < 0 ? '' : lines[anchorLine + 1] ?? '';
      const match = next.match(/\[[^\]]+\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/);
      const link = match && resolveLink(landing, match[1]);
      if (!doc?.anchors.has(legacy.id) || !link || link.file !== target || link.fragment !== legacy.target) report('legacy-anchor', landing);
    }
  }
  return errors;
}

/** Read only the documentation graph rooted in the known public guide files. */
export function collectDocumentation(root: string): Record<string, string> {
  const files: Record<string, string> = {}; const pending = [...roots];
  while (pending.length) {
    const file = pending.shift()!; if (file in files || file === '..' || file.startsWith('../')) continue;
    const absolute = path.join(root, file); if (!existsSync(absolute)) continue;
    try { files[file] = readFileSync(absolute, 'utf8'); } catch { continue; }
    if (/\.md$/i.test(file)) for (const link of parse(file, files[file]).links) if (!(link.file in files)) pending.push(link.file);
  }
  return files;
}

/** Historical benchmark values and default profile IDs have one canonical topic. */
export function auditGuideContent(files: Record<string,string>): DocumentationError[] {
  const errors: DocumentationError[] = [];
  const figures = ['$0.03229','$0.01354','58.05%','$0.11254','$0.05363','52.35%','$0.0000756'];
  const models = ['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol','haiku','sonnet','opus'];
  for (const locale of guideLocales) {
    const benchmark = topicPath(locale,'benchmarks'), configuration = topicPath(locale,'configuration');
    if (figures.some(value=>!files[benchmark]?.includes(value))) errors.push({code:'benchmark-content',path:benchmark});
    if (models.some(value=>!files[configuration]?.includes('`'+value+'`'))) errors.push({code:'model-content',path:configuration});
  }
  return errors;
}

function main(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = collectDocumentation(root);
  const fixture = JSON.parse(readFileSync(path.join(root, 'test-support/guide-legacy-anchors.json'), 'utf8')) as LegacyAnchors;
  const npmArgs = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd', ...npmArgs] : npmArgs;
  const pack = JSON.parse(execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })) as { files: { path: string }[] }[];
  const errors = [...auditDocumentation({ files, packageFiles: pack[0].files.map(file => file.path), legacyAnchors: fixture }), ...auditGuideContent(files)];
  if (errors.length) { for (const error of errors) console.error(`${error.code}: ${error.path}`); process.exitCode = 1; }
  else console.log('Documentation checks passed.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch { console.error('documentation-check-failed: scripts/docs-check.ts'); process.exitCode = 1; }
}
