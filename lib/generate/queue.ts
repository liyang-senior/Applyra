import { randomUUID } from "crypto";
import { runGenerateJob } from "@/lib/generate/run-job";
import {
  GENERATE_STATUS_LABEL,
  type GenerateJobInput,
  type GenerateJobPublic,
  type GenerateJobResult,
  type GenerateJobStatus,
} from "@/lib/generate/types";
import { assertCapacity } from "@/lib/server/capacity";

const MAX_PENDING_PER_USER = 10;
const MAX_CONCURRENT_PER_USER = 2;
/** Finished/failed jobs without a heavy payload — short status retention. */
const JOB_TTL_MS = 5 * 60 * 1000;
/** After the client has fetched base64/prompt once, drop the job sooner. */
const JOB_CONSUMED_TTL_MS = 60 * 1000;

type InternalJob = {
  id: string;
  userId: string;
  status: GenerateJobStatus;
  message: string;
  error?: string;
  result?: GenerateJobResult;
  input: GenerateJobInput;
  /** True after the finished payload was returned to the client once. */
  payloadConsumed?: boolean;
  createdAt: number;
  updatedAt: number;
};

type QueueState = {
  jobs: Map<string, InternalJob>;
  order: string[];
  active: Set<string>;
  pumping: boolean;
};

const globalForQueue = globalThis as typeof globalThis & {
  applyraGenerateQueue?: QueueState;
};

function state(): QueueState {
  if (!globalForQueue.applyraGenerateQueue) {
    globalForQueue.applyraGenerateQueue = {
      jobs: new Map(),
      order: [],
      active: new Set(),
      pumping: false,
    };
  }
  return globalForQueue.applyraGenerateQueue;
}

function touch(job: InternalJob, status: GenerateJobStatus, message?: string) {
  job.status = status;
  job.message = message || GENERATE_STATUS_LABEL[status];
  job.updatedAt = Date.now();
}

function isChatgptManual(input: GenerateJobInput) {
  return input.provider === "chatgpt";
}

function hasPastedReply(input: GenerateJobInput) {
  return Boolean(String(input.pastedResponse || "").trim());
}

function queuedMessageFor(input: GenerateJobInput) {
  if (isChatgptManual(input) && !hasPastedReply(input)) {
    return "Preparing ChatGPT prompt…";
  }
  if (isChatgptManual(input) && hasPastedReply(input)) {
    return "Queued — building from ChatGPT reply…";
  }
  return "Queued — waiting for one of your free slots…";
}

function pendingStatuses(status: GenerateJobStatus) {
  return (
    status === "received" ||
    status === "queued" ||
    status === "generating" ||
    status === "building" ||
    status === "saving"
  );
}

function countPendingForUser(userId: string) {
  let count = 0;
  for (const job of state().jobs.values()) {
    if (job.userId === userId && pendingStatuses(job.status)) count += 1;
  }
  return count;
}

function countActiveForUser(userId: string) {
  let count = 0;
  for (const id of state().active) {
    const job = state().jobs.get(id);
    if (job && job.userId === userId) count += 1;
  }
  return count;
}

/** Position among this user's queued jobs only (1-based). */
function queuePositionForUser(jobId: string, userId: string): number | null {
  const { order, jobs } = state();
  let position = 0;
  for (const id of order) {
    const job = jobs.get(id);
    if (!job || job.userId !== userId || job.status !== "queued") continue;
    position += 1;
    if (id === jobId) return position;
  }
  return null;
}

function releaseHeavyPayload(job: InternalJob) {
  // pasted ChatGPT replies / prompts / file bytes are the bulk of job RAM
  if (job.input.pastedResponse) {
    job.input = { ...job.input, pastedResponse: undefined };
  }
  if (!job.result) return;
  const { base64, prompt, resume, coverLetter, ...rest } = job.result;
  void base64;
  void prompt;
  void resume;
  void coverLetter;
  job.result = {
    ...rest,
    // Keep tiny metadata so UI can still show "finished"; file re-download
    // uses the browser's lastFile copy, not this server payload.
    mode: rest.mode,
  };
  job.payloadConsumed = true;
  job.updatedAt = Date.now();
}

function pruneExpired() {
  const { jobs, order, active } = state();
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (pendingStatuses(job.status)) continue;
    const ttl = job.payloadConsumed ? JOB_CONSUMED_TTL_MS : JOB_TTL_MS;
    if (now - job.updatedAt < ttl) continue;
    jobs.delete(id);
    const idx = order.indexOf(id);
    if (idx >= 0) order.splice(idx, 1);
    active.delete(id);
  }
}

function toPublic(job: InternalJob): GenerateJobPublic {
  return {
    id: job.id,
    status: job.status,
    message: job.message,
    queuePosition:
      job.status === "queued"
        ? queuePositionForUser(job.id, job.userId)
        : null,
    activeCount: countActiveForUser(job.userId),
    pendingForUser: countPendingForUser(job.userId),
    error: job.error,
    result: job.result,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
}

export function getGenerateJob(
  jobId: string,
  userId: string,
): GenerateJobPublic | null {
  pruneExpired();
  const job = state().jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  const publicJob = toPublic(job);
  // Hand the file/prompt to the client once, then free server RAM immediately.
  // "Download again" is served from the browser's lastFile, not this Map.
  if (
    !job.payloadConsumed &&
    (job.status === "finished" || job.status === "failed") &&
    (job.result?.base64 || job.result?.prompt || job.input.pastedResponse)
  ) {
    releaseHeavyPayload(job);
  }
  return publicJob;
}

export function getQueueSnapshot(userId?: string) {
  pruneExpired();
  const { jobs, active } = state();
  let queued = 0;
  for (const job of jobs.values()) {
    if (job.status === "queued") queued += 1;
  }
  return {
    active: active.size,
    queued,
    maxConcurrentPerUser: MAX_CONCURRENT_PER_USER,
    maxPendingPerUser: MAX_PENDING_PER_USER,
    pendingForUser: userId ? countPendingForUser(userId) : null,
    activeForUser: userId ? countActiveForUser(userId) : null,
  };
}

export function enqueueGenerateJob(
  input: GenerateJobInput,
):
  | { ok: true; job: GenerateJobPublic }
  | { ok: false; error: string; status?: number; job?: GenerateJobPublic } {
  pruneExpired();

  const capacity = assertCapacity();
  if (!capacity.ok) {
    return { ok: false, error: capacity.error, status: 503 };
  }

  const pending = countPendingForUser(input.userId);
  if (pending >= MAX_PENDING_PER_USER) {
    return {
      ok: false,
      error: `You already have ${MAX_PENDING_PER_USER} pending generate requests. Wait for one to finish.`,
      status: 429,
    };
  }

  const id = randomUUID();
  const now = Date.now();
  const job: InternalJob = {
    id,
    userId: input.userId,
    status: "received",
    message: GENERATE_STATUS_LABEL.received,
    input,
    createdAt: now,
    updatedAt: now,
  };
  const store = state();
  store.jobs.set(id, job);
  store.order.push(id);
  touch(job, "queued", queuedMessageFor(input));
  void pumpQueue();
  return { ok: true, job: toPublic(job) };
}

function nextRunnableJobId(): string | null {
  const store = state();
  const activeByUser = new Map<string, number>();
  for (const id of store.active) {
    const job = store.jobs.get(id);
    if (!job) continue;
    activeByUser.set(job.userId, (activeByUser.get(job.userId) || 0) + 1);
  }

  for (const id of store.order) {
    const job = store.jobs.get(id);
    // Skip already-running jobs — active is a Set, so re-adding the same id
    // does not raise the per-user count and would spin forever.
    if (!job || job.status !== "queued" || store.active.has(id)) continue;
    const running = activeByUser.get(job.userId) || 0;
    if (running >= MAX_CONCURRENT_PER_USER) continue;
    return id;
  }
  return null;
}

async function pumpQueue() {
  const store = state();
  if (store.pumping) return;
  store.pumping = true;
  try {
    while (true) {
      const capacity = assertCapacity();
      if (!capacity.ok) break;

      const nextId = nextRunnableJobId();
      if (!nextId) break;

      const job = store.jobs.get(nextId);
      if (!job) {
        const idx = store.order.indexOf(nextId);
        if (idx >= 0) store.order.splice(idx, 1);
        continue;
      }

      store.active.add(nextId);
      // Claim immediately so the sync while-loop cannot pick this job again.
      touch(job, "generating", job.message || GENERATE_STATUS_LABEL.generating);
      void processJob(job).finally(() => {
        store.active.delete(nextId);
        void pumpQueue();
      });
    }
  } finally {
    store.pumping = false;
  }
}

async function processJob(job: InternalJob) {
  try {
    const result = await runGenerateJob(job.input, (status, message) => {
      touch(job, status, message);
    });
    job.result = result;
    // Drop the pasted ChatGPT body as soon as rendering finishes — the file
    // bytes in result.base64 are enough until the client polls once.
    if (job.input.pastedResponse) {
      job.input = { ...job.input, pastedResponse: undefined };
    }
    touch(job, "finished", "Finished");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed.";
    job.error = message;
    if (job.input.pastedResponse) {
      job.input = { ...job.input, pastedResponse: undefined };
    }
    touch(job, "failed", message);
  }
}
