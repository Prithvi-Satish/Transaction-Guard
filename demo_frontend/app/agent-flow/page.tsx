import Link from "next/link";

const agentFlow = [
  {
    name: "Sentry",
    full: "Sentry Agent",
    role: "Anomaly Detection",
    summary: "Scores the transaction across 11 AML reason codes using rules, ML anomaly detection, and vector pattern matching. Produces a risk band (PASS → CRITICAL) and zero-verdict policy.",
    outputs: ["Composite anomaly score", "Reason code flags", "Risk band classification"],
    color: "#0b6655"
  },
  {
    name: "Researcher",
    full: "Researcher Agent",
    role: "Context Enrichment",
    summary: "Queries a local SQLite dataset and mock HTTP APIs to build contextual evidence — account history, entity linkages, device fingerprints, IP geo-intel, and prior case annotations.",
    outputs: ["Entity linkage graph", "Impossible-travel flags", "Evidence score"],
    color: "#1a4ed8"
  },
  {
    name: "Compliance",
    full: "Compliance Agent",
    role: "Regulatory Decisioning",
    summary: "Maps enriched signals to PMLA Section 12A, RBI KYC Para 38, and I4C obligations. Applies a weighted signal framework and emits a tiered verdict with citation-level traceability.",
    outputs: ["Weighted risk score", "Regulatory clause citations", "Tiered verdict (PASS/BLOCK/EDD/FILE STR)"],
    color: "#7a4500"
  },
  {
    name: "Scribe",
    full: "Scribe Agent",
    role: "SAR Narrative",
    summary: "Deep-merges researcher and compliance payloads, builds a chronological timeline, and uses a local or cloud LLM (Gemma3/Gemini) to generate a structured SAR narrative with auto-repair validation.",
    outputs: ["SAR narrative (Markdown)", "Structured JSON report", "PDF (optional)"],
    color: "#6b21a8"
  },
  {
    name: "Orchestrator",
    full: "Orchestrator Agent",
    role: "Pipeline Coordinator",
    summary: "Sequences all four agents, seeds the Researcher database, validates the full evidence chain, archives artifacts to case folder, and emits a pipeline summary with per-agent status.",
    outputs: ["pipeline_summary.json", "Artifact folder per case", "End-to-end case record"],
    color: "#374151"
  }
];

const signals = [
  { code: "RC-000", label: "I4C Registry Hit", severity: "CRITICAL" },
  { code: "RC-002", label: "PMLA Single (>₹10L)", severity: "HIGH" },
  { code: "RC-003", label: "PMLA Rolling (>₹50L/30d)", severity: "HIGH" },
  { code: "RC-004", label: "Velocity Breach", severity: "MEDIUM" },
  { code: "RC-012", label: "Structuring Detected", severity: "HIGH" }
];

const severityStyle = (s: string) => {
  if (s === "CRITICAL") return { background: "#fde8ea", color: "#8c1222", border: "1px solid #f5a8b0" };
  if (s === "HIGH") return { background: "#fff3dc", color: "#7a4500", border: "1px solid #f0cd8c" };
  return { background: "#e8f4ff", color: "#1a4f82", border: "1px solid #a8cff5" };
};

export default function AgentFlowPage() {
  return (
    <section className="agent-flow-page reveal-up">
      {/* Intro */}
      <article className="panel flow-intro">
        <p className="eyebrow">Multi-Agent Architecture</p>
        <h1>End-to-end investigation pipeline</h1>
        <p className="section-copy">
          Five coordinated agents take a single flagged transaction from anomaly detection through regulatory decision
          to a filed Suspicious Activity Report — fully automated, fully traceable.
        </p>
        <div className="hero-actions">
          <Link href="/input" className="btn btn-solid">
            Start New Case →
          </Link>
          <Link href="/agents/sentry" className="btn btn-ghost">
            View Agent Analysis
          </Link>
        </div>
      </article>

      {/* Agent cards */}
      <section className="flow-lane">
        {agentFlow.map((item, index) => (
          <article key={item.name} className="panel flow-lane-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div style={{
                width: 28, height: 28,
                borderRadius: "50%",
                background: item.color,
                color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.72rem", fontWeight: 800, flexShrink: 0
              }}>
                {String(index + 1).padStart(2, "0")}
              </div>
              <span style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: item.color }}>
                {item.role}
              </span>
            </div>
            <h3 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>{item.full}</h3>
            <p style={{ margin: "0 0 0.75rem", color: "var(--muted)", fontSize: "0.8rem", lineHeight: 1.55 }}>{item.summary}</p>
            <div style={{ display: "grid", gap: "0.25rem" }}>
              {item.outputs.map((o) => (
                <div key={o} style={{
                  fontSize: "0.72rem",
                  padding: "0.22rem 0.5rem",
                  background: "rgba(11,102,85,0.07)",
                  color: "var(--brand-strong)",
                  borderRadius: "4px",
                  fontWeight: 600
                }}>
                  ↳ {o}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      {/* AML Signals reference */}
      <article className="panel">
        <p className="eyebrow" style={{ marginBottom: "0.6rem" }}>Sentry Reason Codes — Sample</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
          {signals.map((sig) => (
            <div key={sig.code} style={{ padding: "0.6rem 0.75rem", border: "1px solid var(--line-light)", borderRadius: "var(--radius-sm)", background: "#fafcf8" }}>
              <div style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-strong)", marginBottom: "0.25rem" }}>
                {sig.code}
              </div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>{sig.label}</div>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.05em", padding: "0.15rem 0.4rem", borderRadius: "999px", ...severityStyle(sig.severity) }}>
                {sig.severity}
              </span>
            </div>
          ))}
        </div>
      </article>

      {/* Notes */}
      <article className="panel flow-notes">
        <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Demo Notes</p>
        <p>
          This UI runs the full Python pipeline locally. Production deployments would extend with customer risk tier,
          sanctions/PEP screening, real-time IP geo-intelligence, and historian transaction windows.
          The Scribe agent defaults to Ollama (Gemma3); supply a Gemini API key on the input form to use cloud inference.
        </p>
      </article>
    </section>
  );
}
