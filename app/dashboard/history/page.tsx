import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { HistoryPanel } from "@/components/HistoryPanel";
import { getCurrentAccount } from "@/lib/server/auth";
import { listHistoryFor } from "@/lib/history";
import { canManageAccounts } from "@/lib/server/types";
import { listAccountsFor } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "History",
};

export default async function HistoryPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const canFilterUsers = canManageAccounts(user.role);
  const [records, users] = await Promise.all([
    listHistoryFor(user),
    canFilterUsers ? listAccountsFor(user) : Promise.resolve([]),
  ]);

  return (
    <DashboardShell user={user} active="history">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight sm:text-4xl">
          History
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          {canFilterUsers
            ? "Review generated résumés and Applied jobs. Filter by user to inspect their timeline."
            : "Your generated résumés and Applied jobs."}
        </p>
      </div>
      <HistoryPanel
        initialRecords={records}
        users={users}
        canFilterUsers={canFilterUsers}
        canModerate={canFilterUsers}
      />
    </DashboardShell>
  );
}
