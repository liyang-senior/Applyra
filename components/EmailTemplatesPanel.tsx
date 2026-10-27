"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/useToast";
import type { EmailTemplate } from "@/lib/email-templates";
import type { ResumeProfileListItem } from "@/lib/profiles/types";

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

function firstNameFromProfile(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] || "";
}

function buildCopyText(body: string, firstName: string) {
  const text = String(body || "").trimEnd();
  const first = firstName.trim();
  if (first && text) return `${text}\n${first}`;
  if (first) return first;
  return text;
}

export function EmailTemplatesPanel({
  initialTemplates,
  profiles,
}: {
  initialTemplates: EmailTemplate[];
  profiles: ResumeProfileListItem[];
}) {
  const { showToast, toastHost } = useToast();
  const [templates, setTemplates] = useState(initialTemplates);
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const dialogOpen = creating || Boolean(editing);

  const sorted = useMemo(
    () =>
      [...templates].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [templates],
  );

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) || null,
    [profiles, profileId],
  );
  const replyFirstName = firstNameFromProfile(selectedProfile?.name || "");

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setName("");
    setBody("");
  }

  function openEdit(template: EmailTemplate) {
    setCreating(false);
    setEditing(template);
    setName(template.name);
    setBody(template.body);
  }

  function closeDialog(force = false) {
    if (pending && !force) return;
    setCreating(false);
    setEditing(null);
    setName("");
    setBody("");
  }

  async function copyTemplate(template: EmailTemplate) {
    if (!replyFirstName) {
      showToast("Select a profile so the first name can be added.", "error");
      return;
    }
    const text = buildCopyText(template.body, replyFirstName);
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied “${template.name}” with ${replyFirstName}.`, "ok");
    } catch {
      showToast("Could not copy to clipboard.", "error");
    }
  }

  async function saveTemplate() {
    setPending(true);
    try {
      const response = await fetch("/api/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id,
          name,
          body,
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { template?: EmailTemplate };
      if (!data.template) {
        showToast("Could not save template.", "error");
        return;
      }
      setTemplates((prev) => {
        const without = prev.filter((item) => item.id !== data.template!.id);
        return [...without, data.template!];
      });
      showToast(editing ? "Template updated." : "Template added.", "ok");
      closeDialog(true);
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setPending(false);
    }
  }

  async function removeTemplate(template: EmailTemplate) {
    if (!window.confirm(`Remove template “${template.name}”?`)) return;
    setPending(true);
    try {
      const response = await fetch("/api/email-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      setTemplates((prev) => prev.filter((item) => item.id !== template.id));
      if (expandedId === template.id) setExpandedId(null);
      if (editing?.id === template.id) closeDialog(true);
      showToast("Template removed.", "ok");
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      {toastHost}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {sorted.length} template{sorted.length === 1 ? "" : "s"}
          {replyFirstName ? (
            <span className="ml-2">· Sign as {replyFirstName}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Profile</span>
            <select
              className="min-w-[12rem] rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2"
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              disabled={profiles.length === 0}
            >
              {profiles.length === 0 ? (
                <option value="">No profiles</option>
              ) : (
                profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name || profile.email || "Untitled"}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            className="rounded-xl bg-[var(--green)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={openCreate}
          >
            Add template
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-[var(--muted)]">
            No email templates yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {sorted.map((template) => {
              const open = expandedId === template.id;
              return (
                <li key={template.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left font-medium hover:text-[var(--green-deep)]"
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === template.id ? null : template.id,
                        )
                      }
                      aria-expanded={open}
                    >
                      <span className="mr-2 text-[var(--muted)]">
                        {open ? "▾" : "▸"}
                      </span>
                      {template.name}
                    </button>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-[var(--green)] px-3 py-1.5 text-sm font-medium text-[var(--green-deep)] disabled:opacity-60"
                        disabled={pending}
                        onClick={() => void copyTemplate(template)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm"
                        disabled={pending}
                        onClick={() => openEdit(template)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-1.5 text-sm text-[var(--danger)]"
                        disabled={pending}
                        onClick={() => void removeTemplate(template)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {open ? (
                    <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--paper)] p-3 text-xs leading-relaxed text-[var(--muted)] sm:text-sm">
                      {template.body || "(empty)"}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-template-dialog-title"
          onClick={() => closeDialog()}
        >
          <div
            className="flex max-h-[min(90vh,720px)] w-full max-w-xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2
                id="email-template-dialog-title"
                className="font-[family-name:var(--font-fraunces)] text-xl"
              >
                {editing ? "Edit template" : "Add template"}
              </h2>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Name</span>
                <input
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Body</span>
                <textarea
                  className="min-h-48 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 font-mono text-xs sm:text-sm"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
                disabled={pending}
                onClick={() => closeDialog()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--green)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={pending || !name.trim()}
                onClick={() => void saveTemplate()}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
