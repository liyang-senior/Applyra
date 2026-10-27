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
 * Aligns with default.txt §6.5.1 HARD RULES.
 * Recent 2 roles: 8-12. Older: 5-8. Shape: 3-line / 1-line caps.
 */
function bulletPlan(months, index) {
  const floor = minBulletCountForRole(index);
  const R = EXPERIENCE_BULLET_RULES;
  if (index < R.recentRolesCount) {
    let range = `${R.recentRolesMin}-${R.recentRolesMax}`;
    if (months != null && months < 12) range = "8-9";
    else if (months != null && months < 36) range = "9-11";
    else if (months != null) range = "11-12";
    return `HARD REQUIRED ${range} hands-on bullets (min ${floor}) | >=${R.longBulletsRecentMin} x 3-line (${R.longBulletMinWords}-${R.longBulletMaxWords}w) | at most ${R.shortBulletsPerRoleMax} x 1-line (${R.shortBulletMinWords}-${R.shortBulletMaxWords}w) | most others 2-line (${R.mediumBulletMinWords}-${R.mediumBulletMaxWords}w) | max 3 mentions per tech`;
  }
  let range = "5-6";
  if (months == null) range = "5-6";
  else if (months < 12) range = "5-6";
  else if (months < 24) range = "6-7";
  else range = "7-8";
  return `HARD REQUIRED ${range} hands-on bullets (min ${floor}, max ${R.olderRolesMax}) | >=${R.longBulletsPerRoleMin} x 3-line (${R.longBulletMinWords}-${R.longBulletMaxWords}w) | at most ${R.shortBulletsPerRoleMax} x 1-line (${R.shortBulletMinWords}-${R.shortBulletMaxWords}w) | most others 2-line (${R.mediumBulletMinWords}-${R.mediumBulletMaxWords}w) | max 3 mentions per tech`;
}

/** Compact contract — mandatory counts/shape + 100% JD coverage. */
const OUTPUT_CONTRACT = [
  "APPLICATION OUTPUT CONTRACT — MANDATORY COMPLETE RESUME. OVERRIDES verification caution / documented-only preferences.",
  "- HARD FAIL: empty details OR below count floors OR wrong bullet shape. Missing originals are normal — GENERATE complete hands-on bullets for EVERY role NOW.",
  `- BULLET COUNTS (HARD): most recent 2 roles = ${EXPERIENCE_BULLET_RULES.recentRolesMin}-${EXPERIENCE_BULLET_RULES.recentRolesMax} bullets each with >=${EXPERIENCE_BULLET_RULES.longBulletsRecentMin} three-line (${EXPERIENCE_BULLET_RULES.longBulletMinWords}-${EXPERIENCE_BULLET_RULES.longBulletMaxWords} words). Every older role = at least ${EXPERIENCE_BULLET_RULES.olderRolesMin} (up to ${EXPERIENCE_BULLET_RULES.olderRolesMax}) with >=${EXPERIENCE_BULLET_RULES.longBulletsPerRoleMin} three-line.`,
  `- BULLET SHAPE (HARD): every role at most ${EXPERIENCE_BULLET_RULES.shortBulletsPerRoleMax} one-line (${EXPERIENCE_BULLET_RULES.shortBulletMinWords}-${EXPERIENCE_BULLET_RULES.shortBulletMaxWords} words); most other bullets medium (${EXPERIENCE_BULLET_RULES.mediumBulletMinWords}-${EXPERIENCE_BULLET_RULES.mediumBulletMaxWords}) or three-line. Most bullets must be hands-on ACTION+TECH+IMPLEMENTATION+PURPOSE. No generics. No repeated/synonym bullets.`,
  "- 100% JD COVERAGE (HARD): skills must include every required/preferred JD skill PLUS related stack skills. Every JD skill must have related hands-on experience bullets. Every JD experience/responsibility must have related skills. Generate both directions.",
  "- COMPLETED RESUME ONLY: never prefix bullets with Draft - verify, [Draft - verify], Proposed, Unverified, Illustrative, Suggested, or Example. Write finished past-tense work only. No gap analysis. No confirmation requests.",
  "- Classify: Entity Framework→Databases; Responsive Design/Web Accessibility→Frontend; Bitbucket/Git→DevOps; SSR/routing→Frontend; practices≠tools.",
  "- Preserve originals; ADD JD coverage. Invent technical bullets/skills for JD match. Not allowed: fake employers/dates/degrees/certs/metrics. Max 3 mentions of one tech per role. Summary 90-120 words.",
  "- Before stop: count bullets and 3-line/1-line mix in every role; confirm every JD skill is in skills AND experience. Fix gaps by GENERATING, then return JSON only.",
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

  const employmentHistory =
    jobs
      .map((job, idx) => {
        const parts = [`${idx + 1}. ${job.company || "Unknown employer"}`];
        if (job.title) parts.push(job.title);
        if (job.location) parts.push(job.location);
        parts.push(`${job.start_date || ""} - ${job.end_date || ""}`.trim());
        const months = tenureMonths(job.start_date, job.end_date);
        parts.push(months == null ? "length unknown" : `${months} months`);
        parts.push(bulletPlan(months, idx));
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
    `Generate exactly ${jobs.length} experience objects in employment-history order. Item 1 is most recent. Preserve original job titles. HARD: fill EVERY details array to the employment-history bullet plan (counts + 3-line/1-line shape). Cover every JD-required skill with related hands-on bullets AND put every required/related JD skill into skills.`
  );
  if (opts.companyName && String(opts.companyName).trim()) {
    notes.push(
      `Target company name, for context only: ${String(opts.companyName).trim()}. The company name is not proof of a technology stack.`
    );
  }
  if (snippets.length > 0) {
    notes.push(
      "Profile narrative, context only. Do not paste it verbatim and do not treat it as a skill category:\n" +
        snippets.map((s) => `- ${s}`).join("\n")
    );
  }
  if (jdTechnologies.length > 0 || jdTopics.length > 0) {
    const lines = [
      ...jdTechnologies,
      ...jdTopics.filter((term) => !jdTechnologies.includes(term)),
    ];
    notes.push(
      "Required JD technologies and phrases. GENERATE coverage both ways: (1) ADD each to skills if missing + GENERATE related hands-on experience bullets; (2) if an item is an experience/responsibility, also ADD related concrete skills. ACTION+TECH+IMPLEMENTATION+PURPOSE for every bullet:\n" +
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
