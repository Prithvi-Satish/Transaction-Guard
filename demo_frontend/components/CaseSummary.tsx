import { CaseRecord } from "@/lib/types";

interface CaseSummaryProps {
  record: CaseRecord;
}

const verdictClass = (verdict: string) => {
  if (verdict === "BLOCK") return "verdict-BLOCK";
  if (verdict === "REVIEW") return "verdict-REVIEW";
  return "verdict-ALLOW";
};

export function CaseSummary({ record }: CaseSummaryProps) {
  return (
    <section className="case-summary panel">
      <div className="case-summary-inner">
        <div>
          <div className="case-summary-label">Case ID</div>
          <div className="case-summary-value" style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: "0.82rem" }}>
            {record.caseId}
          </div>
        </div>

        <div className="case-summary-divider" />

        <div>
          <div className="case-summary-label">Customer</div>
          <div className="case-summary-value">{record.transaction.customerName}</div>
        </div>

        <div className="case-summary-divider" />

        <div>
          <div className="case-summary-label">Account</div>
          <div className="case-summary-value" style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: "0.85rem" }}>
            {record.transaction.accountId ?? "—"}
          </div>
        </div>

        <div className="case-summary-divider" />

        <div>
          <div className="case-summary-label">Amount</div>
          <div className="case-summary-value">
            {record.transaction.currency}{" "}
            {record.transaction.amount.toLocaleString()}
          </div>
        </div>

        <div className="case-summary-divider" />

        <div>
          <div className="case-summary-label">Channel</div>
          <div className="case-summary-value">{record.transaction.channel}</div>
        </div>

        <div className="case-summary-divider" />

        <div>
          <div className="case-summary-label">Destination</div>
          <div className="case-summary-value">{record.transaction.destinationCountry}</div>
        </div>

        <div className="case-summary-divider" />

        <div>
          <div className="case-summary-label">Verdict</div>
          <div>
            <span className={`verdict-badge ${verdictClass(record.finalVerdict)}`}>
              {record.finalVerdict}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
