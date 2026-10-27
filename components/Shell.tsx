import Link from "next/link";
import type { ReactNode } from "react";
import { SuccessMark } from "@/components/SuccessMark";

export function Shell({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30">
        <div className="h-1 bg-[var(--green)]" />
        <header className="flex h-16 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg outline-offset-4"
          >
            <SuccessMark className="h-8 w-8 shrink-0" />
            <span className="font-[family-name:var(--font-fraunces)] text-[1.35rem] leading-none tracking-tight">
              Applyra
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">{actions}</div>
        </header>
      </div>
      {children}
    </div>
  );
}
