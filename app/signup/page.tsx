import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "@/components/AuthForm";
import { getCurrentAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignUpPage() {
  const user = await getCurrentAccount();
  if (user) redirect("/dashboard");

  return (
    <AuthShell title="Sign up">
      <SignUpForm />
    </AuthShell>
  );
}
