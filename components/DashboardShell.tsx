"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SuccessMark } from "@/components/SuccessMark";
import { UserMenu } from "@/components/UserMenu";
import type { Account } from "@/lib/server/types";
import { canManageAccounts } from "@/lib/server/types";

function navClass(active: boolean) {
  return [
    "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium",
    active
      ? "bg-[var(--green-soft)] text-[var(--green-deep)]"
      : "text-[var(--ink)] hover:bg-black/5",
  ].join(" ");
}

export function DashboardShell({
  user,
  active,
  children,
}: {
  user: Account;
  active:
    | "overview"
    | "users"
    | "profile"
    | "workspace"
    | "history"
    | "profiles"
    | "generate"
    | "analysis"
    | "email-templates";
  children: ReactNode;
}) {
  const showUsers = canManageAccounts(user.role);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30">
        <div className="h-1 bg-[var(--green)]" />
        <header className="flex h-14 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-3 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--card)] text-sm md:hidden"
              aria-expanded={navOpen}
              aria-controls="dashboard-nav"
              onClick={() => setNavOpen((open) => !open)}
            >
              <span className="sr-only">Menu</span>
              {navOpen ? "×" : "☰"}
            </button>
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-2 rounded-lg outline-offset-4 sm:gap-2.5"
            >
              <SuccessMark className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
              <span className="truncate font-[family-name:var(--font-fraunces)] text-[1.2rem] leading-none tracking-tight sm:text-[1.35rem]">
                Applyra
              </span>
            </Link>
          </div>
          <UserMenu name={user.name || user.email} />
        </header>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {navOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <aside
          id="dashboard-nav"
          className={[
            "z-20 w-56 shrink-0 border-r border-[var(--line)] bg-[var(--rail)]/95 px-3 py-6 backdrop-blur md:static md:block md:bg-[var(--rail)]/40",
            navOpen
              ? "absolute inset-y-0 left-0 block shadow-xl"
              : "hidden md:block",
          ].join(" ")}
        >
          <nav className="flex flex-col gap-1" onClick={() => setNavOpen(false)}>
            <Link href="/dashboard" className={navClass(active === "overview")}>
              Overview
            </Link>
            {showUsers ? (
              <Link
                href="/dashboard/users"
                className={navClass(active === "users")}
              >
                Users
              </Link>
            ) : null}
            <Link
              href="/dashboard/profiles"
              className={navClass(active === "profiles")}
            >
              Profiles
            </Link>
            <Link
              href="/dashboard/generate"
              className={navClass(active === "generate")}
            >
              Generate
            </Link>
            <Link
              href="/dashboard/history"
              className={navClass(active === "history" || active === "workspace")}
            >
              History
            </Link>
            <Link
              href="/dashboard/analysis"
              className={navClass(active === "analysis")}
            >
              Analysis
            </Link>
            {showUsers ? (
              <Link
                href="/dashboard/email-templates"
                className={navClass(active === "email-templates")}
              >
                Email templates
              </Link>
            ) : null}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
