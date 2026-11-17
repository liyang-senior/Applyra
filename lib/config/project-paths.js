import path from "path";

/** Repository root (`process.cwd()` in Next.js at runtime). */
export const PROJECT_ROOT = process.cwd();

/**
 * Prompt templates for résumé generation (ported from Origin).
 * Path is under Applyra `lib/resume/prompts` — Origin folder is not required.
 */
export const RESUME_PROMPTS_DIR = path.join(
  PROJECT_ROOT,
  "lib",
  "resume",
  "prompts",
);
