// Available models configuration
// This file is safe to import in both client and server components
export const AVAILABLE_MODELS = {
  claude: [
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
  ],
  openai: [
    // GPT-6 (OpenRouter: openai/… · native API: gpt-6-…)
    { id: "openai/gpt-6-luna", name: "GPT-6 Luna" },
    { id: "openai/gpt-6-sol", name: "GPT-6 Sol" },
    { id: "openai/gpt-6-astra", name: "GPT-6 Astra" },
    { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol" },
    // Older OpenAI family
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini" },
    { id: "openai/gpt-4.1", name: "GPT-4.1" },
    { id: "openai/o4-mini", name: "o4 Mini" },
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5 (via OpenRouter)" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (via OpenRouter)" },
    // Native OpenAI ids (when OPENAI_BASE_URL is api.openai.com / unset)
    { id: "gpt-6-luna", name: "GPT-6 Luna (native)" },
    { id: "gpt-6-sol", name: "GPT-6 Sol (native)" },
    { id: "gpt-6-astra", name: "GPT-6 Astra (native)" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini (native)" },
    { id: "gpt-4o", name: "GPT-4o (native)" },
  ],
  chatgpt: [{ id: "manual", name: "ChatGPT — copy prompt (no API key)" }],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
  ],
};

// Get default model for a provider.
// OpenAI and DeepSeek are chosen in the Generate model menu.
// Claude can still be pinned with ANTHROPIC_MODEL.
export function getDefaultModel(provider) {
  if (provider === 'claude' && process.env.ANTHROPIC_MODEL) {
    return process.env.ANTHROPIC_MODEL;
  }
  const models = AVAILABLE_MODELS[provider];
  return models && models.length > 0 ? models[0].id : null;
}
