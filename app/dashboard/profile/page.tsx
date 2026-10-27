import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { ProfileEditor } from "@/components/ProfileEditor";
import { getCurrentAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  return (
    <DashboardShell user={user} active="profile">
      <ProfileEditor account={user} />
    </DashboardShell>
  );
}
