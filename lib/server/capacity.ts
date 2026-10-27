import os from "os";

/**
 * Local/dev: do not block generate on capacity (Windows freemem + V8 heap ratio
 * false-positive constantly). Production still gates on extreme process RSS only.
 */
const ENFORCE =
  process.env.APPLYRA_CAPACITY_ENFORCE === "1" ||
  process.env.NODE_ENV === "production";

/** Block only when this Node process RSS is genuinely huge. */
const RSS_MAX_MB = Number(process.env.APPLYRA_RSS_MAX_MB || "2048");

export type CapacitySnapshot = {
  ok: boolean;
  reason: string | null;
  totalMemMb: number;
  freeMemMb: number;
  usedMemRatio: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  enforce: boolean;
};

function mb(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

export function getCapacitySnapshot(): CapacitySnapshot {
  const total = os.totalmem();
  const free = os.freemem();
  const usedRatio = total > 0 ? 1 - free / total : 1;
  const mem = process.memoryUsage();
  const rssMb = mb(mem.rss);
  const heapUsedMb = mb(mem.heapUsed);
  const heapTotalMb = mb(mem.heapTotal);

  let reason: string | null = null;
  if (ENFORCE && rssMb >= RSS_MAX_MB) {
    reason = "Server memory is almost full. Try again in a moment.";
  }

  return {
    ok: !reason,
    reason,
    totalMemMb: mb(total),
    freeMemMb: mb(free),
    usedMemRatio: usedRatio,
    rssMb,
    heapUsedMb,
    heapTotalMb,
    enforce: ENFORCE,
  };
}

export function assertCapacity():
  | { ok: true; capacity: CapacitySnapshot }
  | { ok: false; error: string; capacity: CapacitySnapshot } {
  const capacity = getCapacitySnapshot();
  if (!capacity.ok) {
    return {
      ok: false,
      error: capacity.reason || "Server cannot accept requests right now.",
      capacity,
    };
  }
  return { ok: true, capacity };
}
