// Available models configuration
// This file is safe to import in both client and server components
export const AVAILABLE_MODELS = {
  claude: [
    // Claude 4.5 family (latest)
    // { id: "claude-opus-4-5-20251124", name: "Claude Opus 4.5" },
    // { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },

    // Claude 4 family
    // { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1" },
    // { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    // { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },

    // // Claude 3.7 and 3.5 family
    // { id: "claude-3-7-sonnet-20250219", name: "Claude Sonnet 3.7" },
    // { id: "claude-3-5-sonnet-20241022", name: "Claude Sonnet 3.5" },
    // { id: "claude-3-5-haiku-20241022", name: "Claude Haiku 3.5" },

    // // Claude 3 family (legacy)
    // { id: "claude-3-opus-20240229", name: "Claude Opus 3" },
    // { id: "claude-3-sonnet-20240229", name: "Claude Sonnet 3" },
    // { id: "claude-3-haiku-20240307", name: "Claude Haiku 3" }
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
  // Uses your own logged-in ChatGPT web session (CHATGPT_SESSION_TOKEN) instead
  // of an API key. Model slugs mirror chatgpt.com's web UI and may change or
  // be unavailable depending on your plan (Free/Plus).
  "chatgpt-session": [
    { id: "auto", name: "ChatGPT Auto (your plan's default)" },
    { id: "gpt-5", name: "GPT-5 (if available on your plan)" },
    { id: "gpt-4o", name: "GPT-4o (if available on your plan)" }
  ],
  // Manual paste workflow — no live model id; generate APIs return the prompt.
  chatgpt: [{ id: "manual", name: "ChatGPT — copy prompt (no API key)" }],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek Chat" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner" },
  ],
};

// Get default model for a provider
// Uses OPENAI_MODEL / ANTHROPIC_MODEL / DEEPSEEK_MODEL from .env when set
export function getDefaultModel(provider) {
  if (provider === 'openai' && process.env.OPENAI_MODEL) {
    console.log('Using OPENAI_MODEL from .env:', process.env.OPENAI_MODEL);
    return process.env.OPENAI_MODEL;
  }
  if (provider === 'claude' && process.env.ANTHROPIC_MODEL) {
    return process.env.ANTHROPIC_MODEL;
  }
  if (provider === 'deepseek' && process.env.DEEPSEEK_MODEL) {
    return process.env.DEEPSEEK_MODEL;
  }
  if (provider === 'chatgpt-session' && process.env.CHATGPT_MODEL) {
    return process.env.CHATGPT_MODEL;
  }
  const models = AVAILABLE_MODELS[provider];
  return models && models.length > 0 ? models[0].id : null;
}
