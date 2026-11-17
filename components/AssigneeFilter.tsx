"use client";

import { useCallback, useRef, useState } from "react";
import type { Account } from "@/lib/server/types";

export async function fetchFilteredProfiles<T>(
  assigneeIds: string[],
  view?: "info",
): Promise<T[]> {
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  for (const id of assigneeIds) params.append("assigneeId", id);
  const response = await fetch(`/api/profiles?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Could not load profiles.");
  }
  const data = (await response.json()) as { profiles?: T[] };
  return Array.isArray(data.profiles) ? data.profiles : [];
}

export function useServerProfiles<T extends { id: string }>(
  initial: T[],
  enabled: boolean,
  view?: "info",
) {
  const [rows, setRows] = useState(initial);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const changeAssignees = useCallback(
    async (ids: string[]) => {
      setAssigneeIds(ids);
      if (!enabled) return initial;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      try {
        const next = await fetchFilteredProfiles<T>(ids, view);
        if (requestRef.current === requestId) setRows(next);
        return next;
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [enabled, initial, view],
  );

  return { rows, setRows, assigneeIds, loading, changeAssignees };
}

export function AssigneeFilter({
  users,
  selectedIds,
  onChange,
  disabled = false,
}: {
  users: Account[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div className="soft-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Assignees</span>
        <span className="text-xs text-[var(--muted)]">
          {selectedIds.length === 0
            ? "Showing every profile."
            : "Showing profiles for the selected assignees."}
        </span>
      </div>
      {users.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No assignees yet.</p>
      ) : (
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
          {users.map((account) => {
            const checked = selectedIds.includes(account.id);
            return (
              <label
                key={account.id}
                className={[
                  "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                  checked
                    ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green-deep)]"
                    : "border-[var(--line)] bg-white",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(account.id)}
                />
                <span>{account.name || account.email}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
