import Link from "next/link";
import type { ReactNode } from "react";
import { SuccessMark } from "@/components/SuccessMark";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-1 bg-[var(--green)]" />
      <header className="flex h-16 items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg">
          <SuccessMark className="h-8 w-8 shrink-0" />
          <span className="font-[family-name:var(--font-fraunces)] text-[1.35rem] leading-none tracking-tight">
            Applyra
          </span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
          {title}
        </h1>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
