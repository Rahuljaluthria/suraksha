/**
 * Server-side checks that keep model output tied to what the user actually wrote.
 * All comparisons run against the redacted text the model saw, before any
 * original values are restored.
 */

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * An extracted item is grounded only if its quote really appears in the source
 * AND the item's own text appears inside that quote. Paraphrases and inventions
 * fail this check.
 */
export function isGrounded(value: string, sourceQuote: string, source: string): boolean {
  const quote = normalize(sourceQuote);
  const item = normalize(value);
  if (quote.length < 2 || item.length < 1) return false;
  return normalize(source).includes(quote) && quote.includes(item);
}

/** True when the quote really occurs in the source (ignoring case and whitespace). */
export function quoteInSource(sourceQuote: string, source: string): boolean {
  const quote = normalize(sourceQuote);
  return quote.length >= 3 && normalize(source).includes(quote);
}

const SPECIFIC_TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, // IPv4
  /\b(?:[a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})\b/gi, // SHA-256 / SHA-1 / MD5
  /\bCVE-\d{4}-\d{4,7}\b/gi,
  /\bhttps?:\/\/[^\s"'<>)]+/gi,
];

/**
 * Finds concrete, checkable specifics (IPs, hashes, CVE ids, URLs) in generated
 * prose that do not occur in the user's input. These are the most damaging kind
 * of invention in an incident record, so each one is surfaced as a warning.
 */
export function findUnsupportedSpecifics(generatedTexts: string[], source: string): string[] {
  const haystack = normalize(source);
  const unsupported = new Set<string>();

  for (const text of generatedTexts) {
    for (const pattern of SPECIFIC_TOKEN_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const token = match[0];
        if (!haystack.includes(normalize(token))) unsupported.add(token);
      }
    }
  }

  return [...unsupported];
}
