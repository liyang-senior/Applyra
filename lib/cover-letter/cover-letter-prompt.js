/**
 * User prompt for plain-text cover letter (no JSON).
 */
export function buildCoverLetterPrompt({
  name,
  headlineTitle,
  roleForLetter,
  companyName,
  workHistoryText,
  educationText,
  jd,
}) {
  const companyTrim = companyName && String(companyName).trim();
  const companyBlock = companyTrim
    ? `The employer's company name is **${companyTrim}**. Mention it naturally **once** in the opening body (not in the salutation line).`
    : `No company name was provided. Do **not** invent or guess a company name. Write a strong letter focused on the role and impact without naming a specific employer.`;

  return `You are an expert career writer who drafts concise, credible cover letters that recruiters actually read.

## Candidate (facts only — do not exaggerate)
**Name:** ${name}
**Résumé headline:** ${headlineTitle}
**Role they are applying for:** ${roleForLetter}

${companyBlock}

## Work history (for tone and credibility only)
${workHistoryText || "(none provided)"}

## Education
${educationText || "(none provided)"}

## Job description
${jd}

---

## Output rules (non-negotiable)
1. Return **plain text only**. No markdown, no HTML, no JSON, no code fences.
2. **Length:** about **240–340 words** in **four** paragraphs (plus salutation and closing lines — see below).
3. **Salutation:** Start with **Dear Hiring Team,** OR **Hello,** (pick one). Do **not** use "To Whom It May Concern", "Dear Sir/Madam", or any **placeholder** such as [Name], [Hiring Manager], [Company], [Date], [Address], or similar bracketed tokens.
4. **Voice:** Confident, specific, warm. Tie **2–3** concrete strengths to problems implied by the job description. Avoid clichés ("synergy", "passionate about everything").
5. **Role title:** Naturally reference the **Role they are applying for** (${roleForLetter}) early in the letter.
6. **Truthfulness:** Only claim experience that is plausible from the work history and headline; do not invent employers, degrees, or tools not implied there.
7. **Closing:** End with a short closing paragraph inviting conversation, then a line with only **Sincerely,** then one blank line, then the candidate's full name **${name}** on its own last line.

Write the letter now.`;
}
