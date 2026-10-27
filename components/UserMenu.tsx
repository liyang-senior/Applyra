"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-10 max-w-[12rem] cursor-pointer items-center truncate rounded-full px-3.5 text-sm font-medium hover:bg-black/5"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {name}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-[0_12px_40px_rgba(48,36,20,0.12)]"
        >
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
      ) : null}
    </div>
  );
}
