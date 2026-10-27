"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await fetch("/api/auth/signout", { method: "POST" });
          router.push("/signin");
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      Sign out
    </button>
  );
}
