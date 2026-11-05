import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AgentKey, CaseRecord, TransactionInput } from "./types";

const execFileAsync = promisify(execFile);

const workspaceRoot = path.resolve(process.cwd(), "..");
const orchestratorRoot = path.join(workspaceRoot, "orchestrator_agent");
const orchestratorScript = path.join(orchestratorRoot, "orchestrator.py");
const orchestratorInputsDir = path.join(orchestratorRoot, "inputs");
const orchestratorOutputsDir = path.join(orchestratorRoot, "outputs");
const researcherDbPath = path.join(
  workspaceRoot,
  "sara_clone",
  "The-Researcher",
  "sample_data",
  "researcher_demo.db"
);
const preferredPython = path.join(
  workspaceRoot,
  "prithvi_clone",
  "the-sentry",
  ".venv",
  "Scripts",
  "python.exe"
);

type Verdict = CaseRecord["finalVerdict"];

interface OrchestratorCaseBundle {
  sentry_alert: any;
  researcher_output: any;
  compliance_output: any;
  scribe_result: any;
  sar_report?: any;
}

interface PreparedTransactionPayload {
  transaction_id: string;
  customer_id: string;
  origin_account: string;
  destination_account: string;
  amount: number;
  currency: string;
  timestamp: string;
  destination_country: string;
  current_ip: string;
  current_ip_country: string;
  device_id: string;
  shared_email: string;
  shared_phone: string;
  channel: string;
  is_i4c_hit: boolean;
  rolling_30d_volume: number;
  velocity_60m_count: number;
  device_fingerprint_match: boolean;
  is_new_payee: boolean;
  is_out_of_state: boolean;
  is_dormant_account: boolean;
  is_fan_out: boolean;
  has_shared_contact: boolean;
}

interface OrchestratorPreparedInput {
  transaction: PreparedTransactionPayload;
  customerId: string;
  accountId: string;
  transactionId: string;
}

interface OrchestratorRunOptions {
  geminiApiKey?: string;
}

const readJson = async <T>(filePath: string): Promise<T> => {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const scoreToPercent = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const scaled = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const verdictFromCompliance = (verdictRecommendation: string): Verdict => {
  const normalized = verdictRecommendation.toUpperCase();

  if (normalized.includes("BLOCK") || normalized.includes("STR")) {
    return "BLOCK";
  }

  if (normalized.includes("REVIEW") || normalized.includes("HOLD") || normalized.includes("ESCALATE") || normalized.includes("EDD")) {
    return "REVIEW";
  }

  return "ALLOW";
};

const toHighlights = (list: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(list)) {
    return fallback;
  }

  const cleaned = list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return cleaned.length > 0 ? cleaned : fallback;
};

const buildNoOutputCaseRecord = (input: TransactionInput, reason: string): CaseRecord => {
  return {
    caseId: `CASE-NO-ALERT-${Date.now()}`,
    createdAt: new Date().toISOString(),
    transaction: {
      ...input
    },
    analyses: {
      sentry: {
        summary: "No high-risk anomaly was detected by Sentry for this submission.",
        score: 15,
        highlights: [
          "Transaction was evaluated against anomaly and velocity controls.",
          reason
        ],
        recommendation: "No escalation required"
      },
      researcher: {
        summary: "Context enrichment was not required because no anomaly trigger was raised.",
        score: 10,
        highlights: ["Research stage skipped due to PASS-band alert outcome."],
        recommendation: "Monitor through normal controls"
      },
      compliance: {
        summary: "Compliance escalation is not required for PASS-band submissions.",
        score: 12,
        highlights: ["No regulatory escalation trigger was raised."],
        recommendation: "ALLOW"
      },
      scribe: {
        summary: "Final package prepared as no-action informational report.",
        score: 8,
        highlights: ["Case closed without escalation."],
        recommendation: "Archive case"
      }
    },
    finalVerdict: "ALLOW"
  };
};

const buildCaseRecordFromBundle = (bundle: OrchestratorCaseBundle): CaseRecord => {
  const sentry = bundle.sentry_alert ?? {};
  const researcher = bundle.researcher_output ?? {};
  const compliance = bundle.compliance_output ?? {};
  const scribe = bundle.scribe_result ?? {};
  const sar = bundle.sar_report ?? scribe.report_json ?? {};

  const metadata = sentry.case_metadata ?? {};
  const alertSummary = sentry.alert_summary ?? {};
  const flaggedTx = sentry.flagged_transaction ?? {};
  const customerProfile = researcher.customer_profile ?? {};
  const decisionSupport = researcher.decision_support ?? {};

  const complianceVerdict = String(compliance.verdict_recommendation ?? "REVIEW");
  const finalVerdict = verdictFromCompliance(complianceVerdict);

  const sentryRiskScore = scoreToPercent(alertSummary.risk_score);
  const researcherScore = scoreToPercent(researcher.evidence_score);
  const complianceScore = scoreToPercent(compliance.risk_score);
  const scribeScore = scoreToPercent(compliance.risk_score);

  const reasonCodeHighlights = Array.isArray(alertSummary.reason_codes)
    ? alertSummary.reason_codes
        .map((item: any) => (item && typeof item.description === "string" ? item.description : ""))
        .filter((item: string) => item.length > 0)
    : [];

  const researcherHighlights = toHighlights(researcher.research_summary, [
    "Research completed across profile, device, and IP intelligence sources.",
    "Entity graph and case history were correlated to identify hidden links."
  ]);

  const complianceFlags = Array.isArray(compliance.regulatory_flags)
    ? compliance.regulatory_flags.map((item: unknown) => String(item))
    : [];

  return {
    caseId: String(metadata.case_id ?? randomUUID()),
    createdAt: String(metadata.created_at ?? new Date().toISOString()),
    transaction: {
      customerName: String(customerProfile.customer_name ?? metadata.customer_id ?? "Unknown Customer"),
      accountId: String(flaggedTx.origin_account ?? "UNKNOWN_ACCOUNT"),
      amount: Number(flaggedTx.amount ?? 0),
      currency: String(flaggedTx.currency ?? "USD"),
      destinationCountry: String(flaggedTx.destination_country ?? "UNKNOWN"),
      channel: String((sentry.trigger_context ?? {}).channel ?? "unknown"),
      narrative: researcherHighlights[0] ?? "Autonomous investigation context generated by researcher agent."
    },
    analyses: {
      sentry: {
        summary: `Detected ${String(alertSummary.alert_type ?? "ANOMALY")} and generated initial anomaly scoring.`,
        score: sentryRiskScore,
        highlights: toHighlights(reasonCodeHighlights, [
          "Signal anomaly detected by Sentry model.",
          `Flagged transfer to ${String(flaggedTx.destination_country ?? "UNKNOWN")}.`
        ]),
        recommendation: sentry.auto_blocked ? "Escalate immediately and maintain transaction block" : "Forward to enrichment"
      },
      researcher: {
        summary: "Enriched case with customer profile, IP intelligence, device graph, and historical links.",
        score: researcherScore,
        highlights: researcherHighlights,
        recommendation: Boolean(decisionSupport.requires_manual_review)
          ? "Manual review required with full evidence package"
          : "Proceed with automated compliance assessment"
      },
      compliance: {
        summary: "Mapped evidence to regulatory obligations and generated compliance verdict.",
        score: complianceScore,
        highlights: toHighlights(complianceFlags, [
          "Regulatory obligations evaluated against synthesized case evidence.",
          "Decision rationale recorded for audit traceability."
        ]),
        recommendation: String(compliance.verdict_recommendation ?? "REVIEW")
      },
      scribe: {
        summary: "Compiled final SAR/STR narrative and structured reporting artifact.",
        score: scribeScore,
        highlights: toHighlights(sar.evidence_collected, [
          "Case timeline and evidence narrative packaged for reporting."
        ]),
        recommendation: "Publish final report package"
      }
    },
    finalVerdict
  };
};

const listCaseDirectories = async (): Promise<string[]> => {
  const entries = await fs.readdir(orchestratorOutputsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("CASE-")).map((entry) => entry.name);
};

const selectPythonBinary = async (): Promise<string> => {
  try {
    await fs.access(preferredPython);
    return preferredPython;
  } catch {
    return "python";
  }
};

const normalizeToken = (value: string): string => {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
};

const buildOrchestratorInput = (input: TransactionInput): OrchestratorPreparedInput => {
  const normalizedAccount = input.accountId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const deterministicSuffix = normalizedAccount.slice(-6) || "000000";
  const customerNameToken = normalizeToken(input.customerName).slice(0, 8) || "CUSTOMER";
  const customerId = `CUST-${customerNameToken}`;
  const transactionId = `TXN-${Date.now()}`;
  const accountId = input.accountId.trim();
  const timestamp = new Date().toISOString();

  const transaction = {
    transaction_id: transactionId,
    customer_id: customerId,
    origin_account: accountId,
    destination_account: `BEN-${deterministicSuffix}`,
    amount: input.amount,
    currency: input.currency,
    timestamp,
    destination_country: input.destinationCountry,
    current_ip: "185.220.101.1",
    current_ip_country: input.destinationCountry,
    device_id: `DEV-${(input.amount % 900 + 100).toFixed(0)}`,
    shared_email: "x@example.com",
    shared_phone: "+919999999999",
    channel: input.channel.toLowerCase().replace(/\s+/g, "_"),
    is_i4c_hit: false,
    rolling_30d_volume: Number((input.amount * 5).toFixed(2)),
    velocity_60m_count: input.amount > 10000 ? 4 : 2,
    device_fingerprint_match: true,
    is_new_payee: /new beneficiary|urgent/i.test(input.narrative),
    is_out_of_state: input.destinationCountry.toLowerCase() !== "local",
    is_dormant_account: false,
    is_fan_out: false,
    has_shared_contact: /shared|proxy|offshore/i.test(input.narrative)
  };

  return {
    transaction,
    customerId,
    accountId,
    transactionId
  };
};

const seedResearcherDemoData = async (
  pythonBinary: string,
  input: TransactionInput,
  prepared: OrchestratorPreparedInput
): Promise<void> => {
  const sqlBootstrapScript = [
    "import sqlite3,sys",
    "db,customer_id,customer_name,account_id,tx_id,amount,currency,destination_country,channel,timestamp = sys.argv[1:11]",
    "conn = sqlite3.connect(db)",
    "cur = conn.cursor()",
    "cur.executescript('''",
    "CREATE TABLE IF NOT EXISTS customers (",
    "  customer_id TEXT PRIMARY KEY,",
    "  customer_name TEXT,",
    "  age INTEGER,",
    "  address TEXT,",
    "  country TEXT,",
    "  occupation TEXT,",
    "  business_type TEXT,",
    "  risk_level TEXT,",
    "  kyc_status TEXT,",
    "  onboarding_date TEXT,",
    "  account_opened_date TEXT,",
    "  pep_match INTEGER,",
    "  sanctions_match INTEGER",
    ");",
    "CREATE TABLE IF NOT EXISTS accounts (",
    "  account_id TEXT PRIMARY KEY,",
    "  customer_id TEXT,",
    "  account_type TEXT,",
    "  status TEXT,",
    "  balance REAL,",
    "  currency TEXT",
    ");",
    "CREATE TABLE IF NOT EXISTS transactions (",
    "  transaction_id TEXT PRIMARY KEY,",
    "  customer_id TEXT,",
    "  origin_account TEXT,",
    "  destination_account TEXT,",
    "  beneficiary_name TEXT,",
    "  destination_country TEXT,",
    "  channel TEXT,",
    "  amount REAL,",
    "  currency TEXT,",
    "  timestamp TEXT",
    ");",
    "''')",
    "cur.execute('''",
    "INSERT INTO customers (customer_id, customer_name, age, address, country, occupation, business_type, risk_level, kyc_status, onboarding_date, account_opened_date, pep_match, sanctions_match)",
    "VALUES (?, ?, 31, 'Demo City, IN', 'IN', 'Professional', 'Individual', 'medium', 'verified', ?, ?, 0, 0)",
    "ON CONFLICT(customer_id) DO UPDATE SET",
    "  customer_name=excluded.customer_name,",
    "  account_opened_date=excluded.account_opened_date,",
    "  onboarding_date=excluded.onboarding_date",
    "''', (customer_id, customer_name, timestamp, timestamp))",
    "cur.execute('''",
    "INSERT INTO accounts (account_id, customer_id, account_type, status, balance, currency)",
    "VALUES (?, ?, 'checking', 'active', ?, ?)",
    "ON CONFLICT(account_id) DO UPDATE SET",
    "  customer_id=excluded.customer_id,",
    "  balance=excluded.balance,",
    "  currency=excluded.currency",
    "''', (account_id, customer_id, float(amount) * 4.0, currency))",
    "cur.execute('''",
    "INSERT INTO transactions (transaction_id, customer_id, origin_account, destination_account, beneficiary_name, destination_country, channel, amount, currency, timestamp)",
    "VALUES (?, ?, ?, ?, 'Web Intake Beneficiary', ?, ?, ?, ?, ?)",
    "ON CONFLICT(transaction_id) DO UPDATE SET",
    "  customer_id=excluded.customer_id,",
    "  origin_account=excluded.origin_account,",
    "  destination_account=excluded.destination_account,",
    "  destination_country=excluded.destination_country,",
    "  channel=excluded.channel,",
    "  amount=excluded.amount,",
    "  currency=excluded.currency,",
    "  timestamp=excluded.timestamp",
    "''', (tx_id, customer_id, account_id, 'BEN-WEB', destination_country, channel, float(amount), currency, timestamp))",
    "conn.commit()",
    "conn.close()"
  ].join("\n");

  await execFileAsync(
    pythonBinary,
    [
      "-c",
      sqlBootstrapScript,
      researcherDbPath,
      prepared.customerId,
      input.customerName,
      prepared.accountId,
      prepared.transactionId,
      String(input.amount),
      input.currency,
      input.destinationCountry,
      input.channel.toLowerCase().replace(/\s+/g, "_"),
      String(prepared.transaction.timestamp)
    ],
    {
      cwd: workspaceRoot,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 2
    }
  );
};

export const loadOrchestratorCase = async (caseId: string): Promise<CaseRecord> => {
  const caseDir = path.join(orchestratorOutputsDir, caseId);
  const sentryPath = path.join(caseDir, "sentry_alert.json");
  const researcherPath = path.join(caseDir, "researcher_output.json");
  const compliancePath = path.join(caseDir, "compliance_output.json");
  const scribePath = path.join(caseDir, "scribe_result.json");
  const sarPath = path.join(caseDir, "sar_report.json");

  const [sentryAlert, researcherOutput, complianceOutput, scribeResult] = await Promise.all([
    readJson<any>(sentryPath),
    readJson<any>(researcherPath),
    readJson<any>(compliancePath),
    readJson<any>(scribePath)
  ]);

  let sarReport: any | undefined;
  try {
    sarReport = await readJson<any>(sarPath);
  } catch {
    sarReport = undefined;
  }

  return buildCaseRecordFromBundle({
    sentry_alert: sentryAlert,
    researcher_output: researcherOutput,
    compliance_output: complianceOutput,
    scribe_result: scribeResult,
    sar_report: sarReport
  });
};

export const runOrchestratorForInput = async (
  input: TransactionInput,
  options?: OrchestratorRunOptions
): Promise<CaseRecord> => {
  await fs.mkdir(orchestratorInputsDir, { recursive: true });
  const prepared = buildOrchestratorInput(input);
  const generatedFile = path.join(orchestratorInputsDir, `transaction_web_${Date.now()}.json`);
  await fs.writeFile(generatedFile, JSON.stringify(prepared.transaction, null, 2), "utf-8");

  try {
    const python = await selectPythonBinary();
    await seedResearcherDemoData(python, input, prepared);
    const executionEnv = {
      ...process.env,
      ...(options?.geminiApiKey
        ? {
            LLM_PROVIDER: "gemini",
            GEMINI_API_KEY: options.geminiApiKey,
            LLM_MODEL: process.env.GEMINI_MODEL ?? "gemini-1.5-flash"
          }
        : {})
    };

    await execFileAsync(python, [orchestratorScript, "--input", generatedFile, "--input-type", "transaction"], {
      cwd: orchestratorRoot,
      timeout: 240000,
      maxBuffer: 1024 * 1024 * 8,
      env: executionEnv
    });

    const summaryPath = path.join(orchestratorOutputsDir, "pipeline_summary.json");
    const summary = await readJson<Array<Record<string, unknown>>>(summaryPath);
    const completed = [...summary].reverse().find((item) => item.status === "ok" && typeof item.case_id === "string");

    if (!completed || typeof completed.case_id !== "string") {
      const failed = [...summary].reverse().find((item) => item.status === "failed");
      if (failed && typeof failed.error === "string") {
        throw new Error(failed.error);
      }

      const skipped = [...summary].reverse().find((item) => item.status === "skipped");
      const skippedReason =
        skipped && typeof skipped.reason === "string"
          ? skipped.reason
          : "Sentry returned PASS band, so no case escalation artifacts were generated.";
      return buildNoOutputCaseRecord(input, skippedReason);
    }

    const selectedCaseId = completed.case_id;
    const selectedCaseDir = path.join(orchestratorOutputsDir, selectedCaseId);
    const requiredArtifacts = [
      path.join(selectedCaseDir, "sentry_alert.json"),
      path.join(selectedCaseDir, "researcher_output.json"),
      path.join(selectedCaseDir, "compliance_output.json"),
      path.join(selectedCaseDir, "scribe_result.json")
    ];
    const availability = await Promise.all(requiredArtifacts.map((artifact) => fileExists(artifact)));
    if (availability.some((value) => !value)) {
      throw new Error(`Case ${selectedCaseId} did not produce all required artifacts.`);
    }

    const record = await loadOrchestratorCase(selectedCaseId);
    return {
      ...record,
      transaction: {
        ...record.transaction,
        customerName: input.customerName,
        accountId: input.accountId,
        amount: input.amount,
        currency: input.currency,
        destinationCountry: input.destinationCountry,
        channel: input.channel,
        narrative: input.narrative
      }
    };
  } finally {
    await fs.unlink(generatedFile).catch(() => undefined);
  }
};

export const listOrchestratorCases = async (): Promise<string[]> => {
  const cases = await listCaseDirectories();
  return cases.sort((a, b) => b.localeCompare(a));
};
