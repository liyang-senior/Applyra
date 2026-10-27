import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
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
      <h1 className="font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
        Overview
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        Welcome back, {user.name || user.email}. You are signed in as{" "}
        {roleLabel(user.role).toLowerCase()}.
      </p>
    </DashboardShell>
  );
}
