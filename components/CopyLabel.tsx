"use client";

import type { ReactNode } from "react";

export function CopyLabel({
  label,
  value,
  onCopied,
  onError,
  children,
}: {
  label: string;
  value: string;
  onCopied?: (label: string) => void;
  onError?: (message: string) => void;
  children?: ReactNode;
}) {
  async function copy() {
    const text = value.trim();
    if (!text) {
      onError?.(`${label} is empty.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onCopied?.(label);
    } catch {
      onError?.("Could not copy to clipboard.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="mb-1 block text-left text-sm font-medium text-[var(--green-deep)] underline-offset-2 hover:underline"
      title={`Copy ${label}`}
    >
      {children || label}
    </button>
  );
}
