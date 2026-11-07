// A local screen for task text, not a guarantee of provider sufficiency.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

export function hasSufficientTaskText(text: string): boolean {
  const trimmed = text.trim();
  if ([...trimmed].length < 12) return false;
  const content = [...trimmed.normalize('NFKC').toLowerCase()].filter(char => /[\p{L}\p{N}]/u.test(char));
  if (content.length < 8 || new Set(content).size < 6) return false;
  const compact = content.join('');
  if (/^(.{1,20})\1+$/u.test(compact)) return false;
  const words = [...segmenter.segment(trimmed)].filter(part => part.isWordLike)
    .map(part => part.segment.normalize('NFKC').toLowerCase());
  if (new Set(words).size < 3) return false;
  // CJK prose does not require whitespace, but needs more actual content.
  const cjk = content.filter(char => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char));
  return cjk.length >= 8 ? content.length >= 12 : trimmed.split(/\s+/u).length >= 3;
}
