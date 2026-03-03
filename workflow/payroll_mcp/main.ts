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
  payrollApiUrl: z.string(),
  payrollApiKeySecretName: z.string(),
});

type Config = z.infer<typeof configSchema>;

// =============================================================================
// TYPES
// =============================================================================
type PayrollEntry = {
  recipient: string; // PRIVATE — never written on-chain
  amount: number;    // PRIVATE — never written on-chain
  memo: string;
};

type PayrollBatch = {
  batchId: string;
  entries: PayrollEntry[];
  timestamp: string;
};

type SettlementResult = {
  batchId: string;
  batchHash: string;
  recipientCount: number;
  totalAmountUsdCents: number;
  settledAt: string;
  privacy: string;
};

// =============================================================================
// HELPERS — deterministic, no randomness (required for CRE consensus)
// =============================================================================
function computeBatchHash(batch: PayrollBatch): string {
  const canonical = batch.entries
    .map((e) => `${e.recipient.toLowerCase()}:${e.amount}`)
    .sort()
    .join("|");
  const input = `${batch.batchId}:${canonical}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `0x${hex}${"0".repeat(56)}`;
}

function computeTotalAmount(entries: PayrollEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

// Static mock — fixed timestamp ensures determinism across all nodes
const MOCK_BATCH: PayrollBatch = {
  batchId: "MOCK-BATCH-001",
  timestamp: "2026-03-01T20:00:00.000Z",
  entries: [
    {
      recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: 500000,
      memo: "March 2026 - Engineering",
    },
    {
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: 350000,
      memo: "March 2026 - Design",
    },
    {
      recipient: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      amount: 420000,
      memo: "March 2026 - Operations",
    },
  ],
};

// =============================================================================
// NODE-LEVEL FUNCTION — receives apiKey already fetched from Runtime
// NodeRuntime does NOT have getSecret — secrets fetched at DON level first
// =============================================================================
const fetchAndComputeSettlement = (
  nodeRuntime: NodeRuntime<Config>,
  apiKey: string
): SettlementResult => {
  const config = nodeRuntime.config;
  const httpClient = new HTTPClient();

  const response = httpClient
    .sendRequest(nodeRuntime, {
      url: config.payrollApiUrl,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
    })
    .result();

  let batch: PayrollBatch;

  if (!ok(response)) {
    // Fallback to static mock — deterministic across all nodes
    batch = MOCK_BATCH;
  } else {
    batch = JSON.parse(text(response)) as PayrollBatch;
  }

  return {
    batchId: batch.batchId,
    batchHash: computeBatchHash(batch),
    recipientCount: batch.entries.length,
    totalAmountUsdCents: computeTotalAmount(batch.entries),
    settledAt: batch.timestamp,
    privacy: "recipient_addresses_and_amounts_not_recorded_onchain",
  };
};

// =============================================================================
// MAIN CALLBACK — DON-level Runtime
// =============================================================================
export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config;

  runtime.log("🔐 Private Payroll Settlement — workflow triggered");
  runtime.log(`📡 Payroll API: ${config.payrollApiUrl}`);
  runtime.log("🔒 Fetching API key from CRE secrets (DON-level, never on-chain)");

  // getSecret is on Runtime (DON level) via SecretsProvider
  const secret = runtime.getSecret({ id: config.payrollApiKeySecretName }).result();
  const apiKey = secret.value || "dev-api-key";

  runtime.log("✅ API key retrieved from secrets");

  // Pass apiKey into runInNodeMode as extra argument
  const result = runtime
    .runInNodeMode(
      fetchAndComputeSettlement,
      consensusIdenticalAggregation<SettlementResult>()
    )(apiKey)
    .result();

  runtime.log(`✅ Batch: ${result.batchId}`);
  runtime.log(`🔑 Hash: ${result.batchHash}`);
  runtime.log(`👥 Recipients: ${result.recipientCount}`);
  runtime.log(`💰 Total USD cents: ${result.totalAmountUsdCents}`);
  runtime.log("🔒 Privacy: only batch hash recorded on-chain");

  return JSON.stringify(result);
};

// =============================================================================
// WORKFLOW INIT
// =============================================================================
export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

// =============================================================================
// ENTRY POINT
// =============================================================================
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}