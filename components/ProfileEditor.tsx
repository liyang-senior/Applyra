"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/useToast";
import type { Account } from "@/lib/server/types";
import { roleLabel } from "@/lib/server/types";

const REMEMBER_KEY = "applyraRemember";

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
const labelClass = "mb-1.5 block text-sm font-semibold";
const primaryButton =
  "inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-full bg-[var(--green)] text-sm font-medium text-white hover:bg-[var(--green-deep)] disabled:cursor-not-allowed disabled:opacity-60";
const quietClass =
  "inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-full text-sm font-medium text-[var(--green-deep)] hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60";
const dangerClass =
  "inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-full text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-60";
const cardClass =
  "rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[0_10px_30px_rgba(48,36,20,0.04)]";

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
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.8]"
      >
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

export function ProfileEditor({ account }: { account: Account }) {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"deactivate" | "remove" | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REMEMBER_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { email?: string; password?: string };
      if (data.email || data.password) setRemember(true);
    } catch {
      // Ignore bad local storage.
    }
  }, []);

  async function saveProfile() {
    setPending("profile");
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPending(null);
        return;
      }

      syncRemembered(email, undefined, remember);
      showToast("Your profile was updated.", "ok");
      setPending(null);
      router.refresh();
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPending(null);
    }
  }

  function syncRemembered(
    nextEmail: string,
    nextPassword: string | undefined,
    save: boolean,
  ) {
    if (!save) {
      window.localStorage.removeItem(REMEMBER_KEY);
      return;
    }

    let passwordValue = nextPassword ?? "";
    if (nextPassword === undefined) {
      try {
        const raw = window.localStorage.getItem(REMEMBER_KEY);
        passwordValue = raw
          ? String((JSON.parse(raw) as { password?: string }).password || "")
          : "";
      } catch {
        passwordValue = "";
      }
    }

    window.localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({ email: nextEmail, password: passwordValue }),
    );
  }

  async function updatePassword() {
    if (!currentPassword) {
      showToast("Enter your current password.", "error");
      return;
    }
    if (password.length < 8) {
      showToast("Use a new password of at least 8 characters.", "error");
      return;
    }
    if (!confirmPassword) {
      showToast("Confirm your new password.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showToast("New passwords do not match.", "error");
      return;
    }

    setPending("password");
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          currentPassword,
          password,
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPending(null);
        return;
      }

      // Keep the sign-in page autofill in sync with the new password.
      const hadSaved = Boolean(window.localStorage.getItem(REMEMBER_KEY));
      if (remember || hadSaved) {
        setRemember(true);
        syncRemembered(email, password, true);
      }

      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      showToast("Your password was updated.", "ok");
      setPending(null);
      router.refresh();
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPending(null);
    }
  }

  async function deactivate() {
    setPending("deactivate");
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate" }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPending(null);
        setConfirm(null);
        return;
      }
      window.location.href = "/signin";
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPending(null);
      setConfirm(null);
    }
  }

  async function remove() {
    setPending("remove");
    try {
      const response = await fetch("/api/auth/me", { method: "DELETE" });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPending(null);
        setConfirm(null);
        return;
      }
      window.location.href = "/signin";
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPending(null);
      setConfirm(null);
    }
  }

  return (
    <>
      {toastHost}

      <div className="mx-auto w-full max-w-4xl">
        <p className="text-sm text-[var(--muted)]">{roleLabel(account.role)}</p>
        <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
          Profile
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Update your account details on the left. Change your password on the
          right. Passwords stay masked unless you reveal the current one.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold tracking-tight">Account</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Name, email, and local save preference.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="profile-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="profile-email" className={labelClass}>
                  Email address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                  className={fieldClass}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 accent-[var(--green)]"
                />
                Save email and password on this device
              </label>

              <button
                type="button"
                className={primaryButton}
                disabled={pending !== null}
                onClick={() => void saveProfile()}
              >
                {pending === "profile" ? "Saving…" : "Save changes"}
              </button>
            </div>

            <div className="mt-6 space-y-1 border-t border-[var(--line)] pt-4">
              {confirm === null ? (
                <>
                  <button
                    type="button"
                    className={quietClass}
                    disabled={pending !== null}
                    onClick={() => setConfirm("deactivate")}
                  >
                    Deactivate account
                  </button>
                  <button
                    type="button"
                    className={dangerClass}
                    disabled={pending !== null}
                    onClick={() => setConfirm("remove")}
                  >
                    Remove account
                  </button>
                </>
              ) : (
                <div>
                  <p className="text-sm leading-relaxed text-[var(--ink)]">
                    {confirm === "deactivate"
                      ? "Deactivate this account? You won’t be able to sign in until an admin reactivates it."
                      : "Remove this account permanently? This can’t be undone."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-[var(--line)] bg-white text-sm font-medium"
                      onClick={() => setConfirm(null)}
                      disabled={pending !== null}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full bg-[var(--danger)] text-sm font-medium text-white disabled:opacity-60"
                      disabled={pending !== null}
                      onClick={() =>
                        void (confirm === "deactivate" ? deactivate() : remove())
                      }
                    >
                      {pending
                        ? confirm === "deactivate"
                          ? "Deactivating…"
                          : "Removing…"
                        : confirm === "deactivate"
                          ? "Deactivate"
                          : "Remove"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold tracking-tight">Password</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Enter your current password, then choose a new one.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="profile-current-password" className={labelClass}>
                  Current password
                </label>
                <div className="relative">
                  <input
                    id="profile-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    maxLength={128}
                    autoComplete="current-password"
                    className={`${fieldClass} pr-11`}
                  />
                  <EyeToggle
                    targetId="profile-current-password"
                    label="current password"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-new-password" className={labelClass}>
                  New password
                </label>
                <input
                  id="profile-new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className={fieldClass}
                />
                <p className="mt-1.5 text-xs text-[var(--muted)]">
                  At least 8 characters.
                </p>
              </div>

              <div>
                <label htmlFor="profile-confirm-password" className={labelClass}>
                  Confirm password
                </label>
                <input
                  id="profile-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  maxLength={128}
                  autoComplete="new-password"
                  className={fieldClass}
                />
              </div>

              <button
                type="button"
                className={primaryButton}
                disabled={pending !== null}
                onClick={() => void updatePassword()}
              >
                {pending === "password" ? "Updating…" : "Update password"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
