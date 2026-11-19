"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssigneeFilter, useServerProfiles } from "@/components/AssigneeFilter";
import { DataTable } from "@/components/DataTable";
import { PaginationBar, paginateItems } from "@/components/PaginationBar";
import { useToast } from "@/components/useToast";
import type { ResumeProfileListItem } from "@/lib/profiles/types";
import type { Account } from "@/lib/server/types";
import { JobrightFilterForm, emptyJobrightFilters } from "@/components/JobrightFilterForm";
import { jobDedupeKey } from "@/lib/scrape/dedupe";
import { JOB_PLATFORMS } from "@/lib/scrape/platforms";

type ScrapedJob = {
  id: string;
  jobTitle: string;
  companyName: string;
  jobLink: string;
  profileId: string;
  profileName: string;
  verified: boolean;
  createdAt: string;
  matchScore: number | null;
  postedAt: string | null;
  jobrightJobId?: string;
};

type SortKey = "company" | "title" | "link" | "match" | "posted";
type SortDir = "asc" | "desc";

const fieldClass =
  "w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition duration-200 focus:border-[var(--green)] focus:outline-none focus:ring-2 focus:ring-[var(--green)]/20";

function scoreTone(score: number | null) {
  if (score == null) {
    return {
      mark: "bg-[#f3efe6] text-[#6d655c]",
      edge: "border-l-[#e4dacb]",
      wash: "bg-[#fffdf8]",
    };
  }
  if (score >= 80) {
    return {
      mark: "bg-[#e3f3ea] text-[#0c693b]",
      edge: "border-l-[#0e7a45]",
      wash: "bg-[#f4fbf7]",
    };
  }
  if (score >= 65) {
    return {
      mark: "bg-[#e3f1f5] text-[#1f5f73]",
      edge: "border-l-[#1f5f73]",
      wash: "bg-[#f3fafb]",
    };
  }
  if (score >= 50) {
    return {
      mark: "bg-[#f8ecd4] text-[#8a5a12]",
      edge: "border-l-[#c4841d]",
      wash: "bg-[#fdf8ef]",
    };
  }
  if (score >= 35) {
    return {
      mark: "bg-[#f3e8f4] text-[#6b3f72]",
      edge: "border-l-[#6b3f72]",
      wash: "bg-[#fbf6fb]",
    };
  }
  return {
    mark: "bg-[#f8e8e4] text-[#9d3428]",
    edge: "border-l-[#9d3428]",
    wash: "bg-[#fdf6f4]",
  };
}

function postedLabel(value: string | null) {
  if (!value) return "—";
  const posted = Date.parse(value);
  if (!Number.isFinite(posted)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - posted) / 60000));
  if (minutes < 60) return minutes <= 1 ? "1 min" : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hr" : `${hours} hrs`;
  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? "1 day" : `${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 wk" : `${weeks} wks`;
}

function companyInitial(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  return letter || "•";
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Something went wrong. Try again.";
  } catch {
    return "Something went wrong. Try again.";
  }
}

export function ScrapePanel({
  profiles,
  assignees,
  seeAll: _seeAll = false,
}: {
  profiles: ResumeProfileListItem[];
  assignees?: Account[];
  seeAll?: boolean;
}) {
  const { showToast, toastHost } = useToast();
  const profilesQuery = useServerProfiles(profiles, assignees !== undefined);
  const visibleProfiles = profilesQuery.rows;
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [platform, setPlatform] = useState("");
  const [listMode, setListMode] = useState<"search" | "recommended">("recommended");
  const [authMethod, setAuthMethod] = useState<"password" | "token">("password");
  const [jobrightEmail, setJobrightEmail] = useState(profiles[0]?.email || "");
  const [jobrightPassword, setJobrightPassword] = useState("");
  const [jobrightToken, setJobrightToken] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<ScrapedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [jobrightSignedIn, setJobrightSignedIn] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState<
    "" | "remove" | "remove-all" | "verify" | "applied"
  >("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("match");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const scrapeAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [filtersOpen]);

  const visibleKey = visibleProfiles.map((profile) => profile.id).join(",");
  const selectedProfile =
    visibleProfiles.find((profile) => profile.id === profileId) || null;

  useEffect(() => {
    if (selectedProfile) return;
    const next = visibleProfiles[0];
    setProfileId(next?.id || "");
  }, [visibleKey, selectedProfile, visibleProfiles]);

  useEffect(() => {
    setJobrightEmail(selectedProfile?.email || "");
  }, [selectedProfile?.id, selectedProfile?.email]);

  useEffect(() => {
    if (!profileId) {
      setJobs([]);
      return;
    }
    let cancelled = false;
    setSelectedIds([]);
    setLoading(true);
    const params = new URLSearchParams();
    params.set("profileId", profileId);
    void fetch(`/api/scrape?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) showToast(await readError(response), "error");
          return;
        }
        const data = (await response.json()) as { jobs?: ScrapedJob[] };
        if (!cancelled) {
          const rows = Array.isArray(data.jobs) ? data.jobs : [];
          setJobs(rows.filter((job) => job.profileId === profileId));
        }
      })
      .catch(() => {
        if (!cancelled) showToast("Could not load saved links.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, showToast]);

  const visibleJobs = useMemo(() => {
    const owned = profileId ? jobs.filter((job) => job.profileId === profileId) : [];
    const query = search.trim().toLowerCase();
    const matched = query
      ? owned.filter((job) =>
          `${job.companyName} ${job.jobTitle} ${job.jobLink}`
            .toLowerCase()
            .includes(query),
        )
      : owned;
    const postedOf = (job: ScrapedJob) =>
      job.postedAt ? Date.parse(job.postedAt) || 0 : 0;
    return [...matched].sort((a, b) => {
      let result = 0;
      if (sortKey === "company") {
        result = a.companyName.localeCompare(b.companyName, undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "title") {
        result = a.jobTitle.localeCompare(b.jobTitle, undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "link") {
        result = a.jobLink.localeCompare(b.jobLink, undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "match") {
        result = (a.matchScore ?? -1) - (b.matchScore ?? -1);
      } else {
        result = postedOf(a) - postedOf(b);
      }
      return sortDir === "asc" ? result : -result;
    });
  }, [jobs, profileId, search, sortKey, sortDir]);

  const { page: safePage, slice: pageRows } = useMemo(
    () => paginateItems(visibleJobs, page, pageSize),
    [visibleJobs, page, pageSize],
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "match" || key === "posted" ? "desc" : "asc");
    }
    setPage(1);
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const allSelected =
    visibleJobs.length > 0 &&
    visibleJobs.every((job) => selectedIds.includes(job.id));

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      const visible = new Set(visibleJobs.map((job) => job.id));
      setSelectedIds((current) => current.filter((id) => !visible.has(id)));
      return;
    }
    setSelectedIds(visibleJobs.map((job) => job.id));
  }

  async function copyText(text: string, okMessage: string) {
    if (!text.trim()) {
      showToast("Nothing to copy.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMessage);
    } catch {
      showToast("Could not copy to clipboard.", "error");
    }
  }

  function jobrightAuth() {
    return authMethod === "token"
      ? { method: "token" as const, token: jobrightToken }
      : {
          method: "password" as const,
          email: jobrightEmail,
          password: jobrightPassword,
        };
  }

  function credentialsReady() {
    if (authMethod === "token" && !jobrightToken.trim()) {
      showToast("Paste the Jobright Cookie header.", "error");
      return false;
    }
    if (authMethod === "password" && !jobrightEmail.trim()) {
      showToast("Enter the Jobright email address.", "error");
      return false;
    }
    if (authMethod === "password" && !jobrightPassword) {
      showToast("Enter the Jobright password.", "error");
      return false;
    }
    return true;
  }

  async function logIn() {
    if (!credentialsReady()) return;
    setLoggingIn(true);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "login", auth: jobrightAuth() }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      setJobrightSignedIn(true);
      showToast("Signed in to Jobright.");
    } catch {
      showToast("Jobright sign-in failed. Try again.", "error");
    } finally {
      setLoggingIn(false);
    }
  }

  function signOut() {
    setJobrightSignedIn(false);
    setJobrightPassword("");
    setJobrightToken("");
    showToast("Signed out of Jobright.");
  }

  async function scrape() {
    const cookieReady = authMethod === "token" && jobrightToken.trim().length > 0;
    if (authMethod === "token" ? !cookieReady : !jobrightSignedIn) {
      showToast(
        authMethod === "token"
          ? "Paste the Jobright Cookie header."
          : "Log in before scraping.",
        "error",
      );
      return;
    }
    if (!selectedProfile) {
      showToast("Select a profile.", "error");
      return;
    }
    if (!platform) {
      showToast("Select a job platform.", "error");
      return;
    }
    if (listMode === "search" && !filters.keywords?.includes("\t")) {
      showToast("Enter a job function from the list.", "error");
      return;
    }
    if (!credentialsReady()) return;
    const controller = new AbortController();
    scrapeAbort.current = controller;
    setScraping(true);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          profileId: selectedProfile.id,
          platform,
          mode: listMode,
          filters,
          auth: jobrightAuth(),
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as {
        found?: number;
        added?: number;
        skipped?: number;
        jobs?: ScrapedJob[];
      };
      const refreshed = await fetch(`/api/scrape?profileId=${encodeURIComponent(selectedProfile.id)}`);
      const refreshedData = refreshed.ok
        ? ((await refreshed.json()) as { jobs?: ScrapedJob[] })
        : data;
      const rows = Array.isArray(refreshedData.jobs) ? refreshedData.jobs : [];
      setJobs(rows.filter((job) => job.profileId === selectedProfile.id));
      setSelectedIds([]);
      setPage(1);
      const added = data.added || 0;
      const skipped = data.skipped || 0;
      const found = data.found || 0;
      if (found === 0) {
        showToast("No jobs matched those filters.", "error");
        return;
      }
      if (added === 0) {
        showToast(
          skipped > 0
            ? `No new links. Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.`
            : "No new links.",
          "error",
        );
        return;
      }
      showToast(
        `Added ${added} link${added === 1 ? "" : "s"}.${
          skipped > 0
            ? ` Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.`
            : ""
        }`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showToast("Scrape stopped. Links collected so far stay saved.");
        window.setTimeout(() => {
          void fetch(
            `/api/scrape?${(() => {
              const params = new URLSearchParams();
              if (profileId) params.set("profileId", profileId);
              return params;
            })()}`,
          )
            .then(async (response) => {
              if (!response.ok) return;
              const data = (await response.json()) as { jobs?: ScrapedJob[] };
              const rows = Array.isArray(data.jobs) ? data.jobs : [];
              setJobs(profileId ? rows.filter((job) => job.profileId === profileId) : []);
              setSelectedIds([]);
              setPage(1);
            })
            .catch(() => undefined);
        }, 700);
        return;
      }
      showToast("Jobright request failed. Try again.", "error");
    } finally {
      scrapeAbort.current = null;
      setScraping(false);
    }
  }

  function stopScrape() {
    scrapeAbort.current?.abort();
  }

  async function removeJob(id: string) {
    const job = jobs.find((item) => item.id === id);
    const label = job ? `${job.jobTitle} at ${job.companyName}` : "this link";
    if (!window.confirm(`Remove ${label}?`)) return;
    setRemovingId(id);
    try {
      const response = await fetch("/api/scrape", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      setJobs((current) => current.filter((job) => job.id !== id));
      setSelectedIds((current) => current.filter((item) => item !== id));
      showToast("Link removed.");
    } catch {
      showToast("Could not remove that link.", "error");
    } finally {
      setRemovingId(null);
    }
  }

  async function setVerified(ids: string[], verified: boolean) {
    if (ids.length === 0) return;
    setBulkPending("verify");
    try {
      const response = await fetch("/api/scrape", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, verified }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const chosen = new Set(ids);
      const keys = new Set(
        jobs
          .filter((job) => chosen.has(job.id))
          .map((job) => jobDedupeKey(job.jobTitle, job.companyName)),
      );
      setJobs((current) =>
        current.map((job) =>
          chosen.has(job.id) || keys.has(jobDedupeKey(job.jobTitle, job.companyName))
            ? { ...job, verified }
            : job,
        ),
      );
      showToast(
        verified
          ? ids.length === 1
            ? "Link marked verified."
            : `${ids.length} links marked verified.`
          : ids.length === 1
            ? "Link marked unverified."
            : `${ids.length} links marked unverified.`,
      );
    } catch {
      showToast("Could not update verification.", "error");
    } finally {
      setBulkPending("");
    }
  }

  async function markApplied(ids: string[]) {
    if (ids.length === 0) return;
    const cookieReady = authMethod === "token" && jobrightToken.trim().length > 0;
    if (authMethod === "token" ? !cookieReady : !jobrightSignedIn) {
      showToast(
        authMethod === "token"
          ? "Paste the Jobright Cookie header."
          : "Log in before marking jobs applied.",
        "error",
      );
      return;
    }
    if (!credentialsReady()) return;
    setBulkPending("applied");
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "applied",
          ids,
          auth: jobrightAuth(),
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as {
        applied?: number;
        missing?: number;
        failed?: number;
        removedIds?: string[];
      };
      const removed = new Set(data.removedIds || []);
      setJobs((current) => current.filter((job) => !removed.has(job.id)));
      setSelectedIds((current) => current.filter((id) => !removed.has(id)));
      const applied = data.applied || 0;
      const missing = data.missing || 0;
      const failed = data.failed || 0;
      if (applied === 0) {
        showToast(
          missing > 0
            ? "Those links have no Jobright job id. Scrape them again, then mark them applied."
            : "Jobright could not mark those jobs applied.",
          "error",
        );
        return;
      }
      const extra = [
        missing > 0 ? `${missing} had no Jobright job id` : "",
        failed > 0 ? `${failed} failed` : "",
      ]
        .filter(Boolean)
        .join(", ");
      showToast(
        `Marked ${applied} applied.${extra ? ` ${extra}.` : ""}`,
      );
    } catch {
      showToast("Could not mark those jobs applied.", "error");
    } finally {
      setBulkPending("");
    }
  }

  function copySelected() {
    const chosen = new Set(selectedIds);
    const links = jobs.filter((job) => chosen.has(job.id)).map((job) => job.jobLink);
    void copyText(
      links.join("\n"),
      `Copied ${links.length} link${links.length === 1 ? "" : "s"}.`,
    );
  }

  async function removeAll() {
    if (jobs.length === 0 || !profileId) return;
    if (!window.confirm("Remove every saved link for this profile?")) {
      return;
    }
    setBulkPending("remove-all");
    try {
      const response = await fetch("/api/scrape", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          all: true,
          profileIds: [profileId],
        }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { deleted?: number };
      setJobs([]);
      setSelectedIds([]);
      setPage(1);
      const deleted = data.deleted || 0;
      showToast(deleted === 1 ? "Link removed." : `${deleted} links removed.`);
    } catch {
      showToast("Could not remove the links.", "error");
    } finally {
      setBulkPending("");
    }
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    if (
      !window.confirm(
        count === 1
          ? "Remove this link?"
          : `Remove ${count} selected links?`,
      )
    ) {
      return;
    }
    setBulkPending("remove");
    try {
      const response = await fetch("/api/scrape", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        showToast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { deleted?: number };
      const removed = new Set(selectedIds);
      setJobs((current) => current.filter((job) => !removed.has(job.id)));
      setSelectedIds([]);
      const deleted = data.deleted || count;
      showToast(
        deleted === 1 ? "Link removed." : `${deleted} links removed.`,
      );
    } catch {
      showToast("Could not remove those links.", "error");
    } finally {
      setBulkPending("");
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

  const cookieReady = authMethod === "token" && jobrightToken.trim().length > 0;
  const readyToScrape = authMethod === "token" ? cookieReady : jobrightSignedIn;
  const busy =
    scraping || loggingIn || loading || removingId !== null || bulkPending !== "";
  const emptyFilters = emptyJobrightFilters();
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => (value || "") !== (emptyFilters[key] ?? ""),
  ).length;

  return (
    <>
      {toastHost}
      <div className="w-full space-y-6">
        {assignees ? (
          <AssigneeFilter
            users={assignees}
            selectedIds={profilesQuery.assigneeIds}
            disabled={profilesQuery.loading}
            onChange={(ids) => {
              void profilesQuery
                .changeAssignees(ids)
                .catch(() => showToast("Could not load profiles.", "error"));
            }}
          />
        ) : null}
        <div className="scrape-rise relative w-full rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,#fffdf8_0%,#f4fbf7_42%,#fdf8ef_100%)] p-5 shadow-[0_16px_40px_rgba(48,36,20,0.06)] sm:p-6">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
            <div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[#e3f1f5]/80 blur-2xl" />
            <div className="absolute -bottom-16 left-10 h-32 w-32 rounded-full bg-[#f3e8f4]/70 blur-2xl" />
          </div>
          <div className="relative">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Profile</span>
              <select
                className={fieldClass}
                value={profileId}
                disabled={scraping}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setProfileId(nextId);
                  setJobrightSignedIn(false);
                  setJobrightEmail(
                    visibleProfiles.find((profile) => profile.id === nextId)?.email || "",
                  );
                  setPage(1);
                }}
              >
                {visibleProfiles.length === 0 ? (
                  <option value="">No profiles</option>
                ) : null}
                {visibleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.title ? `${profile.name} — ${profile.title}` : profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Job platform</span>
              <select
                className={fieldClass}
                value={platform}
                disabled={scraping}
                onChange={(event) => {
                  const next = event.target.value;
                  setPlatform(next);
                  setFilters(next ? emptyJobrightFilters() : {});
                  setFiltersOpen(false);
                  setPage(1);
                }}
              >
                <option value="">Select a platform</option>
                {JOB_PLATFORMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {platform ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">List</span>
                <select
                  className={fieldClass}
                  value={listMode}
                  disabled={scraping}
                  onChange={(event) =>
                    setListMode(
                      event.target.value === "recommended" ? "recommended" : "search",
                    )
                  }
                >
                  <option value="search">Search</option>
                  <option value="recommended">Recommended</option>
                </select>
              </label>
            ) : null}
          </div>
          {platform ? (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Jobright sign-in</span>
                <select
                  className={fieldClass}
                  value={authMethod}
                  disabled={scraping}
                  onChange={(event) => {
                    setJobrightSignedIn(false);
                    setAuthMethod(event.target.value === "token" ? "token" : "password");
                  }}
                >
                  <option value="password">Email and password</option>
                  <option value="token">Cookie header</option>
                </select>
              </label>
              {authMethod === "password" ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Jobright email *</span>
                    <input
                      className={fieldClass}
                      type="email"
                      autoComplete="off"
                      value={jobrightEmail}
                      disabled={scraping}
                      placeholder="you@email.com"
                      onChange={(event) => {
                        setJobrightSignedIn(false);
                        setJobrightEmail(event.target.value);
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Jobright password *</span>
                    <input
                      className={fieldClass}
                      type="password"
                      autoComplete="new-password"
                      value={jobrightPassword}
                      disabled={scraping}
                      onChange={(event) => {
                        setJobrightSignedIn(false);
                        setJobrightPassword(event.target.value);
                      }}
                    />
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      Used for this scrape only. Not saved.
                    </span>
                  </label>
                </>
              ) : (
                <label className="block text-sm sm:col-span-2 xl:col-span-3">
                  <span className="mb-1 block font-medium">Cookie header *</span>
                  <textarea
                    className={`${fieldClass} min-h-28 font-mono text-xs`}
                    autoComplete="off"
                    spellCheck={false}
                    value={jobrightToken}
                    disabled={scraping}
                    placeholder="SESSION_ID=… or the whole Cookie header"
                    onChange={(event) => {
                      setJobrightSignedIn(false);
                      setJobrightToken(event.target.value);
                    }}
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    In DevTools, open a jobright.ai request, then Headers, then Cookie. Paste that Cookie value. Applyra uses the SESSION_ID inside it for this scrape. It is not saved.
                  </span>
                </label>
              )}
            </div>
          ) : null}
          {platform ? (
            <>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[#1f5f73]/25 bg-[#e3f1f5] px-3 py-2.5 text-sm font-medium text-[#1f5f73] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(31,95,115,0.16)] active:translate-y-0"
                aria-expanded={filtersOpen}
                aria-controls="job-filters"
                onClick={() => setFiltersOpen(true)}
              >
                Filters
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-[var(--green-soft)] px-2 py-0.5 text-xs font-medium text-[var(--green-deep)]">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              {authMethod === "password" ? (
                jobrightSignedIn ? (
                  <button
                    type="button"
                    className="rounded-xl border border-[var(--green)]/40 bg-[var(--green-soft)] px-4 py-2.5 text-sm font-medium text-[var(--green-deep)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(14,122,69,0.16)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    disabled={scraping || loggingIn}
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] shadow-[0_8px_20px_rgba(28,25,21,0.16)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#3a3128] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    disabled={scraping || loggingIn}
                    onClick={() => void logIn()}
                  >
                    {loggingIn ? "Signing in…" : "Log in"}
                  </button>
                )
              ) : null}
              {scraping ? (
                <button
                  type="button"
                  className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2.5 text-sm font-medium text-[var(--danger)] shadow-[0_8px_20px_rgba(157,52,40,0.12)] transition duration-200 hover:-translate-y-0.5 active:translate-y-0"
                  onClick={stopScrape}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className={
                    readyToScrape
                      ? "rounded-xl bg-[linear-gradient(180deg,#149256_0%,#0e7a45_100%)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(14,122,69,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(14,122,69,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                      : "cursor-not-allowed rounded-xl border border-[var(--line)] bg-[var(--rail)] px-4 py-2.5 text-sm font-medium text-[var(--muted)]"
                  }
                  disabled={loggingIn || !readyToScrape}
                  onClick={() => void scrape()}
                >
                  Scrape links
                </button>
              )}
            </div>
            <p className="mt-2 text-right text-xs text-[var(--muted)]">
              {authMethod === "token"
                ? cookieReady
                  ? "Cookie is ready. Scrape uses it directly."
                  : "Paste the Cookie header, then scrape."
                : jobrightSignedIn
                  ? "Signed in to Jobright."
                  : "Log in before scraping."}
            </p>
            </>
          ) : null}
          </div>
        </div>

        {visibleProfiles.length > 0 ? (
          <div className="scrape-rise space-y-4" style={{ animationDelay: "80ms" }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-fraunces)] text-2xl tracking-tight">
                  Saved links
                  {loading
                    ? ""
                    : search.trim()
                      ? ` (${visibleJobs.length} of ${jobs.length})`
                      : ` (${jobs.length})`}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                  disabled={busy || visibleJobs.length === 0 || allSelected}
                  onClick={() => setSelectedIds(visibleJobs.map((job) => job.id))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-[var(--green)] px-3 py-2 text-sm font-medium text-white transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => void markApplied(selectedIds)}
                >
                  {bulkPending === "applied"
                    ? "Marking…"
                    : selectedIds.length > 0
                      ? `Mark applied (${selectedIds.length})`
                      : "Mark applied"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                  disabled={busy || jobs.length === 0}
                  onClick={() => void removeAll()}
                >
                  {bulkPending === "remove-all" ? "Removing…" : "Remove all"}
                </button>
                {selectedIds.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="rounded-xl border border-[#c4841d]/30 bg-[#f8ecd4] px-3 py-2 text-sm font-medium text-[#8a5a12] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                      disabled={busy}
                      onClick={copySelected}
                    >
                      Copy selected ({selectedIds.length})
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-[var(--green)] px-3 py-2 text-sm font-medium text-white transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                      disabled={busy}
                      onClick={() => void setVerified(selectedIds, true)}
                    >
                      {bulkPending === "verify"
                        ? "Saving…"
                        : `Mark verified (${selectedIds.length})`}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                      disabled={busy}
                      onClick={() => void removeSelected()}
                    >
                      {bulkPending === "remove"
                        ? "Removing…"
                        : `Remove selected (${selectedIds.length})`}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-[#6b3f72]/25 bg-[#f3e8f4] px-3 py-2 text-sm text-[#6b3f72] transition duration-200 hover:-translate-y-0.5 active:translate-y-0"
                      disabled={busy}
                      onClick={() => setSelectedIds([])}
                    >
                      Clear selection
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rounded-xl border border-[#c4841d]/30 bg-[#f8ecd4] px-3 py-2 text-sm font-medium text-[#8a5a12] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                    disabled={busy || visibleJobs.length === 0}
                    onClick={() =>
                      void copyText(
                        visibleJobs.map((job) => job.jobLink).join("\n"),
                        `Copied ${visibleJobs.length} link${visibleJobs.length === 1 ? "" : "s"}.`,
                      )
                    }
                  >
                    Copy links
                  </button>
                )}
              </div>
            </div>
            <input
              className="w-full max-w-md rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
              value={search}
              placeholder="Search company, title, or link"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <DataTable
              minWidth="min-w-[64rem] sm:min-w-0"
              selectable
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              disabled={busy}
            >
                  <thead>
                    <tr>
                      <th className="w-10 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--green)]"
                          aria-label="Select all links"
                          checked={allSelected}
                          disabled={busy || visibleJobs.length === 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("company")}>
                          Company name{sortMark("company")}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("title")}>
                          Job title{sortMark("title")}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("link")}>
                          Link{sortMark("link")}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("match")}>
                          Match{sortMark("match")}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("posted")}>
                          Posted{sortMark("posted")}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center font-medium">Verified</th>
                      <th className="px-4 py-3 text-center font-medium"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-8 text-center text-[var(--muted)]"
                        >
                          {loading
                            ? "Loading saved links…"
                            : !profileId
                              ? "Select a profile to see its links."
                              : search.trim()
                                ? "No links match that search."
                                : "No job links yet. Run a scrape to collect them."}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((job, index) => {
                        const accent = scoreTone(job.matchScore);
                        return (
                        <tr
                          key={job.id}
                          data-row-id={job.id}
                          className={`border-b border-l-4 border-[var(--line)] transition-colors duration-200 last:border-b-0 hover:brightness-[0.98] ${accent.edge} ${job.verified ? "bg-[#f3faf6]" : accent.wash}`}
                          style={{ animationDelay: `${index * 35}ms` }}
                        >
                          <td className="px-4 py-3 align-middle">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--green)]"
                              aria-label={`Select ${job.jobTitle} at ${job.companyName}`}
                              checked={selectedIds.includes(job.id)}
                              disabled={busy}
                              onChange={() => toggleSelected(job.id)}
                            />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${accent.mark}`}
                              >
                                {companyInitial(job.companyName)}
                              </span>
                              <span>{job.companyName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle font-medium">
                            {job.jobTitle}
                          </td>
                          <td className="max-w-[16rem] px-4 py-3 align-middle">
                            <a
                              href={job.jobLink}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate rounded-lg bg-white/70 px-2 py-1 text-[var(--green-deep)] underline-offset-2 transition hover:bg-white hover:underline"
                              title={job.jobLink}
                            >
                              {job.jobLink}
                            </a>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <span className={`inline-flex min-w-12 justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${accent.mark}`}>
                              {job.matchScore == null ? "—" : `${job.matchScore}%`}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-[var(--muted)]">
                            {postedLabel(job.postedAt)}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[var(--green)]"
                                aria-label={`Mark ${job.jobTitle} at ${job.companyName} verified`}
                                checked={job.verified}
                                disabled={busy}
                                onChange={() => void setVerified([job.id], !job.verified)}
                              />
                              <span
                                className={
                                  job.verified
                                    ? "rounded-full bg-[#e3f3ea] px-2 py-0.5 text-xs font-medium text-[#0c693b]"
                                    : "rounded-full bg-white/80 px-2 py-0.5 text-xs text-[var(--muted)]"
                                }
                              >
                                {job.verified ? "Verified" : "New"}
                              </span>
                            </label>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-[#c4841d]/30 bg-[#f8ecd4] px-2.5 py-1 text-xs font-medium text-[#8a5a12] transition duration-200 hover:-translate-y-0.5 active:translate-y-0"
                                disabled={busy}
                                onClick={() =>
                                  void copyText(job.jobLink, "Link copied.")
                                }
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                                disabled={busy}
                                onClick={() => void removeJob(job.id)}
                              >
                                {removingId === job.id ? "Removing…" : "Remove"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
            </DataTable>
            <PaginationBar
              page={safePage}
              pageSize={pageSize}
              pageSizes={[10, 20, 50, 100]}
              total={visibleJobs.length}
              disabled={busy}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </div>

      {platform && filtersOpen ? (
        <>
          <button
            type="button"
            className="scrape-fade fixed inset-0 z-40 bg-[#1c1915]/35 backdrop-blur-[3px]"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <aside
            id="job-filters"
            className="scrape-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-[24rem] flex-col overflow-hidden border-l border-[var(--line)] bg-[linear-gradient(180deg,#fffdf8_0%,#f3efe6_100%)] shadow-[-24px_0_60px_rgba(28,25,21,0.18)]"
          >
            <span
              className="filter-edge pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#0e7a45,#1f5f73_55%,#c4841d)]"
              aria-hidden="true"
            />
            <div className="filter-head flex items-center justify-between border-b border-[var(--line)] bg-[var(--card)] px-4 py-3">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl tracking-tight">
                Filters
              </h2>
              <button
                type="button"
                className="filter-close inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--paper)] text-lg leading-none"
                onClick={() => setFiltersOpen(false)}
              >
                <span className="sr-only">Close filters</span>
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <JobrightFilterForm
                filters={filters}
                disabled={scraping}
                requireJobFunction={listMode === "search"}
                onChange={(id, value) =>
                  setFilters((current) => ({ ...current, [id]: value }))
                }
              />
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
