import { computeResumeBaseFileName } from "@/lib/resume/resume-to-docx";

export function computeCoverLetterBaseFileName(resumeName, companyName) {
  return `${computeResumeBaseFileName(resumeName, companyName)}_cover_letter`;
}
