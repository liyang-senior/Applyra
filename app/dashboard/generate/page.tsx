import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { GeneratePanel } from "@/components/GeneratePanel";
import { getCurrentAccount } from "@/lib/server/auth";
import { listProfilesForUser, listResumeProfiles } from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Generate",
};

export default async function GeneratePage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const profiles = canManageAccounts(user.role)
    ? await listResumeProfiles()
    : await listProfilesForUser(user.id);

  return (
    <DashboardShell user={user} active="generate">
      <div className="mb-6 w-full">
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
          Generate
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Tailor a resume or cover letter. With no API key, copy the prompt into
          ChatGPT, paste the reply, then download PDF/DOCX.
        </p>
      </div>
      <div className="w-full">
        <GeneratePanel profiles={profiles} />
      </div>
    </DashboardShell>
  );
}
