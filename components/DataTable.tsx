"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Marquee = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function selectionBox(x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function DataTable({
  children,
  minWidth = "",
  striped = false,
  selectable = false,
  selectedIds = [],
  onSelectedIdsChange,
  disabled = false,
}: {
  children: ReactNode;
  minWidth?: string;
  striped?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const selectedRef = useRef(selectedIds);
  const disabledRef = useRef(disabled);
  const selectableRef = useRef(selectable);
  const onChangeRef = useRef(onSelectedIdsChange);
  selectedRef.current = selectedIds;
  disabledRef.current = disabled;
  selectableRef.current = selectable;
  onChangeRef.current = onSelectedIdsChange;
  const dragRef = useRef<{
    pressId: string;
    base: string[];
    active: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      const drag = dragRef.current;
      const table = tableRef.current;
      if (!drag || !table) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        if (dx * dx + dy * dy < 16) return;
        drag.active = true;
        document.body.style.userSelect = "none";
      }
      const box = selectionBox(drag.startX, drag.startY, event.clientX, event.clientY);
      setMarquee({ left: box.left, top: box.top, width: box.width, height: box.height });
      const hitIds: string[] = [];
      table.querySelectorAll("tr[data-row-id]").forEach((node) => {
        const id = node.getAttribute("data-row-id");
        if (!id) return;
        const row = node.getBoundingClientRect();
        const overlaps =
          row.left < box.right &&
          row.right > box.left &&
          row.top < box.bottom &&
          row.bottom > box.top;
        if (overlaps) hitIds.push(id);
      });
      onChangeRef.current?.([...new Set([...drag.base, ...hitIds])]);
    }
    function onUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      setMarquee(null);
      if (!drag || drag.active || !drag.pressId) return;
      const current = selectedRef.current;
      onChangeRef.current?.(
        current.includes(drag.pressId)
          ? current.filter((id) => id !== drag.pressId)
          : [...current, drag.pressId],
      );
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
  }, []);

  function onMouseDown(event: ReactMouseEvent) {
    if (!selectableRef.current || disabledRef.current || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, label, select, textarea")) return;
    const row = target.closest("tr[data-row-id]");
    if (!row || !tableRef.current?.contains(row)) return;
    const id = row.getAttribute("data-row-id") || "";
    if (!id) return;
    dragRef.current = {
      pressId: id,
      base: selectedRef.current,
      active: false,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  return (
    <>
      <div
        className="max-w-full overflow-x-auto rounded-3xl border border-[var(--line)] bg-white shadow-[0_18px_40px_rgba(48,36,20,0.05)]"
        onMouseDown={onMouseDown}
      >
        <table
          ref={tableRef}
          data-selectable={selectable ? "true" : "false"}
          className={`app-table w-full text-left text-sm ${minWidth} ${striped ? "app-table-striped" : ""}`}
        >
          {children}
        </table>
      </div>
      {marquee
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[70] rounded-md border-2 border-[var(--green)] bg-[rgb(14_122_69_/_16%)]"
              style={{
                left: marquee.left,
                top: marquee.top,
                width: marquee.width,
                height: marquee.height,
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
