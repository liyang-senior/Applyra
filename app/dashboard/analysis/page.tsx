import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalysisTabs } from "@/components/AnalysisTabs";
import { DashboardShell } from "@/components/DashboardShell";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts } from "@/lib/server/types";
import { listAccountsFor } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analysis",
};

export default async function AnalysisPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const canViewTeam = canManageAccounts(user.role);
  const users = canViewTeam ? await listAccountsFor(user) : [];

  return (
    <DashboardShell user={user} active="analysis">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight sm:text-4xl">
          Analysis
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          {canViewTeam
            ? "View applications per day for selected users, or totals per user for a period."
            : "Track your generated résumés and Applied jobs over a period."}
        </p>
      </div>
      <AnalysisTabs canViewTeam={canViewTeam} users={users} />
    </DashboardShell>
  );
}
