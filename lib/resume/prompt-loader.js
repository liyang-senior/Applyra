import fs from "fs";
import path from "path";
import { RESUME_PROMPTS_DIR } from "@/lib/config/project-paths";

/**
 * Prompt templates live in `lib/resume/prompts/`:
 * - `default.txt` — main generation prompt (edit for global changes)
 * - `extend.txt` — optional extra rules appended after the main prompt
 * - `<profileId>.txt` — optional per-profile override (falls back to default)
 */

function stripExtendComments(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n")
    .trim();
}

function loadExtendPrompt() {
  const extendPath = path.join(RESUME_PROMPTS_DIR, "extend.txt");
  if (!fs.existsSync(extendPath)) return "";
  return stripExtendComments(fs.readFileSync(extendPath, "utf-8"));
}

function withExtend(template) {
  const extend = loadExtendPrompt();
  if (!extend) return template;
  return `${template.trim()}\n\n---\n# EXTEND PROMPT\n${extend}\n`;
}

/**
 * Load and process a prompt template file
 * @param {string} promptName - Name of the prompt file (without .txt extension)
 * @param {object} variables - Variables to replace in the prompt template
 * @returns {string} - Processed prompt string
 */
export const loadPrompt = (promptName, variables = {}) => {
  try {
    // Try to load the specific prompt file
    const promptPath = path.join(RESUME_PROMPTS_DIR, `${promptName}.txt`);

    if (!fs.existsSync(promptPath)) {
      const defaultPath = path.join(RESUME_PROMPTS_DIR, "default.txt");
      if (!fs.existsSync(defaultPath)) {
        throw new Error(`Prompt file not found: ${promptName}.txt and default.txt not found`);
      }
      console.log(`Using default prompt (${promptName}.txt not found)`);
      return processPromptTemplate(
        withExtend(fs.readFileSync(defaultPath, "utf-8")),
        variables,
      );
    }

    const promptTemplate = fs.readFileSync(promptPath, "utf-8");
    return processPromptTemplate(withExtend(promptTemplate), variables);
  } catch (error) {
    console.error(`Error loading prompt ${promptName}:`, error);
    throw error;
  }
};

/**
 * Process a prompt template by replacing variables
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {object} variables - Variables to replace
 * @returns {string} - Processed template
 */
const processPromptTemplate = (template, variables) => {
  let processed = template;

  // Replace all {{variable}} placeholders with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    processed = processed.replace(regex, String(value || ""));
  }

  // Safe default if a profile-specific template omits a newer placeholder
  processed = processed.replace(/\{\{jdExperienceKeywords\}\}/g, "");
  processed = processed.replace(/\{\{jdCredibilityGuard\}\}/g, "");

  return processed;
};

/**
 * Load prompt for a specific profile
 * @param {string} profileId - Profile ID (filename without .json)
 * @param {object} variables - Variables to replace in the prompt
 * @returns {string} - Processed prompt string
 */
export const loadPromptForProfile = (profileId, variables = {}) => {
  return loadPrompt(profileId, variables);
};

export default { loadPrompt, loadPromptForProfile };

