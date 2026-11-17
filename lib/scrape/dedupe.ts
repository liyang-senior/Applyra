export function jobDedupeKey(title: string, company: string) {
  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");
  return `${normalize(title)}|${normalize(company)}`;
}

export function isLinkedInJobLink(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "linkedin.com" ||
      host.endsWith(".linkedin.com") ||
      host === "lnkd.in" ||
      host.endsWith(".lnkd.in")
    );
  } catch {
    return false;
  }
}
