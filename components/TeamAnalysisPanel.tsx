"use client";

import { useEffect, useState } from "react";
import { TeamAnalysisChart } from "@/components/TeamAnalysisChart";
import { useToast } from "@/components/useToast";
import type { TeamAnalysisSummary } from "@/lib/analysis";

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

export function TeamAnalysisPanel() {
  const { showToast, toastHost } = useToast();
  const [from, setFrom] = useState(toInputDate(daysAgo(29)));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<TeamAnalysisSummary | null>(null);

  async function load(nextFrom = from, nextTo = to) {
    setPending(true);
    try {
      const params = new URLSearchParams({
        scope: "team",
        from: nextFrom,
        to: nextTo,
      });
      const response = await fetch(`/api/analysis?${params.toString()}`);
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { summary?: TeamAnalysisSummary };
      const next = data.summary;
      setSummary(
        next
          ? {
              ...next,
              users: Array.isArray(next.users) ? next.users : [],
            }
          : null,
      );
    } catch {
      showToast("Could not load team analysis.", "error");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(days: number) {
    const nextFrom = toInputDate(daysAgo(days - 1));
    const nextTo = toInputDate(new Date());
    setFrom(nextFrom);
    setTo(nextTo);
    void load(nextFrom, nextTo);
  }

  return (
    <div className="w-full space-y-5">
      {toastHost}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <label className="block min-w-[10rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">From</span>
          <input
            type="date"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="block min-w-[10rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">To</span>
          <input
            type="date"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            onClick={() => applyPreset(7)}
          >
            7 days
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            onClick={() => applyPreset(30)}
          >
            30 days
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            onClick={() => applyPreset(90)}
          >
            90 days
          </button>
          <button
            type="button"
            className="rounded-xl bg-[var(--green)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={() => void load()}
          >
            {pending ? "Loading…" : "Update"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
          <p className="text-sm text-[var(--muted)]">Team generated</p>
          <p className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl">
            {summary?.generated ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
          <p className="text-sm text-[var(--muted)]">Team applied</p>
          <p className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl">
            {summary?.applied ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
          <p className="text-sm text-[var(--muted)]">Clearance flagged</p>
          <p className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl">
            {summary?.clearance ?? "—"}
          </p>
        </div>
      </div>

      {summary ? (
        <TeamAnalysisChart users={summary.users} />
      ) : (
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-[var(--muted)]">
          {pending ? "Loading chart…" : "No team analysis data yet."}
        </p>
      )}
    </div>
  );
}
