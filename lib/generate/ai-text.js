/** Normalize Origin-style AI responses to a plain string. */
export function aiText(aiResponse) {
  if (!aiResponse) return "";
  if (typeof aiResponse === "string") return aiResponse.trim();
  const block = aiResponse.content?.[0];
  if (typeof block?.text === "string") return block.text.trim();
  if (typeof aiResponse.content === "string") return aiResponse.content.trim();
  return "";
}
