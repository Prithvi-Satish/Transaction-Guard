import { CaseRecord, TransactionInput } from "./types";

/**
 * Hosted demo mode.
 *
 * The full pipeline runs four Python agents (Sentry, Researcher, Compliance,
 * Scribe) plus the Gemini API, which serverless hosting can't run. In demo mode
 * this deterministic TypeScript simulation of the same four stages produces a
 * CaseRecord in exactly the shape the real orchestrator returns, so the whole UI
 * (agent flow, report, PDF export) can be explored live.
 */

const USD_RATE: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, INR: 0.012 };

const COUNTRY_RISK: Record<string, { score: number; note: string }> = {
  Local: { score: 0, note: "Domestic transfer - no cross-border exposure." },
  Singapore: { score: 10, note: "Singapore: major financial hub, low jurisdictional risk." },
  UAE: { score: 25, note: "UAE: elevated trade-based money-laundering exposure." },
  "Hong Kong": { score: 25, note: "Hong Kong: common layering route for cross-border funds." },
  Turkey: { score: 35, note: "Turkey: recently on the FATF increased-monitoring list." },
  Nigeria: { score: 45, note: "Nigeria: FATF increased-monitoring jurisdiction." },
};

const CHANNEL_RISK: Record<string, number> = {
  Card: 5,
  "Mobile Banking": 10,
  Wire: 20,
  "Crypto Exchange": 35,
};

const RED_FLAGS: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /urgent|immediately|asap/i, label: "Urgency pressure in narrative", weight: 10 },
  { pattern: /crypto|usdt|bitcoin|wallet/i, label: "Crypto off-ramp mentioned", weight: 15 },
  { pattern: /gift|lottery|prize|investment return/i, label: "Scam-typology wording (gift/lottery/returns)", weight: 20 },
  { pattern: /split|multiple (accounts|transfers)|structur/i, label: "Possible structuring / splitting of funds", weight: 20 },
  { pattern: /shell|offshore|nominee/i, label: "Shell / offshore entity reference", weight: 20 },
  { pattern: /consult(ing|ancy) fee|invoice|advance/i, label: "Vague service-fee justification", weight: 10 },
  { pattern: /mule|third[- ]party|on behalf/i, label: "Third-party / money-mule indicator", weight: 20 },
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Small deterministic hash so the same input always yields the same case id. */
const hash = (text: string): string => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase();
};

export const runDemoPipeline = (input: TransactionInput): CaseRecord => {
  const amountUsd = input.amount * (USD_RATE[input.currency] ?? 1);
  const country = COUNTRY_RISK[input.destinationCountry] ?? { score: 20, note: `${input.destinationCountry}: unrated jurisdiction.` };
  const channelScore = CHANNEL_RISK[input.channel] ?? 15;
  const flags = RED_FLAGS.filter((f) => f.pattern.test(input.narrative));
  const amountScore = amountUsd >= 100_000 ? 35 : amountUsd >= 25_000 ? 25 : amountUsd >= 10_000 ? 15 : amountUsd >= 2_000 ? 5 : 0;

  // Stage 1 - Sentry: anomaly score from amount, channel and narrative signals
  const sentryScore = clamp(amountScore + channelScore + flags.reduce((s, f) => s + f.weight, 0));
  // Stage 2 - Researcher: adds jurisdiction context to the anomaly signal
  const researcherScore = clamp(sentryScore * 0.6 + country.score + (flags.length >= 2 ? 10 : 0));
  // Stage 3 - Compliance: weighted regulatory risk
  const complianceScore = clamp(sentryScore * 0.45 + researcherScore * 0.4 + (amountUsd >= 10_000 ? 15 : 0));
  const finalVerdict: CaseRecord["finalVerdict"] = complianceScore >= 70 ? "BLOCK" : complianceScore >= 40 ? "REVIEW" : "ALLOW";

  const amountText = `${input.currency} ${input.amount.toLocaleString("en-US")} (~USD ${Math.round(amountUsd).toLocaleString("en-US")})`;

  return {
    caseId: `CASE-DEMO-${hash(JSON.stringify(input))}`,
    createdAt: new Date().toISOString(),
    transaction: { ...input },
    analyses: {
      sentry: {
        summary:
          sentryScore >= 40
            ? `Anomaly detected on a ${input.channel.toLowerCase()} transfer of ${amountText}.`
            : `No strong anomaly on a ${input.channel.toLowerCase()} transfer of ${amountText}.`,
        score: sentryScore,
        highlights: [
          `Amount band contributes ${amountScore} risk points.`,
          `Channel "${input.channel}" contributes ${channelScore} risk points.`,
          ...(flags.length ? flags.map((f) => f.label) : ["No narrative red flags matched."]),
        ],
        recommendation: sentryScore >= 40 ? "Escalate to Researcher" : "Log and monitor",
      },
      researcher: {
        summary: `Enriched case with jurisdiction and behavioural context for account ${input.accountId}.`,
        score: researcherScore,
        highlights: [
          country.note,
          flags.length >= 2 ? "Multiple independent red flags increase confidence." : "Limited corroborating signals.",
        ],
        recommendation: researcherScore >= 50 ? "Evidence supports escalation" : "Evidence is weak",
      },
      compliance: {
        summary: `Regulatory risk assessed at ${complianceScore}/100.`,
        score: complianceScore,
        highlights: [
          amountUsd >= 10_000 ? "Above USD 10,000 reporting threshold." : "Below large-value reporting threshold.",
          finalVerdict === "BLOCK"
            ? "Meets criteria for a Suspicious Transaction Report (STR)."
            : finalVerdict === "REVIEW"
              ? "Enhanced due diligence (EDD) recommended before release."
              : "No regulatory trigger raised.",
        ],
        recommendation: finalVerdict,
      },
      scribe: {
        summary:
          finalVerdict === "ALLOW"
            ? "Informational case note prepared; no SAR required."
            : "Draft Suspicious Activity Report prepared for analyst review.",
        score: complianceScore,
        highlights: [
          `Customer: ${input.customerName}`,
          `Final verdict: ${finalVerdict}`,
          "Generated by the hosted demo simulation (the full pipeline uses Gemini).",
        ],
        recommendation: finalVerdict === "ALLOW" ? "Archive case" : "Submit for analyst sign-off",
      },
    },
    finalVerdict,
  };
};

/* ---------- Stateless job ids ----------
 * Serverless instances don't share memory or disk, so a job created on one
 * instance can't be polled on another. In demo mode the job id itself carries
 * the input and start time, so any instance can answer a status poll.
 */

export const DEMO_JOB_PREFIX = "demo_";
const SIMULATED_RUNTIME_MS = 4000;

export const isDemoMode = (): boolean => process.env.TG_DEMO_MODE === "true";

export const encodeDemoJob = (input: TransactionInput): string =>
  DEMO_JOB_PREFIX +
  Buffer.from(JSON.stringify({ input: { ...input, narrative: input.narrative.slice(0, 1500) }, t: Date.now() })).toString("base64url");

export const decodeDemoJob = (id: string): { input: TransactionInput; startedAt: number } | null => {
  try {
    const parsed = JSON.parse(Buffer.from(id.slice(DEMO_JOB_PREFIX.length), "base64url").toString("utf-8"));
    return { input: parsed.input as TransactionInput, startedAt: Number(parsed.t) };
  } catch {
    return null;
  }
};

export const demoJobStatus = (id: string) => {
  const decoded = decodeDemoJob(id);
  if (!decoded) return null;
  const elapsed = Date.now() - decoded.startedAt;
  const done = elapsed >= SIMULATED_RUNTIME_MS;
  return {
    id,
    status: done ? ("succeeded" as const) : elapsed < 800 ? ("queued" as const) : ("running" as const),
    createdAt: decoded.startedAt,
    updatedAt: Date.now(),
    input: decoded.input,
    caseRecord: done ? runDemoPipeline(decoded.input) : undefined,
  };
};
