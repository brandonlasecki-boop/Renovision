/**
 * Derives a short estimate title from free-form scope text (first line / first sentence,
 * trimmed prefixes, word-boundary truncation).
 */
const LEADING_PREFIXES: RegExp[] = [
  /^(i|we|they)\s+(want|need|would like|are looking)\s+(to\s+)?/i,
  /^(the\s+)?(customer|client|homeowner|home\s*owner)s?\s+(want|needs|wants|would like)\s+(to\s+)?/i,
  /^(looking|planning|hoping)\s+to\s+/i,
  /^(project|job|bid|estimate)\s*:\s*/i,
  /^(please\s+)?(quote|estimate|bid)\s+/i,
];

export function deriveBidTitleFromScope(scope: string): string {
  const raw = scope.trim();
  if (!raw) return "New estimate";

  let line = raw.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? raw;

  const sentence = line.match(/^(.+?[.!?])(?:\s+|$)/);
  if (sentence) {
    const s = sentence[1].trim();
    if (s.length >= 12 && s.length <= 220) {
      line = s;
    }
  }

  for (const re of LEADING_PREFIXES) {
    const next = line.replace(re, "").trim();
    if (next.length >= 8) line = next;
  }

  line = line.replace(/\s+/g, " ").trim();
  const max = 78;
  if (line.length > max) {
    const slice = line.slice(0, max);
    const lastSpace = slice.lastIndexOf(" ");
    line =
      lastSpace > 32 ? `${slice.slice(0, lastSpace).trimEnd()}…` : `${slice.trimEnd()}…`;
  }

  if (!line) return "New estimate";
  return line.charAt(0).toUpperCase() + line.slice(1);
}
