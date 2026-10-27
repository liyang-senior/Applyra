/**
 * Tolerant JSON parsing for LLM / pasted ChatGPT output.
 * Fixes the usual breakages: code fences, smart quotes, unescaped inner quotes,
 * raw newlines/tabs inside strings, missing commas between elements, trailing commas.
 */

const CLOSER_AFTER_STRING = new Set([",", ":", "}", "]"]);

function stripFencesAndExtract(text) {
  let s = String(text ?? "").trim();
  s = s.replace(/```(?:json|javascript|js)?\s*/gi, "").replace(/```/g, "");
  s = s.replace(/^(here is|here's|this is|the json is):?\s*/i, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found. Please paste the full JSON.");
  }
  return s.slice(first, last + 1).trim();
}

function nextNonWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** Decide whether the quote at index i ends a string (vs. being an unescaped inner quote). */
function quoteLooksClosing(s, i) {
  const j = nextNonWs(s, i + 1);
  if (j >= s.length) return true;
  const c = s[j];
  if (c === "}" || c === "]" || c === ":") return true;
  if (c === ",") {
    const k = nextNonWs(s, j + 1);
    if (k >= s.length) return true;
    const d = s[k];
    return /["{\[\]}\-0-9tfn]/.test(d);
  }
  // Missing comma between elements: "a"\n"b"
  if (c === '"') return true;
  return false;
}

export function repairJsonText(input) {
  const s = String(input)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, " ");

  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (!inStr) {
      if (ch === '"') {
        inStr = true;
        out += ch;
      } else {
        out += ch;
      }
      continue;
    }

    // inside string
    if (ch === "\\") {
      const nx = s[i + 1];
      if (nx !== undefined && /["\\/bfnrtu]/.test(nx)) {
        out += ch + nx;
        i++;
      } else {
        out += "\\\\"; // lone backslash
      }
      continue;
    }
    if (ch === '"') {
      if (quoteLooksClosing(s, i)) {
        inStr = false;
        out += ch;
        const j = nextNonWs(s, i + 1);
        if (s[j] === '"') out += ","; // missing comma
      } else {
        out += '\\"';
      }
      continue;
    }
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\t") {
      out += "\\t";
      continue;
    }
    out += ch;
  }

  // Trailing commas outside strings (strings are now well-formed)
  let cleaned = "";
  inStr = false;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (inStr) {
      cleaned += ch;
      if (ch === "\\") {
        cleaned += out[i + 1] ?? "";
        i++;
      } else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      cleaned += ch;
      continue;
    }
    if (ch === ",") {
      const j = nextNonWs(out, i + 1);
      if (out[j] === "}" || out[j] === "]") continue;
    }
    cleaned += ch;
  }

  // Auto-close anything left open (truncated output): strings, arrays, objects
  const stack = [];
  inStr = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) cleaned += '"';
  cleaned = cleaned.replace(/,\s*$/, "");
  // A dangling key with no value, e.g. {"a":  -> drop it
  cleaned = cleaned.replace(/,?\s*"[^"\\]*"\s*:\s*$/, "");
  while (stack.length) cleaned += stack.pop();
  return cleaned;
}

function errorContext(text, message) {
  const m = /position (\d+)/.exec(message || "");
  if (!m) return "";
  const pos = Number(m[1]);
  const snip = text.slice(Math.max(0, pos - 80), pos + 80).replace(/\s+/g, " ");
  return ` Near: …${snip}…`;
}

/**
 * Parse model output into an object. Throws a descriptive error if unrecoverable.
 */
export function parseAiJson(raw) {
  const extracted = stripFencesAndExtract(raw);
  try {
    return JSON.parse(extracted);
  } catch (firstErr) {
    try {
      return JSON.parse(repairJsonText(extracted));
    } catch (secondErr) {
      throw new Error(
        `Invalid JSON: ${firstErr.message}.${errorContext(extracted, firstErr.message)} ` +
          `Check the pasted response (it may be truncated — ask ChatGPT to "continue" and paste the full JSON).`
      );
    }
  }
}
