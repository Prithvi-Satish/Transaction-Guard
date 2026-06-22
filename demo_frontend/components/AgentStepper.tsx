import Link from "next/link";
import { Fragment } from "react";
import { AGENT_LABELS, AGENT_ORDER } from "@/lib/agents";
import { AgentKey } from "@/lib/types";

interface AgentStepperProps {
  current: AgentKey;
}

export function AgentStepper({ current }: AgentStepperProps) {
  const currentIndex = AGENT_ORDER.indexOf(current);

  return (
    <nav className="agent-stepper">
      {AGENT_ORDER.map((agent, index) => {
        const isCurrent = agent === current;
        const isPast = index < currentIndex;
        const isFuture = index > currentIndex;

        return (
          <Fragment key={agent}>
            {index > 0 && (
              <span className="step-divider" aria-hidden="true">›</span>
            )}
            <Link
              href={`/agents/${agent}`}
              className={`step-chip${isCurrent ? " current" : ""}${isPast ? " past" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              tabIndex={isFuture ? -1 : 0}
              style={isFuture ? { pointerEvents: "none", opacity: 0.4 } : {}}
            >
              <span className="step-chip-num">
                {isPast ? "" : index + 1}
              </span>
              {AGENT_LABELS[agent]}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
