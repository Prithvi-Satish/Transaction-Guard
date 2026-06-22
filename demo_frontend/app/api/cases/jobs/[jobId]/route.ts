import { NextResponse } from "next/server";
import { getCaseJob } from "@/lib/case-jobs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const job = await getCaseJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found or expired." }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    caseRecord: job.caseRecord,
    error: job.error
  });
}
