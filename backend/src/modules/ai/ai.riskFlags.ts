import type { RiskFlag } from "./ai.schemas.js";

/**
 * Keyword screen that labels recommendations whose wording suggests a side effect a
 * reviewer should weigh before approving. It labels, it never blocks: the reviewer decides.
 */
const PATTERNS: ReadonlyArray<{ flag: RiskFlag; pattern: RegExp }> = [
  {
    flag: "EVIDENCE_LOSS",
    pattern:
      /\b(?:re-?image|wipe|format|reboot|restart|shut\s?down|power\s?off|clear(?:ing)?\s+(?:the\s+)?logs?|delete\s+(?:the\s+)?(?:logs?|evidence|artifacts?))\b/i,
  },
  {
    flag: "DESTRUCTIVE",
    pattern: /\b(?:delete|drop|truncate|purge|destroy|terminate|uninstall|rm\s+-rf|remove\s+(?:the\s+)?(?:files?|data|accounts?))\b/i,
  },
  {
    flag: "SERVICE_DISRUPTION",
    pattern:
      /\b(?:disable|block|isolate|quarantine|take\s+\w+(?:\s+\w+)?\s+offline|revoke|suspend|lock\s?out|shut\s?down|disconnect)\b/i,
  },
  {
    flag: "CONTAINS_COMMAND",
    pattern: /```|`[^`\n]+`|\bsudo\b|\brm\s+-|\bchmod\b|\bcurl\b[^\n]*\|\s*(?:sh|bash)|\bpowershell(?:\.exe)?\s+-/i,
  },
];

export function detectRiskFlags(...texts: string[]): RiskFlag[] {
  const joined = texts.join("\n");
  return PATTERNS.filter(({ pattern }) => pattern.test(joined)).map(({ flag }) => flag);
}
