import Link from "next/link";
import Iridescence from "@/components/Iridescence";

const agentFlow = [
  {
    stage: "Sentry",
    role: "Anomaly Detection",
    detail: "Scores velocity, geo, channel, and behavioral anomalies across 11 rule-based reason codes.",
    step: "01"
  },
  {
    stage: "Researcher",
    role: "Context Enrichment",
    detail: "Builds evidence from account history, device links, IP intel, and entity overlaps.",
    step: "02"
  },
  {
    stage: "Compliance",
    role: "Regulatory Decisioning",
    detail: "Maps signals to PMLA, RBI KYC, and I4C obligations. Emits a traceable verdict.",
    step: "03"
  },
  {
    stage: "Scribe",
    role: "Report Generation",
    detail: "Synthesises a regulator-ready SAR with chronological evidence narrative.",
    step: "04"
  },
  {
    stage: "Orchestrator",
    role: "Pipeline Coordinator",
    detail: "Validates the full evidence chain, closes the case, and archives audit artifacts.",
    step: "05"
  }
];

const stats = [
  { num: "4", label: "Autonomous agents coordinated in one pipeline" },
  { num: "11", label: "AML reason codes evaluated per transaction" },
  { num: "< 3m", label: "End-to-end case closure time" }
];

const valuePillars = [
  {
    icon: "⚡",
    title: "Structured Intake",
    body: "Capture transaction context once. Every downstream agent works from the same validated signal — no data drift between stages."
  },
  {
    icon: "🔍",
    title: "Transparent Decisions",
    body: "Each agent exposes score, evidence highlights, and regulatory citation. Full traceability from signal to verdict."
  },
  {
    icon: "📋",
    title: "Audit-Ready Output",
    body: "Generate a complete SAR package — chronology, compliance rationale, and regulatory references — ready for filing."
  }
];

export default function HomePage() {
  return (
    <section className="landing">
      <div className="hero-stack reveal-up">
        {/* Hero */}
        <div className="hero-iridescent-wrap panel">
          <Iridescence className="hero-iridescent" tint={[0.05, 0.52, 0.45]} speed={0.85} amplitude={0.08} />
          <div className="hero-overlay">
            <p className="eyebrow">Financial Crime Operating Interface</p>
            <h1 className="hero-card">
              Signal to report — without losing the thread.
            </h1>
            <p className="hero-copy" style={{ maxWidth: "58ch" }}>
              New Horizon runs four coordinated AI agents that take a flagged transaction from anomaly detection
              through regulatory decision to a filed Suspicious Activity Report.
            </p>
            <div className="hero-actions">
              <Link href="/input" className="btn btn-solid">
                Start New Case →
              </Link>
              <Link href="/agent-flow" className="btn btn-flow">
                View Agent Architecture
              </Link>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="stats-row reveal-up delay-1">
          {stats.map((s) => (
            <article key={s.num} className="stat-card">
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </article>
          ))}
        </div>

        {/* Agent Flow */}
        <article className="panel flow-preview reveal-up delay-2">
          <div className="flow-head">
            <h2>Investigation Pipeline</h2>
            <span>Automated · End-to-end</span>
          </div>
          <div className="flow-list">
            {agentFlow.map((item) => (
              <article key={item.stage} className="flow-item">
                <p className="flow-index">{item.step}</p>
                <h3>{item.stage}</h3>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--brand)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {item.role}
                </p>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </article>
      </div>

      {/* Value pillars */}
      <div className="value-grid reveal-up delay-3">
        {valuePillars.map((pillar) => (
          <article key={pillar.title} className="panel value-card">
            <div className="value-icon">{pillar.icon}</div>
            <h3>{pillar.title}</h3>
            <p>{pillar.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
