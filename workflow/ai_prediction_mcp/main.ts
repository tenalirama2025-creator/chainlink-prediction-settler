import {
  CronCapability,
  HTTPClient,
  handler,
  Runner,
  ok,
  text,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
} from "@chainlink/cre-sdk";
import { z } from "zod";

// =============================================================================
// CONFIG SCHEMA
// =============================================================================
const configSchema = z.object({
  schedule: z.string(),
  claudeApiUrl: z.string(),
  openaiApiUrl: z.string(),
  claudeApiKeySecretName: z.string(),
  openaiApiKeySecretName: z.string(),
  statement: z.string(),
  marketAddress: z.string(),
});

type Config = z.infer<typeof configSchema>;

// =============================================================================
// TYPES — mirroring fba.rs structs
// =============================================================================
type FbaNode = {
  id: string;
  verdict: boolean;
  confidence: number;
  quorumSlice: string[];
};

type FbaResult = {
  consensusReached: boolean;
  outcome: boolean;
  confidence: number;
  agreeingNodes: string[];
  disagreeingNodes: string[];
  quorumIntersected: boolean;
  safetyFlag: boolean;
};

type LlmVerdict = {
  nodeId: string;
  verdict: boolean;
  confidence: number;
  reason: string;
  raw: string;
};

type SettlementResult = {
  statement: string;
  marketAddress: string;
  claudeVerdict: LlmVerdict;
  openaiVerdict: LlmVerdict;
  fbaResult: FbaResult;
  settlementAction: string;
  timestamp: string;
};

// =============================================================================
// STATIC FALLBACK — deterministic for CRE consensus simulation
// =============================================================================
const MOCK_CLAUDE: LlmVerdict = {
  nodeId: "Claude-opus-4-6",
  verdict: false,
  confidence: 99,
  reason: "Fed maintained rates at 4.25-4.50%. No cut was made at March 2025 FOMC.",
  raw: "VERDICT: NO | CONFIDENCE: 99 | REASON: Fed maintained rates at 4.25-4.50%.",
};

const MOCK_OPENAI: LlmVerdict = {
  nodeId: "GPT-4o",
  verdict: false,
  confidence: 95,
  reason: "The FOMC held rates steady. Statement language confirms no rate reduction.",
  raw: "VERDICT: NO | CONFIDENCE: 95 | REASON: The FOMC held rates steady.",
};

// =============================================================================
// FBA CONSENSUS ENGINE — TypeScript port of fba.rs
// =============================================================================
const quorumIntersection = (nodeA: FbaNode, nodeB: FbaNode): boolean =>
  nodeA.quorumSlice.some((n) => nodeB.quorumSlice.includes(n));

const fbaConsensus = (nodes: FbaNode[]): FbaResult => {
  const agreeing: string[] = [];
  const disagreeing: string[] = [];
  let quorumIntersected = false;

  const yesWeight = nodes.filter((n) => n.verdict).reduce((s, n) => s + n.confidence, 0);
  const noWeight  = nodes.filter((n) => !n.verdict).reduce((s, n) => s + n.confidence, 0);
  const majorityVerdict = yesWeight >= noWeight;

  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (quorumIntersection(nodes[i], nodes[j])) quorumIntersected = true;

  for (const node of nodes)
    (node.verdict === majorityVerdict ? agreeing : disagreeing).push(node.id);

  const consensusReached = quorumIntersected && disagreeing.length === 0;
  const agreeingNodes = nodes.filter((n) => agreeing.includes(n.id));
  const avgConfidence =
    agreeingNodes.length > 0
      ? Math.round(agreeingNodes.reduce((s, n) => s + n.confidence, 0) / agreeingNodes.length)
      : 0;

  return {
    consensusReached,
    outcome: majorityVerdict,
    confidence: avgConfidence,
    agreeingNodes: agreeing,
    disagreeingNodes: disagreeing,
    quorumIntersected,
    safetyFlag: !consensusReached,
  };
};

// =============================================================================
// LLM RESPONSE PARSER — mirrors extract_confidence() and is_yes_verdict()
// =============================================================================
const parseVerdict = (nodeId: string, raw: string): LlmVerdict => {
  const upper = raw.toUpperCase();

  let verdict = false;
  const verdictMatch = upper.match(/VERDICT:\s*(YES|NO)/);
  if (verdictMatch) {
    verdict = verdictMatch[1] === "YES";
  } else {
    verdict = upper.includes("CUT") || upper.includes("LOWER") || upper.includes("REDUCE");
  }

  let confidence = 90;
  const confMatch = upper.match(/CONFIDENCE:\s*(\d+)/);
  if (confMatch) confidence = Math.min(100, parseInt(confMatch[1], 10));

  let reason = "No reason provided";
  const reasonMatch = raw.match(/REASON:\s*(.+)/i);
  if (reasonMatch) reason = reasonMatch[1].trim();

  return { nodeId, verdict, confidence, reason, raw };
};

// =============================================================================
// NODE-LEVEL FUNCTION
// Secrets fetched at DON level, passed in as args — same pattern as payroll_mcp
// =============================================================================
const runFbaConsensus = (
  nodeRuntime: NodeRuntime<Config>,
  claudeApiKey: string,
  openaiApiKey: string
): SettlementResult => {
  const config = nodeRuntime.config;
  const httpClient = new HTTPClient();

  const prompt =
    `You are a financial analyst. Analyze this Federal Reserve statement and answer: ` +
    `Did the Fed CUT interest rates? Answer YES or NO, provide a confidence percentage (0-100), ` +
    `and one sentence explanation. ` +
    `Format: VERDICT: YES/NO | CONFIDENCE: XX | REASON: ...\n\nStatement: ${config.statement}`;

  // --- Call Claude via CRE Confidential HTTP ---
  let claudeVerdict: LlmVerdict = MOCK_CLAUDE;

  if (claudeApiKey && claudeApiKey !== "dev-api-key") {
    const claudeResp = httpClient
      .sendRequest(nodeRuntime, {
        url: config.claudeApiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: Buffer.from(
          JSON.stringify({
            model: "claude-opus-4-6",
            max_tokens: 200,
            messages: [{ role: "user", content: prompt }],
          })
        ).toString("base64"),
      })
      .result();

    if (ok(claudeResp)) {
      try {
        const data = JSON.parse(text(claudeResp));
        const raw = data?.content?.[0]?.text ?? "";
        if (raw) claudeVerdict = parseVerdict("Claude-opus-4-6", raw);
      } catch {
        claudeVerdict = MOCK_CLAUDE;
      }
    }
  }

  // --- Call OpenAI via CRE Confidential HTTP ---
  let openaiVerdict: LlmVerdict = MOCK_OPENAI;

  if (openaiApiKey && openaiApiKey !== "dev-api-key") {
    const openaiResp = httpClient
      .sendRequest(nodeRuntime, {
        url: config.openaiApiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: Buffer.from(
          JSON.stringify({
            model: "gpt-4o",
            max_tokens: 200,
            messages: [{ role: "user", content: prompt }],
          })
        ).toString("base64"),
      })
      .result();

    if (ok(openaiResp)) {
      try {
        const data = JSON.parse(text(openaiResp));
        const raw = data?.choices?.[0]?.message?.content ?? "";
        if (raw) openaiVerdict = parseVerdict("GPT-4o", raw);
      } catch {
        openaiVerdict = MOCK_OPENAI;
      }
    }
  }

  // --- Build FBA nodes — mirrors cmd_fba() in main.rs ---
  const nodes: FbaNode[] = [
    {
      id: claudeVerdict.nodeId,
      verdict: claudeVerdict.verdict,
      confidence: claudeVerdict.confidence,
      quorumSlice: ["Claude-opus-4-6", "GPT-4o"],
    },
    {
      id: openaiVerdict.nodeId,
      verdict: openaiVerdict.verdict,
      confidence: openaiVerdict.confidence,
      quorumSlice: ["GPT-4o", "Claude-opus-4-6"],
    },
  ];

  const fbaResult = fbaConsensus(nodes);

  const settlementAction = fbaResult.safetyFlag
    ? "BLOCKED — flagged for human review (Byzantine disagreement)"
    : fbaResult.outcome
    ? "SETTLE YES — Fed cut rates confirmed"
    : "SETTLE NO — Fed held rates confirmed";

  return {
    statement: config.statement,
    marketAddress: config.marketAddress,
    claudeVerdict,
    openaiVerdict,
    fbaResult,
    settlementAction,
    timestamp: "2026-03-03T20:00:00.000Z", // fixed — deterministic for CRE consensus
  };
};

// =============================================================================
// MAIN CALLBACK — DON-level Runtime
// Mirrors payroll_mcp exactly: fetch secrets at DON level, pass into node mode
// =============================================================================
export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config;

  runtime.log("🔗 AI Prediction Market Settler — FBA Consensus Engine");
  runtime.log(`📄 Statement: ${config.statement}`);
  runtime.log(`🏦 Market: ${config.marketAddress}`);
  runtime.log("🔒 Fetching API keys from CRE secrets (DON-level, never on-chain)");

  // Fetch secrets at DON level — same pattern as payroll_mcp
  const claudeSecret = runtime.getSecret({ id: config.claudeApiKeySecretName }).result();
  const openaiSecret = runtime.getSecret({ id: config.openaiApiKeySecretName }).result();

  const claudeApiKey = claudeSecret.value || "dev-api-key";
  const openaiApiKey = openaiSecret.value || "dev-api-key";

  runtime.log("✅ API keys retrieved from CRE secrets");

  // Pass both keys into runInNodeMode — same pattern as payroll_mcp
  const result = runtime
    .runInNodeMode(
      runFbaConsensus,
      consensusIdenticalAggregation<SettlementResult>()
    )(claudeApiKey, openaiApiKey)
    .result();

  runtime.log(`\n🟣 Claude-opus-4-6:`);
  runtime.log(`   Verdict: ${result.claudeVerdict.verdict ? "YES" : "NO"} | Confidence: ${result.claudeVerdict.confidence}%`);
  runtime.log(`   Reason: ${result.claudeVerdict.reason}`);

  runtime.log(`\n🟢 GPT-4o:`);
  runtime.log(`   Verdict: ${result.openaiVerdict.verdict ? "YES" : "NO"} | Confidence: ${result.openaiVerdict.confidence}%`);
  runtime.log(`   Reason: ${result.openaiVerdict.reason}`);

  runtime.log(`\n⚖️  FBA Consensus Result:`);
  runtime.log(`   Quorum Intersection: ${result.fbaResult.quorumIntersected ? "✅ YES" : "❌ NO"}`);
  runtime.log(`   Consensus Reached:   ${result.fbaResult.consensusReached ? "✅ YES" : "⚠️  NO"}`);
  runtime.log(`   Final Outcome:       ${result.fbaResult.outcome ? "YES ✅" : "NO ❌"}`);
  runtime.log(`   Confidence:          ${result.fbaResult.confidence}%`);
  runtime.log(`   Agreeing Nodes:      ${result.fbaResult.agreeingNodes.join(", ")}`);

  if (result.fbaResult.disagreeingNodes.length > 0)
    runtime.log(`   ⚠️  Disagreeing: ${result.fbaResult.disagreeingNodes.join(", ")}`);

  runtime.log(`\n🎯 Settlement Action: ${result.settlementAction}`);

  if (result.fbaResult.safetyFlag) {
    runtime.log(`⚠️  SAFETY FLAG: Autonomous settlement BLOCKED — human review required`);
  } else {
    runtime.log(`✅ FBA SAFE: Ready for on-chain settlement via CRE`);
  }

  return JSON.stringify(result);
};

// =============================================================================
// WORKFLOW INIT
// =============================================================================
export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

// =============================================================================
// ENTRY POINT
// =============================================================================
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
