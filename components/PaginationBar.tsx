"use client";

const PAGE_SIZES = [10, 20, 50] as const;

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-[var(--muted)]">
        {total === 0 ? "No items" : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[var(--muted)]">
          <span>Per page</span>
          <select
            className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 text-[var(--ink)]"
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 disabled:opacity-50"
            disabled={disabled || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Prev
          </button>
          <span className="min-w-[5.5rem] text-center text-[var(--muted)]">
            Page {safePage} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 disabled:opacity-50"
            disabled={disabled || safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    slice: items.slice(start, start + pageSize),
  };
}
