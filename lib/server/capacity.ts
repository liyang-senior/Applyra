import os from "os";

const RAM_FREE_MIN_RATIO = Number(process.env.APPLYRA_RAM_FREE_MIN || "0.12");
const HEAP_USED_MAX_RATIO = Number(process.env.APPLYRA_HEAP_USED_MAX || "0.9");

export type CapacitySnapshot = {
  ok: boolean;
  reason: string | null;
  totalMemMb: number;
  freeMemMb: number;
  usedMemRatio: number;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
};

function mb(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

export function getCapacitySnapshot(): CapacitySnapshot {
  const total = os.totalmem();
  const free = os.freemem();
  const usedRatio = total > 0 ? 1 - free / total : 1;
  const mem = process.memoryUsage();
  const heapRatio =
    mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;

  let reason: string | null = null;
  if (total > 0 && free / total < RAM_FREE_MIN_RATIO) {
    reason = "Server memory is almost full. Try again in a moment.";
  } else if (total > 0 && mem.rss / total >= 0.85) {
    reason = "Server memory is almost full. Try again in a moment.";
  } else if (
    mem.heapUsed > 1024 * 1024 * 1024 &&
    heapRatio >= HEAP_USED_MAX_RATIO
  ) {
    reason = "Server is under heavy load. Try again in a moment.";
  }

  return {
    ok: !reason,
    reason,
    totalMemMb: mb(total),
    freeMemMb: mb(free),
    usedMemRatio: usedRatio,
    rssMb: mb(mem.rss),
    heapUsedMb: mb(mem.heapUsed),
    heapTotalMb: mb(mem.heapTotal),
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
