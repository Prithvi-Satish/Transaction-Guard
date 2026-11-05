export type AgentKey = "sentry" | "researcher" | "compliance" | "scribe";

export interface TransactionInput {
  customerName: string;
  accountId: string;
  amount: number;
  currency: string;
  destinationCountry: string;
  channel: string;
  narrative: string;
}

export interface AgentAnalysis {
  summary: string;
  score: number;
  highlights: string[];
  recommendation: string;
}

export interface CaseRecord {
  caseId: string;
  createdAt: string;
  transaction: TransactionInput;
  analyses: Record<AgentKey, AgentAnalysis>;
  finalVerdict: "ALLOW" | "REVIEW" | "BLOCK";
}
