import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccount } from "@/lib/server/auth";
import { getHistoryById } from "@/lib/history";
import { getResumeProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resume",
};

type ResumeJson = {
  title?: string;
  summary?: string | string[];
  skills?: string[] | Record<string, string[]>;
  experience?: Array<{
    company?: string;
    title?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    base_bullets?: string[];
    details?: string[];
  }>;
  education?: Array<{
    degree?: string;
    school?: string;
    start_year?: string;
    end_year?: string;
  }>;
  certifications?: string[];
};

function asLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function skillLines(skills: ResumeJson["skills"]) {
  if (!skills) return [];
  if (Array.isArray(skills)) {
    const lines = skills.map((item) => String(item || "").trim()).filter(Boolean);
    return lines.length ? [{ label: "Skills", text: lines.join(", ") }] : [];
  }
  return Object.entries(skills)
    .map(([label, lines]) => ({
      label,
      text: (Array.isArray(lines) ? lines : [String(lines || "")])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join(", "),
    }))
    .filter((block) => block.text.length > 0);
}

function withPeriod(value: string) {
  const text = value.trim();
  if (!text) return text;
  if (/[.!?]$/.test(text)) return text.replace(/\.{2,}$/, ".");
  return `${text}.`;
}

function fullerText(left: string[], right: string[]) {
  const size = (rows: string[]) => rows.join(" ").trim().length;
  if (size(left) >= size(right)) return left;
  return right;
}

export default async function HistoryResumePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentAccount();
  if (!user) redirect("/signin");

  const { id } = await params;
  const record = await getHistoryById(id, user);
  if (!record) notFound();
  if (!record.resumeJson) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl">
          Resume
        </h1>
        <p className="mt-3 text-[#c9ddd2]">
          No resume was saved for this history item yet.
        </p>
      </main>
    );
  }

  const resume = record.resumeJson as ResumeJson;
  const profile = record.profileId
    ? await getResumeProfile(record.profileId)
    : null;
  const contact = profile?.data;
  const summary = asLines(resume.summary).map(withPeriod);
  const skills = skillLines(resume.skills);
  const experience = Array.isArray(resume.experience) ? resume.experience : [];
  const profileJobs = Array.isArray(contact?.experience) ? contact.experience : [];
  const education = Array.isArray(resume.education) ? resume.education : [];
  const certifications = asLines(resume.certifications);

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#f7fbf8] px-4 py-10 text-[var(--ink)]">
      <div className="mb-8 border-b border-[var(--line)] pb-6">
        <p className="text-sm text-[var(--muted)]">
          {record.companyName || "Company"}
          {record.jobTitle ? ` · ${record.jobTitle}` : ""}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-4xl tracking-tight">
          {contact?.name || "Resume"}
        </h1>
        <p className="mt-1 text-lg text-[var(--muted)]">
          {resume.title || contact?.title || ""}
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {[contact?.email, contact?.phone, contact?.location, contact?.linkedin]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {summary.length ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Summary
          </h2>
          <div className="space-y-2 text-sm leading-relaxed">
            {summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
      ) : null}

      {skills.length ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Skills
          </h2>
          <div className="space-y-2 text-sm leading-relaxed">
            {skills.map((block) => (
              <p key={block.label}>
                <span className="font-medium">{block.label} : </span>
                {block.text}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {experience.length ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Experience
          </h2>
          <div className="space-y-5">
            {experience.map((job, index) => {
              const saved = asLines(job.details);
              const original = asLines(
                job.base_bullets || profileJobs[index]?.base_bullets,
              );
              const bullets = fullerText(saved, original).map(withPeriod);
              return (
                <div key={`${job.company}-${job.title}-${index}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {job.title || "Role"}
                      {job.company ? ` · ${job.company}` : ""}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {[job.start_date, job.end_date].filter(Boolean).join(" – ")}
                    </p>
                  </div>
                  {job.location ? (
                    <p className="text-xs text-[var(--muted)]">{job.location}</p>
                  ) : null}
                  {bullets.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                      {bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {education.length ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Education
          </h2>
          <div className="space-y-3 text-sm">
            {education.map((edu, index) => (
              <div key={`${edu.school}-${edu.degree}-${index}`}>
                <p className="font-medium">
                  {edu.degree || "Degree"}
                  {edu.school ? ` · ${edu.school}` : ""}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {[edu.start_year, edu.end_year].filter(Boolean).join(" – ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {certifications.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Certifications
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {certifications.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {record.coverLetter ? (
        <section className="mt-10 border-t border-[var(--line)] pt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Cover letter
          </h2>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">
            {record.coverLetter}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
