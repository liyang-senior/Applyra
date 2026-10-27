"use client";

import { useState } from "react";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { TeamAnalysisPanel } from "@/components/TeamAnalysisPanel";
import type { Account } from "@/lib/server/types";

type Tab = "daily" | "by-user";

export function AnalysisTabs({
  canViewTeam,
  users,
}: {
  canViewTeam: boolean;
  users: Account[];
}) {
  const [tab, setTab] = useState<Tab>("daily");

  if (!canViewTeam) {
    return <AnalysisPanel />;
  }

  return (
    <div className="w-full space-y-5">
      <div
        className="inline-flex rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1"
        role="tablist"
        aria-label="Analysis views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "daily"}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            tab === "daily"
              ? "bg-[var(--green)] text-white"
              : "text-[var(--muted)] hover:text-[var(--ink)]",
          ].join(" ")}
          onClick={() => setTab("daily")}
        >
          By day
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "by-user"}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            tab === "by-user"
              ? "bg-[var(--green)] text-white"
              : "text-[var(--muted)] hover:text-[var(--ink)]",
          ].join(" ")}
          onClick={() => setTab("by-user")}
        >
          By user
        </button>
      </div>

      {tab === "daily" ? (
        <div role="tabpanel">
          <p className="mb-4 text-sm text-[var(--muted)]">
            Total applications per day for the selected users.
          </p>
          <AnalysisPanel users={users} canSelectUsers />
        </div>
      ) : (
        <div role="tabpanel">
          <p className="mb-4 text-sm text-[var(--muted)]">
            Total applications per user for a selected period.
          </p>
          <TeamAnalysisPanel />
        </div>
      )}
    </div>
  );
}
