"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { FloatingMenu } from "@/components/FloatingMenu";

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-10 max-w-[14rem] cursor-pointer items-center truncate rounded-full px-3.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--green-soft)]"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {name}
      </button>
      <FloatingMenu
        anchorRef={rootRef}
        open={open}
        align="end"
        minWidth={160}
        onDismiss={() => setOpen(false)}
        className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-[0_12px_40px_rgba(48,36,20,0.12)]"
      >
        <div id={menuId} role="menu">
          <Link
            href="/dashboard/profile"
            role="menuitem"
            className="block px-3.5 py-2 text-sm hover:bg-black/5"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            className="block w-full cursor-pointer px-3.5 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-60"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await fetch("/api/auth/signout", { method: "POST" });
                router.push("/signin");
                router.refresh();
              } finally {
                setPending(false);
                setOpen(false);
              }
            }}
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </FloatingMenu>
    </div>
  );
}
