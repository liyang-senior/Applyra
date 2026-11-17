import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
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
      <PageHeading title={canManage ? "Edit profile" : "Profile detail"}>
        {canManage
          ? "Click a field name (Name, LinkedIn, …) to copy its value."
          : "Read-only view of your assigned résumé profile. Click a field name to copy."}
      </PageHeading>
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
