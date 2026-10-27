import {
  GENERATE_STATUS_LABEL,
  type GenerateJobPublic,
  type GenerateJobResult,
} from "@/lib/generate/types";

export type GeneratePollHandlers = {
  onStatus?: (job: GenerateJobPublic) => void;
  signal?: AbortSignal;
  intervalMs?: number;
};

export async function waitForGenerateJob(
  jobId: string,
  handlers: GeneratePollHandlers = {},
): Promise<GenerateJobResult> {
  const intervalMs = handlers.intervalMs ?? 1200;

  while (true) {
    if (handlers.signal?.aborted) {
      throw new Error("Generation cancelled.");
    }

    const response = await fetch(
      `/api/generate?jobId=${encodeURIComponent(jobId)}`,
      { signal: handlers.signal },
    );
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      job?: GenerateJobPublic;
    };
    if (!response.ok) {
      throw new Error(data.error || "Could not check generation status.");
    }
    const job = data.job;
    if (!job) throw new Error("Job not found.");

    handlers.onStatus?.(job);

    if (job.status === "finished" && job.result) {
      return job.result;
    }
    if (job.status === "failed" || job.status === "rejected") {
      throw new Error(
        job.error || job.message || GENERATE_STATUS_LABEL[job.status],
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function formatGenerateStatus(job: GenerateJobPublic) {
  if (job.status === "queued" && job.queuePosition) {
    return `Queued (#${job.queuePosition}) — waiting for one of your free slots…`;
  }
  return job.message || GENERATE_STATUS_LABEL[job.status];
}
