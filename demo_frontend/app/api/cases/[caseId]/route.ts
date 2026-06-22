import { NextResponse } from "next/server";
import { loadOrchestratorCase } from "@/lib/orchestrator";

interface RouteContext {
  params: Promise<{ caseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { caseId } = await context.params;
    const caseRecord = await loadOrchestratorCase(caseId);
    return NextResponse.json({ caseRecord });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load case artifacts.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
