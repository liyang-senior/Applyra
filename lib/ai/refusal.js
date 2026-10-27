/**
 * Claude Opus often returns a prose refusal instead of resume JSON when the
 * contract asks for JD-stack experience the real-named profile does not support.
 */

export function isResumeGenerationRefusal(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return true;
  const t = raw.toLowerCase();
  if (
    /^\s*\{/.test(raw) ||
    /\{\s*"title"\s*:/.test(raw) ||
    /"experience"\s*:\s*\[/.test(raw)
  ) {
    return false;
  }
  const refusalStarts =
    /^(i('m| am) sorry|i cannot|i can't|i won't|i will not|i apologize|i must decline|i have to decline)\b/;
  const refusalBody =
    /won't generate this|will not generate this|as written|false claims|fabricat|anachronistic|synthetic test resumes|truthful tailored resume|gap analysis|tell me which you('d| would) like|invent hands-on experience|put false claims/;
  return refusalStarts.test(t) || refusalBody.test(t);
}

/** Prefer OpenAI, then DeepSeek, when Claude refuses the draft contract. */
export function resolveRefusalFallbackProvider(failedProvider, configured) {
  if (failedProvider !== "claude") return null;
  const cfg = configured || {};
  if (cfg.openai) return "openai";
  if (cfg.deepseek) return "deepseek";
  return null;
}
