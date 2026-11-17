import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
import { ProfileInfoTable } from "@/components/ProfileInfoTable";
import {
  listAllProfileInfo,
  listAssignableAccounts,
  listAssignedProfileInfo,
} from "@/lib/profiles";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts, isOwner } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Information",
};

export default async function InformationPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const staff = canManageAccounts(user.role);
  const owner = isOwner(user.role);
  const [rows, assignees] = await Promise.all([
    staff ? listAllProfileInfo() : listAssignedProfileInfo(user.id),
    owner ? listAssignableAccounts() : Promise.resolve([]),
  ]);

  return (
    <DashboardShell user={user} active="information">
      <PageHeading title="Information">
        {staff
          ? "Every profile is listed. The owner can select assignees to see only their profiles. Click a value to copy it."
          : "Profiles assigned to you. Click a value to copy it."}
      </PageHeading>
      <ProfileInfoTable rows={rows} assignees={owner ? assignees : undefined} />
    </DashboardShell>
  );
}
