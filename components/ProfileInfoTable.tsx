"use client";

import { AssigneeFilter, useServerProfiles } from "@/components/AssigneeFilter";
import { DataTable } from "@/components/DataTable";
import { useToast } from "@/components/useToast";
import type { AssignedProfileInfo } from "@/lib/profiles";
import type { Account } from "@/lib/server/types";

const columns: Array<{
  key: Exclude<keyof AssignedProfileInfo, "id" | "assigneeIds">;
  label: string;
}> = [
  { key: "name", label: "Name" },
  { key: "title", label: "Title" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "zip", label: "Zip" },
  { key: "street", label: "Street" },
  { key: "birthday", label: "Birthday" },
  { key: "ssn", label: "SSN" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "cvLink", label: "CV link" },
];

export function ProfileInfoTable({
  rows,
  assignees,
}: {
  rows: AssignedProfileInfo[];
  assignees?: Account[];
}) {
  const { showToast, toastHost } = useToast();
  const profilesQuery = useServerProfiles(rows, assignees !== undefined, "info");
  const visibleRows = profilesQuery.rows;

  async function copyValue(value: string) {
    const text = value.trim();
    if (!text) {
      showToast("Nothing to copy.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied.");
    } catch {
      showToast("Could not copy to clipboard.", "error");
    }
  }

  return (
    <>
      {toastHost}
      {assignees ? (
        <div className="mb-4">
          <AssigneeFilter
            users={assignees}
            selectedIds={profilesQuery.assigneeIds}
            disabled={profilesQuery.loading}
            onChange={(ids) => {
              void profilesQuery
                .changeAssignees(ids)
                .catch(() => showToast("Could not load profiles.", "error"));
            }}
          />
        </div>
      ) : null}
      <DataTable striped minWidth="min-w-max">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-medium whitespace-nowrap">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-[var(--muted)]"
              >
                {assignees
                  ? profilesQuery.assigneeIds.length > 0
                    ? "No profiles for the selected assignees."
                    : "No profiles yet."
                  : "No profiles are assigned to you yet."}
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => {
                  const value = row[column.key] || "";
                  return (
                    <td key={column.key} className="px-4 py-3 align-middle">
                      <button
                        type="button"
                        className="cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-left hover:text-[var(--green-deep)]"
                        title={value || undefined}
                        onClick={() => void copyValue(value)}
                      >
                        {value || "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </>
  );
}
