"use client";

import { useCallback, useState } from "react";
import { Toast, type ToastKind, type ToastState } from "@/components/Toast";

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useCallback((text: string, kind: ToastKind = "ok") => {
    setToast({ text, kind });
  }, []);

  const toastHost = <Toast toast={toast} onClose={dismissToast} />;

  return { showToast, toastHost };
}
