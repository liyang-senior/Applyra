import type { ReactNode } from "react";

export function PageHeading({
  title,
  children,
  extra,
}: {
  title: string;
  children?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="scrape-rise mb-6 flex w-full flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl tracking-tight sm:text-4xl">
          <span className="bg-[linear-gradient(90deg,#1c1915_0%,#0e7a45_55%,#1f5f73_100%)] bg-clip-text text-transparent">
            {title}
          </span>
        </h1>
        {children ? (
          <div className="mt-2 max-w-3xl text-sm text-[var(--muted)] sm:text-base">
            {children}
          </div>
        ) : null}
      </div>
      {extra}
    </div>
  );
}
