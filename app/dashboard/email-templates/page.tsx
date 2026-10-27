import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { EmailTemplatesPanel } from "@/components/EmailTemplatesPanel";
import { listEmailTemplates } from "@/lib/email-templates";
import { listResumeProfiles } from "@/lib/profiles";
import { getCurrentAccount } from "@/lib/server/auth";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email templates",
};

export default async function EmailTemplatesPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");
  if (!canManageAccounts(user.role)) redirect("/dashboard");

  const [templates, profiles] = await Promise.all([
    listEmailTemplates(),
    listResumeProfiles(),
  ]);

  return (
    <DashboardShell user={user} active="email-templates">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight sm:text-4xl">
          Email templates
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          Pick a profile, copy a reply with their first name, or expand a title
          to read the full template.
        </p>
      </div>
      <EmailTemplatesPanel
        initialTemplates={templates}
        profiles={profiles}
      />
    </DashboardShell>
  );
}
