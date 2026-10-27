"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssignUsersDialog } from "@/components/AssignUsersDialog";
import { PaginationBar, paginateItems } from "@/components/PaginationBar";
import { useToast } from "@/components/useToast";
import {
  genderLabel,
  type ProfileGender,
  type ResumeProfileListItem,
} from "@/lib/profiles/types";
import type { Account } from "@/lib/server/types";

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

type SortKey = "name" | "title" | "gender" | "techStack";

export function ResumeProfilesTable({
  profiles: initial,
  assignableUsers,
  canManage = true,
}: {
  profiles: ResumeProfileListItem[];
  assignableUsers: Account[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [profiles, setProfiles] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    userName: "",
    userEmail: "",
    name: "",
    title: "",
    gender: "all",
    techStack: "",
  });
  const [assignProfile, setAssignProfile] =
    useState<ResumeProfileListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => {
    const assigneeNameQ = filters.userName.trim().toLowerCase();
    const emailQ = filters.userEmail.trim().toLowerCase();
    const nameQ = filters.name.trim().toLowerCase();
    const titleQ = filters.title.trim().toLowerCase();
    const stackQ = filters.techStack.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      if (filters.gender !== "all" && profile.gender !== filters.gender) {
        return false;
      }
      if (stackQ && !profile.techStack.toLowerCase().includes(stackQ)) {
        return false;
      }
      if (nameQ && !profile.name.toLowerCase().includes(nameQ)) {
        return false;
      }
      if (titleQ && !profile.title.toLowerCase().includes(titleQ)) {
        return false;
      }
      if (canManage && assigneeNameQ) {
        const hit = profile.assignees.some((person) =>
          person.name.toLowerCase().includes(assigneeNameQ),
        );
        if (!hit) return false;
      }
      if (canManage && emailQ) {
        const hit = profile.assignees.some((person) =>
          person.email.toLowerCase().includes(emailQ),
        );
        if (!hit) return false;
      }
      return true;
    });

    const factor = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = String(a[sortKey] || "").toLowerCase();
      const right = String(b[sortKey] || "").toLowerCase();
      return left.localeCompare(right) * factor;
    });
  }, [profiles, filters, sortKey, sortDir, canManage]);

  const { page: safePage, slice: pageRows } = useMemo(
    () => paginateItems(rows, page, pageSize),
    [rows, page, pageSize],
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const allVisibleSelected =
    pageRows.length > 0 &&
    pageRows.every((row) => selectedIds.includes(row.id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      const visible = new Set(pageRows.map((row) => row.id));
      setSelectedIds((prev) => prev.filter((id) => !visible.has(id)));
      return;
    }
    setSelectedIds((prev) => [
      ...new Set([...prev, ...pageRows.map((row) => row.id)]),
    ]);
  }

  async function removeIds(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    if (
      !window.confirm(
        unique.length === 1
          ? "Remove this resume profile?"
          : `Remove ${unique.length} selected profiles?`,
      )
    ) {
      return;
    }
    setBulkPending(true);
    try {
      const results = await Promise.all(
        unique.map(async (id) => {
          const response = await fetch(`/api/profiles/${id}`, {
            method: "DELETE",
          });
          return { id, ok: response.ok, error: response.ok ? "" : await readError(response) };
        }),
      );
      const removed = results.filter((item) => item.ok).map((item) => item.id);
      const failed = results.find((item) => !item.ok);
      if (removed.length) {
        setProfiles((prev) => prev.filter((item) => !removed.includes(item.id)));
        setSelectedIds((prev) => prev.filter((id) => !removed.includes(id)));
        showToast(
          removed.length === 1
            ? "Profile removed."
            : `${removed.length} profiles removed.`,
          "ok",
        );
        router.refresh();
      }
      if (failed) showToast(failed.error || "Could not remove some profiles.", "error");
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setBulkPending(false);
      setPendingId(null);
    }
  }

  async function remove(id: string) {
    setPendingId(id);
    await removeIds([id]);
  }

  async function saveAssignees(profileId: string, draftAssignees: string[]) {
    setPendingId(profileId);
    try {
      const response = await fetch(`/api/profiles/${profileId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeIds: draftAssignees }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as {
        profile?: { assigneeIds?: string[] };
      };
      const ids = data.profile?.assigneeIds || draftAssignees;
      const people = assignableUsers
        .filter((account) => ids.includes(account.id))
        .map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
        }));
      setProfiles((prev) =>
        prev.map((item) =>
          item.id === profileId ? { ...item, assignees: people } : item,
        ),
      );
      setAssignProfile(null);
      showToast("Assignees updated.", "ok");
      router.refresh();
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setPendingId(null);
    }
  }

  const colSpan = canManage ? 7 : 5;

  return (
    <>
      {toastHost}
      {canManage ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-sm font-medium text-[var(--danger)] disabled:opacity-60"
              disabled={bulkPending || selectedIds.length === 0}
              onClick={() => void removeIds(selectedIds)}
            >
              {bulkPending
                ? "Removing…"
                : selectedIds.length > 0
                  ? `Remove selected (${selectedIds.length})`
                  : "Remove selected"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm disabled:opacity-60"
              disabled={bulkPending || selectedIds.length === 0}
              onClick={() => setSelectedIds([])}
            >
              Clear selection
            </button>
          </div>
          <Link
            href="/dashboard/profiles/new"
            className="rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white"
          >
            Add profile
          </Link>
        </div>
      ) : null}
      <div
        className={[
          "mb-4 grid gap-3",
          canManage
            ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            : "sm:grid-cols-2 lg:grid-cols-4",
        ].join(" ")}
      >
        {canManage ? (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">User name</span>
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2"
                value={filters.userName}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    userName: event.target.value,
                  }));
                }}
                placeholder="Filter by assignee name"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">User email</span>
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2"
                value={filters.userEmail}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    userEmail: event.target.value,
                  }));
                }}
                placeholder="Filter by assignee email"
              />
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Name</span>
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2"
                value={filters.name}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }));
                }}
                placeholder="Filter by name"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Title</span>
              <input
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2"
                value={filters.title}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }));
                }}
                placeholder="Filter by title"
              />
            </label>
          </>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Gender</span>
          <select
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 pr-11"
            value={filters.gender}
            onChange={(event) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, gender: event.target.value }));
            }}
          >
            <option value="all">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--muted)]">Tech stack</span>
          <input
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2"
            value={filters.techStack}
            onChange={(event) => {
              setPage(1);
              setFilters((prev) => ({
                ...prev,
                techStack: event.target.value,
              }));
            }}
            placeholder="e.g. React, Python"
          />
        </label>
      </div>

      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="min-w-[40rem] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] sm:min-w-0">
          <table className="w-full min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                {canManage ? (
                  <th className="w-10 px-3 py-3 sm:px-4">
                    <input
                      type="checkbox"
                      aria-label="Select all visible profiles"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={pageRows.length === 0 || bulkPending}
                    />
                  </th>
                ) : null}
                {(
                  [
                    ["name", "Name"],
                    ["title", "Title"],
                    ["gender", "Gender"],
                    ["techStack", "Tech stack"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-3 font-medium sm:px-4">
                    <button
                      type="button"
                      className="hover:text-[var(--ink)]"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {sortMark(key)}
                    </button>
                  </th>
                ))}
                {canManage ? (
                  <th className="px-3 py-3 font-medium sm:px-4">Assignees</th>
                ) : null}
                <th className="px-3 py-3 font-medium sm:px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-4 py-8 text-center text-[var(--muted)]"
                  >
                    {canManage
                      ? "No profiles match these filters."
                      : "No profiles are assigned to you yet."}
                  </td>
                </tr>
              ) : (
                pageRows.map((profile) => (
                  <tr
                    key={profile.id}
                    className="border-t border-[var(--line)] align-top"
                  >
                    {canManage ? (
                      <td className="px-3 py-3 sm:px-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${profile.name}`}
                          checked={selectedIds.includes(profile.id)}
                          disabled={bulkPending}
                          onChange={() => toggleSelected(profile.id)}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-3 sm:px-4">
                      <div className="font-medium">{profile.name}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {profile.email}
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      {profile.title || "—"}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      {genderLabel(profile.gender as ProfileGender)}
                    </td>
                    <td className="max-w-[10rem] px-3 py-3 sm:max-w-[14rem] sm:px-4">
                      <span className="line-clamp-2">
                        {profile.techStack || "—"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-3 py-3 sm:px-4">
                        {profile.assignees.length === 0 ? (
                          <span className="text-[var(--muted)]">Unassigned</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {profile.assignees.map((person) => (
                              <li key={person.id}>
                                {person.name || person.email}
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="mt-1 text-xs font-medium text-[var(--green-deep)]"
                          onClick={() => setAssignProfile(profile)}
                        >
                          Assign
                        </button>
                      </td>
                    ) : null}
                    <td className="px-3 py-3 sm:px-4">
                      <div className="flex flex-wrap gap-2">
                        {canManage ? (
                          <>
                            <Link
                              href={`/dashboard/profiles/${profile.id}`}
                              className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)]"
                              disabled={pendingId === profile.id}
                              onClick={() => remove(profile.id)}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium opacity-50"
                            disabled
                            title="View-only — editing is disabled for your role"
                          >
                            Detail
                          </button>
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

      <div className="mt-4">
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          total={rows.length}
          disabled={bulkPending}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {canManage ? (
        <AssignUsersDialog
          open={Boolean(assignProfile)}
          profileName={assignProfile?.name || ""}
          users={assignableUsers}
          selectedIds={
            assignProfile?.assignees.map((person) => person.id) || []
          }
          pending={Boolean(assignProfile && pendingId === assignProfile.id)}
          onClose={() => setAssignProfile(null)}
          onSave={(ids) => {
            if (!assignProfile) return;
            void saveAssignees(assignProfile.id, ids);
          }}
        />
      ) : null}
    </>
  );
}
