/**
 * Normalize model output into trimmed paragraphs (split on blank lines).
 */
export function parseCoverLetterParagraphs(raw) {
  let t = String(raw ?? "").trim();
  t = t.replace(/^```(?:text|plaintext)?\s*/i, "").replace(/\s*```$/s, "").trim();
  t = t.replace(/^(here is|here's|this is|below is|the following is)[^:]*:?\s*/gi, "");
  const parts = t
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts;
}
