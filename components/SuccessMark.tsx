export function SuccessMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="16" fill="#0E7A45" />
      <path
        d="M18 33.5 27.5 43 46 22"
        fill="none"
        stroke="#F7F4EE"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
