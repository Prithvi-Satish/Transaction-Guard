import { NextResponse } from "next/server";
import { createCaseJob } from "@/lib/case-jobs";
import { TransactionInput } from "@/lib/types";

interface RunCaseRequest extends TransactionInput {
  geminiApiKey?: string;
}

const isValidInput = (value: unknown): value is TransactionInput => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const requiredStringFields: Array<keyof TransactionInput> = [
    "customerName",
    "accountId",
    "currency",
    "destinationCountry",
    "channel",
    "narrative"
  ];

  if (!requiredStringFields.every((field) => typeof candidate[field] === "string" && String(candidate[field]).trim().length > 0)) {
    return false;
  }

  return typeof candidate.amount === "number" && Number.isFinite(candidate.amount) && candidate.amount > 0;
};

export async function POST(request: Request) {
  try {
    const rawPayload = (await request.json()) as Partial<RunCaseRequest>;
    const key = typeof rawPayload.geminiApiKey === "string" ? rawPayload.geminiApiKey.trim() : "";

    if (!isValidInput(rawPayload)) {
      return NextResponse.json({ error: "Invalid investigation input payload." }, { status: 400 });
    }

    const payload: TransactionInput = rawPayload;
    const jobId = await createCaseJob(payload, {
      geminiApiKey: key.length > 0 ? key : undefined
    });
    return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute orchestrator pipeline.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
