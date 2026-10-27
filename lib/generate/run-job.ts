import { generateCoverLetterFile } from "@/lib/generate/cover-letter";
import { generateResumeFile } from "@/lib/generate/resume";
import type {
  GenerateJobInput,
  GenerateJobResult,
  GenerateJobStatus,
} from "@/lib/generate/types";
import { saveGeneratedHistory } from "@/lib/history";
import { getResumeProfile } from "@/lib/profiles";

export async function runGenerateJob(
  input: GenerateJobInput,
  setStatus: (status: GenerateJobStatus, message?: string) => void,
): Promise<GenerateJobResult> {
  const profile = await getResumeProfile(input.profileId);
  if (!profile) {
    throw new Error("Profile not found.");
  }

  const chatgpt = input.provider === "chatgpt";
  const hasPaste = Boolean(String(input.pastedResponse || "").trim());
  if (chatgpt && !hasPaste) {
    setStatus("generating", "Building ChatGPT prompt…");
  } else if (chatgpt && hasPaste) {
    setStatus("generating", "Using ChatGPT reply…");
  } else {
    setStatus("generating", "Generating with AI…");
  }

  const result =
    input.kind === "cover-letter"
      ? await generateCoverLetterFile({
          profileData: profile.data,
          jd: input.jd,
          companyName: input.companyName,
          targetRole: input.targetRole,
          provider: input.provider,
          model: input.model,
          format: input.format,
          pastedResponse: input.pastedResponse,
        })
      : await generateResumeFile({
          profileData: profile.data,
          jd: input.jd,
          companyName: input.companyName,
          targetRole: input.targetRole,
          provider: input.provider,
          model: input.model,
          format: input.format,
          pastedResponse: input.pastedResponse,
        });

  let historyId: string | null = input.historyId;

  if (result.mode === "prompt") {
    setStatus("building", "Copying prompt to clipboard…");
  }

  if (result.mode === "file") {
    setStatus(
      "building",
      chatgpt ? "Building document from ChatGPT reply…" : "Building document…",
    );
    setStatus("saving", "Saving to History…");
    const saved = await saveGeneratedHistory({
      userId: input.userId,
      historyId: input.historyId,
      profileId: input.profileId,
      companyName: input.companyName,
      jobTitle: input.targetRole,
      jobDescription: input.jd,
      jobLink: input.jobLink,
      resumeJson:
        input.kind === "resume" && "resume" in result ? result.resume : null,
      coverLetter:
        input.kind === "cover-letter" && "coverLetter" in result
          ? String(result.coverLetter || "")
          : null,
      provider: input.provider,
      model: input.model,
      requiresClearance: input.requiresClearance,
      isRemote: input.isRemote,
    });
    if (!saved.ok) {
      throw Object.assign(new Error(saved.error), { code: "DUPLICATE" });
    }
    historyId = saved.id;
  }

  return {
    ...result,
    provider: input.provider,
    model: input.model,
    kind: input.kind,
    historyId,
    requiresClearance: input.requiresClearance,
    isRemote: input.isRemote,
    clearanceWarning: input.clearanceWarning,
    remoteWarning: input.remoteWarning,
  } as GenerateJobResult;
}
