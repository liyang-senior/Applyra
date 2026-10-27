import { computeResumeBaseFileName } from "@/lib/resume/resume-to-docx";

export function computeCoverLetterBaseFileName(resumeName, companyName, jobTitle) {
  return `${computeResumeBaseFileName(resumeName, companyName, jobTitle)}_cover_letter`;
}
