"use client";

import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/server/types";

type SortKey = "name" | "email";

export function AssignUsersDialog({
  open,
  profileName,
  users,
  selectedIds,
  pending,
  onClose,
  onSave,
  title = "Assign users",
  description,
  saveLabel = "Save",
}: {
  open: boolean;
  profileName: string;
  users: Account[];
  selectedIds: string[];
  pending?: boolean;
  onClose: () => void;
  onSave: (ids: string[]) => void;
  title?: string;
  description?: string;
  saveLabel?: string;
}) {
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!open) return;
    setDraft(selectedIds);
    setQuery("");
  }, [open, selectedIds]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = users.filter((user) => {
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q)
      );
    });
    const factor = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = (sortKey === "name" ? a.name || a.email : a.email).toLowerCase();
      const right = (sortKey === "name" ? b.name || b.email : b.email).toLowerCase();
      return left.localeCompare(right) * factor;
    });
  }, [users, query, sortKey, sortDir]);

  if (!open) return null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-dialog-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2
            id="assign-dialog-title"
            className="font-[family-name:var(--font-fraunces)] text-xl"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {description ||
              `${profileName} — pick who can use this profile (not owners).`}
          </p>
        </div>

        <div className="space-y-3 border-b border-[var(--line)] px-5 py-3">
          <input
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm"
            placeholder="Search name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] px-2.5 py-1 font-medium"
              onClick={() => toggleSort("name")}
            >
              Sort name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] px-2.5 py-1 font-medium"
              onClick={() => toggleSort("email")}
            >
              Sort email{" "}
              {sortKey === "email" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] px-2.5 py-1"
              onClick={() => setDraft(sorted.map((user) => user.id))}
            >
              Select visible
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] px-2.5 py-1"
              onClick={() => setDraft([])}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              No users match.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((account) => {
                const checked = draft.includes(account.id);
                return (
                  <li key={account.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() =>
                          setDraft((prev) =>
                            checked
                              ? prev.filter((id) => id !== account.id)
                              : [...prev, account.id],
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {account.name || account.email}
                        </span>
                        <span className="block text-xs text-[var(--muted)]">
                          {account.email}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-[var(--green)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={() => onSave(draft)}
          >
            {pending ? "Saving…" : `${saveLabel} (${draft.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
