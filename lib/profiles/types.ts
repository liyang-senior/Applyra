export type ProfileGender = "male" | "female" | "other" | "unspecified";

export type ProfileExperience = {
  company: string;
  title: string;
  location: string;
  start_date: string;
  end_date: string;
  base_bullets: string[];
};

export type ProfileEducation = {
  degree: string;
  school: string;
  start_year: string;
  end_year: string;
  grade?: string;
};

/** Resume profile payload — same fields as Origin resume JSON, plus gender/techStack. */
export type ResumeProfileData = {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  zip: string;
  linkedin: string;
  website: string;
  github: string;
  cvLink: string;
  street: string;
  birthday: string;
  ssn: string;
  gender: ProfileGender;
  techStack: string;
  base_skills: string[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
};

export type ResumeProfile = {
  id: string;
  data: ResumeProfileData;
  createdAt: string;
  updatedAt: string;
  assigneeIds: string[];
};

export type ResumeProfileListItem = {
  id: string;
  name: string;
  email: string;
  title: string;
  gender: ProfileGender;
  techStack: string;
  linkedin: string;
  createdAt: string;
  updatedAt: string;
  assignees: Array<{ id: string; name: string; email: string }>;
};

export const emptyProfileData = (): ResumeProfileData => ({
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  zip: "",
  linkedin: "",
  website: "",
  github: "",
  cvLink: "",
  street: "",
  birthday: "",
  ssn: "",
  gender: "unspecified",
  techStack: "",
  base_skills: [],
  experience: [],
  education: [],
});

export function normalizeGender(value: unknown): ProfileGender {
  if (value === "male" || value === "female" || value === "other") return value;
  return "unspecified";
}

export function genderLabel(gender: ProfileGender) {
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  return "—";
}

export function sanitizeProfileData(input: unknown): ResumeProfileData | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const name = String(raw.name ?? "").trim();
  if (!name) return null;

  const techStack = String(raw.techStack ?? "").trim();
  let base_skills: string[] = [];
  if (Array.isArray(raw.base_skills)) {
    base_skills = raw.base_skills.map((line) => String(line ?? "").trim()).filter(Boolean);
  }
  if (techStack && base_skills.length === 0) {
    base_skills = techStack
      .split(/\n|;/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const experience = Array.isArray(raw.experience)
    ? raw.experience.map((item) => {
        const job = (item || {}) as Record<string, unknown>;
        const bullets = Array.isArray(job.base_bullets)
          ? job.base_bullets.map((b) => String(b ?? ""))
          : Array.isArray(job.base_details)
            ? job.base_details.map((b) => String(b ?? ""))
            : [];
        return {
          company: String(job.company ?? ""),
          title: String(job.title ?? ""),
          location: String(job.location ?? ""),
          start_date: String(job.start_date ?? ""),
          end_date: String(job.end_date ?? ""),
          base_bullets: bullets,
        };
      })
    : [];

  const education = Array.isArray(raw.education)
    ? raw.education.map((item) => {
        const edu = (item || {}) as Record<string, unknown>;
        return {
          degree: String(edu.degree ?? ""),
          school: String(edu.school ?? ""),
          start_year: String(edu.start_year ?? ""),
          end_year: String(edu.end_year ?? ""),
          ...(edu.grade ? { grade: String(edu.grade) } : {}),
        };
      })
    : [];

  return {
    name,
    title: String(raw.title ?? "").trim(),
    email: String(raw.email ?? "").trim(),
    phone: String(raw.phone ?? "").trim(),
    location: String(raw.location ?? "").trim(),
    zip: String(raw.zip ?? "").trim(),
    linkedin: String(raw.linkedin ?? "").trim(),
    website: String(raw.website ?? "").trim(),
    github: String(raw.github ?? "").trim(),
    cvLink: String(raw.cvLink ?? raw.cv_link ?? "").trim(),
    street: String(raw.street ?? "").trim(),
    birthday: String(raw.birthday ?? "").trim(),
    ssn: String(raw.ssn ?? "").trim(),
    gender: normalizeGender(raw.gender),
    techStack,
    base_skills,
    experience,
    education,
  };
}
