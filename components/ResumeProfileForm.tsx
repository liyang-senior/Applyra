"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AssignUsersDialog } from "@/components/AssignUsersDialog";
import { CopyLabel } from "@/components/CopyLabel";
import { useToast } from "@/components/useToast";
import {
  emptyProfileData,
  sanitizeProfileData,
  type ProfileExperience,
  type ProfileEducation,
  type ResumeProfileData,
} from "@/lib/profiles/types";
import type { Account } from "@/lib/server/types";

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

const fieldClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70";

function emptyJob(): ProfileExperience {
  return {
    company: "",
    title: "",
    location: "",
    start_date: "",
    end_date: "",
    base_bullets: [""],
  };
}

function emptyEdu(): ProfileEducation {
  return {
    degree: "",
    school: "",
    start_year: "",
    end_year: "",
  };
}

export function ResumeProfileForm({
  mode,
  profileId,
  initial,
  initialAssignees,
  assignableUsers,
  readOnly = false,
}: {
  mode: "create" | "edit";
  profileId?: string;
  initial?: ResumeProfileData;
  initialAssignees?: string[];
  assignableUsers: Account[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { showToast, toastHost } = useToast();
  const [data, setData] = useState<ResumeProfileData>(
    initial || emptyProfileData(),
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initialAssignees || [],
  );
  const [assignOpen, setAssignOpen] = useState(false);
  const [skillsText, setSkillsText] = useState(
    (initial?.base_skills || []).join("\n"),
  );
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const assigneeSummary = assignableUsers
    .filter((account) => assigneeIds.includes(account.id))
    .map((account) => account.name || account.email);

  function setField<K extends keyof ResumeProfileData>(
    key: K,
    value: ResumeProfileData[K],
  ) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function copyHandlers() {
    return {
      onCopied: (label: string) => showToast(`${label} copied.`, "ok"),
      onError: (message: string) => showToast(message, "error"),
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setPending(true);
    const payload: ResumeProfileData = {
      ...data,
      base_skills: skillsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    try {
      if (mode === "create") {
        const response = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: payload, assigneeIds }),
        });
        if (!response.ok) {
          showToast(await readError(response), "error");
          setPending(false);
          return;
        }
        const result = (await response.json()) as { profile: { id: string } };
        showToast("Profile created.", "ok");
        router.push(`/dashboard/profiles/${result.profile.id}`);
        router.refresh();
        return;
      }

      if (!profileId) return;
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        setPending(false);
        return;
      }
      await fetch(`/api/profiles/${profileId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeIds }),
      });
      showToast("Profile updated.", "ok");
      router.refresh();
      setPending(false);
    } catch {
      showToast("Something went wrong. Try again.", "error");
      setPending(false);
    }
  }

  function applyImportedData(parsed: ResumeProfileData) {
    setData(parsed);
    setSkillsText((parsed.base_skills || []).join("\n"));
  }

  async function onImportFile(file: File | null) {
    if (!file || readOnly) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const candidate =
        json &&
        typeof json === "object" &&
        "data" in json &&
        (json as { data: unknown }).data
          ? (json as { data: unknown }).data
          : json;
      const sanitized = sanitizeProfileData(candidate);
      if (!sanitized) {
        showToast(
          "JSON must include at least a name (Origin résumé profile shape).",
          "error",
        );
        return;
      }
      applyImportedData(sanitized);
      showToast(`Imported ${sanitized.name} from ${file.name}.`, "ok");
    } catch {
      showToast("Could not read that JSON file.", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const copy = copyHandlers();

  return (
    <>
      {toastHost}
      <form onSubmit={save} className="space-y-8">
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) =>
                void onImportFile(event.target.files?.[0] || null)
              }
            />
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium"
              onClick={() => fileInputRef.current?.click()}
            >
              Import JSON
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--green)] px-3 py-2 text-sm font-medium text-[var(--green-deep)]"
              onClick={() => setAssignOpen(true)}
            >
              Assign users
              {assigneeIds.length > 0 ? ` (${assigneeIds.length})` : ""}
            </button>
            <p className="w-full text-xs text-[var(--muted)] sm:w-auto sm:flex-1">
              {assigneeSummary.length > 0
                ? `Assigned: ${assigneeSummary.join(", ")}`
                : "No users assigned yet. Import a résumé JSON to fill the form."}
            </p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <CopyLabel label="Name" value={data.name} {...copy} />
            <input
              className={fieldClass}
              value={data.name}
              onChange={(e) => setField("name", e.target.value)}
              required
              disabled={readOnly}
            />
          </div>
          <div>
            <CopyLabel label="Title" value={data.title} {...copy} />
            <input
              className={fieldClass}
              value={data.title}
              onChange={(e) => setField("title", e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div>
            <CopyLabel label="Email" value={data.email} {...copy} />
            <input
              className={fieldClass}
              type="email"
              value={data.email}
              onChange={(e) => setField("email", e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div>
            <CopyLabel label="Phone" value={data.phone} {...copy} />
            <input
              className={fieldClass}
              value={data.phone}
              onChange={(e) => setField("phone", e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div>
            <CopyLabel label="Location" value={data.location} {...copy} />
            <input
              className={fieldClass}
              value={data.location}
              onChange={(e) => setField("location", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="Zip" value={data.zip} {...copy} />
            <input
              className={fieldClass}
              value={data.zip}
              onChange={(e) => setField("zip", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="LinkedIn" value={data.linkedin} {...copy} />
            <input
              className={fieldClass}
              value={data.linkedin}
              onChange={(e) => setField("linkedin", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="Website" value={data.website} {...copy} />
            <input
              className={fieldClass}
              value={data.website}
              onChange={(e) => setField("website", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="GitHub" value={data.github} {...copy} />
            <input
              className={fieldClass}
              value={data.github}
              onChange={(e) => setField("github", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="CV link" value={data.cvLink} {...copy} />
            <input
              className={fieldClass}
              value={data.cvLink}
              onChange={(e) => setField("cvLink", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="Street" value={data.street} {...copy} />
            <input
              className={fieldClass}
              value={data.street}
              onChange={(e) => setField("street", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="Birthday" value={data.birthday} {...copy} />
            <input
              className={fieldClass}
              value={data.birthday}
              onChange={(e) => setField("birthday", e.target.value)}
            />
          </div>
          <div>
            <CopyLabel label="SSN" value={data.ssn} {...copy} />
            <input
              className={fieldClass}
              value={data.ssn}
              onChange={(e) => setField("ssn", e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Gender</label>
            <select
              className={fieldClass}
              value={
                data.gender === "male" || data.gender === "female"
                  ? data.gender
                  : ""
              }
              onChange={(e) =>
                setField(
                  "gender",
                  e.target.value as ResumeProfileData["gender"],
                )
              }
              required
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <CopyLabel label="Tech stack" value={data.techStack} {...copy} />
            <input
              className={fieldClass}
              value={data.techStack}
              onChange={(e) => setField("techStack", e.target.value)}
              placeholder="React, TypeScript, Node.js"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <CopyLabel label="Skills" value={skillsText} {...copy} />
            <textarea
              className={`${fieldClass} min-h-28`}
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="One skill line per row"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">
              Experience
            </h2>
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() =>
                setData((prev) => ({
                  ...prev,
                  experience: [...prev.experience, emptyJob()],
                }))
              }
            >
              Add role
            </button>
          </div>
          {data.experience.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No roles yet.</p>
          ) : (
            data.experience.map((job, index) => (
              <div
                key={index}
                className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className={fieldClass}
                    placeholder="Company"
                    value={job.company}
                    onChange={(e) => {
                      const next = [...data.experience];
                      next[index] = { ...job, company: e.target.value };
                      setField("experience", next);
                    }}
                  />
                  <input
                    className={fieldClass}
                    placeholder="Title"
                    value={job.title}
                    onChange={(e) => {
                      const next = [...data.experience];
                      next[index] = { ...job, title: e.target.value };
                      setField("experience", next);
                    }}
                  />
                  <input
                    className={fieldClass}
                    placeholder="Location"
                    value={job.location}
                    onChange={(e) => {
                      const next = [...data.experience];
                      next[index] = { ...job, location: e.target.value };
                      setField("experience", next);
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className={fieldClass}
                      placeholder="Start"
                      value={job.start_date}
                      onChange={(e) => {
                        const next = [...data.experience];
                        next[index] = { ...job, start_date: e.target.value };
                        setField("experience", next);
                      }}
                    />
                    <input
                      className={fieldClass}
                      placeholder="End"
                      value={job.end_date}
                      onChange={(e) => {
                        const next = [...data.experience];
                        next[index] = { ...job, end_date: e.target.value };
                        setField("experience", next);
                      }}
                    />
                  </div>
                </div>
                <textarea
                  className={`${fieldClass} min-h-24`}
                  placeholder="Bullets (one per line)"
                  value={job.base_bullets.join("\n")}
                  onChange={(e) => {
                    const next = [...data.experience];
                    next[index] = {
                      ...job,
                      base_bullets: e.target.value.split("\n"),
                    };
                    setField("experience", next);
                  }}
                />
                <button
                  type="button"
                  className="text-sm text-[var(--danger)]"
                  onClick={() =>
                    setField(
                      "experience",
                      data.experience.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove role
                </button>
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl">
              Education
            </h2>
            <button
              type="button"
              className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm"
              onClick={() =>
                setData((prev) => ({
                  ...prev,
                  education: [...prev.education, emptyEdu()],
                }))
              }
            >
              Add school
            </button>
          </div>
          {data.education.map((edu, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 sm:grid-cols-2"
            >
              <input
                className={fieldClass}
                placeholder="Degree"
                value={edu.degree}
                onChange={(e) => {
                  const next = [...data.education];
                  next[index] = { ...edu, degree: e.target.value };
                  setField("education", next);
                }}
              />
              <input
                className={fieldClass}
                placeholder="School"
                value={edu.school}
                onChange={(e) => {
                  const next = [...data.education];
                  next[index] = { ...edu, school: e.target.value };
                  setField("education", next);
                }}
              />
              <input
                className={fieldClass}
                placeholder="Start year"
                value={edu.start_year}
                onChange={(e) => {
                  const next = [...data.education];
                  next[index] = { ...edu, start_year: e.target.value };
                  setField("education", next);
                }}
              />
              <input
                className={fieldClass}
                placeholder="End year"
                value={edu.end_year}
                onChange={(e) => {
                  const next = [...data.education];
                  next[index] = { ...edu, end_year: e.target.value };
                  setField("education", next);
                }}
              />
              <button
                type="button"
                className="text-left text-sm text-[var(--danger)] sm:col-span-2"
                onClick={() =>
                  setField(
                    "education",
                    data.education.filter((_, i) => i !== index),
                  )
                }
              >
                Remove school
              </button>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-3">
          {!readOnly ? (
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Create profile"
                  : "Save changes"}
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="rounded-xl border border-[var(--green)] px-4 py-2.5 text-sm font-medium text-[var(--green-deep)]"
              onClick={() => setAssignOpen(true)}
            >
              Assign users
              {assigneeIds.length > 0 ? ` (${assigneeIds.length})` : ""}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm"
            onClick={() => router.push("/dashboard/profiles")}
          >
            Back to profiles
          </button>
        </div>
      </form>

      <AssignUsersDialog
        open={assignOpen}
        profileName={data.name.trim() || "New profile"}
        users={assignableUsers}
        selectedIds={assigneeIds}
        onClose={() => setAssignOpen(false)}
        onSave={(ids) => {
          setAssigneeIds(ids);
          setAssignOpen(false);
          showToast(
            ids.length
              ? `Assigned ${ids.length} user${ids.length === 1 ? "" : "s"}.`
              : "Cleared assignees.",
            "ok",
          );
        }}
      />
    </>
  );
}
