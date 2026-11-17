import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
import { ScrapePanel } from "@/components/ScrapePanel";
import {
  listAssignableAccounts,
  listProfilesForUser,
  listResumeProfiles,
} from "@/lib/profiles";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts, isOwner } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job links",
};

export default async function ScrapePage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const owner = isOwner(user.role);
  const [profiles, assignees] = await Promise.all([
    canManageAccounts(user.role)
      ? listResumeProfiles()
      : listProfilesForUser(user.id),
    owner ? listAssignableAccounts() : Promise.resolve([]),
  ]);

  return (
    <DashboardShell user={user} active="scrape">
      <PageHeading title="Job links">
        Pick a profile and jobright.ai. A Jobright email and password, or the
        Cookie header from a jobright.ai request, is required to collect
        links. Neither is saved. Admins and the owner see every saved link.
        The owner can narrow that list to selected assignees. Other accounts
        see the links saved for an assigned profile. Each company and role
        appears once. New links stay unverified until you check them.
      </PageHeading>
      <ScrapePanel
        profiles={profiles}
        assignees={owner ? assignees : undefined}
        seeAll={canManageAccounts(user.role)}
      />
    </DashboardShell>
  );
}
