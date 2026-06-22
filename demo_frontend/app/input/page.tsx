"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCaseRecord } from "@/lib/storage";
import { CaseRecord } from "@/lib/types";

const currencies = ["USD", "EUR", "GBP", "INR"];
const channels = ["Card", "Wire", "Crypto Exchange", "Mobile Banking"];
const countries = ["Local", "Singapore", "UAE", "Hong Kong", "Nigeria", "Turkey"];

interface DemoProfile {
  customerName: string;
  accountId: string;
  amount: string;
  currency: string;
  destinationCountry: string;
  channel: string;
  narrative: string;
  riskHint: string;
  amountDisplay: string;
}

const demoProfiles: DemoProfile[] = [
  {
    customerName: "Aarav Mehta",
    accountId: "ACC-NH-204",
    amount: "920000",
    currency: "USD",
    destinationCountry: "UAE",
    channel: "Mobile Banking",
    narrative: "Urgent transfer to new beneficiary with shared contact and proxy behavior.",
    riskHint: "HIGH · Velocity + geo",
    amountDisplay: "USD 9,20,000"
  },
  {
    customerName: "Nisha Kapoor",
    accountId: "ACC-NH-661",
    amount: "180000",
    currency: "EUR",
    destinationCountry: "Hong Kong",
    channel: "Wire",
    narrative: "High-value split settlement across offshore counterparties under time pressure.",
    riskHint: "HIGH · Structuring",
    amountDisplay: "EUR 1,80,000"
  },
  {
    customerName: "Vikram Rao",
    accountId: "ACC-NH-889",
    amount: "75000",
    currency: "USD",
    destinationCountry: "Singapore",
    channel: "Card",
    narrative: "Repeated external merchant payments to newly added payee network.",
    riskHint: "MEDIUM · Unusual payee",
    amountDisplay: "USD 75,000"
  },
  {
    customerName: "Riya Sen",
    accountId: "ACC-NH-105",
    amount: "1200",
    currency: "INR",
    destinationCountry: "Local",
    channel: "Card",
    narrative: "Monthly software subscription and regular bill payment.",
    riskHint: "LOW · Routine",
    amountDisplay: "INR 1,200"
  }
];

const riskColor = (hint: string) => {
  if (hint.startsWith("HIGH")) return "var(--danger)";
  if (hint.startsWith("MEDIUM")) return "var(--warning)";
  return "var(--brand)";
};

const riskBg = (hint: string) => {
  if (hint.startsWith("HIGH")) return "var(--danger-light)";
  if (hint.startsWith("MEDIUM")) return "var(--warning-light)";
  return "var(--brand-light)";
};

export default function InputPage() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [progressLabel, setProgressLabel] = useState<string>("");
  const [jobStatus, setJobStatus] = useState<"idle" | "queued" | "running" | "succeeded" | "failed">("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<number | null>(null);

  const [form, setForm] = useState({
    customerName: "",
    accountId: "",
    amount: "",
    currency: "USD",
    destinationCountry: "Local",
    channel: "Wire",
    narrative: "",
    geminiApiKey: ""
  });

  const applyProfile = (index: number) => {
    const profile = demoProfiles[index];
    setSelectedProfile(index);
    setForm((prev) => ({
      ...prev,
      customerName: profile.customerName,
      accountId: profile.accountId,
      amount: profile.amount,
      currency: profile.currency,
      destinationCountry: profile.destinationCountry,
      channel: profile.channel,
      narrative: profile.narrative
    }));
    setError("");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const amount = Number(form.amount);
    if (!form.customerName || !form.accountId || !form.narrative || Number.isNaN(amount) || amount <= 0) {
      setError("Please fill all required fields with a valid amount.");
      return;
    }

    setIsRunning(true);
    setJobStatus("queued");
    setElapsedSeconds(0);
    setActiveJobId("");
    setProgressLabel("Dispatching to orchestrator...");
    const startedAt = Date.now();

    try {
      const response = await fetch("/api/cases/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          accountId: form.accountId,
          amount,
          currency: form.currency,
          destinationCountry: form.destinationCountry,
          channel: form.channel,
          narrative: form.narrative,
          geminiApiKey: form.geminiApiKey.trim() || undefined
        })
      });

      const data = (await response.json()) as { jobId?: string; error?: string };
      if (!response.ok || !data.jobId) {
        throw new Error(data.error ?? "Pipeline run failed.");
      }

      const jobId = data.jobId;
      setActiveJobId(jobId);
      const maxPolls = 180;

      const progressMessages = [
        "Sentry agent scoring anomalies...",
        "Researcher agent enriching context...",
        "Compliance agent evaluating regulatory signals...",
        "Scribe agent generating report narrative...",
        "Orchestrator validating evidence chain..."
      ];

      let resolvedRecord: CaseRecord | null = null;
      for (let i = 0; i < maxPolls; i += 1) {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        if (i % 8 === 0) {
          setProgressLabel(progressMessages[Math.floor(i / 8) % progressMessages.length]);
        }

        const jobResponse = await fetch(`/api/cases/jobs/${jobId}`, {
          method: "GET",
          cache: "no-store"
        });

        const jobData = (await jobResponse.json()) as {
          status?: "queued" | "running" | "succeeded" | "failed";
          caseRecord?: CaseRecord;
          error?: string;
        };

        if (!jobResponse.ok) {
          throw new Error(jobData.error ?? "Job status check failed.");
        }

        if (jobData.status === "queued" || jobData.status === "running") {
          setJobStatus(jobData.status);
        }

        if (jobData.status === "succeeded" && jobData.caseRecord) {
          setJobStatus("succeeded");
          resolvedRecord = jobData.caseRecord;
          break;
        }

        if (jobData.status === "failed") {
          setJobStatus("failed");
          throw new Error(jobData.error ?? "Background agent execution failed.");
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!resolvedRecord) {
        throw new Error("Pipeline timed out. Please retry.");
      }

      saveCaseRecord(resolvedRecord);
      router.push("/agents/sentry");
    } catch (runError) {
      setJobStatus("failed");
      setError(runError instanceof Error ? runError.message : "Pipeline execution failed.");
    } finally {
      setProgressLabel("");
      setIsRunning(false);
    }
  };

  return (
    <section className="panel input-wrap reveal-up">
      <div className="input-head">
        <div>
          <p className="eyebrow" style={{ marginBottom: "0.4rem" }}>New Investigation</p>
          <h1>Create Case</h1>
          <p className="section-copy" style={{ marginTop: 0 }}>
            Transaction details drive all downstream agent analysis. Fill or select a demo profile below.
          </p>
        </div>
      </div>

      {/* Demo profile cards */}
      <div>
        <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: "0.5rem", marginTop: "0.25rem" }}>
          Demo Profiles — click to autofill
        </p>
        <div className="demo-profiles">
          {demoProfiles.map((profile, index) => (
            <button
              key={profile.customerName}
              type="button"
              className={`demo-profile-card${selectedProfile === index ? " selected" : ""}`}
              onClick={() => applyProfile(index)}
              disabled={isRunning}
            >
              <div className="demo-profile-name">{profile.customerName}</div>
              <div className="demo-profile-detail">{profile.accountId} · {profile.channel}</div>
              <div className="demo-profile-amount">{profile.amountDisplay}</div>
              <div style={{
                marginTop: "0.4rem",
                fontSize: "0.7rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                color: riskColor(profile.riskHint),
                background: riskBg(profile.riskHint),
                display: "inline-block",
                padding: "0.15rem 0.45rem",
                borderRadius: "999px"
              }}>
                {profile.riskHint}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Run status */}
      {jobStatus !== "idle" && (
        <article className="run-status-card">
          <p className="run-status-title">Pipeline Status</p>
          <div className="run-status-grid">
            <p>
              State
              <strong>
                <span className={`run-status-chip ${jobStatus}`}>{jobStatus.toUpperCase()}</span>
              </strong>
            </p>
            <p>
              Elapsed
              <strong>{elapsedSeconds}s</strong>
            </p>
            <p>
              Job ID
              <strong style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: "0.8rem" }}>
                {activeJobId ? activeJobId.slice(0, 8) + "…" : "Pending"}
              </strong>
            </p>
          </div>
          {isRunning && progressLabel && (
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: "var(--brand-strong)", fontWeight: 600 }}>
              ↳ {progressLabel}
            </p>
          )}
        </article>
      )}

      {/* Form */}
      <form onSubmit={onSubmit} className="form-grid" style={{ marginTop: "1rem" }}>
        <div className="form-section-label">Transaction Details</div>

        <label>
          Customer Name
          <input
            value={form.customerName}
            onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
            placeholder="Aarav Mehta"
            disabled={isRunning}
          />
        </label>

        <label>
          Account ID
          <input
            value={form.accountId}
            onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))}
            placeholder="ACC-900182"
            disabled={isRunning}
          />
        </label>

        <label>
          Amount
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="42000"
            disabled={isRunning}
          />
        </label>

        <label>
          Currency
          <select
            value={form.currency}
            onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
            disabled={isRunning}
          >
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>
          Destination Country
          <select
            value={form.destinationCountry}
            onChange={(e) => setForm((p) => ({ ...p, destinationCountry: e.target.value }))}
            disabled={isRunning}
          >
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>
          Channel
          <select
            value={form.channel}
            onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
            disabled={isRunning}
          >
            {channels.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="narrative-field">
          Transaction Narrative
          <textarea
            rows={3}
            value={form.narrative}
            onChange={(e) => setForm((p) => ({ ...p, narrative: e.target.value }))}
            placeholder="Describe the transaction context — purpose, beneficiary relationship, urgency indicators..."
            disabled={isRunning}
          />
        </label>

        <div className="form-section-label">Optional Configuration</div>

        <label className="narrative-field">
          Gemini API Key <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional — enables cloud LLM for Scribe)</span>
          <input
            type="password"
            value={form.geminiApiKey}
            onChange={(e) => setForm((p) => ({ ...p, geminiApiKey: e.target.value }))}
            placeholder="Paste key to run Scribe with Gemini instead of Ollama"
            autoComplete="off"
            disabled={isRunning}
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.25rem" }}>
          <button type="submit" className="btn btn-solid" disabled={isRunning} style={{ minWidth: "200px" }}>
            {isRunning ? "Running Pipeline…" : "Run Agent Pipeline →"}
          </button>
          {!isRunning && (
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
              Takes 30–180s depending on LLM provider
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
