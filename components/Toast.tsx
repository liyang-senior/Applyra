"use client";

import { useEffect } from "react";

export type ToastKind = "ok" | "error";

export type ToastState = {
  text: string;
  kind: ToastKind;
} | null;

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const ok = toast.kind === "ok";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-5 z-[100] flex justify-center px-4"
      aria-live={ok ? "polite" : "assertive"}
      role={ok ? "status" : "alert"}
    >
      <div
        className={[
          "pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_18px_50px_rgba(48,36,20,0.16)] backdrop-blur-md",
          "animate-[toast-in_280ms_cubic-bezier(0.22,1,0.36,1)]",
          ok
            ? "border-[var(--green)]/20 bg-[var(--card)]/95 text-[var(--green-deep)]"
            : "border-[var(--danger)]/20 bg-[var(--card)]/95 text-[var(--danger)]",
        ].join(" ")}
      >
        <span
          className={[
            "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white",
            ok ? "bg-[var(--green)]" : "bg-[var(--danger)]",
          ].join(" ")}
          aria-hidden="true"
        >
          {ok ? "✓" : "!"}
        </span>
        <p className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed font-medium">
          {toast.text}
        </p>
        <button
          type="button"
          className="ml-1 cursor-pointer rounded-lg px-1.5 py-0.5 text-lg leading-none text-[var(--muted)] hover:bg-black/5"
          aria-label="Dismiss"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}
