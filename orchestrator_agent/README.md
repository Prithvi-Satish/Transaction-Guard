# Orchestrator Agent

This service runs four investigation components in sequence:

1. [The Sentry](https://github.com/Prithvi-Satish/the-sentry)
2. [The Researcher](https://github.com/SaraJain26/The-Researcher)
3. [Compliance Officer](https://github.com/pvnvik/FinAgent-Compliance-officer)
4. [The Scribe](https://github.com/Viggy-Bhat/Scribe)

## What It Does

- Accepts transaction or Sentry alert JSON input.
- Runs each agent stage in order.
- Adapts schema differences between repos automatically.
- Stores per-case artifacts and a pipeline summary in `outputs`.

## Quick Start

From this folder (`orchestrator_agent`), run:

```powershell
python orchestrator.py
```

This uses `inputs/transaction_sample.json` by default.

## Input Options

Transaction input (single object):

```powershell
python orchestrator.py --input inputs/transaction_sample.json --input-type transaction
```

Sentry alert input (single object):

```powershell
python orchestrator.py --input path/to/sentry_alert.json --input-type sentry-alert
```

Batch input (array):

- Use `--input-type transactions` for array of transaction objects.
- Use `--input-type sentry-alerts` for array of Sentry alerts.

## Output Files

For each case:

- `sentry_alert.json`
- `researcher_output.json`
- `compliance_output.json`
- `scribe_researcher_input.json`
- `scribe_result.json`
- `sar_report.md` (when Scribe ran successfully)
- `sar_report.json` (when Scribe ran successfully)

Global summary:

- `outputs/pipeline_summary.json`

## Notes

- If Gemini SDK is unavailable, Compliance agent now falls back to deterministic rules.
- Scribe report persistence to its own repo outputs/SQLite is optional via `--persist-to-scribe-repo`.
- Researcher can run with local connectors (`--connector-mode local`) or HTTP mode (`--connector-mode http --internal-api-base-url ...`).
- Scribe now supports both Ollama and Gemini providers. To run with Gemini, set environment variables before launch:

```powershell
$env:LLM_PROVIDER="gemini"
$env:GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
$env:GEMINI_MODEL="gemini-1.5-flash"
python orchestrator.py --input inputs/transaction_sample.json --input-type transaction
```
