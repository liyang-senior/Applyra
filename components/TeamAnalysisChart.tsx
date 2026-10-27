"use client";

import type { TeamAnalysisUser } from "@/lib/analysis";

export function TeamAnalysisChart({
  users,
}: {
  users?: TeamAnalysisUser[] | null;
}) {
  const rows = Array.isArray(users) ? users : [];
  const maxValue = Math.max(
    1,
    ...rows.map((user) => Math.max(user.generated, user.applied)),
  );

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-[var(--muted)]">
        No users found.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--green)]" />
          Generated
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-700" />
          Applied
        </span>
      </div>

      <div className="space-y-4">
        {rows.map((user) => {
          const label = user.userName || user.userEmail;
          const generatedPct = Math.max(
            0,
            Math.round((user.generated / maxValue) * 100),
          );
          const appliedPct = Math.max(
            0,
            Math.round((user.applied / maxValue) * 100),
          );
          return (
            <div key={user.userId} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  {user.userName ? (
                    <p className="text-xs text-[var(--muted)]">
                      {user.userEmail}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {user.generated} gen · {user.applied} applied
                  {user.clearance > 0 ? ` · ${user.clearance} clearance` : ""}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[11px] text-[var(--muted)]">
                    Generated
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-black/5">
                    <div
                      className="h-full rounded-sm bg-[var(--green)]"
                      style={{ width: `${generatedPct}%` }}
                      title={`${user.generated} generated`}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums">
                    {user.generated}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[11px] text-[var(--muted)]">
                    Applied
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-black/5">
                    <div
                      className="h-full rounded-sm bg-amber-700"
                      style={{ width: `${appliedPct}%` }}
                      title={`${user.applied} applied`}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums">
                    {user.applied}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
