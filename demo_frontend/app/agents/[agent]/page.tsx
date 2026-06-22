"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AgentStepper } from "@/components/AgentStepper";
import { CaseSummary } from "@/components/CaseSummary";
import { ScoreRing } from "@/components/ScoreRing";
import { AGENT_LABELS, AGENT_ORDER, nextAgent } from "@/lib/agents";
import { loadCaseRecord } from "@/lib/storage";
import { AgentKey, CaseRecord } from "@/lib/types";

interface AgentPageProps {
  params: Promise<{ agent: string }>;
}

const isAgentKey = (value: string): value is AgentKey => AGENT_ORDER.includes(value as AgentKey);

const agentMeta: Record<AgentKey, { role: string; description: string }> = {
  sentry: {
    role: "Anomaly Detection",
    description: "Evaluated transaction signals across rules-based thresholds, ML anomaly scoring, and vector pattern matching to produce an initial risk band."
  },
  researcher: {
    role: "Context Enrichment",
    description: "Queried account history, device fingerprints, entity linkages, and IP intelligence to build a contextual evidence package for downstream decision-making."
  },
  compliance: {
    role: "Regulatory Decisioning",
    description: "Mapped enriched signals to PMLA, RBI KYC, and I4C regulatory obligations. Applied weighted scoring and emitted a traceable compliance verdict."
  },
  scribe: {
    role: "Report Generation",
    description: "Synthesised all upstream evidence into a structured SAR narrative with chronological timeline, regulatory references, and investigator-ready findings."
  }
};

const flowByAgent: Record<AgentKey, string[]> = {
  sentry: [
    "Ingest and normalise transaction features",
    "Run rules engine across 11 AML reason codes",
    "Apply ML anomaly layer and vector similarity scoring",
    "Compute composite risk band (PASS → CRITICAL)"
  ],
  researcher: [
    "Query customer profile and account baseline",
    "Resolve entity linkages (email, phone, device)",
    "Collect login history and detect impossible-travel",
    "Retrieve IP intelligence and prior case annotations"
  ],
  compliance: [
    "Extract reason codes and build signal framework",
    "Apply weighted regulatory scoring (I4C, PMLA, velocity)",
    "Query knowledge graph for applicable clause citations",
    "Emit tiered verdict with traceable rationale"
  ],
  scribe: [
    "Deep-merge researcher and compliance payloads",
    "Build chronological event timeline",
    "Generate LLM narrative via Gemini or Ollama",
    "Validate sections and auto-repair if required"
  ]
};

export default function AgentPage({ params }: AgentPageProps) {
  const router = useRouter();
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [agent, setAgent] = useState<AgentKey | null>(null);

  useEffect(() => {
    let alive = true;

    const setup = async () => {
      const data = await params;
      if (!alive) return;

      if (!isAgentKey(data.agent)) {
        router.replace("/input");
        return;
      }

      const loaded = loadCaseRecord();
      if (!loaded) {
        router.replace("/input");
        return;
      }

      setAgent(data.agent);
      setRecord(loaded);
    };

    void setup();
    return () => { alive = false; };
  }, [params, router]);

  const nextRoute = useMemo(() => {
    if (!agent) return null;
    const next = nextAgent(agent);
    return next ? `/agents/${next}` : "/report";
  }, [agent]);

  if (!record || !agent || !nextRoute) {
    return (
      <section className="panel loading-panel reveal-up">
        <p style={{ margin: 0, fontWeight: 600 }}>Loading agent context…</p>
        <div className="loading-dots">
          <span /><span /><span />
        </div>
      </section>
    );
  }

  const analysis = record.analyses[agent];
  const meta = agentMeta[agent];
  const agentIndex = AGENT_ORDER.indexOf(agent);

  return (
    <section className="agent-page reveal-up">
      <AgentStepper current={agent} />
      <CaseSummary record={record} />

      <article className="panel analysis-card">
        {/* Header */}
        <div className="analysis-header">
          <div className="analysis-header-left">
            <p className="eyebrow">{AGENT_LABELS[agent]} · {meta.role}</p>
            <h2>{analysis.summary}</h2>
            <div className="analysis-meta">
              <span className="status-chip">Completed</span>
              <span className="agent-position-chip">
                Agent {agentIndex + 1} of {AGENT_ORDER.length}
              </span>
            </div>
          </div>
          <ScoreRing score={analysis.score} size={80} />
        </div>

        {/* Agent description */}
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.65, margin: "0.25rem 0 0" }}>
          {meta.description}
        </p>

        {/* Risk meter */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="risk-meter">
            <div className="risk-meter-label">
              <span>Signal Strength</span>
              <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontWeight: 700 }}>
                {analysis.score} / 100
              </span>
            </div>
            <div className="risk-meter-bar">
              <div
                className={`risk-meter-fill ${analysis.score >= 70 ? "high" : analysis.score >= 40 ? "medium" : "low"}`}
                style={{ width: `${analysis.score}%` }}
              />
            </div>
          </div>
        </div>

        {/* How it worked */}
        <div className="how-it-works">
          <p className="how-it-works-title">How this agent worked</p>
          {flowByAgent[agent].map((step, i) => (
            <div key={step} className="how-step">
              <span className="how-step-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>

        {/* Evidence highlights */}
        <div className="evidence-section" style={{ marginTop: "1.25rem" }}>
          <p className="evidence-section-title">Evidence Highlights</p>
          <div className="evidence-list">
            {analysis.highlights.map((item, i) => (
              <div key={item} className="evidence-item">
                <span className={`evidence-icon ${i === 0 ? "warn" : ""}`}>
                  {i === 0 ? "!" : "→"}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendation */}
        <div className="recommendation-box">
          <p className="recommendation-box-label">Agent Recommendation</p>
          <p className="recommendation-box-text">{analysis.recommendation}</p>
        </div>

        {/* Actions */}
        <div className="agent-actions" style={{ marginTop: "1.25rem" }}>
          <Link href={nextRoute} className="btn btn-solid">
            {nextRoute === "/report" ? "View Final Report →" : "Next Agent →"}
          </Link>
          <Link href="/input" className="btn btn-ghost">
            ← Edit Input
          </Link>
        </div>
      </article>
    </section>
  );
}
