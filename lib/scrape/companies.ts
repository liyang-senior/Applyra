export type CompanyChoice = {
  companyId: string;
  companyName: string;
};

const COMPANY_ID = /^\d{3,20}$/;
const MAX_COMPANIES = 12;

export function parseCompanies(value: string): CompanyChoice[] {
  const items: CompanyChoice[] = [];
  const seen = new Set<string>();
  for (const part of value.split("|")) {
    const splitAt = part.indexOf("\t");
    if (splitAt < 1) continue;
    const companyId = part.slice(0, splitAt).trim();
    const companyName = part.slice(splitAt + 1).trim().replace(/\s+/g, " ").slice(0, 120);
    if (!COMPANY_ID.test(companyId) || !companyName || seen.has(companyId)) continue;
    seen.add(companyId);
    items.push({ companyId, companyName });
    if (items.length >= MAX_COMPANIES) break;
  }
  return items;
}

export function encodeCompanies(items: CompanyChoice[]) {
  return items
    .slice(0, MAX_COMPANIES)
    .map((item) => `${item.companyId}\t${item.companyName}`)
    .join("|");
}
