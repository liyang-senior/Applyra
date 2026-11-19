"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Box = { top: number; left: number; width: number; maxHeight: number };

export function FloatingMenu({
  anchorRef,
  open,
  children,
  className = "",
  align = "start",
  minWidth = 0,
  onDismiss,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  minWidth?: number;
  onDismiss?: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = Math.max(rect.width, minWidth);
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, Math.min(256, preferBelow ? spaceBelow : spaceAbove));
      const top = preferBelow
        ? rect.bottom + 4
        : Math.max(8, rect.top - 4 - maxHeight);
      setBox({ top, left, width, maxHeight });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, align, minWidth]);

  useEffect(() => {
    if (!open || !onDismiss) return;
    const dismiss = onDismiss;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      dismiss();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onDismiss, anchorRef]);

  if (!open || !box) return null;
  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={{
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        zIndex: 80,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
