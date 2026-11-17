"use client";

import { useEffect } from "react";

export type ToastKind = "ok" | "error";

export type ToastState = {
  id: number;
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
      className="pointer-events-none fixed top-5 right-5 z-[100] flex max-w-[min(22rem,calc(100vw-2.5rem))] justify-end"
      aria-live={ok ? "polite" : "assertive"}
      role={ok ? "status" : "alert"}
    >
      <div
        key={toast.id}
        className={[
          "toast-card pointer-events-auto relative w-max max-w-full overflow-hidden rounded-2xl border text-left shadow-[0_18px_40px_rgba(28,25,21,0.12)]",
          ok
            ? "toast-card-ok border-[#b7dfc8] bg-[#e7f6ee] text-[#0c693b]"
            : "toast-card-error border-[#f0c2ba] bg-[#fdecea] text-[#9d3428]",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span
            className={[
              "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white",
              ok ? "bg-[#0e7a45]" : "bg-[#9d3428]",
            ].join(" ")}
            aria-hidden="true"
          >
            {ok ? "✓" : "!"}
          </span>
          <p className="min-w-0 text-left text-sm leading-relaxed font-medium">
            {toast.text}
          </p>
          <button
            type="button"
            className="cursor-pointer rounded-lg px-1.5 py-0.5 text-lg leading-none opacity-70 transition hover:bg-black/5 hover:opacity-100"
            aria-label="Dismiss"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <span className="toast-life" aria-hidden="true" />
      </div>
    </div>
  );
}
