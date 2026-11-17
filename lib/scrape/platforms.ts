export const JOB_PLATFORMS = [
  { id: "jobright", label: "jobright.ai" },
] as const;

export type JobPlatformId = (typeof JOB_PLATFORMS)[number]["id"];

export type PlatformSelectOption = {
  value: string;
  label: string;
};

export type PlatformField = {
  id: string;
  label: string;
  kind: "text" | "select" | "multi";
  group: "main" | "other";
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  help?: string;
  options?: PlatformSelectOption[];
};

export const JOBRIGHT_FIELDS: PlatformField[] = [
  {
    id: "keywords",
    label: "Search keywords",
    kind: "text",
    group: "main",
    required: true,
    placeholder: "Software engineer, React developer",
    help: "Comma-separated job titles. Up to 5. Each keyword collects up to 100 listings.",
  },
  {
    id: "remote",
    label: "Work model",
    kind: "multi",
    group: "main",
    options: [
      { value: "remote", label: "Remote" },
      { value: "hybrid", label: "Hybrid" },
      { value: "onsite", label: "Onsite" },
    ],
    help: "Select any that apply.",
  },
  {
    id: "posted",
    label: "Post date",
    kind: "select",
    group: "main",
    options: [
      { value: "any", label: "Any time" },
      { value: "1", label: "Past 24 hours" },
      { value: "3", label: "Past 3 days" },
      { value: "7", label: "Past week" },
      { value: "30", label: "Past month" },
    ],
  },
  {
    id: "location",
    label: "Location",
    kind: "text",
    group: "other",
    placeholder: "Austin, TX",
    help: "Optional city. Search uses the radius below.",
  },
  {
    id: "seniority",
    label: "Seniority",
    kind: "multi",
    group: "other",
    options: [
      { value: "1", label: "Intern / new grad" },
      { value: "2", label: "Entry level" },
      { value: "3", label: "Mid level" },
      { value: "4", label: "Senior" },
      { value: "5", label: "Lead / staff" },
      { value: "6", label: "Director / executive" },
    ],
    help: "Select any that apply.",
  },
  {
    id: "jobType",
    label: "Job type",
    kind: "multi",
    group: "other",
    options: [
      { value: "1", label: "Full-time" },
      { value: "2", label: "Contract" },
      { value: "3", label: "Part-time" },
      { value: "4", label: "Internship" },
    ],
    help: "Select any that apply.",
  },
  {
    id: "country",
    label: "Country",
    kind: "select",
    group: "other",
    options: [
      { value: "US", label: "United States" },
      { value: "CA", label: "Canada" },
      { value: "GB", label: "United Kingdom" },
    ],
  },
  {
    id: "radius",
    label: "Radius",
    kind: "select",
    group: "other",
    defaultValue: "25",
    options: [
      { value: "10", label: "10 miles" },
      { value: "25", label: "25 miles" },
      { value: "50", label: "50 miles" },
      { value: "100", label: "100 miles" },
    ],
  },
  {
    id: "salary",
    label: "Minimum annual salary",
    kind: "select",
    group: "other",
    options: [
      { value: "0", label: "Any" },
      { value: "50000", label: "$50,000+" },
      { value: "80000", label: "$80,000+" },
      { value: "100000", label: "$100,000+" },
      { value: "120000", label: "$120,000+" },
      { value: "150000", label: "$150,000+" },
      { value: "180000", label: "$180,000+" },
      { value: "200000", label: "$200,000+" },
      { value: "250000", label: "$250,000+" },
      { value: "300000", label: "$300,000+" },
    ],
  },
  {
    id: "stage",
    label: "Company stage",
    kind: "multi",
    group: "other",
    options: [
      { value: "Early Stage", label: "Early stage" },
      { value: "Growth Stage", label: "Growth stage" },
      { value: "Late Stage", label: "Late stage" },
      { value: "Public", label: "Public company" },
    ],
    help: "Select any that apply.",
  },
  {
    id: "limitations",
    label: "Exclude limitations",
    kind: "multi",
    group: "other",
    options: [
      { value: "clearance", label: "Security clearance required" },
      { value: "citizen", label: "US citizen only" },
    ],
    help: "Hide jobs that require these.",
  },
  {
    id: "h1b",
    label: "H1B sponsorship",
    kind: "select",
    group: "other",
    options: [
      { value: "any", label: "Any" },
      { value: "only", label: "Sponsors only" },
    ],
  },
  {
    id: "staffing",
    label: "Staffing agencies",
    kind: "select",
    group: "other",
    options: [
      { value: "any", label: "Any" },
      { value: "exclude", label: "Exclude staffing agencies" },
    ],
  },
  {
    id: "roleType",
    label: "Role type",
    kind: "select",
    group: "other",
    options: [
      { value: "any", label: "Any" },
      { value: "IC", label: "Individual contributor" },
      { value: "Manager", label: "Manager" },
    ],
  },
  {
    id: "minExperience",
    label: "Minimum experience",
    kind: "select",
    group: "other",
    options: [
      { value: "any", label: "Any" },
      { value: "0", label: "0+ years" },
      { value: "1", label: "1+ years" },
      { value: "2", label: "2+ years" },
      { value: "3", label: "3+ years" },
      { value: "5", label: "5+ years" },
      { value: "8", label: "8+ years" },
    ],
  },
  {
    id: "skills",
    label: "Skills",
    kind: "text",
    group: "other",
    placeholder: "TypeScript, Python",
    help: "Optional. Comma-separated skills, up to 8.",
  },
  {
    id: "excludedSkills",
    label: "Excluded skills",
    kind: "text",
    group: "other",
    placeholder: "PHP, COBOL",
    help: "Optional. Comma-separated skills to leave out.",
  },
  {
    id: "excludedTitles",
    label: "Excluded titles",
    kind: "text",
    group: "other",
    placeholder: "Intern, Recruiter",
    help: "Optional. Comma-separated title words to leave out.",
  },
  {
    id: "companies",
    label: "Companies",
    kind: "text",
    group: "other",
    placeholder: "Stripe, Notion",
    help: "Optional. Keep jobs whose company name matches.",
  },
  {
    id: "excludedCompanies",
    label: "Exclude companies",
    kind: "text",
    group: "other",
    placeholder: "Amazon, Meta",
    help: "Optional. Drop jobs whose company name matches.",
  },
  {
    id: "industry",
    label: "Industry",
    kind: "text",
    group: "other",
    placeholder: "Fintech, Healthcare",
    help: "Optional. Keep companies in these industries.",
  },
  {
    id: "excludedIndustry",
    label: "Exclude industry",
    kind: "text",
    group: "other",
    placeholder: "Staffing, Gambling",
    help: "Optional. Drop companies in these industries.",
  },
];

export function platformFields(platformId: string): PlatformField[] {
  if (platformId === "jobright") return JOBRIGHT_FIELDS;
  return [];
}

export function isJobPlatform(value: string): value is JobPlatformId {
  return JOB_PLATFORMS.some((platform) => platform.id === value);
}

export function defaultFieldValues(fields: PlatformField[]) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.id] =
      field.kind === "select"
        ? field.defaultValue || field.options?.[0]?.value || ""
        : "";
  }
  return values;
}
