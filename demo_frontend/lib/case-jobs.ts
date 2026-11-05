import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEMO_JOB_PREFIX, demoJobStatus, encodeDemoJob, isDemoMode } from "./demo-pipeline";
import { runOrchestratorForInput } from "./orchestrator";
import { CaseRecord, TransactionInput } from "./types";

type JobStatus = "queued" | "running" | "succeeded" | "failed";

interface CaseJob {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  input: TransactionInput;
  caseRecord?: CaseRecord;
  error?: string;
}

interface CaseRunOptions {
  geminiApiKey?: string;
}

const JOB_TTL_MS = 30 * 60 * 1000;
const jobsDir = path.resolve(process.cwd(), ".runtime", "case-jobs");

const now = (): number => Date.now();

const jobPath = (id: string): string => path.join(jobsDir, `${id}.json`);

const writeJob = async (job: CaseJob): Promise<void> => {
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2), "utf-8");
};

const readJob = async (id: string): Promise<CaseJob | null> => {
  try {
    const raw = await fs.readFile(jobPath(id), "utf-8");
    return JSON.parse(raw) as CaseJob;
  } catch {
    return null;
  }
};

const cleanupStaleJobs = async (): Promise<void> => {
  await fs.mkdir(jobsDir, { recursive: true });
  const cutoff = now() - JOB_TTL_MS;
  const entries = await fs.readdir(jobsDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const file = path.join(jobsDir, entry.name);
        try {
          const stats = await fs.stat(file);
          if (stats.mtimeMs < cutoff) {
            await fs.unlink(file);
          }
        } catch {
          // Ignore races during cleanup.
        }
      })
  );
};

export const createCaseJob = async (input: TransactionInput, options?: CaseRunOptions): Promise<string> => {
  if (isDemoMode()) {
    return encodeDemoJob(input);
  }

  await cleanupStaleJobs();

  const id = randomUUID();
  const created = now();
  const job: CaseJob = {
    id,
    status: "queued",
    createdAt: created,
    updatedAt: created,
    input
  };

  await writeJob(job);

  void (async () => {
    const current = await readJob(id);
    if (!current) {
      return;
    }

    current.status = "running";
    current.updatedAt = now();
    await writeJob(current);

    try {
      const caseRecord = await runOrchestratorForInput(input, options);
      const done = await readJob(id);
      if (!done) {
        return;
      }
      done.caseRecord = caseRecord;
      done.status = "succeeded";
      done.updatedAt = now();
      await writeJob(done);
    } catch (error) {
      const done = await readJob(id);
      if (!done) {
        return;
      }
      done.status = "failed";
      done.error = error instanceof Error ? error.message : "Pipeline execution failed.";
      done.updatedAt = now();
      await writeJob(done);
    }
  })();

  return id;
};

export const getCaseJob = async (id: string): Promise<CaseJob | null> => {
  if (id.startsWith(DEMO_JOB_PREFIX)) {
    return demoJobStatus(id);
  }

  await cleanupStaleJobs();
  return readJob(id);
};
