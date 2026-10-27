import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import { callAI } from "@/lib/ai/ai-service";
import { buildCoverLetterDocxBuffer } from "@/lib/cover-letter/cover-letter-docx";
import { computeCoverLetterBaseFileName } from "@/lib/cover-letter/cover-letter-files";
import { buildCoverLetterPrompt } from "@/lib/cover-letter/cover-letter-prompt";
import { parseCoverLetterParagraphs } from "@/lib/cover-letter/cover-letter-parse";
import CoverLetterPdf from "@/lib/pdf-templates/CoverLetterPdf";
import { aiText } from "@/lib/generate/ai-text";

function formatWorkHistoryForPrompt(experience) {
  if (!Array.isArray(experience) || experience.length === 0) return "";
  return experience
    .map((job, idx) => {
      const parts = [`${idx + 1}. ${job.company || "Company"}`];
      if (job.title) parts.push(job.title);
      parts.push(`${job.start_date || "?"} – ${job.end_date || "?"}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function formatEducationForPrompt(education) {
  if (!Array.isArray(education) || education.length === 0) return "";
  return education
    .map(
      (e) =>
        `- ${e.degree || ""}, ${e.school || ""} (${e.start_year || ""}–${e.end_year || ""})`,
    )
    .join("\n");
}

export function buildCoverLetterPromptForProfile(profileData, {
  jd,
  companyName,
  targetRole,
}) {
  const roleForLetter =
    (targetRole && String(targetRole).trim()) ||
    profileData.title ||
    "the position";
  return buildCoverLetterPrompt({
    name: profileData.name || "Candidate",
    headlineTitle: profileData.title || roleForLetter,
    roleForLetter,
    companyName: companyName && String(companyName).trim(),
    workHistoryText: formatWorkHistoryForPrompt(profileData.experience),
    educationText: formatEducationForPrompt(profileData.education),
    jd: String(jd).trim(),
  });
}

/**
 * @param {{
 *   profileData: object,
 *   jd: string,
 *   companyName?: string | null,
 *   targetRole?: string | null,
 *   provider: string,
 *   model?: string | null,
 *   format?: string,
 *   pastedResponse?: string | null,
 * }} args
 */
export async function generateCoverLetterFile({
  profileData,
  jd,
  companyName = null,
  targetRole = null,
  provider,
  model = null,
  format = "pdf",
  pastedResponse = null,
}) {
  const data = {
    ...profileData,
    experience: Array.isArray(profileData.experience)
      ? profileData.experience
      : [],
    education: Array.isArray(profileData.education)
      ? profileData.education
      : [],
  };
  const prompt = buildCoverLetterPromptForProfile(data, {
    jd,
    companyName,
    targetRole,
  });

  if (provider === "chatgpt" && !String(pastedResponse || "").trim()) {
    return { mode: "prompt", prompt };
  }

  let text =
    provider === "chatgpt"
      ? String(pastedResponse).trim()
      : aiText(await callAI(prompt, provider, model, 3000, 2, 120000));

  if (!text) {
    throw new Error(
      "The model returned an empty cover letter. Check API keys or try again.",
    );
  }

  const lower = text.toLowerCase();
  if (
    lower.startsWith("i'm sorry") ||
    lower.startsWith("i cannot") ||
    lower.startsWith("i apologize")
  ) {
    throw new Error(
      "The model declined to write the cover letter. Try again or shorten the job description.",
    );
  }

  const paragraphs = parseCoverLetterParagraphs(text);
  if (paragraphs.length < 2) {
    throw new Error(
      "Cover letter text was too short or malformed. Please try generating again.",
    );
  }

  const header = {
    name: data.name || "",
    email: data.email || "",
    phone: data.phone || "",
    location: data.location || "",
    linkedin: data.linkedin || "",
  };
  const resumeName = String(data.name || "Cover_Letter")
    .trim()
    .replace(/\s+/g, "_");
  const baseName = computeCoverLetterBaseFileName(resumeName, companyName);
  const outFormat = format === "docx" || format === "word" ? "docx" : "pdf";

  if (outFormat === "docx") {
    const buffer = await buildCoverLetterDocxBuffer({
      ...header,
      paragraphs,
    });
    return {
      mode: "file",
      filename: `${baseName}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64: buffer.toString("base64"),
      coverLetter: text,
    };
  }

  const pdfStream = await renderToStream(
    React.createElement(CoverLetterPdf, { ...header, paragraphs }),
  );
  const chunks = [];
  for await (const chunk of pdfStream) chunks.push(chunk);
  return {
    mode: "file",
    filename: `${baseName}.pdf`,
    mimeType: "application/pdf",
    base64: Buffer.concat(chunks).toString("base64"),
    coverLetter: text,
  };
}
