import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AVAILABLE_MODELS, getDefaultModel } from "./models";
import {
  isResumeGenerationRefusal,
  resolveRefusalFallbackProvider as resolveRefusalFallbackProviderBase,
} from "./refusal";

export { isResumeGenerationRefusal };

export function resolveRefusalFallbackProvider(failedProvider) {
  return resolveRefusalFallbackProviderBase(
    failedProvider,
    getConfiguredProviders()
  );
}

// Initialize clients
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
      ...(process.env.OPENAI_BASE_URL?.includes("openrouter.ai")
        ? {
            defaultHeaders: {
              "HTTP-Referer":
                process.env.OPENROUTER_HTTP_REFERER || "https://applyra.local",
              "X-Title": process.env.OPENROUTER_APP_TITLE || "Applyra",
            },
          }
        : {}),
    })
  : null;

const deepseek = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    })
  : null;

// Re-export for backward compatibility
export { AVAILABLE_MODELS, getDefaultModel };

// Which providers actually have credentials configured on this server.
// `chatgpt` is always available: copy the prompt into ChatGPT and paste back
// (no API key required). ChatGPT session-token mode was removed.
export function getConfiguredProviders() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    chatgpt: true,
  };
}

// Prefer a live key when present. Never default to OpenAI when its key is
// missing — that used to fail cover letters / resumes with “API key not configured”.
export function resolveDefaultProvider() {
  const configured = getConfiguredProviders();
  if (configured.openai) return "openai";
  if (configured.claude) return "claude";
  if (configured.deepseek) return "deepseek";
  return "chatgpt";
}

function outputTokenCap(model) {
  const id = String(model || "");
  if (/^gpt-3\.5/.test(id)) return 4096;
  if (id === "gpt-4") return 8192;
  return 16000;
}

// Call AI with timeout & retries (provider-agnostic)
export async function callAI(
  promptOrMessages,
  provider = "openai",
  model = null,
  maxTokens = 16000,
  retries = 2,
  timeoutMs = 180000
) {
  // Validate provider
  if (!AVAILABLE_MODELS[provider]) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  // Validate model if specified
  if (model) {
    const validModels = AVAILABLE_MODELS[provider].map(m => m.id);
    if (!validModels.includes(model)) {
      console.warn(`Model ${model} not in allowed list, but attempting to use it anyway.`);
      // Allow the model to be used - the API will reject it if it's invalid
    }
  }

  // Get default model if not specified
  if (!model) {
    model = getDefaultModel(provider);
  }

  maxTokens = Math.min(maxTokens, outputTokenCap(model));

  // Route to appropriate provider
  switch (provider) {
    case "claude":
      return await callClaude(promptOrMessages, model, maxTokens, retries, timeoutMs);
    case "openai":
      return await callOpenAI(promptOrMessages, model, maxTokens, retries, timeoutMs);
    case "deepseek":
      return await callDeepSeek(promptOrMessages, model, maxTokens, retries, timeoutMs);
    case "chatgpt":
      throw new Error(
        "No-API mode does not call a model. Copy the prompt into ChatGPT, paste the reply, then download.",
      );
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

const RESUME_SYSTEM =
  "Applyra resume JSON writer. Return JSON only ({…}). No Markdown, refusal, or gap analysis. " +
  "Follow the user prompt MUST DO rules exactly. " +
  "Skills = JD preferred/required/stack tools first; echo those tools in bullets when possible. " +
  "Bullets: first3 6-8, middle 4-6, last 5-7; per role 3-5×35-48w, ≤3×12-18w, rest 22-32w. " +
  "Title = job title only. Summary 70-95 words. No fake employers/dates/certs/metrics.";

const CLAUDE_RESUME_SYSTEM = RESUME_SYSTEM;

// Claude implementation
async function callClaude(promptOrMessages, model, maxTokens, retries, timeoutMs) {
  if (!anthropic) {
    throw new Error("Anthropic API key not configured");
  }

  while (retries > 0) {
    try {
      let messages;
      let systemPrompt = CLAUDE_RESUME_SYSTEM;

      if (typeof promptOrMessages === 'string') {
        messages = [{ role: "user", content: promptOrMessages }];
      } else if (Array.isArray(promptOrMessages)) {
        const systemMsg = promptOrMessages.find(msg => msg.role === 'system');
        if (systemMsg) {
          systemPrompt = `${CLAUDE_RESUME_SYSTEM}\n\n${systemMsg.content}`;
        }
        messages = promptOrMessages
          .filter(msg => msg.role !== 'system')
          .map(msg => ({ role: msg.role, content: msg.content }));
      } else {
        messages = [{ role: "user", content: String(promptOrMessages) }];
      }

      const apiParams = {
        model: model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
        max_tokens: maxTokens,
        // Lower temperature improves structured JSON + bullet-count compliance on Claude.
        temperature: 0.35,
        messages: messages
      };

      if (systemPrompt) {
        apiParams.system = systemPrompt;
      }

      const response = await Promise.race([
        anthropic.messages.create(apiParams),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI request timed out")), timeoutMs)
        )
      ]);

      // Normalize response format
      return {
        provider: "claude",
        model: response.model,
        content: response.content,
        usage: response.usage,
        stop_reason: response.stop_reason
      };
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.log(`Retrying Claude... (${retries} attempts left)`);
    }
  }
}

// OpenAI implementation
async function callOpenAI(promptOrMessages, model, maxTokens, retries, timeoutMs) {
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  let allowReasoning = true;
  while (retries > 0) {
    try {
      let messages;
      let systemPrompt = RESUME_SYSTEM;

      if (typeof promptOrMessages === 'string') {
        messages = [{ role: "user", content: promptOrMessages }];
      } else if (Array.isArray(promptOrMessages)) {
        const systemMsg = promptOrMessages.find(msg => msg.role === 'system');
        if (systemMsg) {
          systemPrompt = `${RESUME_SYSTEM}\n\n${systemMsg.content}`;
        }
        messages = promptOrMessages
          .filter(msg => msg.role !== 'system')
          .map(msg => ({ role: msg.role, content: msg.content }));
      } else {
        messages = [{ role: "user", content: String(promptOrMessages) }];
      }

      messages = [{ role: "system", content: systemPrompt }, ...messages];

      const resolvedModel = model || process.env.OPENAI_MODEL || "gpt-5-mini";
      const apiParams = {
        model: resolvedModel,
        max_completion_tokens: maxTokens,
        messages: messages
      };
      // Reasoning models spend completion tokens on hidden reasoning. Keep that
      // budget small so the resume JSON is actually returned.
      if (allowReasoning && /^gpt-5/.test(resolvedModel)) {
        apiParams.reasoning_effort = "low";
      }

      const response = await Promise.race([
        openai.chat.completions.create(apiParams),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI request timed out")), timeoutMs)
        )
      ]);

      const choice0 = response.choices?.[0];
      const msg = choice0?.message;
      let textOut = msg?.content;
      if (Array.isArray(textOut)) {
        textOut = textOut
          .map((p) => (typeof p === "object" && p?.text ? p.text : String(p ?? "")))
          .join("");
      }
      if (textOut == null || (typeof textOut === "string" && !textOut.trim())) {
        const usage = response.usage || {};
        console.error("OpenAI empty message", {
          status: 200,
          model: response.model,
          finish_reason: choice0?.finish_reason,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
        });
        throw new Error(
          `OpenAI returned no text (finish_reason=${choice0?.finish_reason || "unknown"}, completion_tokens=${usage.completion_tokens ?? "unknown"}). The token budget was likely used before any resume JSON was written.`
        );
      }
      const finish = choice0?.finish_reason ?? "stop";

      // Normalize response format to match Claude's structure
      return {
        provider: "openai",
        model: response.model,
        content: [{ text: typeof textOut === "string" ? textOut : String(textOut) }],
        usage: {
          input_tokens: response.usage?.prompt_tokens,
          output_tokens: response.usage?.completion_tokens
        },
        stop_reason: finish === "length" ? "max_tokens" : finish
      };
    } catch (err) {
      retries--;
      if (/reasoning_effort/i.test(String(err.message || ""))) allowReasoning = false;
      console.error("OpenAI request failed", {
        status: err.status || err.statusCode || null,
        message: err.message,
        attemptsLeft: retries,
      });
      if (retries === 0) throw err;
      console.log(`Retrying OpenAI... (${retries} attempts left)`);
    }
  }
}

async function callDeepSeek(promptOrMessages, model, maxTokens, retries, timeoutMs) {
  if (!deepseek) {
    throw new Error("DeepSeek API key not configured");
  }

  while (retries > 0) {
    try {
      let messages;
      let systemPrompt = RESUME_SYSTEM;

      if (typeof promptOrMessages === "string") {
        messages = [{ role: "user", content: promptOrMessages }];
      } else if (Array.isArray(promptOrMessages)) {
        const systemMsg = promptOrMessages.find((msg) => msg.role === "system");
        if (systemMsg) {
          systemPrompt = `${RESUME_SYSTEM}\n\n${systemMsg.content}`;
        }
        messages = promptOrMessages
          .filter((msg) => msg.role !== "system")
          .map((msg) => ({ role: msg.role, content: msg.content }));
      } else {
        messages = [{ role: "user", content: String(promptOrMessages) }];
      }

      messages = [{ role: "system", content: systemPrompt }, ...messages];
      const resolvedModel =
        model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
      const response = await Promise.race([
        deepseek.chat.completions.create({
          model: resolvedModel,
          max_tokens: maxTokens,
          messages,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI request timed out")), timeoutMs),
        ),
      ]);

      const choice0 = response.choices?.[0];
      let textOut = choice0?.message?.content;
      if (Array.isArray(textOut)) {
        textOut = textOut
          .map((p) =>
            typeof p === "object" && p?.text ? p.text : String(p ?? ""),
          )
          .join("");
      }
      if (textOut == null || (typeof textOut === "string" && !textOut.trim())) {
        throw new Error("DeepSeek returned no text.");
      }
      const finish = choice0?.finish_reason ?? "stop";
      return {
        provider: "deepseek",
        model: response.model,
        content: [
          { text: typeof textOut === "string" ? textOut : String(textOut) },
        ],
        usage: {
          input_tokens: response.usage?.prompt_tokens,
          output_tokens: response.usage?.completion_tokens,
        },
        stop_reason: finish === "length" ? "max_tokens" : finish,
      };
    } catch (err) {
      retries--;
      console.error("DeepSeek request failed", {
        status: err.status || err.statusCode || null,
        message: err.message,
        attemptsLeft: retries,
      });
      if (retries === 0) throw err;
      console.log(`Retrying DeepSeek... (${retries} attempts left)`);
    }
  }
}

