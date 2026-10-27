import { NextResponse } from "next/server";
import {
  isAiProvider,
  resolveDefaultProvider,
  type AiProvider,
} from "@/lib/ai/providers";
import { generateCoverLetterFile } from "@/lib/generate/cover-letter";
import {
  enqueueGenerateJob,
  getGenerateJob,
  getQueueSnapshot,
} from "@/lib/generate/queue";
import { generateResumeFile } from "@/lib/generate/resume";
import { analyzeJobDescription } from "@/lib/jd-checks";
import { findAppliedDuplicate } from "@/lib/history";
import { getCapacitySnapshot } from "@/lib/server/capacity";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { getResumeProfile, userCanAccessProfile } from "@/lib/profiles";

type Body = {
  kind?: "resume" | "cover-letter";
  profileId?: string;
  jd?: string;
  companyName?: string;
  targetRole?: string;
  jobLink?: string;
  provider?: string;
  model?: string;
  pastedResponse?: string;
  format?: "pdf" | "docx";
  historyId?: string;
};

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({
      queue: getQueueSnapshot(user.id),
      capacity: getCapacitySnapshot(),
    });
  }

  const job = getGenerateJob(jobId, user.id);
  if (!job) return jsonError("Job not found.", 404);
  return NextResponse.json({
    job,
    queue: getQueueSnapshot(user.id),
    capacity: getCapacitySnapshot(),
  });
}

export async function POST(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const kind = body.kind === "cover-letter" ? "cover-letter" : "resume";
  const profileId = String(body.profileId || "");
  const jd = String(body.jd || "").trim();
  const companyName = String(body.companyName || "").trim();
  const targetRole = String(body.targetRole || "").trim();
  const jobLink = String(body.jobLink || "").trim();
  const format = body.format === "docx" ? "docx" : "pdf";
  const model = body.model ? String(body.model) : null;
  const historyId = body.historyId ? String(body.historyId) : null;

  if (!profileId) return jsonError("Select a profile.", 400);
  if (!jd) return jsonError("Enter a job description.", 400);
  if (!jobLink) return jsonError("Enter a job link.", 400);
  if (!companyName) return jsonError("Enter a company name.", 400);
  if (!targetRole) return jsonError("Enter a job title.", 400);

  const jdCheck = analyzeJobDescription(jd);

  if (!(await userCanAccessProfile(user, profileId))) {
    return jsonError("Profile not found.", 404);
  }

  const profile = await getResumeProfile(profileId);
  if (!profile) return jsonError("Profile not found.", 404);

  const duplicate = await findAppliedDuplicate({
    userId: user.id,
    profileId,
    companyName,
    jobTitle: targetRole,
    jobLink,
    excludeId: historyId,
  });
  if (!duplicate.ok) return jsonError(duplicate.error, 409);

  const provider: AiProvider = isAiProvider(body.provider)
    ? body.provider
    : resolveDefaultProvider();
  const pastedResponse = body.pastedResponse
    ? String(body.pastedResponse)
    : undefined;

  // ChatGPT copy-prompt is local template work — return immediately (no queue/poll).
  if (provider === "chatgpt" && !String(pastedResponse || "").trim()) {
    try {
      const built =
        kind === "cover-letter"
          ? await generateCoverLetterFile({
              profileData: profile.data,
              jd,
              companyName,
              targetRole,
              provider,
              format,
            })
          : await generateResumeFile({
              profileData: profile.data,
              jd,
              companyName,
              targetRole,
              provider,
              format,
            });
      if (built.mode !== "prompt" || !built.prompt) {
        return jsonError("Could not build prompt.", 500);
      }
      return NextResponse.json({
        result: {
          mode: "prompt" as const,
          prompt: built.prompt,
          provider,
          model: null,
          kind,
          historyId,
          requiresClearance: jdCheck.requiresClearance,
          isRemote: jdCheck.isRemote,
          clearanceWarning: jdCheck.clearanceWarning,
          remoteWarning: jdCheck.remoteWarning,
        },
        requiresClearance: jdCheck.requiresClearance,
        isRemote: jdCheck.isRemote,
        clearanceWarning: jdCheck.clearanceWarning,
        remoteWarning: jdCheck.remoteWarning,
      });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Could not build prompt.",
        500,
      );
    }
  }

  const enqueued = enqueueGenerateJob({
    userId: user.id,
    kind,
    profileId,
    jd,
    companyName,
    targetRole,
    jobLink,
    provider,
    model,
    format,
    historyId,
    pastedResponse,
    requiresClearance: jdCheck.requiresClearance,
    isRemote: jdCheck.isRemote,
    clearanceWarning: jdCheck.clearanceWarning,
    remoteWarning: jdCheck.remoteWarning,
  });

  if (!enqueued.ok) {
    return jsonError(enqueued.error, enqueued.status || 503);
  }

  return NextResponse.json(
    {
      jobId: enqueued.job.id,
      job: enqueued.job,
      queue: getQueueSnapshot(user.id),
      capacity: getCapacitySnapshot(),
      requiresClearance: jdCheck.requiresClearance,
      isRemote: jdCheck.isRemote,
      clearanceWarning: jdCheck.clearanceWarning,
      remoteWarning: jdCheck.remoteWarning,
    },
    { status: 202 },
  );
}
