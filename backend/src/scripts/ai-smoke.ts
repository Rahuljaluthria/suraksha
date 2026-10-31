/**
 * Live smoke test for the AI integration. Run after adding DEEPSEEK_API_KEY to backend/.env:
 *
 *   npm run ai:smoke
 *
 * It makes two real DeepSeek calls (a few hundred tokens) using a made-up incident and prints
 * what came back. It never prints the API key or any real incident data, and it does not touch
 * the database or the HTTP server.
 */
import { env } from "../config/env.js";
import { AiError } from "../modules/ai/ai.errors.js";
import { getLlmProvider, isAiConfigured } from "../modules/ai/providers/deepseek.client.js";
import { prepareReportDraft, runReportDraft } from "../modules/ai/ai.service.js";

const SAMPLE =
  "This morning at about 9:15 I got an email from billing@fake-pay.example asking me to confirm my login. " +
  "I clicked the link http://fake-pay.example/login and entered my password on laptop WS-04. " +
  "A minute later my screen flashed and I noticed an unfamiliar tool open for a second.";

async function main(): Promise<void> {
  console.log("================================");
  console.log("     SURAKSHA AI SMOKE TEST");
  console.log("================================");
  console.log(`Model:    ${env.DEEPSEEK_MODEL}`);
  console.log(`Base URL: ${env.DEEPSEEK_BASE_URL}`);
  console.log(`Key set:  ${env.DEEPSEEK_API_KEY.length > 0 ? "yes" : "no"}`);

  if (!isAiConfigured()) {
    console.log("\nAI is not configured (missing DEEPSEEK_API_KEY, AI_ENABLED=false, or an insecure base URL).");
    console.log("Add DEEPSEEK_API_KEY to backend/.env and run this again.");
    process.exitCode = 1;
    return;
  }

  // 1. Transport: confirms the key, model, base URL and JSON mode.
  console.log("\n[1/2] Provider round trip...");
  const ping = await getLlmProvider().complete({
    messages: [
      { role: "system", content: "Reply with a json object only." },
      { role: "user", content: 'Return {"ok": true} as json.' },
    ],
    maxTokens: 30,
  });
  console.log(`  OK in ${ping.latencyMs} ms, model ${ping.model}, reply: ${ping.content.trim().slice(0, 60)}`);

  // 2. Feature 1 end to end: redaction, prompt, model output, schema and grounding checks.
  console.log("\n[2/2] Report draft on a made-up incident...");
  const prepared = prepareReportDraft(SAMPLE);
  const { response, callMeta } = await runReportDraft(prepared);
  const { draft, warnings } = response;
  console.log(`  OK in ${callMeta.latencyMs} ms, ${callMeta.attempts} attempt(s), ${callMeta.usage.totalTokens ?? "?"} tokens`);
  console.log(`  Title:      ${draft.title}`);
  console.log(`  Category:   ${draft.category}`);
  console.log(`  Severity:   ${draft.suggestedSeverity.level} (${draft.suggestedSeverity.rationale})`);
  console.log(`  Assets:     ${draft.affectedAssets.map((a) => a.name).join(", ") || "none"}`);
  console.log(`  Indicators: ${draft.observedIndicators.map((i) => i.indicator).join(", ") || "none"}`);
  console.log(`  Missing:    ${draft.missingInformation.length} item(s)`);
  console.log(`  Warnings:   ${warnings.length === 0 ? "none" : warnings.length}`);
  for (const w of warnings) console.log(`    - ${w}`);
  console.log("\nA 'repair' attempt (attempts > 1) or removed-item warnings mean the model drifted from the");
  console.log("requested format; that is handled safely, but frequent drift is worth reporting.");
}

main().catch((error: unknown) => {
  if (error instanceof AiError) {
    console.error(`\nFAILED: ${error.code} (HTTP ${error.httpStatus}): ${error.message}`);
    const status = (error as { upstreamStatus?: number }).upstreamStatus;
    if (status === 401) console.error("The provider rejected the API key (401). Check DEEPSEEK_API_KEY.");
    if (status === 402) console.error("The provider reports insufficient balance (402). Top up the account.");
    if (status === 404 || status === 400) console.error("Check DEEPSEEK_MODEL and DEEPSEEK_BASE_URL.");
  } else {
    console.error("\nFAILED:", error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
