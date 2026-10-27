import ResumeTemplate from "./ResumeTemplate";
import { ResumeExecutiveNavy } from "./templates/ResumeExecutiveNavy";

const templates = {
  Resume: ResumeTemplate,
  "Resume-Executive-Navy": ResumeExecutiveNavy,
};

export const getTemplate = (templateId) => {
  const templateName = templateId || "Resume";
  return templates[templateName] || ResumeTemplate;
};

export default templates;

