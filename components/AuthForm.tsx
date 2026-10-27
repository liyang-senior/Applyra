"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/useToast";

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

const fieldClass =
  "h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--green)] focus:outline-2 focus:outline-[rgb(14_122_69_/_25%)]";
const buttonClass =
  "inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-full bg-[var(--green)] text-sm font-medium text-white hover:bg-[var(--green-deep)] disabled:cursor-not-allowed disabled:opacity-60";

function EyeToggle({
  targetId,
  label,
}: {
  targetId: string;
  label: string;
}) {
  const [showing, setShowing] = useState(false);

  return (
    <button
      type="button"
      className="absolute top-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)]"
      aria-label={showing ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={showing}
      onClick={() => {
        const input = document.getElementById(targetId) as HTMLInputElement | null;
        if (!input) return;
        const next = input.type === "password";
        input.type = next ? "text" : "password";
        setShowing(next);
      }}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.8]">
        {showing ? (
          <>
            <path d="M3 3l18 18" strokeLinecap="round" />
            <path d="M10.6 10.6a3 3 0 004.2 4.2" strokeLinecap="round" />
            <path
              d="M9.9 5.2A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a18.4 18.4 0 01-3.2 4.4"
              strokeLinecap="round"
            />
            <path
              d="M6.1 6.7C3.5 8.6 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.9"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

const REMEMBER_KEY = "applyraRemember";

export function SignInForm() {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { email?: string; password?: string };
      if (data.email) setEmail(data.email);
      if (data.password) setPassword(data.password);
      if (data.email || data.password) setRemember(true);
    } catch {
      // Ignore bad local storage.
    }
  }, []);

  return (
    <>
      {toastHost}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            const response = await fetch("/api/auth/signin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
            if (!response.ok) {
              showToast(await readError(response), "error");
              setPending(false);
              return;
            }
            if (remember) {
              window.localStorage.setItem(
                REMEMBER_KEY,
                JSON.stringify({ email, password }),
              );
            } else {
              window.localStorage.removeItem(REMEMBER_KEY);
            }
            showToast("Signed in.", "ok");
            router.push("/dashboard");
            router.refresh();
          } catch {
            showToast("Something went wrong. Try again.", "error");
            setPending(false);
          }
        }}
      >
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${fieldClass} pr-11`}
            />
            <EyeToggle targetId="password" label="password" />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 accent-[var(--green)]"
          />
          Save email and password
        </label>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-[var(--muted)]">
          No account?{" "}
          <Link href="/signup" className="font-medium text-[var(--green-deep)]">
            Sign up
          </Link>
        </p>
      </form>
    </>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [pending, setPending] = useState(false);

  return (
    <>
      {toastHost}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const password = String(form.get("password") || "");
          const confirm = String(form.get("confirm") || "");
          if (!confirm) {
            showToast("Confirm your password.", "error");
            return;
          }
          if (password !== confirm) {
            showToast("Passwords do not match.", "error");
            return;
          }
          setPending(true);
          try {
            const response = await fetch("/api/auth/signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: String(form.get("name") || ""),
                email: String(form.get("email") || ""),
                password,
              }),
            });
            if (!response.ok) {
              showToast(await readError(response), "error");
              setPending(false);
              return;
            }
            showToast("Account created.", "ok");
            router.push("/dashboard");
            router.refresh();
          } catch {
            showToast("Something went wrong. Try again.", "error");
            setPending(false);
          }
        }}
      >
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              className={`${fieldClass} pr-11`}
            />
            <EyeToggle targetId="password" label="password" />
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-sm font-semibold">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              className={`${fieldClass} pr-11`}
            />
            <EyeToggle targetId="confirm" label="confirm password" />
          </div>
        </div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Creating account…" : "Sign up"}
        </button>
        <p className="text-center text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link href="/signin" className="font-medium text-[var(--green-deep)]">
            Sign in
          </Link>
        </p>
      </form>
    </>
  );
}
