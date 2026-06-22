"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CaseSummary } from "@/components/CaseSummary";
import { ScoreRing } from "@/components/ScoreRing";
import { AGENT_LABELS, AGENT_ORDER } from "@/lib/agents";
import { downloadReportJson, downloadReportMarkdown, downloadReportPdf } from "@/lib/report";
import { clearCaseRecord, loadCaseRecord } from "@/lib/storage";
import { CaseRecord } from "@/lib/types";

const verdictMeta = {
  BLOCK: {
    cls: "verdict-BLOCK",
    headline: "Transaction Blocked",
    detail: "This transaction presents high-risk indicators that require immediate action. Filing of Suspicious Activity Report is recommended."
  },
  REVIEW: {
    cls: "verdict-REVIEW",
    headline: "Under Review",
    detail: "Elevated risk signals detected. Enhanced due diligence required before proceeding. Consider escalating to a Principal Officer."
  },
  ALLOW: {
    cls: "verdict-ALLOW",
    headline: "Transaction Cleared",
    detail: "Analysis completed. Risk signals are within acceptable thresholds. No immediate action required."
  }
};

const agentRoleMap: Record<string, string> = {
  sentry: "Anomaly Detection",
  researcher: "Context Enrichment",
  compliance: "Regulatory Decisioning",
  scribe: "Report Generation"
};

export default function ReportPage() {
  const router = useRouter();
  const [record, setRecord] = useState<CaseRecord | null>(null);

  useEffect(() => {
    const loaded = loadCaseRecord();
    if (!loaded) {
      router.replace("/input");
      return;
    }
    setRecord(loaded);
  }, [router]);

  const averageScore = useMemo(() => {
    if (!record) return 0;
    const total = AGENT_ORDER.reduce((sum, agent) => sum + record.analyses[agent].score, 0);
    return Math.round(total / AGENT_ORDER.length);
  }, [record]);

  if (!record) {
    return (
      <section className="panel loading-panel reveal-up">
        <p style={{ margin: 0, fontWeight: 600 }}>Loading final report…</p>
        <div className="loading-dots">
          <span /><span /><span />
        </div>
      </section>
    );
  }

  const vm = verdictMeta[record.finalVerdict] ?? verdictMeta.REVIEW;
  const closedAt = new Date(record.createdAt).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  return (
    <section className="report-page reveal-up">
      <CaseSummary record={record} />

      {/* Verdict hero */}
      <article className="panel report-hero">
        <div className="report-hero-content">
          <p className="eyebrow">Investigation Complete</p>
          <h1>{vm.headline}</h1>
          <p className="section-copy">{vm.detail}</p>
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.5rem", marginBottom: 0 }}>
            Closed {closedAt} · Compliance rec: <strong style={{ color: "var(--ink)" }}>{record.analyses.compliance.recommendation}</strong>
          </p>
        </div>
        <div className="report-hero-badge">
          <div style={{ textAlign: "center" }}>
            <span className={`verdict-badge verdict-badge-lg ${vm.cls}`} style={{ display: "inline-flex", marginBottom: "0.9rem" }}>
              {record.finalVerdict}
            </span>
            <ScoreRing score={averageScore} size={88} />
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.5rem", marginBottom: 0, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              Avg. Confidence
            </p>
          </div>
        </div>
      </article>

      {/* Agent summaries */}
      <section className="report-grid">
        {AGENT_ORDER.map((agent) => {
          const a = record.analyses[agent];
          const riskClass = a.score >= 70 ? "high" : a.score >= 40 ? "medium" : "low";
          const riskColor = riskClass === "high" ? "var(--danger)" : riskClass === "medium" ? "var(--warning)" : "var(--brand)";

          return (
            <article key={agent} className="panel report-card">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                <div>
                  <p style={{ margin: "0 0 0.1rem", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)" }}>
                    {agentRoleMap[agent] ?? agent}
                  </p>
                  <h3>{AGENT_LABELS[agent]}</h3>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="report-card-score" style={{ color: riskColor }}>{a.score}</div>
                  <div className="report-card-score-label">/ 100</div>
                </div>
              </div>

              <p>{a.summary}</p>

              {/* Mini risk bar */}
              <div className="risk-meter" style={{ marginTop: "0.4rem" }}>
                <div className="risk-meter-bar">
                  <div className={`risk-meter-fill ${riskClass}`} style={{ width: `${a.score}%` }} />
                </div>
              </div>

              <ul className="report-card-highlights">
                {a.highlights.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      {/* Actions */}
      <article className="panel report-actions-panel">
        <div className="report-actions-left">
          <h3>Next Action</h3>
          <p>{record.analyses.compliance.recommendation}</p>
        </div>
        <div className="report-buttons">
          <button className="btn btn-solid" onClick={() => downloadReportPdf(record)}>
            ↓ PDF Report
          </button>
          <button className="btn btn-ghost" onClick={() => downloadReportMarkdown(record)}>
            ↓ Markdown
          </button>
          <button className="btn btn-ghost" onClick={() => downloadReportJson(record)}>
            ↓ JSON
          </button>
          <Link href="/input" className="btn btn-solid">
            New Case
          </Link>
          <button
            className="btn btn-danger"
            onClick={() => {
              clearCaseRecord();
              router.push("/");
            }}
          >
            Clear Session
          </button>
        </div>
      </article>
    </section>
  );
}
