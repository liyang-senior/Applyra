import { request as httpsRequest } from "node:https";
import { parseCompanies } from "@/lib/scrape/companies";
import { isLinkedInJobLink, jobDedupeKey } from "@/lib/scrape/dedupe";
import { parseJobFunctions } from "@/lib/scrape/job-functions";

const API_BASE = "https://swan-api.jobright.ai";
const LOGIN_URL = `${API_BASE}/swan/auth/login/pwd`;
const SEARCH_URL = `${API_BASE}/swan/recommend/search`;
const RECOMMEND_URL = `${API_BASE}/swan/recommend/list/jobs`;
const PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 10;
const MAX_PAGES = 200;
const MAX_SKILLS = 8;

const WORK_MODELS: Record<string, number> = {
  onsite: 1,
  remote: 2,
  hybrid: 3,
};

const POSTED_DAYS: Record<string, number> = {
  "1": 1,
  "3": 3,
  "7": 7,
  "24": 24,
  "30": 30,
};

const SENIORITY = new Set(["1", "2", "3", "4", "5", "6"]);
const JOB_TYPES = new Set(["1", "2", "3", "4"]);
const COUNTRIES = new Set(["US", "CA", "GB", "AU", "IE", "NZ"]);
const COUNTRY_PLACES: Record<string, string[]> = {
  CA: ["canada"],
  GB: ["united kingdom", "england", "scotland", "wales"],
  AU: ["australia"],
  IE: ["ireland"],
  NZ: ["new zealand"],
};
const COMPANY_STAGES = new Set([
  "Early Stage",
  "Growth Stage",
  "Late Stage",
  "Public",
]);
const ROLE_TYPES = new Set(["IC", "Manager"]);
const SALARY_MIN = 10000;
const SALARY_MAX = 800000;
const SALARY_STEP = 10000;
const RADII = new Set([10, 25, 50, 100]);

export type ScrapedJobDraft = {
  jobTitle: string;
  companyName: string;
  jobLink: string;
  dedupeKey: string;
  matchScore: number | null;
  postedAt: string | null;
};

export type JobrightFilters = {
  keywords: string;
  remote?: string;
  posted?: string;
  location?: string;
  seniority?: string;
  jobType?: string;
  limitations?: string;
  skills?: string;
  country?: string;
  radius?: string;
  salary?: string;
  stage?: string;
  h1b?: string;
  staffing?: string;
  roleType?: string;
  minExperience?: string;
  excludedSkills?: string;
  excludedTitles?: string;
  companies?: string;
  excludedCompanies?: string;
  industry?: string;
  excludedIndustry?: string;
};

export type JobrightAuth =
  | { method: "password"; email: string; password: string }
  | { method: "token"; token: string };

function textList(value: string, limit: number) {
  const parts = value.includes("|") ? value.split("|") : value.split(/[,;\n]/);
  const items: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const item = part.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item.slice(0, 200));
    if (items.length >= limit) break;
  }
  return items;
}

function pipeList(value: string, limit: number) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split("|")) {
    const item = part.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item.slice(0, 200));
    if (items.length >= limit) break;
  }
  return items;
}

function splitList(value: string, limit: number) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(/[,;\n]/)) {
    const item = part.trim().replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item.slice(0, 200));
    if (items.length >= limit) break;
  }
  return items;
}

function readScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(score) || score < 0) return null;
  const percent = score <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function readPostedAt(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = Date.parse(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function readJob(row: unknown): ScrapedJobDraft | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as {
    displayScore?: unknown;
    jobResult?: Record<string, unknown>;
    companyResult?: Record<string, unknown>;
  };
  const job = raw.jobResult || {};
  const company = raw.companyResult || {};
  const jobTitle = String(job.jobTitle || "").trim();
  const companyName = String(
    company.companyName || job.userCompanyName || "",
  ).trim();
  const jobId = String(job.jobId || "").trim();
  const externalLinks = [job.applyLink, job.url]
    .map((value) => String(value || "").trim())
    .filter((value) => /^https?:\/\//i.test(value));
  if (externalLinks.length > 0 && externalLinks.every((value) => isLinkedInJobLink(value))) {
    return null;
  }
  let jobLink = externalLinks.find((value) => !isLinkedInJobLink(value)) || "";
  if (!jobLink && /^[\w-]+$/.test(jobId)) {
    jobLink = `https://jobright.ai/jobs/info/${jobId}`;
  }
  if (!jobTitle || !companyName) return null;
  if (!/^https?:\/\//i.test(jobLink) || isLinkedInJobLink(jobLink)) return null;
  return {
    jobTitle,
    companyName,
    jobLink: jobLink.slice(0, 2000),
    dedupeKey: jobDedupeKey(jobTitle, companyName),
    matchScore: readScore(raw.displayScore ?? job.displayScore),
    postedAt: readPostedAt(job.publishTime),
  };
}

function chosen(value: string | undefined, allowed: Set<string>) {
  return splitList(value || "", 12).filter((item) => allowed.has(item));
}

function salaryMinimum(value: string | undefined) {
  const salary = Number(value || 0);
  if (!Number.isFinite(salary) || salary < SALARY_MIN || salary > SALARY_MAX) return 0;
  if (salary % SALARY_STEP !== 0) return 0;
  return salary;
}

function experienceRange(value: string | undefined): [number, number] | null {
  if (!value || value === "any") return null;
  const [rawMin, rawMax] = value.split(",");
  const min = Number(rawMin);
  const max = rawMax === undefined || rawMax === "" ? 11 : Number(rawMax);
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  if (min < 0 || max > 11 || min > max) return null;
  return [min, max];
}

function searchBody(filters: JobrightFilters) {
  const country = COUNTRIES.has(filters.country || "") ? filters.country : "US";
  const functions = parseJobFunctions(filters.keywords);
  const workModel = chosen(filters.remote, new Set(Object.keys(WORK_MODELS)))
    .map((item) => WORK_MODELS[item])
    .filter((item) => item !== undefined);
  const seniority = chosen(filters.seniority, SENIORITY).map(Number);
  const jobTypes = chosen(filters.jobType, JOB_TYPES).map(Number);
  const companies = parseCompanies(filters.companies || "").map((item) => ({
    companyId: item.companyId,
    companyName: item.companyName,
  }));
  const body: Record<string, unknown> = {
    jobTitle: functions.map((item) => item.title.replace(/,/g, " ")).join(", "),
    country,
    jobTaxonomyList: functions.map((item) => ({
      taxonomyId: "00-00-00",
      title: item.title,
    })),
    locations: [],
    companies,
    jobTypes,
    seniority,
    workModel,
  };
  const excludedCompanies = parseCompanies(filters.excludedCompanies || "");
  if (excludedCompanies.length > 0) {
    body.excludedCompanies = excludedCompanies.map((item) => ({
      companyId: item.companyId,
      companyName: item.companyName,
    }));
  }
  const daysAgo = POSTED_DAYS[filters.posted || ""];
  if (daysAgo) body.daysAgo = daysAgo;
  const skills = textList(filters.skills || "", MAX_SKILLS);
  if (skills.length > 0) body.skills = skills;
  const excludedSkills = textList(filters.excludedSkills || "", MAX_SKILLS);
  if (excludedSkills.length > 0) body.excludedSkills = excludedSkills;
  const excludedTitles = textList(filters.excludedTitles || "", MAX_SKILLS);
  if (excludedTitles.length > 0) body.excludedTitle = excludedTitles;
  const salary = salaryMinimum(filters.salary);
  if (salary > 0) body.annualSalaryMinimum = salary;
  const limitations = chosen(
    filters.limitations,
    new Set(["clearance", "citizen"]),
  );
  if (limitations.includes("clearance")) body.excludeSecurityClearance = true;
  if (limitations.includes("citizen")) body.excludeUsCitizen = true;
  if (filters.h1b === "only") body.isH1BOnly = true;
  if (filters.staffing === "exclude") body.excludeStaffingAgency = true;
  const stages = chosen(filters.stage, COMPANY_STAGES);
  if (stages.length > 0) body.companyStages = stages;
  if (filters.roleType && ROLE_TYPES.has(filters.roleType)) {
    body.roleType = filters.roleType;
  }
  const years = experienceRange(filters.minExperience);
  if (years) body.minYearsOfExperienceRange = years;
  const cities = pipeList(filters.location || "", 8);
  const radius = RADII.has(Number(filters.radius)) ? Number(filters.radius) : 25;
  if (cities.length > 0) {
    body.city = cities[0];
    body.radiusRange = radius;
    body.locations = cities.map((city) => ({ city, radiusRange: radius }));
  }
  return body;
}

function stoppedError() {
  const error = new Error("Scrape stopped.");
  error.name = "ScrapeStopped";
  return error;
}

function isStopped(error: unknown) {
  return error instanceof Error && error.name === "ScrapeStopped";
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(stoppedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(stoppedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function requestJson(
  url: URL,
  init: {
    method: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    failure: string;
    signal?: AbortSignal;
  },
) {
  const payload = init.body === undefined ? "" : JSON.stringify(init.body);
  return new Promise<{
    status: number;
    json: unknown;
    setCookie: string[];
  }>((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Origin: "https://jobright.ai",
      Referer: "https://jobright.ai/jobs/recommend",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ...init.headers,
    };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    if (init.signal?.aborted) {
      reject(stoppedError());
      return;
    }
    const req = httpsRequest(
      url,
      { method: init.method, headers, timeout: 25000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const raw = res.headers["set-cookie"];
          const setCookie = Array.isArray(raw) ? raw : raw ? [raw] : [];
          try {
            resolve({
              status: res.statusCode || 0,
              json: text ? (JSON.parse(text) as unknown) : null,
              setCookie,
            });
          } catch {
            reject(new Error(init.failure));
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(init.failure));
    });
    req.on("error", (error) => {
      reject(isStopped(error) ? error : new Error(init.failure));
    });
    const onAbort = () => req.destroy(stoppedError());
    init.signal?.addEventListener("abort", onAbort, { once: true });
    req.on("close", () => init.signal?.removeEventListener("abort", onAbort));
    if (payload) req.write(payload);
    req.end();
  });
}

function sessionFromCookies(setCookie: string[]) {
  for (const item of setCookie) {
    const match = /^SESSION_ID=([^;]+)/i.exec(item);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return "";
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanToken(value: string) {
  const compact = value.replace(/^cookie:\s*/i, "").replace(/\s+/g, "");
  const named = /SESSION_ID=([^;]+)/i.exec(compact);
  const token = decodeCookieValue(named?.[1] || compact);
  if (token.length < 8 || token.length > 8000 || !/^[\w.~+/=-]+$/.test(token)) {
    throw new Error("Paste the Jobright Cookie header. It needs a SESSION_ID value.");
  }
  return token;
}

async function loginJobright(email: string, password: string) {
  const { status, json, setCookie } = await requestJson(new URL(LOGIN_URL), {
    method: "POST",
    body: { email, password },
    failure: "Jobright sign-in failed. Try again.",
  });
  const data = json as { success?: boolean; errorMsg?: string };
  const sessionId = sessionFromCookies(setCookie);
  if (sessionId) return sessionId;
  if (status === 401 || status === 400 || data.success === false) {
    throw new Error("Jobright email or password is incorrect.");
  }
  throw new Error("Jobright sign-in failed. Try again.");
}

export function parseJobrightAuth(input: unknown): JobrightAuth {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  if (String(raw.method || "password") === "token") {
    return { method: "token", token: cleanToken(String(raw.token || "")) };
  }
  const email = String(raw.email || "").trim().slice(0, 254);
  const password = String(raw.password || "");
  if (!email || !email.includes("@")) {
    throw new Error("Enter the Jobright email address.");
  }
  if (password.length < 1 || password.length > 200) {
    throw new Error("Enter the Jobright password.");
  }
  return { method: "password", email, password };
}

export async function resolveJobrightSession(auth: JobrightAuth) {
  if (auth.method === "token") return auth.token;
  return loginJobright(auth.email, auth.password);
}

export async function verifyJobrightLogin(auth: JobrightAuth) {
  const sessionId = await resolveJobrightSession(auth);
  const url = new URL(RECOMMEND_URL);
  url.searchParams.set("position", "0");
  url.searchParams.set("count", "1");
  const { status, json } = await requestJson(url, {
    method: "GET",
    headers: { Cookie: `SESSION_ID=${sessionId}` },
    failure: "Jobright sign-in failed. Try again.",
  });
  const data = json as { success?: boolean };
  if (status === 401 || status === 403 || data.success === false) {
    throw new Error(
      "Jobright rejected that sign-in. Check the email and password, or paste a current Cookie header.",
    );
  }
  if (status < 200 || status >= 300) {
    throw new Error("Jobright sign-in failed. Try again.");
  }
}

function jobrightProblem(
  label: string,
  status: number,
  data: { errorCode?: number | string; errorMsg?: string },
) {
  const parts = [`HTTP ${status || 0}`];
  if (data.errorCode !== undefined && data.errorCode !== null && data.errorCode !== "") {
    parts.push(`code ${data.errorCode}`);
  }
  if (data.errorMsg) parts.push(data.errorMsg);
  return `${label} (${parts.join(", ")}).`;
}

export type SuggestedJobTitle = {
  taxonomyId: string;
  title: string;
  category: string;
};

export async function suggestJobTitles(input: string): Promise<SuggestedJobTitle[]> {
  const query = input.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!query) return [];
  const { status, json } = await requestJson(
    new URL(`${API_BASE}/swan/filter/suggestion/titles-v3`),
    {
      method: "POST",
      body: { input: query },
      failure: "Job function search failed. Try again.",
    },
  );
  const data = json as { success?: boolean; result?: unknown };
  if (status < 200 || status >= 300 || data.success === false || !Array.isArray(data.result)) {
    throw new Error("Job function search failed. Try again.");
  }
  const items: SuggestedJobTitle[] = [];
  const seen = new Set<string>();
  for (const row of data.result) {
    if (!row || typeof row !== "object") continue;
    const raw = row as { taxonomyId?: unknown; title?: unknown; secondCategory?: unknown };
    const taxonomyId = String(raw.taxonomyId || "");
    const title = String(raw.title || "").trim().replace(/\s+/g, " ");
    if (!/^\d{2}-\d{2}-\d{2}$/.test(taxonomyId) || !title || seen.has(taxonomyId)) continue;
    seen.add(taxonomyId);
    items.push({
      taxonomyId,
      title: title.slice(0, 80),
      category: String(raw.secondCategory || "").trim().slice(0, 80),
    });
    if (items.length >= 8) break;
  }
  return items;
}

export type SuggestedCompany = {
  companyId: string;
  companyName: string;
};

export async function suggestCompanies(input: string): Promise<SuggestedCompany[]> {
  const query = input.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!query) return [];
  const { status, json } = await requestJson(
    new URL(`${API_BASE}/swan/filter/suggestion/companies`),
    {
      method: "POST",
      body: { input: query },
      failure: "Company search failed. Try again.",
    },
  );
  const data = json as { success?: boolean; result?: unknown };
  if (status < 200 || status >= 300 || data.success === false || !Array.isArray(data.result)) {
    throw new Error("Company search failed. Try again.");
  }
  const items: SuggestedCompany[] = [];
  const seen = new Set<string>();
  for (const row of data.result) {
    if (!row || typeof row !== "object") continue;
    const raw = row as { companyId?: unknown; companyName?: unknown };
    const companyId = String(raw.companyId || "");
    const companyName = String(raw.companyName || "").trim().replace(/\s+/g, " ");
    if (!/^\d{3,20}$/.test(companyId) || !companyName || seen.has(companyId)) continue;
    seen.add(companyId);
    items.push({ companyId, companyName: companyName.slice(0, 120) });
    if (items.length >= 8) break;
  }
  return items;
}

async function fetchPage(
  filters: JobrightFilters,
  position: number,
  sessionId: string,
  signal?: AbortSignal,
) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("searchType", "job_title");
  url.searchParams.set("refresh", position === 0 ? "true" : "false");
  url.searchParams.set("count", String(SEARCH_PAGE_SIZE));
  url.searchParams.set("position", String(position));
  url.searchParams.set("sortCondition", "0");

  const { status, json } = await requestJson(url, {
    method: "POST",
    body: {
      ...searchBody(filters),
      searchType: "job_title",
      refresh: position === 0,
      count: SEARCH_PAGE_SIZE,
      position,
      sortCondition: 0,
    },
    headers: {
      Referer: "https://jobright.ai/jobs",
      Cookie: `SESSION_ID=${sessionId}`,
    },
    failure: "Jobright search failed. Try again.",
    signal,
  });
  const data = json as {
    success?: boolean;
    errorCode?: number | string;
    errorMsg?: string;
    result?: { jobList?: unknown[]; jobNum?: number };
  };
  if (status === 401 || status === 403) {
    const error = new Error(
      status === 401
        ? "Jobright rejected that sign-in. Check the email and password, or paste a current Cookie header."
        : jobrightProblem("Jobright blocked the request", status, data),
    );
    error.name = status === 401 ? "JobrightRejected" : "JobrightBlocked";
    throw error;
  }
  if (status < 200 || status >= 300 || data.success === false) {
    const error = new Error(jobrightProblem("Jobright search failed", status, data));
    if (status === 400) error.name = "JobrightPageEnd";
    throw error;
  }
  const total = Number(data.result?.jobNum);
  return {
    rows: Array.isArray(data.result?.jobList) ? data.result.jobList : [],
    total: Number.isFinite(total) && total > 0 ? total : null,
  };
}

export function parseJobrightFilters(
  input: unknown,
  options?: { requireKeywords?: boolean },
): JobrightFilters {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const keywords = String(raw.keywords || "").trim();
  const requireKeywords = options?.requireKeywords !== false;
  const functions = parseJobFunctions(keywords);
  if (requireKeywords && functions.length === 0) {
    throw new Error("Enter a job function from the list.");
  }
  return {
    keywords,
    remote: String(raw.remote || "any"),
    posted: String(raw.posted || "any"),
    location: String(raw.location || ""),
    seniority: String(raw.seniority || ""),
    jobType: String(raw.jobType || ""),
    skills: String(raw.skills || ""),
    country: COUNTRIES.has(String(raw.country || "")) ? String(raw.country) : "US",
    radius: String(raw.radius || "25"),
    salary: String(raw.salary || "0"),
    stage: String(raw.stage || ""),
    limitations: String(raw.limitations || ""),
    h1b: String(raw.h1b || "any"),
    staffing: String(raw.staffing || "any"),
    roleType: String(raw.roleType || "any"),
    minExperience: String(raw.minExperience || "any"),
    excludedSkills: String(raw.excludedSkills || ""),
    excludedTitles: String(raw.excludedTitles || ""),
    companies: String(raw.companies || ""),
    excludedCompanies: String(raw.excludedCompanies || ""),
    industry: String(raw.industry || ""),
    excludedIndustry: String(raw.excludedIndustry || ""),
  };
}

export async function searchJobright(
  filters: JobrightFilters,
  auth: JobrightAuth,
  signal?: AbortSignal,
): Promise<ScrapedJobDraft[]> {
  const sessionId = await resolveJobrightSession(auth);
  const jobs: ScrapedJobDraft[] = [];
  const seen = new Set<string>();
  let position = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (signal?.aborted) break;
    if (page > 0) {
      try {
        await delay(300, signal);
      } catch (error) {
        if (isStopped(error)) break;
        throw error;
      }
    }
    let pageResult: { rows: unknown[]; total: number | null };
    try {
      pageResult = await fetchPage(filters, position, sessionId, signal);
    } catch (error) {
      if (isStopped(error)) break;
      if (
        page > 0 &&
        error instanceof Error &&
        (error.name === "JobrightPageEnd" ||
          error.name === "JobrightBlocked" ||
          error.name === "JobrightRejected")
      ) {
        break;
      }
      throw error;
    }
    for (const row of pageResult.rows) {
      if (!matchesCompanyText(row, filters)) continue;
      const job = readJob(row);
      if (!job || seen.has(job.dedupeKey)) continue;
      seen.add(job.dedupeKey);
      jobs.push(job);
    }
    position += pageResult.rows.length;
    if (pageResult.rows.length < SEARCH_PAGE_SIZE) break;
    if (pageResult.total !== null && position >= pageResult.total) break;
  }

  return jobs;
}

const SENIORITY_WORDS: Record<string, string[]> = {
  "1": ["new grad", "intern"],
  "2": ["entry"],
  "3": ["mid"],
  "4": ["senior"],
  "5": ["lead", "staff"],
  "6": ["director", "executive"],
};

const JOB_TYPE_WORDS: Record<string, string[]> = {
  "1": ["full"],
  "2": ["contract"],
  "3": ["part"],
  "4": ["intern"],
};

function includesWord(haystack: string, words: string[]) {
  return words.some((word) => haystack.includes(word));
}

function jobText(job: Record<string, unknown>) {
  return [
    job.jobTitle,
    job.jobSummary,
    job.requirements,
    job.coreResponsibilities,
    job.jobTags,
    job.recommendationTags,
    job.h1BStatus,
  ]
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item || "")))
    .join(" ")
    .toLowerCase();
}

function annualFloor(job: Record<string, unknown>) {
  const sources = [job.salaryDesc, job.jobSummary]
    .map((item) => String(item || ""))
    .filter(Boolean);
  const amounts: number[] = [];
  for (const source of sources) {
    if (/\b(hr|hour|hourly)\b/i.test(source)) continue;
    const matches = source.match(/\$\s?\d[\d,]*(?:\.\d+)?\s*[kK]?/g) || [];
    for (const raw of matches) {
      const thousands = /k/i.test(raw);
      const num = Number(raw.replace(/[$,\s]/g, "").replace(/k/i, ""));
      if (!Number.isFinite(num) || num <= 0) continue;
      const annual = thousands || num < 1000 ? num * 1000 : num;
      if (annual >= 10000) amounts.push(annual);
    }
    if (amounts.length > 0) break;
  }
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

function listHits(value: string, haystack: string) {
  const items = textList(value, 12).map((item) => item.toLowerCase());
  if (items.length === 0) return null;
  return items.some((item) => haystack.includes(item));
}

function matchesCompanyText(row: unknown, filters: JobrightFilters) {
  if (!row || typeof row !== "object") return false;
  const raw = row as {
    companyResult?: Record<string, unknown>;
  };
  const company = raw.companyResult || {};
  const name = String(company.companyName || "").toLowerCase();
  const categories = `${String(company.companyCategories || "")} ${String(company.gptShortDescription || "")}`.toLowerCase();
  const wantedCompanies = listHits(filters.companies || "", name);
  if (wantedCompanies === false) return false;
  const blockedCompanies = parseCompanies(filters.excludedCompanies || "");
  if (
    blockedCompanies.length > 0
      ? blockedCompanies.some((item) => name.includes(item.companyName.toLowerCase()))
      : listHits(filters.excludedCompanies || "", name) === true
  ) {
    return false;
  }
  const wantedIndustry = listHits(filters.industry || "", categories);
  if (wantedIndustry === false) return false;
  const blockedIndustry = listHits(filters.excludedIndustry || "", categories);
  if (blockedIndustry === true) return false;
  return true;
}

function matchesRecommended(row: unknown, filters: JobrightFilters) {
  if (!row || typeof row !== "object") return false;
  const raw = row as {
    jobResult?: Record<string, unknown>;
    companyResult?: Record<string, unknown>;
  };
  const job = raw.jobResult || {};
  const company = raw.companyResult || {};
  const title = String(job.jobTitle || "").toLowerCase();
  const keywords = parseJobFunctions(filters.keywords || "").map((item) => item.title.toLowerCase());
  if (keywords.length > 0 && !keywords.some((word) => title.includes(word))) {
    return false;
  }
  const workModel = String(job.workModel || "").toLowerCase();
  const models = chosen(filters.remote, new Set(Object.keys(WORK_MODELS)));
  if (models.length > 0) {
    const matchesModel = models.some((model) => {
      if (model === "remote") return workModel.includes("remote");
      if (model === "hybrid") return workModel.includes("hybrid");
      return workModel.includes("onsite") || workModel.includes("on-site");
    });
    if (!matchesModel) return false;
  }
  const postedDays = POSTED_DAYS[filters.posted || ""];
  if (postedDays) {
    const published = Date.parse(String(job.publishTime || "").replace(" ", "T") + "Z");
    if (Number.isFinite(published) && Date.now() - published > postedDays * 86400000) {
      return false;
    }
  }
  const seniority = String(job.jobSeniority || "").toLowerCase();
  const seniorityWords = chosen(filters.seniority, SENIORITY).flatMap(
    (level) => SENIORITY_WORDS[level] || [],
  );
  if (seniorityWords.length > 0 && seniority && !includesWord(seniority, seniorityWords)) {
    return false;
  }
  const employment = String(job.employmentType || "").toLowerCase();
  const typeWords = chosen(filters.jobType, JOB_TYPES).flatMap(
    (type) => JOB_TYPE_WORDS[type] || [],
  );
  if (typeWords.length > 0 && employment && !includesWord(employment, typeWords)) return false;
  const text = jobText(job);
  const skills = textList(filters.skills || "", MAX_SKILLS).map((skill) => skill.toLowerCase());
  if (skills.length > 0 && !skills.some((skill) => text.includes(skill))) return false;
  const excludedSkills = textList(filters.excludedSkills || "", MAX_SKILLS).map((skill) =>
    skill.toLowerCase(),
  );
  if (excludedSkills.some((skill) => text.includes(skill))) return false;
  const excludedTitles = textList(filters.excludedTitles || "", MAX_SKILLS).map((item) =>
    item.toLowerCase(),
  );
  if (excludedTitles.some((item) => title.includes(item))) return false;
  const cities = pipeList(filters.location || "", 8).map((city) => city.toLowerCase());
  const places = `${String(job.jobLocation || "")} ${JSON.stringify(job.jobLocations || "")}`.toLowerCase();
  if (cities.length > 0 && !cities.some((city) => places.includes(city))) return false;
  const countryPlaces = COUNTRY_PLACES[filters.country || ""];
  if (countryPlaces && !countryPlaces.some((place) => places.includes(place))) return false;
  const salary = salaryMinimum(filters.salary);
  if (salary > 0) {
    const floor = annualFloor(job);
    if (floor === null || floor < salary) return false;
  }
  const stages = chosen(filters.stage, COMPANY_STAGES);
  if (stages.length > 0) {
    const stage = String(company.fundraisingCurrentStage || "").toLowerCase();
    if (!stage) return false;
    const matchesStage = stages.some((wanted) => {
      const value = wanted.toLowerCase();
      return value === "public" ? stage.includes("public") : stage === value;
    });
    if (!matchesStage) return false;
  }
  const limitations = chosen(filters.limitations, new Set(["clearance", "citizen"]));
  if (limitations.includes("clearance") && /security clearance|clearance required|ts\/sci|top secret/.test(text)) {
    return false;
  }
  if (
    limitations.includes("citizen") &&
    /citizen only|only\s+(u\.?s\.?|us)\s+citizens|must be (a |an )?(u\.?s\.?|us) citizen/.test(text)
  ) {
    return false;
  }
  if (filters.h1b === "only") {
    const sponsorship = `${String(job.h1BStatus || "")} ${JSON.stringify(job.recommendationTags || "")}`.toLowerCase();
    if (/no h1b|no sponsorship|not sponsor/.test(sponsorship)) return false;
    if (!/h1b|sponsor/.test(sponsorship)) return false;
  }
  if (filters.staffing === "exclude") {
    const agency = `${String(company.companyName || "")} ${String(company.companyCategories || "")} ${String(company.gptShortDescription || "")} ${JSON.stringify(company.companyRecommendationTags || "")}`.toLowerCase();
    if (/staffing|recruiting agency|talent solutions/.test(agency)) return false;
  }
  if (filters.roleType === "Manager" || filters.roleType === "IC") {
    const manager = /\b(manager|director|head of|vp|vice president|chief)\b/.test(title);
    if (filters.roleType === "Manager" && !manager) return false;
    if (filters.roleType === "IC" && manager) return false;
  }
  const years = experienceRange(filters.minExperience);
  if (years) {
    const required = Number(job.minYearsOfExperience);
    if (!Number.isFinite(required) || required < years[0] || required > years[1]) return false;
  }
  if (!matchesCompanyText(row, filters)) return false;
  return true;
}

async function fetchRecommendedPage(
  sessionId: string,
  position: number,
  refresh: boolean,
  signal?: AbortSignal,
) {
  const url = new URL(RECOMMEND_URL);
  url.searchParams.set("refresh", refresh ? "true" : "false");
  url.searchParams.set("sortCondition", "0");
  url.searchParams.set("position", String(position));
  url.searchParams.set("count", String(PAGE_SIZE));
  const { status, json } = await requestJson(url, {
    method: "GET",
    headers: { Cookie: `SESSION_ID=${sessionId}` },
    failure: "Jobright recommendations failed. Try again.",
    signal,
  });
  const data = json as {
    success?: boolean;
    errorCode?: number | string;
    errorMsg?: string;
    result?: { jobList?: unknown[] };
  };
  if (status === 401 || status === 403) {
    const error = new Error(
      status === 401
        ? "Jobright rejected that sign-in. Check the email and password, or paste a current Cookie header."
        : jobrightProblem("Jobright blocked the request", status, data),
    );
    error.name = status === 401 ? "JobrightRejected" : "JobrightBlocked";
    throw error;
  }
  if (status < 200 || status >= 300 || data.success === false) {
    const error = new Error(jobrightProblem("Jobright recommendations failed", status, data));
    if (status === 400) error.name = "JobrightPageEnd";
    throw error;
  }
  return Array.isArray(data.result?.jobList) ? data.result.jobList : [];
}

export async function recommendJobright(
  _filters: JobrightFilters,
  auth: JobrightAuth,
  signal?: AbortSignal,
): Promise<ScrapedJobDraft[]> {
  const sessionId = await resolveJobrightSession(auth);
  const jobs: ScrapedJobDraft[] = [];
  const seen = new Set<string>();
  let position = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (signal?.aborted) break;
    if (page > 0) {
      try {
        await delay(300, signal);
      } catch (error) {
        if (isStopped(error)) break;
        throw error;
      }
    }
    let rows: unknown[];
    try {
      rows = await fetchRecommendedPage(sessionId, position, position === 0, signal);
    } catch (error) {
      if (isStopped(error)) break;
      if (
        page > 0 &&
        error instanceof Error &&
        (error.name === "JobrightPageEnd" ||
          error.name === "JobrightBlocked" ||
          error.name === "JobrightRejected")
      ) {
        break;
      }
      throw error;
    }
    for (const row of rows) {
      const job = readJob(row);
      if (!job || seen.has(job.dedupeKey)) continue;
      seen.add(job.dedupeKey);
      jobs.push(job);
    }
    if (rows.length < PAGE_SIZE) break;
    position += rows.length;
  }

  return jobs;
}
