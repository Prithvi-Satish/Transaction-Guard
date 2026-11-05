# Transaction-Guard - Multi-Agent AML Investigation Platform

Transaction-Guard investigates a suspicious bank transaction the way a compliance analyst would: four AI agents run in sequence, and the result is a verdict (**ALLOW / REVIEW / BLOCK**) plus an audit-ready Suspicious Activity Report (SAR).

**Live demo:** https://transaction-guard.vercel.app (hosted demo mode, see below)
**Stack:** Next.js 15 · React · TypeScript · Python · Pydantic · Gemini API · SQLite · jsPDF / ReportLab

## How it works

```
Next.js UI ──POST /api/cases/run──▶ job created (202 + jobId) ──▶ UI polls GET /api/cases/jobs/:id
                                          │
                                          ▼
                         Python orchestrator (orchestrator_agent/orchestrator.py)
     ┌────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
     │  Sentry    │ ─▶ │  Researcher  │ ─▶ │  Compliance  │ ─▶ │   Scribe   │
     │ anomaly &  │    │ profile, IP, │    │ regulatory   │    │ SAR report │
     │ velocity   │    │ SQL history  │    │ risk scoring │    │ (Gemini)   │
     └────────────┘    └──────────────┘    └──────────────┘    └────────────┘
            each hand-off is a Pydantic-validated JSON contract
```

- **Async job pattern:** the run endpoint validates input and returns `202 Accepted` with a job id at once. The pipeline takes tens of seconds, so the UI polls a status endpoint instead of holding the HTTP request open.
- **Typed contracts:** agents exchange JSON validated by Pydantic models (Python side) and TypeScript interfaces (UI side), so a malformed agent output fails loudly instead of corrupting the report.
- **Reports:** the Scribe agent drafts the SAR narrative with Gemini. The UI exports it as a PDF with jsPDF, and the backend can render it with ReportLab.

## Hosted demo mode

The full pipeline needs Python, four agent packages and a Gemini key, which a serverless host can't run. With `TG_DEMO_MODE=true`, the API swaps in [`lib/demo-pipeline.ts`](demo_frontend/lib/demo-pipeline.ts), a deterministic TypeScript simulation of the four stages that returns the same `CaseRecord` shape, so the whole UI works live.

Serverless instances don't share memory or disk, so a demo job id encodes its own input and start time (base64url). Any instance can answer a status poll without a database.

## Run locally

```bash
cd demo_frontend
npm install
npm run dev                          # full pipeline: needs the agent repos + Python, see backend_docs/
# or
TG_DEMO_MODE=true NEXT_PUBLIC_TG_DEMO_MODE=true npm run dev   # demo mode, no Python needed
```

Open http://localhost:3000/input, pick a demo profile and run the investigation.

## Deploy (Vercel)

Root directory: `demo_frontend` · Environment variables: `TG_DEMO_MODE=true`, `NEXT_PUBLIC_TG_DEMO_MODE=true`

## Team

- **Prithvi Satish:** Sentry agent (rules + Isolation Forest + vector matching risk engine), the orchestrator that integrates all four agents, shared contracts, and the Next.js integration and hosting.
- Researcher, Compliance and Scribe agents were built with teammates. Their implementations live in their own repositories.
