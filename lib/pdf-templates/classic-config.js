/**
 * Shared classic résumé layout: Helvetica (ATS-friendly sans), black/white, section rules,
 * italic headline, skills as bullets, experience title | dates (bold).
 */
export const CLASSIC_PDF_RESUME_CONFIG = {
  fonts: {
    body: "Helvetica",
    title: "Helvetica-Bold",
    baseSize: 11,
    nameSize: 22,
    titleSize: 11,
    contactSize: 10,
    sectionSize: 10.5,
  },
  sectionTitles: {
    summary: "SUMMARY",
    skills: "SKILLS",
    experience: "PROFESSIONAL EXPERIENCE",
    certifications: "CERTIFICATIONS",
    education: "EDUCATION",
  },
  headerLayout: "center",
};
