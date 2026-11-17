import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { PageHeading } from "@/components/PageHeading";
import { getCurrentAccount } from "@/lib/server/auth";
import { roleLabel } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  return (
    <DashboardShell user={user} active="overview">
      <PageHeading title="Overview">
        Welcome back, {user.name || user.email}. You are signed in as{" "}
        {roleLabel(user.role).toLowerCase()}.
      </PageHeading>
    </DashboardShell>
  );
}
