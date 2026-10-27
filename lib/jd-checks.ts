export type JdAnalysis = {
  isRemote: boolean;
  requiresClearance: boolean;
  remoteMatches: string[];
  clearanceMatches: string[];
  remoteError: string | null;
  clearanceWarning: string | null;
};

/** Phrases that indicate remote / WFH eligibility. */
const REMOTE_PATTERNS: RegExp[] = [
  /\bremote\b/i,
  /\bwork[\s-]*from[\s-]*home\b/i,
  /\bwfh\b/i,
  /\btelework(?:ing)?\b/i,
  /\btelecommut(?:e|ing)\b/i,
  /\bfully[\s-]*remote\b/i,
  /\b100%\s*remote\b/i,
  /\bremote[\s-]*first\b/i,
  /\bremote[\s-]*friendly\b/i,
  /\bremote[\s-]*ok\b/i,
  /\bremote[\s-]*optional\b/i,
  /\bdistributed\s+team\b/i,
  /\bwork\s+remotely\b/i,
  /\banywhere\s+in\s+the\s+(?:us|u\.s\.|united\s+states)\b/i,
  /\blocation:\s*remote\b/i,
];

/** Security clearance / public trust requirements to flag. */
const CLEARANCE_PATTERNS: RegExp[] = [
  /\bsecurity\s+clearance\b/i,
  /\bactive\s+clearance\b/i,
  /\bmust\s+(?:hold|have|possess)\s+(?:a\s+)?(?:secret|top\s*secret|ts\/?sci|clearance)\b/i,
  /\b(?:secret|top\s*secret|ts\/?sci)\s+clearance\b/i,
  /\bpublic\s+trust\b/i,
  /\bhigh\s+risk\s+public\s+trust\b/i,
  /\bmoderate\s+risk\s+public\s+trust\b/i,
  /\bnational\s+agency\s+check\b/i,
  /\bbackground\s+investigation\b/i,
  /\bdod\s+clearance\b/i,
  /\bdoe\s+q\s+clearance\b/i,
  /\bability\s+to\s+obtain\s+(?:a\s+)?(?:secret|top\s*secret|clearance|public\s+trust)\b/i,
  /\beligible\s+for\s+(?:a\s+)?(?:secret|top\s*secret|ts\/?sci|clearance|public\s+trust)\b/i,
];

function collectMatches(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) found.add(match[0].replace(/\s+/g, " ").trim());
  }
  return [...found];
}

export function analyzeJobDescription(jd: string): JdAnalysis {
  const text = String(jd || "");
  const remoteMatches = collectMatches(text, REMOTE_PATTERNS);
  const clearanceMatches = collectMatches(text, CLEARANCE_PATTERNS);
  const isRemote = remoteMatches.length > 0;
  const requiresClearance = clearanceMatches.length > 0;

  return {
    isRemote,
    requiresClearance,
    remoteMatches,
    clearanceMatches,
    remoteError: isRemote
      ? null
      : "This job description does not mention remote / work-from-home. Generate and Applied are blocked.",
    clearanceWarning: requiresClearance
      ? `Warning: JD may require clearance or public trust (${clearanceMatches.join(", ")}). Proceed only if appropriate — it will be flagged in History.`
      : null,
  };
}

export function assertRemoteJobDescription(jd: string): JdAnalysis | { ok: false; error: string } {
  const analysis = analyzeJobDescription(jd);
  if (!analysis.isRemote) {
    return { ok: false, error: analysis.remoteError || "Remote work not found in JD." };
  }
  return analysis;
}
