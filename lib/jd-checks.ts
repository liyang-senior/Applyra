export type JdAnalysis = {
  isRemote: boolean;
  requiresClearance: boolean;
  remoteMatches: string[];
  locationMatches: string[];
  clearanceMatches: string[];
  remoteWarning: string | null;
  clearanceWarning: string | null;
};

/** Hybrid / onsite location requirements to warn and flag. */
const LOCATION_FLAG_PATTERNS: RegExp[] = [
  /\bhybrid\b/i,
  /\bonsite\b/i,
  /\bon[\s-]*site\b/i,
  /\bin[\s-]*office\b/i,
  /\bin[\s-]*person\b/i,
  /\bon[\s-]*prem(?:ises)?\b/i,
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
  const locationMatches = collectMatches(text, LOCATION_FLAG_PATTERNS);
  const clearanceMatches = collectMatches(text, CLEARANCE_PATTERNS);
  const hasHybridOrOnsite = locationMatches.length > 0;
  const isRemote = !hasHybridOrOnsite;
  const requiresClearance = clearanceMatches.length > 0;

  return {
    isRemote,
    requiresClearance,
    remoteMatches: locationMatches,
    locationMatches,
    clearanceMatches,
    remoteWarning: hasHybridOrOnsite
      ? `Warning: JD mentions hybrid / onsite (${locationMatches.join(", ")}). It will be flagged in History.`
      : null,
    clearanceWarning: requiresClearance
      ? `Warning: JD may require clearance or public trust (${clearanceMatches.join(", ")}). Proceed only if appropriate — it will be flagged in History.`
      : null,
  };
}
