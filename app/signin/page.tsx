import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { SignInForm } from "@/components/AuthForm";
import { getCurrentAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage() {
  const user = await getCurrentAccount();
  if (user) redirect("/dashboard");

  return (
    <AuthShell title="Sign in">
      <SignInForm />
    </AuthShell>
  );
}
