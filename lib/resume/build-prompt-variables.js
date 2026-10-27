import {
  extractNarrativeSnippetsFromSkillMap,
  normalizeBaseSkillsToSkillMap,
  normalizeCertifications,
  UNCATEGORIZED_SKILLS_KEY,
} from "./merge-resume-base.js";
import { extractJdRequirementTerms } from "./jd-experience-keywords.js";
import { demonstratedSkillsFromText } from "./resume-sanitize.js";
import {
  EXPERIENCE_BULLET_RULES,
  isLastExperienceRole,
  maxBulletCountForRole,
  minBulletCountForRole,
} from "./experience-bullet-guidance.js";

function linesOf(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function bulletBlock(value, emptyLabel) {
  const lines = linesOf(value);
  if (lines.length === 0) return emptyLabel;
  return lines.map((line) => `- ${line}`).join("\n");
}

function parseJobDate(value) {
  const text = String(value ?? "").trim();
  if (!text || /present|current|now/i.test(text)) return new Date();
  const monthYear = text.match(/(\d{1,2})[\/\-.](\d{4})/);
  if (monthYear) return new Date(Number(monthYear[2]), Number(monthYear[1]) - 1, 1);
  const year = text.match(/(\d{4})/);
  if (year) return new Date(Number(year[1]), 0, 1);
  return null;
}

function tenureMonths(start, end) {
  const from = parseJobDate(start);
  const to = parseJobDate(end);
  if (!from || !to) return null;
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, months);
}

/**
 * Aligns with default.txt experience guidance.
 * First 3 roles 6–8; middle 4–6; last role 5–7 (merge to fit).
 * Per role: mix 3/2/1-line; ≤3 one-line; prefer 3–5 three-line (word counts).
 */
function bulletPlan(months, index, totalRoles) {
  const floor = minBulletCountForRole(index, totalRoles);
  const ceil = maxBulletCountForRole(index, totalRoles);
  const R = EXPERIENCE_BULLET_RULES;
  const mix = `length mix 3-5×${R.longBulletMinWords}-${R.longBulletMaxWords}w / ≤${R.shortBulletsPerRoleMax}×${R.shortBulletMinWords}-${R.shortBulletMaxWords}w / rest ${R.mediumBulletMinWords}-${R.mediumBulletMaxWords}w`;
  if (isLastExperienceRole(index, totalRoles)) {
    return `LAST: ${floor}-${ceil} bullets (MERGE) | ${mix}`;
  }
  if (index < R.recentRolesCount) {
    return `${floor}-${ceil} bullets | ${mix}`;
  }
  return `${floor}-${ceil} bullets (middle) | ${mix}`;
}

/** Tiny Extra reminder — full rules live in default.txt (avoid duplicating). */
const OUTPUT_CONTRACT = [
  "JSON only. Summary 70-95 words. Title = job title only.",
  "SKILLS = JD preferred/required/stack tools first; drop unrelated profile tools; echo JD tools in bullets when possible.",
  "Bullets: first3 6-8; middle 4-6; LAST 5-7; per role 3-5 long (35-48w), ≤3 short (12-18w), rest 22-32w; one period; MERGE to fit.",
].join("\n");

/**
 * Variables for the resume prompt. Each fact is supplied once.
 * @param {object} profileData
 * @param {{ jd?: string, targetRole?: string, companyName?: string }} [opts]
 */
export function buildResumePromptVariables(profileData, opts = {}) {
  const profile = profileData && typeof profileData === "object" ? profileData : {};
  const jd = typeof opts.jd === "string" ? opts.jd : "";
  const jobs = Array.isArray(profile.experience) ? profile.experience : [];
  const education = Array.isArray(profile.education) ? profile.education : [];

  const contact = [profile.email, profile.phone].filter(Boolean).join(" | ");
  const educationText = education
    .map((edu) => {
      let line = `- ${edu.degree || "Degree"}, ${edu.school || "School"} (${edu.start_year || ""}-${edu.end_year || ""})`;
      if (edu.grade) line += ` | GPA: ${edu.grade}`;
      return line;
    })
    .join("\n");

  const candidateProfile = [
    `Name: ${profile.name || "(not supplied)"}`,
    `Headline: ${profile.title || "(not supplied)"}`,
    `Contact: ${contact || "(not supplied)"}`,
    `Location: ${profile.location || "(not supplied)"}`,
    educationText ? `Education:\n${educationText}` : "Education: (none supplied)",
  ].join("\n");

  const totalRoles = jobs.length;
  const employmentHistory =
    jobs
      .map((job, idx) => {
        const parts = [`${idx + 1}. ${job.company || "Unknown employer"}`];
        if (job.title) parts.push(job.title);
        if (job.location) parts.push(job.location);
        parts.push(`${job.start_date || ""} - ${job.end_date || ""}`.trim());
        const months = tenureMonths(job.start_date, job.end_date);
        parts.push(months == null ? "length unknown" : `${months} months`);
        parts.push(bulletPlan(months, idx, totalRoles));
        return parts.join(" | ");
      })
      .join("\n") || "(none supplied)";

  const originalBullets =
    jobs
      .map((job, idx) => {
        const header = `${idx + 1}. ${job.company || "Unknown employer"}${job.title ? ` | ${job.title}` : ""}`;
        const bullets = linesOf(job.base_bullets ?? job.base_details);
        if (bullets.length === 0) {
          return `${header}\n(no original bullets supplied for this role)`;
        }
        return `${header}\n${bullets.map((b) => `- ${b}`).join("\n")}`;
      })
      .join("\n\n") || "(none supplied)";

  const skillMap = normalizeBaseSkillsToSkillMap(profile.base_skills);
  const { skillMap: techSkillMap, snippets, experienceContextSnippets } =
    extractNarrativeSnippetsFromSkillMap(skillMap);
  const skillLines = [];
  for (const [cat, arr] of Object.entries(techSkillMap)) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    if (cat === UNCATEGORIZED_SKILLS_KEY) skillLines.push(`Uncategorized: ${arr.join(", ")}`);
    else skillLines.push(`${cat}: ${arr.join(", ")}`);
  }

  const certs = normalizeCertifications(profile.certifications);
  const certText =
    certs.length === 0
      ? "(none documented)"
      : certs
          .map((c) => `- ${[c.name, c.issuer, c.date].filter(Boolean).join(" | ")}`)
          .join("\n");

  const jdTechnologies = demonstratedSkillsFromText(jd).map((item) => item.name);
  const jdTopics = extractJdRequirementTerms(jd, { max: 40 }).filter(
    (term) => !/^(experience|capabilities)$/i.test(term)
  );

  const notes = [OUTPUT_CONTRACT];
  notes.push(
    `Exactly ${jobs.length} experience objects in order. #1 most recent; #${jobs.length || 1} LAST (5-7 bullets).`,
  );
  if (opts.companyName && String(opts.companyName).trim()) {
    notes.push(`Target company (context only): ${String(opts.companyName).trim()}.`);
  }
  if (snippets.length > 0) {
    notes.push(
      "Profile narrative (context only; not a skill category):\n" +
        snippets.map((s) => `- ${s}`).join("\n")
    );
  }
  if (jdTechnologies.length > 0 || jdTopics.length > 0) {
    const lines = [
      ...jdTechnologies,
      ...jdTopics.filter((term) => !jdTechnologies.includes(term)),
    ];
    notes.push(
      "MUST put in Skills (and in bullets when possible):\n" +
        lines.map((s) => `- ${s}`).join("\n")
    );
  }
  const profileNotes = linesOf(profile.additional_instructions);
  if (profileNotes.length > 0) notes.push(profileNotes.join("\n"));

  const separateResume =
    (typeof profile.original_resume === "string" && profile.original_resume.trim()) ||
    (typeof profile.resume_text === "string" && profile.resume_text.trim()) ||
    "";

  const targetRole = String(opts.targetRole || "").trim();

  return {
    CANDIDATE_PROFILE: candidateProfile,
    EMPLOYMENT_HISTORY: employmentHistory,
    ORIGINAL_RESUME: separateResume || "(not supplied separately)",
    ORIGINAL_EXPERIENCE_BULLETS: originalBullets,
    VERIFIED_TECHNICAL_SKILLS: skillLines.join("\n") || "(none supplied)",
    CONFIRMED_SKILLS: bulletBlock(
      profile.confirmed_additional_skills ?? profile.confirmed_skills,
      "(none supplied)"
    ),
    CONFIRMED_RESPONSIBILITIES: bulletBlock(
      profile.confirmed_responsibilities,
      "(none supplied)"
    ),
    CONFIRMED_PROJECTS: bulletBlock(
      profile.confirmed_projects ?? profile.confirmed_projects_and_responsibilities,
      "(none supplied)"
    ),
    DOCUMENTED_ACHIEVEMENTS: bulletBlock(experienceContextSnippets, "(none supplied)"),
    CERTIFICATIONS: certText,
    TARGET_JOB_TITLE:
      targetRole ||
      "Not supplied separately. Infer the target role from the job description. The profile headline is a hint, not a required title.",
    JOB_DESCRIPTION: jd || "(none supplied)",
    ADDITIONAL_INSTRUCTIONS: notes.join("\n\n"),
  };
}
