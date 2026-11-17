import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
import { ScrapePanel } from "@/components/ScrapePanel";
import { listProfilesForUser, listResumeProfiles } from "@/lib/profiles";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job links",
};

export default async function ScrapePage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const profiles = canManageAccounts(user.role)
    ? await listResumeProfiles()
    : await listProfilesForUser(user.id);

  return (
    <DashboardShell user={user} active="scrape">
      <PageHeading title="Job links">
        Pick a profile and jobright.ai. A Jobright email and password, or the
        Cookie header from a jobright.ai request, is required to collect
        links. Neither is saved. Each profile keeps its own copy of a company
        and job title. When that job is already saved for another profile, it
        stays in the database and stays off this list. New links stay
        unverified until you check them.
      </PageHeading>
      <ScrapePanel profiles={profiles} />
    </DashboardShell>
  );
}
