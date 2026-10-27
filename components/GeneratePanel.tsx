"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/useToast";
import {
  formatGenerateStatus,
  waitForGenerateJob,
} from "@/lib/generate/wait-job";
import { analyzeJobDescription } from "@/lib/jd-checks";
import type { ResumeProfileListItem } from "@/lib/profiles/types";

type ProviderOption = {
  id: string;
  label: string;
  available: boolean;
  models?: Array<{ id: string; name: string }>;
  defaultModel?: string | null;
};

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

function downloadBase64(filename: string, base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const fieldClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2";

export function GeneratePanel({
  profiles,
}: {
  profiles: ResumeProfileListItem[];
}) {
  const { showToast, toastHost } = useToast();
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [companyName, setCompanyName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jd, setJd] = useState("");
  const [provider, setProvider] = useState("chatgpt");
  const [model, setModel] = useState("");
  const [options, setOptions] = useState<ProviderOption[]>([]);
  const [pending, setPending] = useState<
    "prompt-resume" | "prompt-cover" | "resume" | "cover-letter" | null
  >(null);
  const [pasteText, setPasteText] = useState("");
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [appliedPending, setAppliedPending] = useState(false);
  const [jobStatus, setJobStatus] = useState("");
  const [lastFile, setLastFile] = useState<{
    filename: string;
    mimeType: string;
    base64: string;
  } | null>(null);

  const noApi = provider === "chatgpt";
  const providerOption = useMemo(
    () => options.find((option) => option.id === provider),
    [options, provider],
  );
  const modelOptions = providerOption?.models || [];
  const jdCheck = useMemo(() => analyzeJobDescription(jd), [jd]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/ai-config");
        if (!response.ok) return;
        const data = (await response.json()) as {
          defaultProvider?: string;
          defaultModel?: string;
          options?: ProviderOption[];
        };
        if (cancelled) return;
        const nextOptions = (data.options || []).filter(
          (option) => option.id !== "chatgpt-session",
        );
        setOptions(nextOptions);
        const next =
          data.defaultProvider === "chatgpt-session"
            ? "chatgpt"
            : data.defaultProvider || "chatgpt";
        setProvider(next);
        const matched = nextOptions.find((option) => option.id === next);
        setModel(
          matched?.defaultModel ||
            data.defaultModel ||
            matched?.models?.[0]?.id ||
            "",
        );
      } catch {
        // keep chatgpt fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!providerOption) return;
    const stillValid = providerOption.models?.some((item) => item.id === model);
    if (!stillValid) {
      setModel(providerOption.defaultModel || providerOption.models?.[0]?.id || "");
    }
  }, [providerOption, model]);

  const selected = useMemo(
    () => profiles.find((item) => item.id === profileId),
    [profiles, profileId],
  );

  async function copyPrompt(kind: "resume" | "cover-letter") {
    if (!profileId) {
      showToast("Select a profile.", "error");
      return;
    }
    if (!companyName.trim()) {
      showToast("Enter a company name.", "error");
      return;
    }
    if (!targetRole.trim()) {
      showToast("Enter a job title.", "error");
      return;
    }
    if (!jobLink.trim()) {
      showToast("Enter a job link.", "error");
      return;
    }
    if (!jd.trim()) {
      showToast("Enter a job description.", "error");
      return;
    }
    if (jdCheck.remoteWarning) {
      showToast(jdCheck.remoteWarning, "error");
    }
    if (jdCheck.clearanceWarning) {
      showToast(jdCheck.clearanceWarning, "error");
    }
    setPending(kind === "resume" ? "prompt-resume" : "prompt-cover");
    setJobStatus("Preparing ChatGPT prompt…");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          profileId,
          jd,
          companyName,
          targetRole,
          jobLink,
          provider: "chatgpt",
          format,
          historyId,
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as {
        result?: { mode?: string; prompt?: string; historyId?: string | null };
        jobId?: string;
        job?: { message?: string };
      };
      // Fast path: prompt returned inline (no queue).
      if (data.result?.mode === "prompt" && data.result.prompt) {
        if (data.result.historyId) setHistoryId(data.result.historyId);
        await navigator.clipboard.writeText(data.result.prompt);
        showToast(
          "Prompt copied. Paste into ChatGPT, then paste the reply below.",
          "ok",
        );
        return;
      }
      // Legacy/queued fallback
      if (!data.jobId) {
        showToast("Could not build prompt.", "error");
        return;
      }
      setJobStatus(data.job?.message || "Preparing ChatGPT prompt…");
      const result = await waitForGenerateJob(data.jobId, {
        onStatus: (job) => setJobStatus(formatGenerateStatus(job)),
      });
      if (result.historyId) setHistoryId(result.historyId);
      if (result.mode === "prompt" && result.prompt) {
        await navigator.clipboard.writeText(result.prompt);
        showToast(
          "Prompt copied. Paste into ChatGPT, then paste the reply below.",
          "ok",
        );
        return;
      }
      showToast("Could not build prompt.", "error");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again.",
        "error",
      );
    } finally {
      setPending(null);
      setJobStatus("");
    }
  }

  async function markApplied() {
    if (!companyName.trim()) {
      showToast("Enter a company name.", "error");
      return;
    }
    if (!targetRole.trim()) {
      showToast("Enter a job title.", "error");
      return;
    }
    if (!jobLink.trim()) {
      showToast("Enter a job link.", "error");
      return;
    }
    if (!jd.trim()) {
      showToast("Enter a job description.", "error");
      return;
    }
    if (jdCheck.remoteWarning) {
      showToast(jdCheck.remoteWarning, "error");
    }
    if (jdCheck.clearanceWarning) {
      showToast(jdCheck.clearanceWarning, "error");
    }
    setAppliedPending(true);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          jobTitle: targetRole,
          jobDescription: jd,
          jobLink,
          profileId: profileId || undefined,
          historyId: historyId || undefined,
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { id?: string };
      if (data.id) setHistoryId(data.id);
      showToast("Marked as Applied.", "ok");
    } catch {
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setAppliedPending(false);
    }
  }

  async function generate(kind: "resume" | "cover-letter") {
    if (!profileId) {
      showToast("Select a profile.", "error");
      return;
    }
    if (!companyName.trim()) {
      showToast("Enter a company name.", "error");
      return;
    }
    if (!targetRole.trim()) {
      showToast("Enter a job title.", "error");
      return;
    }
    if (!jobLink.trim()) {
      showToast("Enter a job link.", "error");
      return;
    }
    if (!jd.trim()) {
      showToast("Enter a job description.", "error");
      return;
    }
    if (jdCheck.remoteWarning) {
      showToast(jdCheck.remoteWarning, "error");
    }
    if (jdCheck.clearanceWarning) {
      showToast(jdCheck.clearanceWarning, "error");
    }
    if (noApi && !pasteText.trim()) {
      showToast("Paste the ChatGPT reply first.", "error");
      return;
    }

    setPending(kind);
    setJobStatus(
      noApi ? "Building from ChatGPT reply…" : "Received…",
    );
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          profileId,
          jd,
          companyName,
          targetRole,
          jobLink,
          provider,
          model: noApi ? undefined : model || undefined,
          format,
          historyId,
          pastedResponse: noApi ? pasteText : undefined,
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as {
        jobId?: string;
        job?: { message?: string };
      };
      if (!data.jobId) {
        showToast("Could not queue generation.", "error");
        return;
      }
      setJobStatus(
        data.job?.message ||
          (noApi ? "Building from ChatGPT reply…" : "Queued…"),
      );
      const result = await waitForGenerateJob(data.jobId, {
        onStatus: (job) => setJobStatus(formatGenerateStatus(job)),
      });
      if (result.historyId) setHistoryId(result.historyId);

      if (result.mode === "prompt" && result.prompt) {
        await navigator.clipboard.writeText(result.prompt);
        showToast(
          "Prompt copied. Paste into ChatGPT, then paste the reply below.",
          "ok",
        );
        return;
      }

      if (
        result.mode === "file" &&
        result.base64 &&
        result.filename &&
        result.mimeType
      ) {
        setLastFile({
          filename: result.filename,
          mimeType: result.mimeType,
          base64: result.base64,
        });
        downloadBase64(result.filename, result.base64, result.mimeType);
        showToast(
          kind === "cover-letter"
            ? "Cover letter saved to History and downloaded."
            : "Resume saved to History and downloaded.",
          "ok",
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
        "error",
      );
    } finally {
      setPending(null);
      setJobStatus("");
    }
  }

  if (profiles.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-[var(--muted)]">
        No resume profiles are assigned to you yet. Ask an admin to assign one
        from Profiles.
      </p>
    );
  }

  return (
    <>
      {toastHost}
      <div className="w-full space-y-6">
        <div className="w-full space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm md:col-span-2 xl:col-span-1">
              <span className="mb-1 block font-medium">Profile</span>
              <select
                className={fieldClass}
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.title ? ` — ${profile.title}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">AI provider</span>
              <select
                className={fieldClass}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {(options.length
                  ? options
                  : [
                      {
                        id: "chatgpt",
                        label: "No API key — copy/paste ChatGPT",
                        available: true,
                      },
                    ]
                ).map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    disabled={!option.available}
                  >
                    {option.label}
                    {!option.available ? " (not configured)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {!noApi ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">AI model</span>
                <select
                  className={fieldClass}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {modelOptions.length === 0 ? (
                    <option value="">Default</option>
                  ) : (
                    modelOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Download format</span>
              <select
                className={fieldClass}
                value={format}
                onChange={(e) =>
                  setFormat(e.target.value === "docx" ? "docx" : "pdf")
                }
              >
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Company name</span>
              <input
                className={fieldClass}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Job title</span>
              <input
                className={fieldClass}
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </label>

            <label className="block text-sm md:col-span-2 xl:col-span-1">
              <span className="mb-1 block font-medium">Job link</span>
              <input
                className={fieldClass}
                type="url"
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
                placeholder="https://…"
                required
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Job description</span>
            <textarea
              className={`${fieldClass} min-h-44`}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              required
            />
          </label>

          {jd.trim() && jdCheck.remoteWarning ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {jdCheck.remoteWarning}
            </p>
          ) : null}
          {jd.trim() && jdCheck.clearanceWarning ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {jdCheck.clearanceWarning}
            </p>
          ) : null}

          {selected ? (
            <p className="text-xs text-[var(--muted)]">
              Using {selected.name}
              {noApi
                ? ". No API key: copy a prompt, paste ChatGPT’s reply below, then Generate."
                : "."}
            </p>
          ) : null}

          {jobStatus ? (
            <p
              className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm"
              role="status"
            >
              {jobStatus}
            </p>
          ) : null}

          {noApi ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(pending) || appliedPending}
                onClick={() => void copyPrompt("resume")}
                className="rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending === "prompt-resume" ? "Copying…" : "Copy resume prompt"}
              </button>
              <button
                type="button"
                disabled={Boolean(pending) || appliedPending}
                onClick={() => void copyPrompt("cover-letter")}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {pending === "prompt-cover"
                  ? "Copying…"
                  : "Copy cover letter prompt"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(pending) || appliedPending}
                onClick={() => generate("resume")}
                className="rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending === "resume" ? "Working…" : "Generate resume"}
              </button>
              <button
                type="button"
                disabled={Boolean(pending) || appliedPending}
                onClick={() => generate("cover-letter")}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {pending === "cover-letter"
                  ? "Working…"
                  : "Generate cover letter"}
              </button>
              <button
                type="button"
                disabled={Boolean(pending) || appliedPending}
                onClick={() => void markApplied()}
                className="rounded-xl border border-[var(--green)] px-4 py-2.5 text-sm font-medium text-[var(--green-deep)] disabled:opacity-60"
              >
                {appliedPending ? "Saving…" : "Applied"}
              </button>
            </div>
          )}
        </div>

        {noApi ? (
          <div className="w-full space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
            <div>
              <h2 className="mb-2 font-medium">Paste ChatGPT reply</h2>
              <textarea
                className={`${fieldClass} min-h-56 text-xs`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the full ChatGPT response here, then Generate below."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  Boolean(pending) ||
                  appliedPending ||
                  !pasteText.trim()
                }
                onClick={() => generate("resume")}
                className="rounded-xl bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending === "resume" ? "Working…" : "Generate resume"}
              </button>
              <button
                type="button"
                disabled={
                  Boolean(pending) ||
                  appliedPending ||
                  !pasteText.trim()
                }
                onClick={() => generate("cover-letter")}
                className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {pending === "cover-letter"
                  ? "Working…"
                  : "Generate cover letter"}
              </button>
              <button
                type="button"
                disabled={Boolean(pending) || appliedPending}
                onClick={() => void markApplied()}
                className="rounded-xl border border-[var(--green)] px-4 py-2.5 text-sm font-medium text-[var(--green-deep)] disabled:opacity-60"
              >
                {appliedPending ? "Saving…" : "Applied"}
              </button>
            </div>
          </div>
        ) : null}

        {lastFile ? (
          <div className="w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{lastFile.filename}</h2>
                <p className="text-sm text-[var(--muted)]">
                  Ready. Download again if the browser blocked the first save.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--green-deep)]"
                onClick={() =>
                  downloadBase64(
                    lastFile.filename,
                    lastFile.base64,
                    lastFile.mimeType,
                  )
                }
              >
                Download again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
