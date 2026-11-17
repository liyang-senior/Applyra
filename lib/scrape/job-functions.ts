export type JobFunctionChoice = {
  taxonomyId: string;
  title: string;
};

const TAXONOMY_ID = /^\d{2}-\d{2}-\d{2}$/;
const MAX_JOB_FUNCTIONS = 5;

export function parseJobFunctions(value: string): JobFunctionChoice[] {
  const items: JobFunctionChoice[] = [];
  const seen = new Set<string>();
  for (const part of value.split("|")) {
    const splitAt = part.indexOf("\t");
    if (splitAt < 1) continue;
    const taxonomyId = part.slice(0, splitAt).trim();
    const title = part.slice(splitAt + 1).trim().replace(/\s+/g, " ").slice(0, 80);
    if (!TAXONOMY_ID.test(taxonomyId) || !title || seen.has(taxonomyId)) continue;
    seen.add(taxonomyId);
    items.push({ taxonomyId, title });
    if (items.length >= MAX_JOB_FUNCTIONS) break;
  }
  return items;
}

export function encodeJobFunctions(items: JobFunctionChoice[]) {
  return items
    .slice(0, MAX_JOB_FUNCTIONS)
    .map((item) => `${item.taxonomyId}\t${item.title}`)
    .join("|");
}
