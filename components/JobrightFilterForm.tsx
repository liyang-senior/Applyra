"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FloatingMenu } from "@/components/FloatingMenu";
import { encodeCompanies, parseCompanies } from "@/lib/scrape/companies";
import { encodeJobFunctions, parseJobFunctions } from "@/lib/scrape/job-functions";

const SENIORITY = [
  { value: "1", label: "Intern/New Grad", tip: "No work experience required, recent graduates or internships." },
  { value: "2", label: "Entry Level", tip: "1-3 years of experience, ideal for job seekers just starting their career." },
  { value: "3", label: "Mid Level", tip: "2-5 years of experience, not yet senior." },
  { value: "4", label: "Senior Level", tip: "Has over 5 years of work experience and can independently manage projects." },
  { value: "5", label: "Lead/Staff", tip: "Staff or principal level, or a leader across teams." },
  { value: "6", label: "Director/Executive", tip: "Senior company management, responsible for strategic decision-making." },
];

const JOB_TYPES = [
  { value: "1", label: "Full-time" },
  { value: "2", label: "Contract" },
  { value: "3", label: "Part-time" },
  { value: "4", label: "Internship" },
];

const WORK_MODELS = [
  { value: "onsite", label: "Onsite" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

const POSTED = [
  { value: "1", label: "Past 24 hours" },
  { value: "3", label: "Past 3 days" },
  { value: "7", label: "Past week" },
  { value: "24", label: "Past 24 days" },
  { value: "30", label: "Past month" },
];

const STAGES = [
  { value: "Early Stage", label: "Early Stage" },
  { value: "Growth Stage", label: "Growth Stage" },
  { value: "Late Stage", label: "Late Stage" },
  { value: "Public", label: "Public Company" },
];

const COUNTRIES = [
  { value: "US", label: "United States", flag: "🇺🇸", anywhere: "Anywhere in the US" },
  { value: "CA", label: "Canada", flag: "🇨🇦", anywhere: "Anywhere in Canada" },
  { value: "GB", label: "United Kingdom", flag: "🇬🇧", anywhere: "Anywhere in the UK" },
  { value: "AU", label: "Australia", flag: "🇦🇺", anywhere: "Anywhere in Australia" },
  { value: "IE", label: "Ireland", flag: "🇮🇪", anywhere: "Anywhere in Ireland" },
  { value: "NZ", label: "New Zealand", flag: "🇳🇿", anywhere: "Anywhere in New Zealand" },
];

const rangeClass =
  "pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent " +
  "[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] " +
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
  "[&::-webkit-slider-thumb]:border-[var(--green)] [&::-webkit-slider-thumb]:bg-[var(--card)] " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] " +
  "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--green)] " +
  "[&::-moz-range-thumb]:bg-[var(--card)]";

export function emptyJobrightFilters(): Record<string, string> {
  return {
    keywords: "",
    excludedTitles: "",
    jobType: "1,2,3",
    remote: "remote",
    country: "US",
    location: "",
    seniority: "3,4,5",
    minExperience: "",
    posted: "1",
    salary: "120000",
    h1b: "",
    limitations: "clearance",
    industry: "",
    excludedIndustry: "",
    skills: "",
    excludedSkills: "",
    roleType: "",
    companies: "",
    stage: "Early Stage,Growth Stage,Late Stage",
    staffing: "",
    excludedCompanies:
      "33808595\tRedis|6068905\tOracle|5181133\tMicrosoft|3252082\tGoogle|8579547\tAmazon|11908257\tAbnormal AI",
  };
}

function csvSet(value: string) {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function toggleCsv(value: string, option: string, order: string[]) {
  const next = csvSet(value);
  if (next.has(option)) next.delete(option);
  else next.add(option);
  return order.filter((item) => next.has(item)).join(",");
}

function pipeItems(value: string) {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function withPipe(value: string, item: string, limit: number) {
  const clean = item.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return value;
  const items = pipeItems(value);
  if (items.some((current) => current.toLowerCase() === clean.toLowerCase())) return value;
  if (items.length >= limit) return value;
  return [...items, clean].join("|");
}

function withoutPipe(value: string, item: string) {
  return pipeItems(value)
    .filter((current) => current !== item)
    .join("|");
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function Tip({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[11px] text-[var(--muted)]"
      title={text}
      aria-label={text}
    >
      ?
    </button>
  );
}

function ClearAll({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      className="text-sm text-[var(--muted)]"
      onClick={onClear}
    >
      Clear All
    </button>
  );
}

function Section({ title }: { title: string }) {
  return <h3 className="pt-2 text-lg font-semibold">{title}</h3>;
}

function Block({
  title,
  required,
  tip,
  clear,
  children,
}: {
  title: string;
  required?: boolean;
  tip?: string;
  clear?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 font-semibold">
          <span>
            {title}
            {required ? <span className="text-[var(--danger)]"> *</span> : null}
          </span>
          {tip ? <Tip text={tip} /> : null}
        </div>
        {clear ? <ClearAll onClear={clear} /> : null}
      </div>
      {children}
    </section>
  );
}

function ChoiceGrid({
  options,
  selected,
  mode,
  disabled,
  onToggle,
}: {
  options: { value: string; label: string; tip?: string }[];
  selected: Set<string>;
  mode: "check" | "radio";
  disabled: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 ${options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map((option) => {
        const on = selected.has(option.value);
        return (
          <label
            key={option.value}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
          >
            <input
              type={mode === "radio" ? "radio" : "checkbox"}
              className="h-4 w-4 accent-[var(--green)]"
              checked={on}
              disabled={disabled}
              onChange={() => onToggle(option.value)}
            />
            <span className="flex-1">{option.label}</span>
            {option.tip ? <Tip text={option.tip} /> : null}
          </label>
        );
      })}
    </div>
  );
}

function JobFunctionPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selected = parseJobFunctions(value);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ taxonomyId: string; title: string; category: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetch(`/api/scrape/titles?input=${encodeURIComponent(term)}`)
        .then(async (response) => {
          if (!response.ok) return { titles: [] };
          return (await response.json()) as {
            titles?: { taxonomyId: string; title: string; category: string }[];
          };
        })
        .then((data) => {
          if (!cancelled) setOptions(data.titles || []);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function choose(option: { taxonomyId: string; title: string }) {
    if (selected.some((item) => item.taxonomyId === option.taxonomyId)) return;
    if (selected.length >= 5) return;
    onChange(encodeJobFunctions([...selected, option]));
    setQuery("");
    setOptions([]);
    setOpen(false);
  }

  const choices = options.filter((option) => !selected.some((item) => item.taxonomyId === option.taxonomyId));
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-2">
      {selected.map((item) => (
        <div
          key={item.taxonomyId}
          className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--green)]"
            checked
            disabled={disabled}
            aria-label={item.title}
            onChange={() =>
              onChange(encodeJobFunctions(selected.filter((current) => current.taxonomyId !== item.taxonomyId)))
            }
          />
          <span className="flex-1">{item.title}</span>
          <button
            type="button"
            className="px-1 text-lg leading-none text-[var(--muted)]"
            aria-label={`Remove ${item.title}`}
            disabled={disabled}
            onClick={() =>
              onChange(encodeJobFunctions(selected.filter((current) => current.taxonomyId !== item.taxonomyId)))
            }
          >
            ×
          </button>
        </div>
      ))}
      {selected.length < 5 ? (
        <div ref={anchorRef} className="relative">
          <input
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
            value={query}
            disabled={disabled}
            placeholder="Search a job function"
            role="combobox"
            aria-expanded={open && choices.length > 0}
            aria-autocomplete="list"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && choices[0]) {
                event.preventDefault();
                choose(choices[0]);
              }
            }}
          />
          <FloatingMenu
            anchorRef={anchorRef}
            open={open && query.trim().length > 0 && choices.length > 0}
            onDismiss={() => setOpen(false)}
            className="overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-[0_12px_30px_rgba(48,36,20,0.12)]"
          >
            <ul role="listbox">
              {choices.map((option) => (
                <li key={option.taxonomyId}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--paper)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <span>{option.title}</span>
                    {option.category ? (
                      <span className="text-xs text-[var(--muted)]">{option.category}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </FloatingMenu>
        </div>
      ) : null}
    </div>
  );
}

function CompanyPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const selected = parseCompanies(value);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ companyId: string; companyName: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetch(`/api/scrape/companies?input=${encodeURIComponent(term)}`)
        .then(async (response) => {
          if (!response.ok) return { companies: [] };
          return (await response.json()) as {
            companies?: { companyId: string; companyName: string }[];
          };
        })
        .then((data) => {
          if (!cancelled) setOptions(data.companies || []);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function choose(option: { companyId: string; companyName: string }) {
    if (selected.some((item) => item.companyId === option.companyId)) return;
    if (selected.length >= 12) return;
    onChange(encodeCompanies([...selected, option]));
    setQuery("");
    setOptions([]);
    setOpen(false);
  }

  const choices = options.filter(
    (option) => !selected.some((item) => item.companyId === option.companyId),
  );
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-2">
      {selected.map((item) => (
        <div
          key={item.companyId}
          className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--green)]"
            checked
            disabled={disabled}
            aria-label={item.companyName}
            onChange={() =>
              onChange(
                encodeCompanies(selected.filter((current) => current.companyId !== item.companyId)),
              )
            }
          />
          <span className="flex-1">{item.companyName}</span>
          <button
            type="button"
            className="px-1 text-lg leading-none text-[var(--muted)]"
            aria-label={`Remove ${item.companyName}`}
            disabled={disabled}
            onClick={() =>
              onChange(
                encodeCompanies(selected.filter((current) => current.companyId !== item.companyId)),
              )
            }
          >
            ×
          </button>
        </div>
      ))}
      {selected.length < 12 ? (
        <div ref={anchorRef} className="relative">
          <input
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
            value={query}
            disabled={disabled}
            placeholder="Search a company to exclude"
            role="combobox"
            aria-expanded={open && choices.length > 0}
            aria-autocomplete="list"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter" && choices[0]) {
                event.preventDefault();
                choose(choices[0]);
              }
            }}
          />
          <FloatingMenu
            anchorRef={anchorRef}
            open={open && query.trim().length > 0 && choices.length > 0}
            onDismiss={() => setOpen(false)}
            className="overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-[0_12px_30px_rgba(48,36,20,0.12)]"
          >
            <ul role="listbox">
              {choices.map((option) => (
                <li key={option.companyId}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-start px-3 py-2 text-left text-sm hover:bg-[var(--paper)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    {option.companyName}
                  </button>
                </li>
              ))}
            </ul>
          </FloatingMenu>
        </div>
      ) : null}
    </div>
  );
}

function AddList({
  value,
  placeholder,
  limit,
  disabled,
  persistent,
  onChange,
}: {
  value: string;
  placeholder: string;
  limit: number;
  disabled: boolean;
  persistent?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const items = pipeItems(value);

  function commit() {
    const next = withPipe(value, draft, limit);
    onChange(next);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item}
          className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--green)]"
            checked
            disabled={disabled}
            aria-label={item}
            onChange={() => onChange(withoutPipe(value, item))}
          />
          <span className="flex-1">{item}</span>
          <button
            type="button"
            className="px-1 text-lg leading-none text-[var(--muted)]"
            aria-label={`Remove ${item}`}
            disabled={disabled}
            onClick={() => onChange(withoutPipe(value, item))}
          >
            ×
          </button>
        </div>
      ))}
      {adding || persistent ? (
        <div className={persistent ? "space-y-2" : "flex gap-2"}>
          <input
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
            value={draft}
            disabled={disabled}
            placeholder={placeholder}
            autoFocus={!persistent}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
          <button
            type="button"
            className={`rounded-xl border border-[var(--line)] bg-[var(--paper)] py-2.5 text-sm disabled:opacity-60 ${persistent ? "w-full" : "px-3"}`}
            disabled={disabled || !draft.trim() || items.length >= limit}
            onClick={commit}
          >
            + Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] py-2.5 text-sm disabled:opacity-60"
          disabled={disabled || items.length >= limit}
          onClick={() => setAdding(true)}
        >
          + Add
        </button>
      )}
    </div>
  );
}

function Collapse({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between font-semibold"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{title}</span>
        <span className="text-[var(--muted)]">{open ? "▴" : "▾"}</span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

function Switch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 text-sm text-[var(--muted)]"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
    >
      <span>{label}</span>
      <span className={`relative h-6 w-11 rounded-full ${on ? "bg-[var(--green)]" : "bg-[var(--line)]"}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--card)] ${on ? "left-5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

export function JobrightFilterForm({
  filters,
  disabled,
  requireJobFunction,
  onChange,
}: {
  filters: Record<string, string>;
  disabled: boolean;
  requireJobFunction: boolean;
  onChange: (id: string, value: string) => void;
}) {
  const country = COUNTRIES.find((item) => item.value === filters.country) || COUNTRIES[0];
  const seniority = csvSet(filters.seniority || "");
  const jobTypes = csvSet(filters.jobType || "");
  const models = csvSet(filters.remote || "");
  const stages = csvSet(filters.stage || "");
  const limits = csvSet(filters.limitations || "");
  const experienceOpen = !filters.minExperience;
  const [expMin, expMax] = (filters.minExperience || "0,11").split(",").map((item) => Number(item));
  const salaryOpen = !filters.salary || filters.salary === "0";
  const salary = salaryOpen ? 10000 : Number(filters.salary);

  return (
    <div className="filter-cascade space-y-3">
      <Section title="Basic Job Criteria" />
      <Block
        title="Job Function"
        required={requireJobFunction}
        tip="Search and choose a job function. Up to 5."
        clear={filters.keywords ? () => onChange("keywords", "") : undefined}
      >
        <JobFunctionPicker
          value={filters.keywords || ""}
          disabled={disabled}
          onChange={(value) => onChange("keywords", value)}
        />
      </Block>
      <Collapse title="Excluded Title">
        <AddList
          value={filters.excludedTitles || ""}
          placeholder="Enter a job title to exclude"
          limit={8}
          disabled={disabled}
          onChange={(value) => onChange("excludedTitles", value)}
        />
      </Collapse>
      <Block
        title="Job Type"
        clear={filters.jobType ? () => onChange("jobType", "") : undefined}
      >
        <ChoiceGrid
          options={JOB_TYPES}
          selected={jobTypes}
          mode="check"
          disabled={disabled}
          onToggle={(value) =>
            onChange("jobType", toggleCsv(filters.jobType || "", value, JOB_TYPES.map((item) => item.value)))
          }
        />
      </Block>
      <Block
        title="Work Model"
        clear={filters.remote ? () => onChange("remote", "") : undefined}
      >
        <ChoiceGrid
          options={WORK_MODELS}
          selected={models}
          mode="check"
          disabled={disabled}
          onToggle={(value) =>
            onChange(
              "remote",
              toggleCsv(filters.remote || "", value, WORK_MODELS.map((item) => item.value)),
            )
          }
        />
      </Block>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-semibold">
            Location<span className="text-[var(--danger)]"> *</span>
          </div>
          <label className="text-sm">
            <span className="sr-only">Country</span>
            <select
              className="rounded-lg border border-[var(--line)] bg-[var(--card)] py-1 pl-2 text-sm"
              value={country.value}
              disabled={disabled}
              onChange={(event) => onChange("country", event.target.value)}
            >
              {COUNTRIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.flag} {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AddList
          value={filters.location || ""}
          placeholder={country.anywhere}
          limit={8}
          persistent
          disabled={disabled}
          onChange={(value) => onChange("location", value)}
        />
      </section>
      <Block
        title="Experience Level"
        required
        clear={filters.seniority ? () => onChange("seniority", "") : undefined}
      >
        <ChoiceGrid
          options={SENIORITY}
          selected={seniority}
          mode="check"
          disabled={disabled}
          onToggle={(value) =>
            onChange(
              "seniority",
              toggleCsv(filters.seniority || "", value, SENIORITY.map((item) => item.value)),
            )
          }
        />
      </Block>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">Required Experience</div>
            <div className="text-sm text-[var(--muted)]">
              {experienceOpen ? "Any requirements" : `${expMin} - ${expMax} Years`}
            </div>
          </div>
          <Switch
            on={experienceOpen}
            label="Open to all"
            disabled={disabled}
            onToggle={() => onChange("minExperience", experienceOpen ? "0,11" : "")}
          />
        </div>
        <div className={`relative mt-4 h-8 ${experienceOpen ? "opacity-50" : ""}`}>
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-[var(--line)]" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--green)]"
            style={{
              left: `${(expMin / 11) * 100}%`,
              right: `${((11 - expMax) / 11) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={11}
            step={1}
            value={Number.isFinite(expMin) ? expMin : 0}
            disabled={disabled || experienceOpen}
            aria-label="Minimum years"
            className={rangeClass}
            style={{ zIndex: expMin >= expMax ? 4 : 2 }}
            onChange={(event) => {
              const next = Number(event.target.value);
              onChange("minExperience", `${Math.min(next, expMax)},${expMax}`);
            }}
          />
          <input
            type="range"
            min={0}
            max={11}
            step={1}
            value={Number.isFinite(expMax) ? expMax : 11}
            disabled={disabled || experienceOpen}
            aria-label="Maximum years"
            className={rangeClass}
            style={{ zIndex: 3 }}
            onChange={(event) => {
              const next = Number(event.target.value);
              onChange("minExperience", `${expMin},${Math.max(next, expMin)}`);
            }}
          />
        </div>
      </section>
      <Block
        title="Date Posted"
        clear={filters.posted ? () => onChange("posted", "") : undefined}
      >
        <ChoiceGrid
          options={POSTED}
          selected={new Set(filters.posted ? [filters.posted] : [])}
          mode="radio"
          disabled={disabled}
          onToggle={(value) => onChange("posted", value)}
        />
      </Block>

      <Section title="Compensation & Sponsorship" />
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">Minimum Annual Salary</div>
            <div className="text-sm text-[var(--muted)]">
              {salaryOpen ? "Any salary" : `${money(salary)}+`}
            </div>
          </div>
          <Switch
            on={salaryOpen}
            label="Open to all"
            disabled={disabled}
            onToggle={() => onChange("salary", salaryOpen ? "100000" : "0")}
          />
        </div>
        <div className={`relative mt-4 h-8 ${salaryOpen ? "opacity-50" : ""}`}>
          <input
            type="range"
            min={10000}
            max={800000}
            step={10000}
            value={Number.isFinite(salary) ? salary : 10000}
            disabled={disabled || salaryOpen}
            aria-label="Minimum annual salary"
            className="w-full accent-[var(--green)]"
            onChange={(event) => onChange("salary", event.target.value)}
          />
        </div>
      </section>
      <Block
        title="Work Authorization"
        tip='Keeps jobs that say "H1B Sponsored" or come from companies marked "H1B Sponsor Likely".'
      >
        <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--green)]"
            checked={filters.h1b === "only"}
            disabled={disabled}
            onChange={() => onChange("h1b", filters.h1b === "only" ? "" : "only")}
          />
          H1B sponsorship
        </label>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This filter helps you find jobs that either explicitly state H1B support
          (&quot;H1B Sponsored&quot;) or come from companies with a recent history of
          sponsoring H1B visas for similar roles (&quot;H1B Sponsor Likely&quot;).
        </p>
      </Block>
      <Block
        title="Exclude Jobs with Limitations"
        tip="Hide roles that have special work-authorization limits."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ["clearance", "Security Clearance Required"],
            ["citizen", "US Citizen Only"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--green)]"
                checked={limits.has(value)}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    "limitations",
                    toggleCsv(filters.limitations || "", value, ["clearance", "citizen"]),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      </Block>

      <Section title="Areas of Interests" />
      <Block
        title="Industry"
        clear={filters.industry ? () => onChange("industry", "") : undefined}
      >
        <AddList
          value={filters.industry || ""}
          placeholder="Add an industry"
          limit={12}
          disabled={disabled}
          onChange={(value) => onChange("industry", value)}
        />
      </Block>
      <Collapse title="Excluded Industry">
        <AddList
          value={filters.excludedIndustry || ""}
          placeholder="Add an industry to exclude"
          limit={12}
          disabled={disabled}
          onChange={(value) => onChange("excludedIndustry", value)}
        />
      </Collapse>
      <Block
        title="Skill"
        clear={filters.skills ? () => onChange("skills", "") : undefined}
      >
        <AddList
          value={filters.skills || ""}
          placeholder="Add a skill"
          limit={8}
          disabled={disabled}
          onChange={(value) => onChange("skills", value)}
        />
      </Block>
      <Collapse title="Excluded Skill">
        <AddList
          value={filters.excludedSkills || ""}
          placeholder="Add a skill to exclude"
          limit={8}
          disabled={disabled}
          onChange={(value) => onChange("excludedSkills", value)}
        />
      </Collapse>
      <Block
        title="Role Type"
        clear={filters.roleType ? () => onChange("roleType", "") : undefined}
      >
        <ChoiceGrid
          options={[
            { value: "IC", label: "IC" },
            { value: "Manager", label: "Manager" },
          ]}
          selected={new Set(filters.roleType ? [filters.roleType] : [])}
          mode="radio"
          disabled={disabled}
          onToggle={(value) => onChange("roleType", value)}
        />
      </Block>

      <Section title="Company Insights" />
      <Block
        title="Company"
        tip="Keep jobs whose company name matches one of these."
        clear={filters.companies ? () => onChange("companies", "") : undefined}
      >
        <AddList
          value={filters.companies || ""}
          placeholder="Add a company"
          limit={12}
          disabled={disabled}
          onChange={(value) => onChange("companies", value)}
        />
      </Block>
      <Block
        title="Company Stage"
        tip="Early is seed and Series A. Growth is Series B and C. Late is Series D and later. Public is a listed company."
        clear={filters.stage ? () => onChange("stage", "") : undefined}
      >
        <ChoiceGrid
          options={STAGES}
          selected={stages}
          mode="check"
          disabled={disabled}
          onToggle={(value) =>
            onChange("stage", toggleCsv(filters.stage || "", value, STAGES.map((item) => item.value)))
          }
        />
      </Block>
      <Block title="Job Source" tip="Skip roles posted by staffing and recruiting agencies.">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--green)]"
            checked={filters.staffing === "exclude"}
            disabled={disabled}
            onChange={() => onChange("staffing", filters.staffing === "exclude" ? "" : "exclude")}
          />
          Exclude Staffing Agency
        </label>
      </Block>
      <Block
        title="Exclude Company"
        clear={filters.excludedCompanies ? () => onChange("excludedCompanies", "") : undefined}
      >
        <CompanyPicker
          value={filters.excludedCompanies || ""}
          disabled={disabled}
          onChange={(value) => onChange("excludedCompanies", value)}
        />
      </Block>
    </div>
  );
}
