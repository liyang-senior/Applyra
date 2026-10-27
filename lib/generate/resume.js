import React from "react";
import { renderToStream } from "@react-pdf/renderer";
import {
  callAI,
  isResumeGenerationRefusal,
  resolveRefusalFallbackProvider,
} from "@/lib/ai/ai-service";
import { getTemplate } from "@/lib/pdf-templates";
import { buildResumePromptVariables } from "@/lib/resume/build-prompt-variables";
import { findUnderfilledExperienceRoles } from "@/lib/resume/experience-bullet-guidance";
import {
  ensureJdTermsInRecentRoles,
  orderAllExperienceBulletsJdFirst,
} from "@/lib/resume/jd-experience-keywords";
import {
  finalizeExportedResumeSummaryAndSkills,
  mergeExperienceDetails,
  normalizeAiResumeContent,
  normalizeCertifications,
} from "@/lib/resume/merge-resume-base";
import { splitLongestDetailInFirstRoleForPageFlow } from "@/lib/resume/page-flow-experience";
import { repairJsonText } from "@/lib/resume/parse-ai-json";
import { loadPromptForProfile } from "@/lib/resume/prompt-loader";
import {
  prepareExperienceForExport,
  skillEvidenceText,
  stripDraftWording,
  toAsciiPunctuation,
} from "@/lib/resume/resume-sanitize";
import {
  buildResumeDocxBuffer,
  computeResumeBaseFileName,
} from "@/lib/resume/resume-to-docx";
import { aiText } from "@/lib/generate/ai-text";

function extractJsonObjectText(raw) {
  let content = String(raw ?? "");
  content = content.replace(/```json\s*/gi, "");
  content = content.replace(/```javascript\s*/gi, "");
  content = content.replace(/```\s*/g, "");
  content = content.replace(/^(here is|here's|this is|the json is):?\s*/gi, "");
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("AI did not return valid JSON format. Please try again.");
  }
  return content.substring(firstBrace, lastBrace + 1).trim();
}

function parseResumeJsonText(raw, fallbackTitle) {
  const extracted = extractJsonObjectText(raw);
  let parsed;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    parsed = JSON.parse(repairJsonText(extracted));
  }
  return normalizeAiResumeContent(parsed, {
    fallbackTitle: fallbackTitle || "Senior Software Engineer",
  });
}

async function renderResumeFile(templateData, templateName, resumeName, companyName, format) {
  const baseName = computeResumeBaseFileName(resumeName, companyName);
  const outFormat = format === "docx" || format === "word" ? "docx" : "pdf";
  if (outFormat === "docx") {
    const buffer = await buildResumeDocxBuffer(templateData);
    return {
      filename: `${baseName}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    };
  }
  const TemplateComponent = getTemplate(templateName);
  if (!TemplateComponent) {
    throw new Error(`Template "${templateName}" not found`);
  }
  const pdfStream = await renderToStream(
    React.createElement(TemplateComponent, { data: templateData }),
  );
  const chunks = [];
  for await (const chunk of pdfStream) chunks.push(chunk);
  return {
    filename: `${baseName}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.concat(chunks),
  };
}

function buildTemplateData(profileData, resumeContent, jd) {
  const evidenceText = [
    skillEvidenceText(profileData),
    ...profileData.experience.flatMap(
      (job) => job.base_bullets || job.base_details || [],
    ),
  ].join(" ");
  const { summary: exportSummary, skills: exportSkills } =
    finalizeExportedResumeSummaryAndSkills(
      profileData.base_skills,
      resumeContent.summary,
      resumeContent.skills,
      jd,
      evidenceText,
    );
  const allowedTech = [
    evidenceText,
    String(jd || ""),
    ...Object.values(exportSkills).flat(),
  ].join(" ");
  let mergedDetails = prepareExperienceForExport(
    profileData.experience,
    mergeExperienceDetails(profileData.experience, resumeContent.experience),
    allowedTech,
    jd || "",
  );
  mergedDetails = ensureJdTermsInRecentRoles(mergedDetails, jd || "");
  const emptyRoles = mergedDetails
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => !Array.isArray(row) || row.length === 0);
  if (emptyRoles.length > 0) {
    const gaps = emptyRoles.map(({ idx }) => {
      const job = profileData.experience[idx] || {};
      const label =
        [job.company, job.title].filter(Boolean).join(" | ") ||
        `Role ${idx + 1}`;
      return `${label}: the generated experience section is empty.`;
    });
    const error = new Error(
      "The model returned empty experience for one or more roles.",
    );
    error.code = "INCOMPLETE_INFORMATION";
    error.gaps = gaps;
    throw error;
  }
  mergedDetails = orderAllExperienceBulletsJdFirst(mergedDetails, jd);
  mergedDetails = splitLongestDetailInFirstRoleForPageFlow(mergedDetails);

  return {
    name: profileData.name,
    title: stripDraftWording(
      (typeof resumeContent.title === "string" && resumeContent.title.trim()) ||
        profileData.title ||
        "",
    ),
    email: profileData.email,
    phone: profileData.phone,
    location: profileData.location,
    linkedin: profileData.linkedin,
    website: null,
    summary: toAsciiPunctuation(exportSummary),
    skills: exportSkills,
    experience: profileData.experience.map((job, idx) => ({
      title: job.title || resumeContent.experience[idx]?.title || "Engineer",
      company: job.company,
      location: job.location,
      start_date: job.start_date,
      end_date: job.end_date,
      details: mergedDetails[idx] || [],
    })),
    certifications: normalizeCertifications(
      profileData.certifications,
      resumeContent.certifications,
    ),
    education: profileData.education,
  };
}

/**
 * Build the Origin résumé prompt for a DB profile (no Origin folder / slug files).
 */
export function buildResumePrompt(profileData, { jd, targetRole, companyName }) {
  return loadPromptForProfile(
    "default",
    buildResumePromptVariables(profileData, { jd, targetRole, companyName }),
  );
}

/**
 * Run Origin’s résumé tailor + PDF/DOCX export against in-memory profile JSON.
 */
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
export async function generateResumeFile({
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
  const prompt = buildResumePrompt(data, { jd, targetRole, companyName });

  if (provider === "chatgpt" && !String(pastedResponse || "").trim()) {
    return { mode: "prompt", prompt };
  }

  async function runResumeModel(activeProvider, activeModel, activePrompt) {
    const aiResponse = await callAI(
      activePrompt,
      activeProvider,
      activeModel,
      16000,
      2,
      180000,
    );
    let text = aiText(aiResponse);
    if (
      aiResponse.stop_reason === "max_tokens" ||
      aiResponse.stop_reason === "length"
    ) {
      const concisePrompt =
        activePrompt +
        "\n\nRetry after a truncated reply. Return one complete JSON object and nothing else.";
      const retryResponse = await callAI(
        concisePrompt,
        activeProvider,
        activeModel,
        16000,
        1,
        180000,
      );
      text = aiText(retryResponse);
    }
    if (!text) {
      throw new Error(
        "AI returned an empty response. Check API keys or model output.",
      );
    }
    return text;
  }

  let activeProvider = provider;
  let activeModel = model;
  let content =
    provider === "chatgpt"
      ? String(pastedResponse).trim()
      : await runResumeModel(activeProvider, activeModel, prompt);

  if (provider !== "chatgpt" && isResumeGenerationRefusal(content)) {
    const fallbackProvider = resolveRefusalFallbackProvider(activeProvider);
    if (fallbackProvider) {
      activeProvider = fallbackProvider;
      activeModel = null;
      content = await runResumeModel(activeProvider, activeModel, prompt);
    }
    if (isResumeGenerationRefusal(content)) {
      throw new Error(
        "The model refused to generate a resume under this contract. Try OpenAI or ChatGPT.",
      );
    }
  }

  let resumeContent = parseResumeJsonText(
    content,
    data.title || "Senior Software Engineer",
  );

  const hasSummary =
    (Array.isArray(resumeContent.summary) &&
      resumeContent.summary.length > 0) ||
    (typeof resumeContent.summary === "string" &&
      resumeContent.summary.trim().length > 0);
  if (
    !resumeContent.title ||
    !hasSummary ||
    !resumeContent.skills ||
    !resumeContent.experience
  ) {
    throw new Error(
      "AI response missing required fields (title, summary, skills, or experience)",
    );
  }

  let underfilled = findUnderfilledExperienceRoles(resumeContent.experience);
  if (underfilled.length > 0 && provider !== "chatgpt") {
    const gapLines = underfilled
      .map(
        ({ index, have, need }) =>
          `Role ${index + 1}: returned ${have} details, need at least ${need}`,
      )
      .join("\n");
    const fillRetryPrompt =
      prompt +
      "\n\nYour previous JSON under-filled experience bullets. Fix it now.\n" +
      gapLines +
      "\nRegenerate the COMPLETE resume JSON. Return only JSON.";
    const fillRetry = await callAI(
      fillRetryPrompt,
      activeProvider,
      activeModel,
      16000,
      1,
      180000,
    );
    const fillText = aiText(fillRetry);
    if (fillText) {
      try {
        const retried = parseResumeJsonText(
          fillText,
          data.title || "Senior Software Engineer",
        );
        const retriedGaps = findUnderfilledExperienceRoles(retried.experience);
        const prevDeficit = underfilled.reduce(
          (s, g) => s + (g.need - g.have),
          0,
        );
        const nextDeficit = retriedGaps.reduce(
          (s, g) => s + (g.need - g.have),
          0,
        );
        if (
          retried?.skills &&
          Array.isArray(retried.experience) &&
          (retriedGaps.length === 0 || nextDeficit < prevDeficit)
        ) {
          resumeContent = retried;
          underfilled = retriedGaps;
        }
      } catch {
        // keep first parse
      }
    }
  }

  const templateData = buildTemplateData(data, resumeContent, jd);
  const resumeName = String(data.name || "Resume")
    .trim()
    .replace(/\s+/g, "_");
  const file = await renderResumeFile(
    templateData,
    "Resume-Executive-Navy",
    resumeName,
    companyName,
    format,
  );

  return {
    mode: "file",
    filename: file.filename,
    mimeType: file.mimeType,
    base64: file.buffer.toString("base64"),
    resume: resumeContent,
  };
}
