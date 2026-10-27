"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar, paginateItems } from "@/components/PaginationBar";
import { useToast } from "@/components/useToast";
import type { HistoryRecord } from "@/lib/history";
import type { Account } from "@/lib/server/types";

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: HistoryRecord["status"]) {
  if (status === "applied") return "Applied";
  if (status === "rejected") return "Rejected";
  return "Resume created";
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

export function HistoryPanel({
  initialRecords,
  users,
  canFilterUsers,
  canModerate,
  initialUserId = "",
}: {
  initialRecords: HistoryRecord[];
  users: Account[];
  canFilterUsers: boolean;
  canModerate: boolean;
  initialUserId?: string;
}) {
  const { showToast, toastHost } = useToast();
  const [userId, setUserId] = useState(initialUserId);
  const [records, setRecords] = useState(initialRecords);
  const [pending, setPending] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jdRecord, setJdRecord] = useState<HistoryRecord | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState({
    company: "",
    jobTitle: "",
    status: "all" as "all" | "draft" | "applied" | "rejected",
    clearance: "all" as "all" | "flagged" | "clear",
    remote: "all" as "all" | "non-remote" | "remote",
  });

  const filteredRecords = useMemo(() => {
    const companyQ = filters.company.trim().toLowerCase();
    const titleQ = filters.jobTitle.trim().toLowerCase();
    return records.filter((record) => {
      if (filters.status !== "all" && record.status !== filters.status) {
        return false;
      }
      if (filters.clearance === "flagged" && !record.requiresClearance) {
        return false;
      }
      if (filters.clearance === "clear" && record.requiresClearance) {
        return false;
      }
      if (filters.remote === "non-remote" && record.isRemote) {
        return false;
      }
      if (filters.remote === "remote" && !record.isRemote) {
        return false;
      }
      if (companyQ && !record.companyName.toLowerCase().includes(companyQ)) {
        return false;
      }
      if (titleQ && !record.jobTitle.toLowerCase().includes(titleQ)) {
        return false;
      }
      return true;
    });
  }, [records, filters]);

  const { page: safePage, slice: pageRows } = useMemo(
    () => paginateItems(filteredRecords, page, pageSize),
    [filteredRecords, page, pageSize],
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const allSelected =
    pageRows.length > 0 &&
    pageRows.every((row) => selectedIds.includes(row.id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      const visible = new Set(pageRows.map((row) => row.id));
      setSelectedIds((prev) => prev.filter((id) => !visible.has(id)));
      return;
    }
    setSelectedIds((prev) => [
      ...new Set([...prev, ...pageRows.map((row) => row.id)]),
    ]);
  }

  function updateFilter<K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  async function loadForUser(nextUserId: string) {
    setPending(true);
    setError("");
    try {
      const query = nextUserId
        ? `?userId=${encodeURIComponent(nextUserId)}`
        : "";
      const response = await fetch(`/api/applications${query}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error || "Could not load history.");
        return;
      }
      const data = (await response.json()) as { records?: HistoryRecord[] };
      setRecords(Array.isArray(data.records) ? data.records : []);
      setSelectedIds([]);
      setJdRecord(null);
      setPage(1);
    } catch {
      setError("Could not load history.");
    } finally {
      setPending(false);
    }
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        selectedIds.length === 1
          ? "Remove this history item?"
          : `Remove ${selectedIds.length} selected history items?`,
      )
    ) {
      return;
    }
    setBulkPending(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { deleted?: number };
      const removed = new Set(selectedIds);
      setRecords((prev) => prev.filter((row) => !removed.has(row.id)));
      setSelectedIds([]);
      if (jdRecord && removed.has(jdRecord.id)) setJdRecord(null);
      showToast(
        (data.deleted || selectedIds.length) === 1
          ? "History item removed."
          : `${data.deleted || selectedIds.length} history items removed.`,
        "ok",
      );
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setBulkPending(false);
    }
  }

  async function rejectSelected() {
    const comment = rejectComment.trim();
    if (!comment) {
      showToast("Enter a reject comment.", "error");
      return;
    }
    if (selectedIds.length === 0) return;
    setBulkPending(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          ids: selectedIds,
          comment,
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const now = new Date().toISOString();
      const rejected = new Set(selectedIds);
      setRecords((prev) =>
        prev.map((row) =>
          rejected.has(row.id)
            ? {
                ...row,
                status: "rejected" as const,
                rejectComment: comment,
                rejectedAt: now,
              }
            : row,
        ),
      );
      setSelectedIds([]);
      setRejectOpen(false);
      setRejectComment("");
      showToast(
        selectedIds.length === 1
          ? "History item rejected."
          : `${selectedIds.length} history items rejected.`,
        "ok",
      );
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setBulkPending(false);
    }
  }

  const colSpan = canFilterUsers ? 8 : 7;
  const fieldClass =
    "w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2";

  return (
    <div className="w-full space-y-4">
      {toastHost}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {canFilterUsers ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">User</span>
            <select
              className={fieldClass}
              value={userId}
              disabled={pending || bulkPending}
              onChange={(event) => {
                const next = event.target.value;
                setUserId(next);
                void loadForUser(next);
              }}
            >
              <option value="">All users</option>
              {users.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name || account.email} · {account.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Company</span>
          <input
            className={fieldClass}
            value={filters.company}
            disabled={pending || bulkPending}
            placeholder="Filter by company"
            onChange={(event) => updateFilter("company", event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Job title</span>
          <input
            className={fieldClass}
            value={filters.jobTitle}
            disabled={pending || bulkPending}
            placeholder="Filter by job title"
            onChange={(event) => updateFilter("jobTitle", event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select
            className={fieldClass}
            value={filters.status}
            disabled={pending || bulkPending}
            onChange={(event) =>
              updateFilter(
                "status",
                event.target.value as "all" | "draft" | "applied" | "rejected",
              )
            }
          >
            <option value="all">All</option>
            <option value="draft">Resume created</option>
            <option value="applied">Applied</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Clearance</span>
          <select
            className={fieldClass}
            value={filters.clearance}
            disabled={pending || bulkPending}
            onChange={(event) =>
              updateFilter(
                "clearance",
                event.target.value as "all" | "flagged" | "clear",
              )
            }
          >
            <option value="all">All</option>
            <option value="flagged">Clearance / public trust flagged</option>
            <option value="clear">No clearance flag</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Location</span>
          <select
            className={fieldClass}
            value={filters.remote}
            disabled={pending || bulkPending}
            onChange={(event) =>
              updateFilter(
                "remote",
                event.target.value as "all" | "non-remote" | "remote",
              )
            }
          >
            <option value="all">All</option>
            <option value="non-remote">Flagged as hybrid / onsite</option>
            <option value="remote">No hybrid / onsite flag</option>
          </select>
        </label>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {canModerate ? (
            <button
              type="button"
              className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-60"
              disabled={bulkPending}
              onClick={() => setRejectOpen(true)}
            >
              Reject selected ({selectedIds.length})
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)] disabled:opacity-60"
            disabled={bulkPending}
            onClick={() => void removeSelected()}
          >
            {bulkPending
              ? "Working…"
              : `Remove selected (${selectedIds.length})`}
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            disabled={bulkPending}
            onClick={() => setSelectedIds([])}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="min-w-[44rem] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] sm:min-w-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-3 sm:px-4">
                  <input
                    type="checkbox"
                    aria-label="Select all history"
                    checked={allSelected}
                    disabled={pageRows.length === 0 || bulkPending || pending}
                    onChange={toggleSelectAll}
                  />
                </th>
                {canFilterUsers ? (
                  <th className="px-3 py-3 font-medium sm:px-4">User</th>
                ) : null}
                <th className="px-3 py-3 font-medium sm:px-4">Job</th>
                <th className="px-3 py-3 font-medium sm:px-4">Status</th>
                <th className="px-3 py-3 font-medium sm:px-4">Flags</th>
                <th className="px-3 py-3 font-medium sm:px-4">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    {pending ? "Loading…" : "No history yet."}
                  </td>
                </tr>
              ) : (
                pageRows.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-[var(--line)] align-top"
                  >
                    <td className="px-3 py-3 sm:px-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${record.companyName || record.jobTitle || "history item"}`}
                        checked={selectedIds.includes(record.id)}
                        disabled={bulkPending}
                        onChange={() => toggleSelected(record.id)}
                      />
                    </td>
                    {canFilterUsers ? (
                      <td className="px-3 py-3 sm:px-4">
                        <div className="font-medium">
                          {record.userName || record.userEmail}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {record.userEmail}
                        </div>
                      </td>
                    ) : null}
                    <td className="px-3 py-3 sm:px-4">
                      <div className="font-medium">
                        {record.companyName || "—"}
                      </div>
                      <div className="text-[var(--muted)]">
                        {record.jobTitle || "—"}
                      </div>
                      {record.jobLink ? (
                        <a
                          href={record.jobLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block max-w-[16rem] truncate text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                          title={record.jobLink}
                        >
                          {record.jobLink}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          record.status === "applied"
                            ? "bg-[var(--green-soft)] text-[var(--green-deep)]"
                            : record.status === "rejected"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-black/5 text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {statusLabel(record.status)}
                      </span>
                      {record.status === "rejected" && record.rejectComment ? (
                        <p className="mt-2 max-w-[14rem] text-xs leading-snug text-[var(--muted)]">
                          {record.rejectComment}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex flex-wrap gap-1">
                        {record.requiresClearance ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Clearance
                          </span>
                        ) : null}
                        {!record.isRemote ? (
                          <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
                            Hybrid / onsite
                          </span>
                        ) : null}
                        {record.requiresClearance || !record.isRemote ? null : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <dl className="space-y-1 text-xs sm:text-sm">
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-[var(--muted)]">
                            Generated
                          </dt>
                          <dd>
                            {formatTime(
                              record.generatedAt ||
                                (record.resumeJson ? record.createdAt : null),
                            )}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-[var(--muted)]">
                            Applied
                          </dt>
                          <dd>{formatTime(record.appliedAt)}</dd>
                        </div>
                        {record.rejectedAt ? (
                          <div className="flex gap-2">
                            <dt className="w-16 shrink-0 text-[var(--muted)]">
                              Rejected
                            </dt>
                            <dd>{formatTime(record.rejectedAt)}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-[var(--green-deep)] underline-offset-2 hover:underline"
                          onClick={() => setJdRecord(record)}
                        >
                          JD
                        </button>
                        {record.resumeJson ? (
                          <a
                            href={`/dashboard/history/${record.id}/resume`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-[var(--green-deep)] underline-offset-2 hover:underline"
                          >
                            Resume
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">
                            Resume
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationBar
        page={safePage}
        pageSize={pageSize}
        total={filteredRecords.length}
        disabled={pending || bulkPending}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {jdRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jd-dialog-title"
          onClick={() => setJdRecord(null)}
        >
          <div
            className="flex max-h-[min(85vh,720px)] w-full max-w-2xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2
                id="jd-dialog-title"
                className="font-[family-name:var(--font-fraunces)] text-xl"
              >
                Job description
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[jdRecord.companyName, jdRecord.jobTitle]
                  .filter(Boolean)
                  .join(" · ") || "History item"}
              </p>
              {jdRecord.jobLink ? (
                <p className="mt-2 text-sm">
                  <a
                    href={jdRecord.jobLink}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    {jdRecord.jobLink}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <pre className="whitespace-pre-wrap rounded-xl bg-[var(--paper)] p-3 text-xs leading-relaxed sm:text-sm">
                {jdRecord.jobDescription || "(empty)"}
              </pre>
            </div>
            <div className="flex justify-end border-t border-[var(--line)] px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
                onClick={() => setJdRecord(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          onClick={() => !bulkPending && setRejectOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2
                id="reject-dialog-title"
                className="font-[family-name:var(--font-fraunces)] text-xl"
              >
                Reject selected
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                This comment will be saved on each of the {selectedIds.length}{" "}
                selected record{selectedIds.length === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Comment</span>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
                  value={rejectComment}
                  onChange={(event) => setRejectComment(event.target.value)}
                  placeholder="Why are these being rejected?"
                  disabled={bulkPending}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
                disabled={bulkPending}
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={bulkPending || !rejectComment.trim()}
                onClick={() => void rejectSelected()}
              >
                {bulkPending ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
