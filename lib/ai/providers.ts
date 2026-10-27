import {
  getConfiguredProviders as getConfiguredProvidersJs,
  resolveDefaultProvider as resolveDefaultProviderJs,
} from "@/lib/ai/ai-service";

export type AiProvider = "openai" | "claude" | "deepseek" | "chatgpt";

export type ProviderAvailability = Record<AiProvider, boolean>;

export function getConfiguredProviders(): ProviderAvailability {
  const raw = getConfiguredProvidersJs() as Record<string, boolean>;
  return {
    openai: Boolean(raw.openai),
    claude: Boolean(raw.claude),
    deepseek: Boolean(raw.deepseek),
    chatgpt: true,
  };
}

export function resolveDefaultProvider(): AiProvider {
  const value = resolveDefaultProviderJs();
  if (
    value === "openai" ||
    value === "claude" ||
    value === "deepseek" ||
    value === "chatgpt"
  ) {
    return value;
  }
  return "chatgpt";
}

export function providerLabel(provider: AiProvider) {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_BASE_URL?.includes("openrouter.ai")
        ? "OpenRouter (API key)"
        : "OpenAI (API key)";
    case "claude":
      return "Claude (API key)";
    case "deepseek":
      return "DeepSeek (API key)";
    case "chatgpt":
      return "No API key — copy/paste ChatGPT";
  }
}

export function isAiProvider(value: unknown): value is AiProvider {
  return (
    value === "openai" ||
    value === "claude" ||
    value === "deepseek" ||
    value === "chatgpt"
  );
}
