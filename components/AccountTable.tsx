"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { useToast } from "@/components/useToast";
import type { Account, AccountRole } from "@/lib/server/types";
import { roleLabel } from "@/lib/server/types";

export type AccountRow = Account & {
  joined: string;
};

const buttonClass =
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60";

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

export function AccountTable({
  accounts,
  currentUserId,
  viewerRole,
}: {
  accounts: AccountRow[];
  currentUserId: string;
  viewerRole: AccountRole;
}) {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const canAssignAdmin = viewerRole === "owner";

  async function change(
    id: string,
    patch: {
      role?: "admin" | "user";
      active?: boolean;
      resetPassword?: boolean;
    },
  ) {
    setPendingId(id);
    setPendingAction(
      patch.resetPassword
        ? "reset"
        : patch.role
          ? "role"
          : patch.active === false
            ? "deactivate"
            : "activate",
    );
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPendingId(null);
        setPendingAction(null);
        return;
      }
      if (patch.resetPassword) {
        showToast("Password reset to qwe123QWE!@#", "ok");
      } else if (patch.role === "admin") {
        showToast("Admin role assigned.", "ok");
      } else if (patch.role === "user") {
        showToast("Admin role removed.", "ok");
      } else if (patch.active === false) {
        showToast("Account deactivated.", "ok");
      } else if (patch.active === true) {
        showToast("Account activated.", "ok");
      }
      setPendingId(null);
      setPendingAction(null);
      router.refresh();
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPendingId(null);
      setPendingAction(null);
    }
  }

  async function remove(id: string) {
    setConfirmId(null);
    setPendingId(id);
    try {
      const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPendingId(null);
        return;
      }
      if (id === currentUserId) {
        window.location.href = "/signin";
        return;
      }
      showToast("Account removed.", "ok");
      setPendingId(null);
      router.refresh();
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPendingId(null);
    }
  }

  return (
    <div>
      {toastHost}
      <DataTable striped minWidth="min-w-[48rem]">
          <thead>
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Email address
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Joined
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account, index) => {
              const mark = [
                "bg-[#e3f3ea] text-[#0c693b]",
                "bg-[#f8ecd4] text-[#8a5a12]",
                "bg-[#e3f1f5] text-[#1f5f73]",
                "bg-[#f3e8f4] text-[#6b3f72]",
                "bg-[#f8e8e4] text-[#9d3428]",
              ][index % 5];
              const isYou = account.id === currentUserId;
              const confirming = confirmId === account.id;
              return (
                <tr key={account.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${mark}`}
                      >
                        {(account.name || account.email || "•").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium">{account.name || "—"}</span>
                      {isYou ? (
                        <span className="rounded-full bg-[var(--green-soft)] px-2 py-0.5 text-xs font-medium text-[var(--green-deep)]">
                          You
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{account.email}</td>
                  <td className="px-4 py-3">{roleLabel(account.role)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={
                        account.active
                          ? "rounded-full bg-[#e3f3ea] px-2.5 py-1 text-xs font-medium text-[#0c693b]"
                          : "rounded-full bg-[#f8e8e4] px-2.5 py-1 text-xs font-medium text-[#9d3428]"
                      }
                    >
                      {account.active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--muted)]">
                    {account.joined}
                  </td>
                  <td className="px-4 py-3">
                    {confirming ? (
                      <span className="flex justify-end gap-1">
                        <button
                          type="button"
                          className={`${buttonClass} bg-[var(--danger)] text-white hover:bg-[#84291f]`}
                          disabled={pendingId !== null}
                          onClick={() => void remove(account.id)}
                        >
                          {pendingId === account.id ? "Removing…" : "Confirm remove"}
                        </button>
                        <button
                          type="button"
                          className={`${buttonClass} hover:bg-black/5`}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex justify-end gap-1">
                        {canAssignAdmin && account.role === "user" ? (
                          <button
                            type="button"
                            className={`${buttonClass} hover:bg-black/5`}
                            disabled={pendingId !== null}
                            onClick={() => void change(account.id, { role: "admin" })}
                          >
                            Make admin
                          </button>
                        ) : null}
                        {canAssignAdmin &&
                        account.role === "admin" &&
                        !isYou ? (
                          <button
                            type="button"
                            className={`${buttonClass} hover:bg-black/5`}
                            disabled={pendingId !== null}
                            onClick={() => void change(account.id, { role: "user" })}
                          >
                            Remove admin
                          </button>
                        ) : null}
                        {isYou ? null : (
                          <button
                            type="button"
                            className={`${buttonClass} hover:bg-black/5`}
                            disabled={pendingId !== null}
                            title={
                              account.active
                                ? "Deactivated accounts cannot sign in"
                                : "Allow this account to sign in again"
                            }
                            onClick={() =>
                              void change(account.id, { active: !account.active })
                            }
                          >
                            {account.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${buttonClass} hover:bg-black/5`}
                          disabled={pendingId !== null}
                          title="Reset password to qwe123QWE!@#"
                          onClick={() =>
                            void change(account.id, { resetPassword: true })
                          }
                        >
                          {pendingId === account.id && pendingAction === "reset"
                            ? "Resetting…"
                            : "Reset password"}
                        </button>
                        <button
                          type="button"
                          className={`${buttonClass} text-[var(--danger)] hover:bg-[var(--danger-soft)]`}
                          disabled={pendingId !== null}
                          onClick={() => setConfirmId(account.id)}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
      </DataTable>
    </div>
  );
}
