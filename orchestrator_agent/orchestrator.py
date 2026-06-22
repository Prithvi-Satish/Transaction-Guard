"""Cross-repo orchestrator for autonomous financial crime investigations.

Pipeline:
1) The Sentry: detect anomaly from transaction stream payloads.
2) The Researcher: enrich alert with contextual evidence.
3) Compliance Officer: derive regulatory verdict and rationale.
4) The Scribe: generate audit-ready SAR/STR report artifacts.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
SENTRY_ROOT = WORKSPACE_ROOT / "prithvi_clone" / "the-sentry"
RESEARCHER_ROOT = WORKSPACE_ROOT / "sara_clone" / "The-Researcher"
COMPLIANCE_ROOT = WORKSPACE_ROOT / "vikrant_clone" / "FinAgent-Compliance-officer"
SCRIBE_ROOT = WORKSPACE_ROOT / "vignesh_clone" / "Scribe" / "scribe_agent"

DEFAULT_TRANSACTION_INPUT = Path(__file__).resolve().parent / "inputs" / "transaction_sample.json"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"


def _append_import_paths() -> None:
    for path in [SENTRY_ROOT, RESEARCHER_ROOT, COMPLIANCE_ROOT, SCRIBE_ROOT]:
        path_str = str(path)
        if path_str not in sys.path:
            sys.path.append(path_str)


_append_import_paths()

from src.sentry import TheSentry  # type: ignore  # noqa: E402
from src.schemas import TransactionParams  # type: ignore  # noqa: E402
from researcher_agent import (  # type: ignore  # noqa: E402
    DB_PATH,
    INTERNAL_API_DATA_PATH,
    HybridIPIntelConnector,
    InternalAPIConnectors,
    ResearcherAgent,
    SQLTools,
    build_internal_connector,
    ensure_demo_db,
    ensure_internal_api_seed,
)
from risk_assessor_agent import RegulatoryRiskAssessor, TransactionSignal  # type: ignore  # noqa: E402

SCRIBE_IMPORT_ERROR: str | None = None
try:
    from config import get_settings as get_scribe_settings  # type: ignore  # noqa: E402
    from scribe_agent import ScribeAgent  # type: ignore  # noqa: E402
except Exception as exc:  # pragma: no cover - runtime environment guardrail
    SCRIBE_IMPORT_ERROR = str(exc)
    get_scribe_settings = None
    ScribeAgent = None


@dataclass(slots=True)
class PipelineArtifacts:
    sentry_alert: dict[str, Any]
    researcher_output: dict[str, Any]
    compliance_output: dict[str, Any]
    scribe_researcher_input: dict[str, Any]
    scribe_result: dict[str, Any]


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def normalize_input(payload: Any, input_type: str) -> list[dict[str, Any]]:
    if input_type in {"transaction", "sentry-alert"}:
        if not isinstance(payload, dict):
            raise ValueError(f"Expected a JSON object for input type '{input_type}'.")
        return [payload]

    if input_type in {"transactions", "sentry-alerts"}:
        if not isinstance(payload, list):
            raise ValueError(f"Expected a JSON array for input type '{input_type}'.")
        if not all(isinstance(item, dict) for item in payload):
            raise ValueError("All items in the array input must be JSON objects.")
        return payload

    raise ValueError(f"Unsupported input type: {input_type}")


def run_sentry(transaction_payload: dict[str, Any], sentry: TheSentry) -> dict[str, Any] | None:
    txn = TransactionParams(**transaction_payload)
    alert = sentry.process_transaction(txn)
    if alert is None:
        return None
    return alert.model_dump(mode="json")


def run_researcher(
    sentry_alert: dict[str, Any],
    connector_mode: str,
    internal_api_base_url: str | None,
    external_ip_base_url: str | None,
    external_ip_api_key: str | None,
) -> dict[str, Any]:
    ensure_demo_db(DB_PATH)
    ensure_internal_api_seed(INTERNAL_API_DATA_PATH)

    internal_connector: InternalAPIConnectors = build_internal_connector(
        connector_mode,
        internal_api_base_url,
    )
    ip_connector = HybridIPIntelConnector(
        internal_connector,
        external_base_url=external_ip_base_url,
        api_key=external_ip_api_key,
    )
    researcher = ResearcherAgent(
        sql_tools=SQLTools(DB_PATH),
        internal_connectors=internal_connector,
        ip_connector=ip_connector,
    )
    return researcher.build_case(sentry_alert)


def _extract_reason_codes(sentry_alert: dict[str, Any]) -> set[str]:
    reason_codes = sentry_alert.get("alert_summary", {}).get("reason_codes", [])
    extracted: set[str] = set()
    for reason in reason_codes:
        if isinstance(reason, dict) and isinstance(reason.get("code"), str):
            extracted.add(reason["code"])
    return extracted


def build_compliance_signal(
    sentry_alert: dict[str, Any],
    researcher_output: dict[str, Any],
) -> TransactionSignal:
    reason_codes = _extract_reason_codes(sentry_alert)
    tx_amount = float(sentry_alert.get("flagged_transaction", {}).get("amount", 0.0))

    behavior = researcher_output.get("account_history", {}).get("transaction_behavior", {})
    avg_amount = float(behavior.get("avg_txn_amount_30d", 0.0) or 0.0)
    txn_count = int(behavior.get("txn_count_30d", 0) or 0)
    rolling_30day_amount = avg_amount * txn_count

    ip_history = researcher_output.get("ip_history", {})
    evidence_score = float(researcher_output.get("evidence_score", 0.0) or 0.0)

    return TransactionSignal(
        i4c_hit=("RC-000" in reason_codes) or bool(sentry_alert.get("auto_blocked", False)),
        transaction_amount=tx_amount,
        rolling_30day_amount=rolling_30day_amount,
        upi_velocity=5.0 if "RC-004" in reason_codes else 1.0,
        sim_device_mismatch=bool(ip_history.get("ip_country_mismatch", False)),
        vda_purchase_via_upi=False,
        typology_confidence=max(0.0, min(evidence_score, 1.0)),
    )


def run_compliance(
    sentry_alert: dict[str, Any],
    researcher_output: dict[str, Any],
) -> dict[str, Any]:
    assessor = RegulatoryRiskAssessor()
    signal = build_compliance_signal(sentry_alert, researcher_output)
    verdict = assessor.assess_transaction(signal)

    decision_score_floor = {
        "BLOCK": 0.95,
        "FILE STR": 0.9,
        "HOLD 24H": 0.78,
        "EDD": 0.68,
        "ESCALATE TO HUMAN PO": 0.7,
        "PASS": 0.3,
    }
    risk_score = max(
        float(researcher_output.get("evidence_score", 0.0) or 0.0),
        float(sentry_alert.get("alert_summary", {}).get("risk_score", 0.0) or 0.0),
        decision_score_floor.get(verdict.decision, 0.5),
    )

    regulatory_flags = list(verdict.rag_citations)
    if verdict.escalated_to_human and not regulatory_flags:
        regulatory_flags = ["Human Review Required"]

    return {
        "risk_score": round(min(max(risk_score, 0.0), 1.0), 2),
        "regulatory_flags": regulatory_flags,
        "compliance_reasoning": verdict.thought_trace or verdict.regulatory_basis,
        "verdict_recommendation": verdict.decision.replace(" ", "_"),
        "raw_verdict": verdict.model_dump(),
    }


def to_scribe_researcher_payload(
    sentry_alert: dict[str, Any],
    researcher_output: dict[str, Any],
) -> dict[str, Any]:
    metadata = sentry_alert.get("case_metadata", {})
    trigger_context = sentry_alert.get("trigger_context", {})
    flagged_tx = sentry_alert.get("flagged_transaction", {})

    customer_profile = researcher_output.get("customer_profile", {})
    device = researcher_output.get("device_fingerprint", {})
    ip_history = researcher_output.get("ip_history", {})

    tx_id = metadata.get("transaction_id", "UNKNOWN_TXN")
    tx_timestamp = flagged_tx.get("timestamp") or metadata.get("created_at")
    if not isinstance(tx_timestamp, str):
        tx_timestamp = metadata.get("created_at", "1970-01-01T00:00:00Z")

    login_timestamp = metadata.get("created_at", "1970-01-01T00:00:00Z")
    ip_country = ip_history.get("ip_country") or trigger_context.get("current_ip_country", "UNKNOWN")

    annotations = list(researcher_output.get("research_summary", []))
    decision_support = researcher_output.get("decision_support", {})
    reason_codes = decision_support.get("reason_codes", [])
    if reason_codes:
        annotations.append("Reason codes: " + ", ".join(str(item) for item in reason_codes))

    return {
        "case_id": metadata.get("case_id", "UNKNOWN_CASE"),
        "customer": {
            "customer_id": metadata.get("customer_id", "UNKNOWN_CUSTOMER"),
            "name": customer_profile.get("customer_name", "Unknown"),
            "country": customer_profile.get("country", "UNKNOWN"),
            "kyc_status": customer_profile.get("kyc_status", "unknown"),
        },
        "transactions": [
            {
                "tx_id": tx_id,
                "amount": float(flagged_tx.get("amount", 0.0) or 0.0),
                "currency": flagged_tx.get("currency", "INR"),
                "timestamp": tx_timestamp,
                "destination_country": flagged_tx.get("destination_country", "UNKNOWN"),
                "transaction_type": trigger_context.get("channel", "unknown"),
            }
        ],
        "login_events": [
            {
                "ip": trigger_context.get("current_ip", "0.0.0.0"),
                "location": str(ip_country),
                "timestamp": login_timestamp,
            }
        ],
        "device_data": {
            "device_id": trigger_context.get("device_id", "UNKNOWN_DEVICE"),
            "device_risk_score": float(device.get("fraud_cluster_score", 0.0) or 0.0),
        },
        "case_annotations": annotations,
    }


def run_scribe(
    scribe_researcher_payload: dict[str, Any],
    compliance_output: dict[str, Any],
    persist_to_scribe_repo: bool,
) -> dict[str, Any]:
    if ScribeAgent is None or get_scribe_settings is None:
        return {
            "status": "skipped",
            "error": f"Scribe import failed: {SCRIBE_IMPORT_ERROR}",
        }

    settings = get_scribe_settings()
    agent = ScribeAgent(settings)
    result = agent.run(scribe_researcher_payload, compliance_output)

    if persist_to_scribe_repo:
        agent.persist_reports(
            result["report_markdown"],
            result["report_json"],
            generation_latency=result["generation_latency"],
            validation_status=result["validation_status"],
            fallback_used=result["fallback_used"],
        )

    return {
        "status": "ok",
        "validation_status": result["validation_status"],
        "generation_latency": result["generation_latency"],
        "fallback_used": result["fallback_used"],
        "report_markdown": result["report_markdown"],
        "report_json": result["report_json"],
    }


def run_single_case(
    sentry_alert: dict[str, Any],
    connector_mode: str,
    internal_api_base_url: str | None,
    external_ip_base_url: str | None,
    external_ip_api_key: str | None,
    persist_to_scribe_repo: bool,
) -> PipelineArtifacts:
    researcher_output = run_researcher(
        sentry_alert=sentry_alert,
        connector_mode=connector_mode,
        internal_api_base_url=internal_api_base_url,
        external_ip_base_url=external_ip_base_url,
        external_ip_api_key=external_ip_api_key,
    )

    compliance_output = run_compliance(
        sentry_alert=sentry_alert,
        researcher_output=researcher_output,
    )

    scribe_researcher_input = to_scribe_researcher_payload(
        sentry_alert=sentry_alert,
        researcher_output=researcher_output,
    )

    scribe_result = run_scribe(
        scribe_researcher_payload=scribe_researcher_input,
        compliance_output=compliance_output,
        persist_to_scribe_repo=persist_to_scribe_repo,
    )

    return PipelineArtifacts(
        sentry_alert=sentry_alert,
        researcher_output=researcher_output,
        compliance_output=compliance_output,
        scribe_researcher_input=scribe_researcher_input,
        scribe_result=scribe_result,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run cross-repo autonomous investigation orchestration across "
            "Sentry, Researcher, Compliance, and Scribe."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_TRANSACTION_INPUT,
        help="Path to input JSON.",
    )
    parser.add_argument(
        "--input-type",
        choices=["transaction", "transactions", "sentry-alert", "sentry-alerts"],
        default="transaction",
        help="Type of JSON payload in --input.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where orchestrator artifacts will be written.",
    )
    parser.add_argument(
        "--connector-mode",
        choices=["local", "http"],
        default="local",
        help="Researcher connector mode.",
    )
    parser.add_argument(
        "--internal-api-base-url",
        default=None,
        help="Required when --connector-mode=http for Researcher internal connectors.",
    )
    parser.add_argument(
        "--external-ip-base-url",
        default=None,
        help="Optional external IP enrichment API URL for Researcher.",
    )
    parser.add_argument(
        "--external-ip-api-key",
        default=None,
        help="Optional bearer token used by external IP enrichment API.",
    )
    parser.add_argument(
        "--persist-to-scribe-repo",
        action="store_true",
        help="Persist report outputs to Scribe's configured outputs/database.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    payload = read_json(args.input)
    inputs = normalize_input(payload, args.input_type)

    output_root = args.output_dir.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    sentry = TheSentry()
    summary: list[dict[str, Any]] = []

    for index, item in enumerate(inputs, start=1):
        try:
            if args.input_type.startswith("sentry-alert"):
                sentry_alert = item
            else:
                sentry_alert = run_sentry(item, sentry=sentry)
                if sentry_alert is None:
                    summary.append(
                        {
                            "index": index,
                            "status": "skipped",
                            "reason": "No anomaly generated by The Sentry (PASS band).",
                        }
                    )
                    print(f"[{index}] Skipped: Sentry returned PASS.")
                    continue

            case_id = str(sentry_alert.get("case_metadata", {}).get("case_id", f"CASE_{index:03d}"))
            case_dir = output_root / case_id
            case_dir.mkdir(parents=True, exist_ok=True)

            artifacts = run_single_case(
                sentry_alert=sentry_alert,
                connector_mode=args.connector_mode,
                internal_api_base_url=args.internal_api_base_url,
                external_ip_base_url=args.external_ip_base_url,
                external_ip_api_key=args.external_ip_api_key,
                persist_to_scribe_repo=args.persist_to_scribe_repo,
            )

            write_json(case_dir / "sentry_alert.json", artifacts.sentry_alert)
            write_json(case_dir / "researcher_output.json", artifacts.researcher_output)
            write_json(case_dir / "compliance_output.json", artifacts.compliance_output)
            write_json(case_dir / "scribe_researcher_input.json", artifacts.scribe_researcher_input)
            write_json(case_dir / "scribe_result.json", artifacts.scribe_result)

            if artifacts.scribe_result.get("status") == "ok":
                write_text(case_dir / "sar_report.md", artifacts.scribe_result["report_markdown"])
                write_json(case_dir / "sar_report.json", artifacts.scribe_result["report_json"])

            summary_item = {
                "index": index,
                "case_id": case_id,
                "status": "ok",
                "risk_score": artifacts.compliance_output.get("risk_score"),
                "verdict": artifacts.compliance_output.get("verdict_recommendation"),
                "scribe_status": artifacts.scribe_result.get("status"),
                "validation_status": artifacts.scribe_result.get("validation_status"),
                "output_dir": str(case_dir),
            }
            summary.append(summary_item)

            print(
                f"[{index}] Completed case {case_id} | "
                f"verdict={summary_item['verdict']} | "
                f"scribe={summary_item['scribe_status']}"
            )

        except Exception as exc:
            summary.append(
                {
                    "index": index,
                    "status": "failed",
                    "error": str(exc),
                }
            )
            print(f"[{index}] Failed: {exc}")

    write_json(output_root / "pipeline_summary.json", summary)
    print(f"\nPipeline finished. Summary written to: {output_root / 'pipeline_summary.json'}")


if __name__ == "__main__":
    main()
