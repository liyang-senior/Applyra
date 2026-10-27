import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountTable } from "@/components/AccountTable";
import { DashboardShell } from "@/components/DashboardShell";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts } from "@/lib/server/types";
import { listAccountsFor } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");
  if (!canManageAccounts(user.role)) redirect("/dashboard");

  const accounts = (await listAccountsFor(user)).map((account) => ({
    ...account,
    joined: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(account.createdAt)),
  }));

  return (
    <DashboardShell user={user} active="users">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
            Users
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            {user.role === "owner"
              ? "Owners can assign or remove admin, reset passwords, deactivate or activate accounts, and remove accounts."
              : "Admins can reset passwords, deactivate, activate, and remove normal user accounts."}
          </p>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </p>
      </div>
      <AccountTable
        accounts={accounts}
        currentUserId={user.id}
        viewerRole={user.role}
      />
    </DashboardShell>
  );
}
