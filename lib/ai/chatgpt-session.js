// Calls ChatGPT's web backend using a copied browser session cookie instead
// of an API key. This talks to chatgpt.com's internal (undocumented) API —
// OpenAI does not officially support automating it, and it can be blocked
// or rate-limited without notice. See .env.example for how to obtain
// CHATGPT_SESSION_TOKEN.
import { randomUUID } from "crypto";

const CHATGPT_BASE_URL = process.env.CHATGPT_BASE_URL || "https://chatgpt.com";
const CHATGPT_SESSION_TOKEN = process.env.CHATGPT_SESSION_TOKEN;
const CHATGPT_USER_AGENT =
  process.env.CHATGPT_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function resolveAccessToken() {
  const res = await fetch(`${CHATGPT_BASE_URL}/api/auth/session`, {
    headers: {
      Cookie: `__Secure-next-auth.session-token=${CHATGPT_SESSION_TOKEN}`,
      "User-Agent": CHATGPT_USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Could not resolve ChatGPT session (HTTP ${res.status}). CHATGPT_SESSION_TOKEN is likely expired — re-copy it from your browser (see .env.example).`
    );
  }

  const data = await res.json().catch(() => null);
  if (!data?.accessToken) {
    throw new Error(
      "ChatGPT session did not return an access token. Re-copy the __Secure-next-auth.session-token cookie from a logged-in chatgpt.com tab."
    );
  }

  return data.accessToken;
}

function extractTextFromSseLine(line, state) {
  if (!line.startsWith("data:")) return;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return;

  let json;
  try {
    json = JSON.parse(payload);
  } catch {
    return;
  }

  const parts = json?.message?.content?.parts;
  if (Array.isArray(parts) && typeof parts[0] === "string") {
    state.text = parts[0];
  }
}

export async function callChatGPTSession(
  promptOrMessages,
  model = "auto",
  maxTokens,
  retries = 2,
  timeoutMs = 120000
) {
  if (!CHATGPT_SESSION_TOKEN) {
    throw new Error(
      "CHATGPT_SESSION_TOKEN is not set. See .env.example for how to get it from your logged-in ChatGPT session."
    );
  }

  const promptText =
    typeof promptOrMessages === "string"
      ? promptOrMessages
      : Array.isArray(promptOrMessages)
      ? promptOrMessages.map((m) => m.content).join("\n\n")
      : String(promptOrMessages);

  let lastErr;
  while (retries > 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const accessToken = await resolveAccessToken();

      const res = await fetch(`${CHATGPT_BASE_URL}/backend-api/conversation`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": CHATGPT_USER_AGENT,
          Origin: CHATGPT_BASE_URL,
          Referer: `${CHATGPT_BASE_URL}/`,
        },
        body: JSON.stringify({
          action: "next",
          messages: [
            {
              id: randomUUID(),
              author: { role: "user" },
              content: { content_type: "text", parts: [promptText] },
            },
          ],
          model,
          parent_message_id: randomUUID(),
        }),
      });

      if (!res.ok || !res.body) {
        const bodyText = await res.text().catch(() => "");
        throw new Error(
          `ChatGPT session request failed (HTTP ${res.status}). ${
            res.status === 403 || res.status === 401
              ? "OpenAI likely blocked this as automated traffic, or the session token expired."
              : bodyText.slice(0, 200)
          }`
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const state = { text: "" };
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) extractTextFromSseLine(line.trim(), state);
      }

      clearTimeout(timer);

      if (!state.text.trim()) {
        throw new Error(
          "ChatGPT session returned no text. The session may have expired, or OpenAI's bot protection blocked the request."
        );
      }

      return {
        provider: "chatgpt-session",
        model,
        content: [{ text: state.text }],
        usage: null,
        stop_reason: "stop",
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      retries--;
      if (retries === 0) throw err;
      console.log(`Retrying ChatGPT session... (${retries} attempts left)`);
    }
  }

  throw lastErr;
}
