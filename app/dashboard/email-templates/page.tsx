import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
import { EmailTemplatesPanel } from "@/components/EmailTemplatesPanel";
import { listEmailTemplates } from "@/lib/email-templates";
import {
  listAssignableAccounts,
  listProfilesForUser,
  listResumeProfiles,
} from "@/lib/profiles";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts, isOwner } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email templates",
};

export default async function EmailTemplatesPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const staff = canManageAccounts(user.role);
  const owner = isOwner(user.role);
  const [templates, profiles, assignees] = await Promise.all([
    listEmailTemplates(),
    staff ? listResumeProfiles() : listProfilesForUser(user.id),
    owner ? listAssignableAccounts() : Promise.resolve([]),
  ]);

  return (
    <DashboardShell user={user} active="email-templates">
      <PageHeading title="Email templates">
        Pick a profile, copy a reply with their first name, or expand a title
        to read the full template. Admins and the owner can choose any
        profile. Other accounts choose a profile assigned to them.
      </PageHeading>
      <EmailTemplatesPanel
        initialTemplates={templates}
        profiles={profiles}
        assignees={owner ? assignees : undefined}
        canManage={staff}
      />
    </DashboardShell>
  );
}
