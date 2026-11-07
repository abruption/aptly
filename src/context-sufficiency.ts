// A local screen for task text, not a guarantee of provider sufficiency.
const segmenter = new Intl.Segmenter('en', { granularity: 'word' });

export function hasSufficientTaskText(text: string): boolean {
  const trimmed = text.trim();
  if ([...trimmed].length < 12) return false;
  // Numbers and repeated characters alone should not turn a vague request into
  // a descriptive one. Identifiers still contribute their letter content.
  const normalized = trimmed.normalize('NFKC').toLowerCase().replace(/(\p{L})\1{2,}/gu, '$1');
  const content = [...normalized].filter(char => /\p{L}/u.test(char));
  if (content.length < 8 || new Set(content).size < 6) return false;
  const compact = content.join('');
  if (/^(.{1,20})\1+$/u.test(compact)) return false;
  const words = [...segmenter.segment(normalized)].filter(part => part.isWordLike && /\p{L}/u.test(part.segment))
    .map(part => part.segment);
  if (new Set(words).size < 3) return false;
  // CJK prose and mixed CJK/identifier text do not require whitespace, but
  // need more letter content and distinct word segments.
  const cjk = content.filter(char => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char));
  return cjk.length >= 2 ? content.length >= 12 : trimmed.split(/\s+/u).length >= 3;
}
