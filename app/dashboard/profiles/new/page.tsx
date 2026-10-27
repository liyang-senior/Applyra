import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { ResumeProfileForm } from "@/components/ResumeProfileForm";
import { getCurrentAccount } from "@/lib/server/auth";
import { listAssignableAccounts } from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add profile",
};

export default async function NewProfilePage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");
  if (!canManageAccounts(user.role)) redirect("/dashboard");

  const assignableUsers = await listAssignableAccounts();

  return (
    <DashboardShell user={user} active="profiles">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
          Add profile
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Import a résumé JSON, assign users in the dialog, then create.
        </p>
      </div>
      <ResumeProfileForm mode="create" assignableUsers={assignableUsers} />
    </DashboardShell>
  );
}
