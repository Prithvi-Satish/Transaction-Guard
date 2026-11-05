import { AgentKey, CaseRecord, TransactionInput } from "./types";

export const AGENT_ORDER: AgentKey[] = ["sentry", "researcher", "compliance", "scribe"];

export const AGENT_LABELS: Record<AgentKey, string> = {
  sentry: "Sentry",
  researcher: "Researcher",
  compliance: "Compliance",
  scribe: "Scribe"
};

const scoreClamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const narrativeFlags = (narrative: string): { highRisk: number; calming: number } => {
  const highRiskTerms = ["urgent", "new beneficiary", "split", "offshore", "cash", "proxy"];
  const calmingTerms = ["invoice", "salary", "rent", "tuition", "contract"];

  let highRisk = 0;
  let calming = 0;

  highRiskTerms.forEach((term) => {
    if (new RegExp(term, "i").test(narrative)) {
      highRisk += 1;
    }
  });

  calmingTerms.forEach((term) => {
    if (new RegExp(term, "i").test(narrative)) {
      calming += 1;
    }
  });

  return { highRisk, calming };
};

const computeSentryScore = (input: TransactionInput): number => {
  const amountSignal = Math.min(input.amount / 320, 48);
  const countrySignal = input.destinationCountry !== "Local" ? 18 : 4;
  const channelSignal = input.channel === "Crypto Exchange" ? 20 : input.channel === "Wire" ? 11 : 7;
  const { highRisk, calming } = narrativeFlags(input.narrative);
  const narrativeSignal = highRisk * 7 - calming * 4;

  return scoreClamp(amountSignal + countrySignal + channelSignal + narrativeSignal);
};

const computeResearcherScore = (input: TransactionInput, sentryScore: number): number => {
  const geographyConfidence = input.destinationCountry === "Local" ? 14 : 29;
  const accountMaturity = /^ACC-[0-4]/i.test(input.accountId) ? 19 : 10;
  const { highRisk, calming } = narrativeFlags(input.narrative);
  const contextVolatility = highRisk * 6 - calming * 3;

  return scoreClamp(sentryScore * 0.34 + geographyConfidence + accountMaturity + contextVolatility);
};

const computeComplianceScore = (
  input: TransactionInput,
  sentryScore: number,
  researcherScore: number
): number => {
  const policyThresholdPressure = input.amount >= 50000 ? 24 : input.amount >= 20000 ? 14 : 8;
  const crossBorderPressure = input.destinationCountry !== "Local" ? 13 : 4;
  const blendedEvidence = sentryScore * 0.45 + researcherScore * 0.4;

  return scoreClamp(blendedEvidence * 0.62 + policyThresholdPressure + crossBorderPressure);
};

const computeScribeScore = (sentryScore: number, researcherScore: number, complianceScore: number): number => {
  const synthesisStrength = sentryScore * 0.2 + researcherScore * 0.28 + complianceScore * 0.42;
  return scoreClamp(synthesisStrength + 9);
};

const verdictFromScore = (score: number): CaseRecord["finalVerdict"] => {
  if (score >= 75) {
    return "BLOCK";
  }

  if (score >= 45) {
    return "REVIEW";
  }

  return "ALLOW";
};

const makeCaseId = (): string => {
  const ts = new Date().getTime().toString(36).toUpperCase();
  return `CASE-${ts}`;
};

export const createCaseRecord = (input: TransactionInput): CaseRecord => {
  const sentryScore = computeSentryScore(input);
  const researcherScore = computeResearcherScore(input, sentryScore);
  const complianceScore = computeComplianceScore(input, sentryScore, researcherScore);
  const scribeScore = computeScribeScore(sentryScore, researcherScore, complianceScore);

  const verdict = verdictFromScore(complianceScore);

  return {
    caseId: makeCaseId(),
    createdAt: new Date().toISOString(),
    transaction: input,
    analyses: {
      sentry: {
        summary: "Signal detection on velocity, geography, and channel patterns.",
        score: sentryScore,
        highlights: [
          `Transaction amount ${input.currency} ${input.amount.toLocaleString()}`,
          `${input.destinationCountry} destination profile`,
          `${input.channel} behavioral baseline check`
        ],
        recommendation: sentryScore > 70 ? "Escalate immediately" : "Forward for enrichment"
      },
      researcher: {
        summary: "Context enrichment from account history and narrative clues.",
        score: researcherScore,
        highlights: [
          `Account ${input.accountId} reviewed for historical anomalies`,
          "Narrative intent and urgency phrase extraction",
          "Beneficiary linkage confidence generated"
        ],
        recommendation: researcherScore > 68 ? "Open deep-dive review" : "Continue compliance mapping"
      },
      compliance: {
        summary: "Policy alignment and obligation mapping with a decision score.",
        score: complianceScore,
        highlights: [
          "AML controls and threshold checks executed",
          "Cross-border transfer obligations evaluated",
          "Decision traceability block attached"
        ],
        recommendation: verdict === "BLOCK" ? "Prepare STR and block" : verdict === "REVIEW" ? "Hold and request docs" : "Allow with monitoring"
      },
      scribe: {
        summary: "Narrative synthesis for auditor-ready final report.",
        score: scribeScore,
        highlights: [
          "Chronological event storyline drafted",
          "Evidence confidence matrix included",
          "Action item checklist prepared"
        ],
        recommendation: "Publish final report"
      }
    },
    finalVerdict: verdict
  };
};

export const nextAgent = (current: AgentKey): AgentKey | null => {
  const idx = AGENT_ORDER.indexOf(current);
  const nextIdx = idx + 1;

  if (nextIdx >= AGENT_ORDER.length) {
    return null;
  }

  return AGENT_ORDER[nextIdx];
};
