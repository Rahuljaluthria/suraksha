/**
 * Best-effort redaction applied to every piece of free text before it leaves
 * the backend. It removes credentials and personal data and replaces them with
 * stable typed placeholders ([EMAIL_1], [SECRET_2], ...) so the model can still
 * reason about "the same address appears twice". It is NOT a guarantee: users
 * are told what is sent, and structured fields are allowlisted before this step.
 *
 * IPs, hostnames, domains and file hashes are intentionally kept by default
 * because they are the indicators incident analysis depends on.
 */

export type RedactionType =
  | "PRIVATE_KEY"
  | "TOKEN"
  | "SECRET"
  | "CARD"
  | "GOV_ID"
  | "EMAIL"
  | "PHONE"
  | "IP";

export type IpMaskMode = "none" | "private" | "all";

export interface RedactionResult {
  text: string;
  /** Number of replaced occurrences per type (counts only, never the values). */
  counts: Partial<Record<RedactionType, number>>;
  total: number;
  /**
   * Puts the original email, phone and IP values back into text that is returned to
   * the user who supplied them (e.g. a phishing sender address in a report draft).
   * Secrets, tokens, keys, card and ID numbers are never restored.
   */
  restore: (text: string) => string;
}

const RESTORABLE: ReadonlySet<RedactionType> = new Set(["EMAIL", "PHONE", "IP"]);

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

export function redactText(input: string, ipMode: IpMaskMode = "none"): RedactionResult {
  const counts: Partial<Record<RedactionType, number>> = {};
  const seen = new Map<RedactionType, Map<string, number>>();
  const originals = new Map<string, string>();

  const placeholder = (type: RedactionType, value: string, original: string = value): string => {
    counts[type] = (counts[type] ?? 0) + 1;
    let byValue = seen.get(type);
    if (!byValue) {
      byValue = new Map();
      seen.set(type, byValue);
    }
    let index = byValue.get(value);
    if (index === undefined) {
      index = byValue.size + 1;
      byValue.set(value, index);
      if (RESTORABLE.has(type)) originals.set(`[${type}_${index}]`, original);
    }
    return `[${type}_${index}]`;
  };

  let text = input;

  // Whole-block and prefix-identified secrets first so later patterns cannot split them.
  text = text.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    (m) => placeholder("PRIVATE_KEY", m)
  );
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    (m) => placeholder("TOKEN", m)
  );
  text = text.replace(/\b(Bearer|Basic)(\s+)([A-Za-z0-9._~+/=-]{16,})/gi, (_m, scheme, ws, tok) =>
    `${scheme}${ws}${placeholder("TOKEN", tok)}`
  );
  text = text.replace(
    /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|glpat-[A-Za-z0-9_-]{16,})\b/g,
    (m) => placeholder("TOKEN", m)
  );

  // Credentials embedded in URLs: scheme://user:pass@host
  text = text.replace(/\b([a-z][a-z0-9+.-]{0,31}:\/\/)([^\s/:@]{1,256}):([^\s/@]{1,256})@/gi, (_m, scheme, _u, pass) =>
    `${scheme}${placeholder("SECRET", pass)}@`
  );

  // key=value / key: value style secrets (keeps the key, hides the value)
  text = text.replace(
    /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token)(\s*[:=]\s*)(["']?)([^\s"',;]{3,})\3/gi,
    (_m, key, sep, quote, value) => `${key}${sep}${quote}${placeholder("SECRET", value)}${quote}`
  );

  // Payment cards (Luhn-checked to avoid eating arbitrary long numbers)
  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
      ? placeholder("CARD", digits)
      : m;
  });

  // Government identifiers: US SSN, Aadhaar (4-4-4), PAN
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (m) => placeholder("GOV_ID", m));
  text = text.replace(/\b\d{4}\s\d{4}\s\d{4}\b/g, (m) => placeholder("GOV_ID", m));
  text = text.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, (m) => placeholder("GOV_ID", m));

  // Email addresses
  // Quantifiers are bounded (RFC 5321 limits) so long runs of word characters cannot make this
  // scan quadratic, which an attacker could otherwise use to stall the event loop.
  text = text.replace(/\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}\b/g, (m) =>
    placeholder("EMAIL", m.toLowerCase(), m)
  );

  // Phone numbers: +CC international, 3-3-4 grouped, and 10-digit Indian mobiles
  text = text.replace(/(?<![\w.])\+\d{1,3}(?:[\s.-]?\(?\d{2,5}\)?){2,4}(?![\w.])/g, (m) =>
    placeholder("PHONE", m.replace(/\D/g, ""), m)
  );
  text = text.replace(/(?<![\w.:/-])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.-])/g, (m) =>
    placeholder("PHONE", m.replace(/\D/g, ""), m)
  );
  text = text.replace(/(?<![\w.])[6-9]\d{9}(?![\w.])/g, (m) => placeholder("PHONE", m));

  // Optional IPv4 masking
  if (ipMode !== "none") {
    text = text.replace(IPV4, (ip) =>
      ipMode === "all" || isPrivateIpv4(ip) ? placeholder("IP", ip) : ip
    );
  }

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const restore = (value: string): string =>
    value.replace(/\[(?:EMAIL|PHONE|IP)_\d+\]/g, (token) => originals.get(token) ?? token);
  return { text, counts, total, restore };
}

/** Merges redaction counts from several fields into one summary for audit metadata. */
export function mergeRedactionCounts(
  results: ReadonlyArray<RedactionResult>
): Partial<Record<RedactionType, number>> {
  const merged: Partial<Record<RedactionType, number>> = {};
  for (const result of results) {
    for (const [type, n] of Object.entries(result.counts) as Array<[RedactionType, number]>) {
      merged[type] = (merged[type] ?? 0) + n;
    }
  }
  return merged;
}
