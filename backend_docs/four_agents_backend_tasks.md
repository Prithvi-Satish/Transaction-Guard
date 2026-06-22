# Backend Documentation: Four Agent Tasks

## Purpose
This document explains the backend responsibilities of the four core agents used in the investigation pipeline:
1. Sentry Agent
2. Researcher Agent
3. Compliance Agent
4. Scribe Agent

The orchestration entrypoint that connects these agents is implemented in `orchestrator_agent/orchestrator.py`.

---

## 1) Sentry Agent (Detection and Alert Creation)

### Backend role
The Sentry Agent receives a transaction payload and decides whether to emit an anomaly alert for downstream investigation.

### Main backend tasks
- Parse transaction into internal schema (`TransactionParams`).
- Run three scoring layers:
  - Rules engine
  - ML anomaly layer
  - Vector matcher layer
- Build composite risk score and clamp to 0.0-1.0.
- Apply adversarial probe guardrail:
  - Track repeated near-threshold risky behavior per customer.
  - Elevate risk and add guardrail reason code if probe behavior is detected.
- Map risk score to anomaly band:
  - PASS, LOW, MEDIUM, HIGH, CRITICAL
- Enforce zero-verdict policy:
  - If PASS, return `None` (no case dispatch).
- Construct alert payload for downstream agents when band >= LOW:
  - Case metadata
  - Alert summary (type, model, reasons, score)
  - Trigger context
  - Flagged transaction details
  - Auto-block marker

### Key implementation references
- `prithvi_clone/the-sentry/src/sentry.py`
- `prithvi_clone/the-sentry/src/layers/rules_engine.py`
- `prithvi_clone/the-sentry/src/layers/ml_anomaly.py`
- `prithvi_clone/the-sentry/src/layers/vector_matcher.py`

### Input contract
- Transaction payload fields such as customer id, transaction id, amount, channel, device, IP, destination country.

### Output contract
- If anomaly: structured `ResearcherOutput`-style alert JSON.
- If PASS: no downstream dispatch (`None`).

---

## 2) Researcher Agent (Context Enrichment and Evidence Building)

### Backend role
The Researcher Agent enriches the Sentry alert with customer/account/device/IP/history context and produces an evidence-focused case output.

### Main backend tasks
- Ensure local data dependencies are ready:
  - SQLite demo database bootstrap (`ensure_demo_db`).
  - Internal API seed data bootstrap (`ensure_internal_api_seed`).
- Resolve connectors based on mode:
  - Local connector mode
  - HTTP connector mode for internal APIs
  - Optional hybrid external IP enrichment with fallback to internal data
- Validate primary records exist:
  - Must find both customer and transaction in SQLite.
- Collect contextual datasets:
  - Customer profile and onboarding docs
  - Accounts and transaction behavior
  - Login history and impossible-travel indicators
  - Device metadata and shared-device links
  - Entity-link overlaps (email/phone/device)
  - Prior case links and annotations
- Call connector services:
  - Case annotations
  - IP intelligence
  - Device risk
- Compute evidence score from alert + enrichment signals.
- Return consolidated research case JSON.

### Key implementation references
- `sara_clone/The-Researcher/researcher_agent.py`
- `sara_clone/The-Researcher/internal_api_server.py`
- `sara_clone/The-Researcher/sample_data/researcher_demo.db`

### Input contract
- Sentry alert JSON (contains `case_metadata`, `trigger_context`, `flagged_transaction`, `alert_summary`).

### Output contract
- `researcher_output.json` containing:
  - customer profile
  - account history
  - IP history
  - device fingerprint and linkage
  - research summary and decision support
  - evidence score

---

## 3) Compliance Agent (Regulatory Decisioning)

### Backend role
The Compliance Agent converts Sentry + Researcher signals into a regulated verdict and rationale.

### Main backend tasks
- Build a normalized `TransactionSignal` from upstream payloads.
  - Includes i4c hit, transaction amount, rolling 30-day amount, velocity proxy, SIM/IP mismatch, typology confidence.
- Calculate composite score using weighted risk signal framework.
- Apply Tier 1 logic (real-time):
  - Immediate BLOCK when I4C hit or score >= 0.85.
- Apply Tier 2 logic (deep reasoning):
  - If Gemini client available, request structured verdict JSON from model.
  - If not available, run deterministic rule-based fallback.
- Enforce guardrails:
  - Zero-hallucination clause citation validation.
  - Invalid verdict or bad citations trigger escalation to human PO.
- Track escalation rate and pause automation if escalation ratio exceeds threshold.
- Return compliance output normalized for downstream use:
  - risk_score
  - regulatory_flags
  - compliance_reasoning
  - verdict_recommendation
  - raw_verdict

### Key implementation references
- `vikrant_clone/FinAgent-Compliance-officer/risk_assessor_agent.py`
- Knowledge graph and verdict mapping logic inside the same file.

### Input contract
- Derived transaction signal from Sentry + Researcher data.

### Output contract
- `compliance_output.json` with verdict recommendation and rationale.

---

## 4) Scribe Agent (Final Report Generation and Persistence)

### Backend role
The Scribe Agent transforms investigation payloads into final STR/SAR-style artifacts with validation and persistence.

### Main backend tasks
- Initialize local LLM generator and ensure report database schema exists.
- Merge Researcher and Compliance payloads (deep merge with compliance precedence).
- Validate merged payload against Pydantic schema (`InvestigationCase`).
- Build chronological timeline from transactions and login events.
- Build prompt from template + structured user payload.
- Request report narrative from local LLM (Ollama) with retries/fallback.
- Normalize generated sections and validate final markdown structure.
- Attempt auto-repair prompt if sections are missing/invalid.
- Emit final artifacts:
  - Markdown report
  - JSON report
  - Optional PDF
- Persist artifacts:
  - File outputs
  - SQLite report history (version, latency, validation status, fallback usage)
- Provide service health and metrics endpoints support (used by API layer).

### Key implementation references
- `vignesh_clone/Scribe/scribe_agent/scribe_agent.py`
- `vignesh_clone/Scribe/scribe_agent/sar_generator.py`
- `vignesh_clone/Scribe/scribe_agent/report_validator.py`
- `vignesh_clone/Scribe/scribe_agent/utils/report_formatter.py`

### Input contract
- Researcher payload prepared for Scribe.
- Compliance payload with risk and verdict fields.

### Output contract
- `scribe_result.json`
- `sar_report.md` and `sar_report.json` when generation succeeds

---

## End-to-End Orchestrator Responsibilities

### What orchestration adds
The orchestrator coordinates all four backend agents and ensures cross-repo schema adaptation and artifact persistence.

### Core orchestration tasks
- Parse CLI arguments and input mode (`transaction`, `transactions`, `sentry-alert`, `sentry-alerts`).
- Normalize input into iterable case payloads.
- Run Sentry when input is transaction; skip dispatch for PASS-band cases.
- Run Researcher enrichment.
- Build compliance signal and run Compliance decisioning.
- Transform payload shape for Scribe and run report generation.
- Persist per-case artifacts into output folder:
  - `sentry_alert.json`
  - `researcher_output.json`
  - `compliance_output.json`
  - `scribe_researcher_input.json`
  - `scribe_result.json`
  - `sar_report.md` and `sar_report.json` when available
- Emit global `pipeline_summary.json` with case-level status.

### Key implementation reference
- `orchestrator_agent/orchestrator.py`

---

## Failure and Fallback Behavior (Important for Backend Operations)

- Sentry PASS band: case is skipped and recorded in summary as skipped.
- Researcher missing SQL records: raises error (must seed or upsert customer/transaction).
- Compliance model unavailable: deterministic fallback logic is used.
- Compliance citation guardrail failure: escalates to human PO verdict.
- Scribe import/model issues: result can be marked as skipped/fallback, with status in `scribe_result.json`.
- Pipeline-level exceptions: captured in summary as failed entries.

---

## Output Traceability

Primary runtime output location:
- `orchestrator_agent/outputs/`

Per-case folder convention:
- `CASE-<uuid>/...`

Global run summary:
- `orchestrator_agent/outputs/pipeline_summary.json`

This output layout supports backend debugging, UI consumption, and demo replay.
