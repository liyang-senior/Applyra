import type { AiProvider } from "@/lib/ai/providers";

export type GenerateJobStatus =
  | "received"
  | "queued"
  | "generating"
  | "building"
  | "saving"
  | "finished"
  | "failed"
  | "rejected";

export type GenerateJobInput = {
  userId: string;
  kind: "resume" | "cover-letter";
  profileId: string;
  jd: string;
  companyName: string;
  targetRole: string;
  jobLink: string;
  provider: AiProvider;
  model: string | null;
  format: "pdf" | "docx";
  historyId: string | null;
  pastedResponse?: string;
  requiresClearance: boolean;
  isRemote: boolean;
  clearanceWarning: string | null;
  remoteWarning: string | null;
};

export type GenerateJobResult = {
  mode: "prompt" | "file";
  prompt?: string;
  filename?: string;
  mimeType?: string;
  base64?: string;
  resume?: unknown;
  coverLetter?: string;
  provider: AiProvider;
  model: string | null;
  kind: "resume" | "cover-letter";
  historyId: string | null;
  requiresClearance: boolean;
  isRemote: boolean;
  clearanceWarning: string | null;
  remoteWarning: string | null;
};

export type GenerateJobPublic = {
  id: string;
  status: GenerateJobStatus;
  message: string;
  queuePosition: number | null;
  activeCount: number;
  pendingForUser: number;
  error?: string;
  result?: GenerateJobResult;
  createdAt: string;
  updatedAt: string;
};

export const GENERATE_STATUS_LABEL: Record<GenerateJobStatus, string> = {
  received: "Received",
  queued: "Queued",
  generating: "Generating with AI…",
  building: "Building document…",
  saving: "Saving to History…",
  finished: "Finished",
  failed: "Failed",
  rejected: "Rejected",
};
