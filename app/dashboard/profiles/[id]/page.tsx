import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { ResumeProfileForm } from "@/components/ResumeProfileForm";
import { getCurrentAccount } from "@/lib/server/auth";
import {
  getResumeProfile,
  listAssignableAccounts,
  userCanAccessProfile,
} from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
};

type Params = { params: Promise<{ id: string }> };

export default async function EditProfilePage({ params }: Params) {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const { id } = await params;
  if (!(await userCanAccessProfile(user, id))) notFound();

  const canManage = canManageAccounts(user.role);
  const [profile, assignableUsers] = await Promise.all([
    getResumeProfile(id),
    canManage ? listAssignableAccounts() : Promise.resolve([]),
  ]);
  if (!profile) notFound();

  return (
    <DashboardShell user={user} active="profiles">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight sm:text-4xl">
          {canManage ? "Edit profile" : "Profile detail"}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          {canManage
            ? "Click a field name (Name, LinkedIn, …) to copy its value."
            : "Read-only view of your assigned résumé profile. Click a field name to copy."}
        </p>
      </div>
      <ResumeProfileForm
        mode="edit"
        profileId={profile.id}
        initial={profile.data}
        initialAssignees={profile.assigneeIds}
        assignableUsers={assignableUsers}
        readOnly={!canManage}
      />
    </DashboardShell>
  );
}
