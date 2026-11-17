import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
import { ResumeProfilesTable } from "@/components/ResumeProfilesTable";
import { getCurrentAccount } from "@/lib/server/auth";
import {
  listAssignableAccounts,
  listProfilesForUser,
  listResumeProfiles,
} from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profiles",
};

export default async function ProfilesPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const canManage = canManageAccounts(user.role);
  const [profiles, assignableUsers] = await Promise.all([
    canManage ? listResumeProfiles() : listProfilesForUser(user.id),
    canManage ? listAssignableAccounts() : Promise.resolve([]),
  ]);

  return (
    <DashboardShell user={user} active="profiles">
      <PageHeading title="Profiles">
        {canManage
          ? "Add resume profiles, assign them to users (not owners), and filter by assignee, gender, or tech stack."
          : "Résumé profiles assigned to you. Open Detail to view (editing is disabled)."}
      </PageHeading>
      <ResumeProfilesTable
        profiles={profiles}
        assignableUsers={assignableUsers}
        canManage={canManage}
      />
    </DashboardShell>
  );
}
