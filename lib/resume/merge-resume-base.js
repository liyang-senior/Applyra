import {
  extractJdRequirementTerms,
  extractJdMustHavePhrases,
  findMissingJdTerms,
} from "./jd-experience-keywords.js";
import {
  addDemonstratedSkills,
  canonicalSkillName,
  sanitizeSkillMap,
  stripDraftWording,
  toAsciiPunctuation,
} from "./resume-sanitize.js";

/**
 * Merge permanent "base" bullets and skills from profile JSON with AI-generated resume JSON.
 *
 * Profile JSON (optional):
 * - `base_skills`: **array** of lines like `"Languages: Python, JavaScript"` (first `:` splits label vs skills),
 *   OR legacy object `{ "Category": ["A","B"], ... }` (values may be comma-separated strings).
 * - Each `experience[]` entry may include `base_bullets` (alias: `base_details`): string[]
 */

function normalizeStringList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

/**
 * Split comma-separated skills without breaking commas inside `(...)`.
 * Naive `.split(",")` turns `AWS (EC2, EKS), Azure (AKS)` into fragments and
 * causes merged output to repeat the same platforms when joined with full AI lines.
 */
function splitSkillsListLine(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      const piece = s.slice(start, i).trim();
      if (piece) parts.push(piece);
      start = i + 1;
    }
  }
  const tail = s.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function normalizeForMatch(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "their",
  "was",
  "were",
  "are",
  "has",
  "have",
  "had",
  "not",
  "but",
  "our",
  "your",
  "all",
  "any",
  "its",
  "via",
  "per",
  "using",
  "used",
  "use",
]);

function significantTokens(text) {
  const n = normalizeForMatch(text);
  return n
    .split(/[^a-z0-9%+$/]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * True if `haystack` (one bullet or several joined) still reflects the substance of `baseBullet`.
 * Used so merged / rewritten bullets do not drop permanent profile facts.
 */
function bulletHaystackCoversBase(haystack, baseBullet) {
  const h = normalizeForMatch(haystack);
  const b = normalizeForMatch(baseBullet);
  if (!b || b.length <= 2) return true;
  if (!h) return false;
  if (h.includes(b)) return true;
  if (b.length >= 14 && h.includes(b.slice(0, 14))) return true;

  const tokens = significantTokens(baseBullet);
  if (tokens.length === 0) return true;
  let hit = 0;
  for (const t of tokens) {
    if (h.includes(t)) hit++;
  }
  return hit / tokens.length >= 0.65;
}

function ensureAiBulletContainsBase(baseBullet, aiBullet) {
  const ai = String(aiBullet ?? "").trim();
  const base = String(baseBullet ?? "").trim();
  if (!base) return ai;
  if (bulletHaystackCoversBase(ai, base)) return ai;
  if (!ai) return base;
  return `${base} ${ai}`.replace(/\s+/g, " ").trim();
}

/**
 * Combine profile `base_bullets` with AI `details` for one role.
 * Bullet *count* may go up or down; every base fact must remain represented (enforced here when the model slips).
 */
function mergeDetailsForOneRole(base, fromAi) {
  if (base.length === 0) return [...fromAi];
  if (fromAi.length === 0) return [...base];

  if (fromAi.length === base.length) {
    return base.map((b, i) => ensureAiBulletContainsBase(b, fromAi[i] ?? ""));
  }

  const union = fromAi.join(" ");
  const uncovered = base.filter((b) => !bulletHaystackCoversBase(union, b));
  if (uncovered.length === 0) {
    return [...fromAi];
  }
  if (uncovered.length === base.length) {
    return [...base, ...fromAi];
  }
  return [...fromAi, ...uncovered];
}

/** Internal key for base skills that had no category label. Never exported as a row. */
export const UNCATEGORIZED_SKILLS_KEY = "__uncategorized__";

function skillKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep each skill token in exactly ONE category (first occurrence wins); drop emptied rows.
 */
export function dedupeSkillsAcrossCategories(skillMap) {
  const seen = new Set();
  const out = {};
  for (const [cat, list] of Object.entries(skillMap || {})) {
    if (!Array.isArray(list)) continue;
    const kept = [];
    for (const raw of list) {
      const t = String(raw ?? "").trim();
      if (!t) continue;
      const k = skillKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      kept.push(t);
    }
    if (kept.length) out[cat] = kept;
  }
  return out;
}

/**
 * Infer a natural category title for a skill token when no existing row fits.
 * Order matters: more specific patterns first.
 */
const CATEGORY_INFERENCE = [
  { re: /multiplatform|cross[-\s]?platform|react native|flutter|xamarin|ionic/i, cat: "Cross-platform development" },
  // Frontend techniques before bare "server-side" backend matching
  {
    re: /server[-\s]?side\s+render(?:ing)?|client[-\s]?side\s+rout(?:ing)?|client[-\s]?side\s+render(?:ing)?|server\s+components?|app\s+router|pages?\s+router|\bssr\b|\bcsr\b|\bssg\b|\bisr\b|tailwind|shadcn|storybook|responsive\s*design|web\s+accessibility|\baccessibility\b|\ba11y\b/i,
    cat: "Frontend engineering",
  },
  { re: /front[-\s]?end|\bfed\b|react|angular|vue|next\.?js|microsoft front|css|html|\bui\b|ux\b|pwa/i, cat: "Frontend engineering" },
  { re: /client[-\s]?side/i, cat: "Frontend engineering" },
  { re: /django|fastapi|flask|express|nest|spring|\.net|laravel|graphql|rest\s*apis?|openapi|webhooks|backend|server[-\s]?side\s+components?/i, cat: "Backend engineering" },
  { re: /python framework|node\.?js|\bnode\b/i, cat: "Backend engineering" },
  { re: /aws|azure|gcp|cloud computing|cloud platform|scalable application|lambda|ec2|s3/i, cat: "Cloud engineering" },
  { re: /docker|kubernetes|helm|container|ecs|eks|terraform|cloudformation|ansible|iac\b|infrastructure as code|version control|\bgit\b|github|gitlab|bitbucket|ci\/?cd|jenkins|github actions|pipeline|devops/i, cat: "DevOps" },
  { re: /database|postgres|mysql|mongodb|redis|nosql|snowflake|bigquery|\bconvex\b|entity framework/i, cat: "Databases" },
  { re: /dremel|data (storage|management|collection|processing|query)|warehouse|etl|pandas|numpy|spark/i, cat: "Data engineering" },
  { re: /machine learning|\bml\b|unsupervised|neural|\bai\b|llm|embedding|vector search|predictive/i, cat: "AI & machine learning" },
  { re: /^(c\+\+|c#|sql|googlesql|matlab|python|java|javascript|typescript|go|golang|rust|php|ruby|kotlin|swift|scala|bash)$/i, cat: "Programming Languages" },
  { re: /kafka|rabbitmq|sqs|pubsub|streaming|message queue/i, cat: "Messaging" },
  { re: /datadog|prometheus|grafana|opentelemetry|observab|sre|pagerduty|splunk|monitor/i, cat: "Observability & SRE" },
  { re: /jest|cypress|playwright|vitest|pytest|junit|testing|qa\b|unit test|integration test|end[-\s]?to[-\s]?end/i, cat: "Testing" },
  { re: /security|oauth|oidc|iam|auth|encryption|pci|multi[-\s]?tenant/i, cat: "Security" },
  { re: /agile|scrum|sprint|iterative|roadmap|architecture|delivery|sme\b|subject matter|code review|technical documentation/i, cat: "Engineering practices" },
  { re: /cross[-\s]?functional|collaborat|mentor|knowledge sharing|leadership|stakeholder/i, cat: "Engineering practices" },
  { re: /performance|optimiz|reliab|maintain|quality|improvement/i, cat: "Engineering practices" },
];

/** Match an uncategorized token to an existing category name. */
const PLACEMENT_RULES = [
  { token: /sql|database|dremel|data (storage|management|collection|processing)|warehouse|etl|nosql|googlesql/i, cat: /data|database|storage|analytics|query/i },
  { token: /machine learning|\bml\b|predict|model|unsupervised|neural|\bai\b|llm|embedding/i, cat: /machine|learning|\bml\b|\bai\b|intelligent|predict/i },
  { token: /multiplatform|cross[-\s]?platform/i, cat: /cross|multi|platform|mobile/i },
  { token: /front[-\s]?end|\bfed\b|react|angular|vue|microsoft front|css|html|\bui\b/i, cat: /frontend|front-end|web|ui|framework/i },
  { token: /server[-\s]?side|django|fastapi|flask|express|nest|spring|backend|graphql|rest\b|api\b|python framework/i, cat: /backend|framework|server|api|runtime|programming/i },
  { token: /^(c\+\+|c#|sql|googlesql|matlab|python|java|javascript|typescript|go|golang|rust|php|ruby|kotlin|swift|scala|bash)$/i, cat: /language|runtime/i },
  { token: /aws|azure|gcp|cloud|scalable application/i, cat: /cloud|devops|infrastructure/i },
  { token: /docker|kubernetes|container/i, cat: /container|orchestrat|cloud|devops/i },
  { token: /version control|\bgit\b|ci\/?cd|jenkins/i, cat: /ci\/?cd|devops|quality|tooling|version/i },
  { token: /agile|scrum|architecture|delivery|roadmap/i, cat: /architecture|delivery|agile|process/i },
  { token: /cross[-\s]?functional|collaborat|mentor|knowledge sharing|leadership/i, cat: /collaborat|leadership|soft|people|communication/i },
  { token: /test|debug|quality|maintenance|performance|optimiz|error|improvement/i, cat: /quality|testing|engineering|software|reliab|practice/i },
];

/** Preferred display order — DevOps/SRE-friendly first, then other layers. */
const CATEGORY_ORDER = [
  /ci\/?cd|devops|automation|pipeline|version/i,
  /container|orchestrat|kubernetes|docker/i,
  /iac|infrastructure|terraform|ansible|provision/i,
  /cloud|aws|azure|gcp/i,
  /observab|sre|monitor|prometheus|grafana|incident/i,
  /security|compliance|identity|iam/i,
  /language|runtime|script/i,
  /data|database|analytics|storage|query|cache|redis/i,
  /messaging|streaming|queue|kafka/i,
  /backend|api|service/i,
  /frontend|front-end|web|ui/i,
  /cross|multi.?platform|mobile/i,
  /machine|learning|\bai\b|intelligent|agent/i,
  /testing|qa/i,
  /architecture|delivery|agile/i,
  /engineering practice|software|collaborat|leadership/i,
  /core competenc/i,
];

function inferCategoryForToken(token) {
  const t = String(token ?? "").trim();
  if (!t) return "Engineering practices";
  for (const rule of CATEGORY_INFERENCE) {
    if (rule.re.test(t)) return rule.cat;
  }
  return "Engineering practices";
}

function pickCategoryForToken(token, categories) {
  for (const rule of PLACEMENT_RULES) {
    if (!rule.token.test(token)) continue;
    const hit = categories.find((c) => rule.cat.test(c));
    if (hit) return hit;
  }
  return null;
}

function isCatchAllCategoryName(cat) {
  const c = String(cat ?? "").trim();
  return (
    /^(technical |core |key )?skills$|^core competenc/i.test(c) ||
    /target\s+stack|stack\s+requirements?|required\s+skills?|jd\s+requirements?/i.test(
      c
    ) ||
    /^(software engineering|collaboration|collaboration & leadership|engineering tools|other|miscellaneous)$/i.test(
      c
    )
  );
}

/** Prefer an existing row that matches the inferred theme (word overlap), else null. */
function findCompatibleCategory(categories, inferred) {
  const inf = String(inferred ?? "")
    .toLowerCase()
    .trim();
  if (!inf) return null;
  const exact = categories.find((c) => c.toLowerCase() === inf);
  if (exact) return exact;
  const words = inf.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && w !== "engineering");
  if (words.length === 0) return null;
  return (
    categories.find((c) => {
      const cl = c.toLowerCase();
      if (isCatchAllCategoryName(c)) return false;
      return words.some((w) => cl.includes(w));
    }) || null
  );
}

/** Full-stack taxonomy names we must not invent when the model/profile used another stack. */
function isForcedFullStackCategoryName(cat) {
  return /^(languages|frontend engineering|backend engineering|frontend frameworks|backend & apis|languages & runtimes)$/i.test(
    String(cat ?? "").trim(),
  );
}

/**
 * Place a skill into an existing category when possible.
 * Only create a new category if the map is empty — never invent Languages /
 * Frontend / Backend rows on top of a DevOps/SRE (or other) taxonomy.
 */
function resolveSkillCategory(merged, token, preferredHint = null) {
  const cats = Object.keys(merged || {}).filter((c) => !isCatchAllCategoryName(c));
  if (preferredHint) {
    const hint = String(preferredHint).trim();
    if (hint && merged[hint]) return hint;
    const compatible = findCompatibleCategory(cats, hint);
    if (compatible) return compatible;
  }
  const byRule = pickCategoryForToken(token, cats);
  if (byRule) return byRule;
  const inferred = inferCategoryForToken(token);
  const byInfer = findCompatibleCategory(cats, inferred);
  if (byInfer) return byInfer;
  if (cats.length > 0) {
    // Keep the model's taxonomy: fold into densest existing row.
    return cats
      .slice()
      .sort(
        (a, b) =>
          (merged[b]?.length || 0) - (merged[a]?.length || 0) ||
          categoryOrderIndex(a) - categoryOrderIndex(b),
      )[0];
  }
  // Empty map only — allow inference, but avoid classic full-stack labels.
  if (isForcedFullStackCategoryName(inferred)) {
    if (/devops|kubernetes|terraform|docker|ci\/?cd|jenkins|helm|ansible/i.test(token)) {
      return "DevOps";
    }
    if (/aws|azure|gcp|cloud|lambda|ec2/i.test(token)) return "Cloud platforms";
    if (/prometheus|grafana|datadog|observab|sre|pagerduty/i.test(token)) {
      return "Observability & SRE";
    }
    return "Core technologies";
  }
  return inferred || "Core technologies";
}

/**
 * Fold uncategorized tokens into existing themed rows when possible.
 */
function placeUncategorizedSkills(merged, uncategorized) {
  const have = new Set(
    Object.values(merged)
      .flat()
      .map((s) => skillKey(s))
  );
  for (const raw of uncategorized) {
    const t = String(raw ?? "").trim();
    if (!t || have.has(skillKey(t))) continue;
    have.add(skillKey(t));
    const target = resolveSkillCategory(merged, t);
    if (!merged[target]) merged[target] = [];
    merged[target].push(t);
  }
  return merged;
}

/**
 * Break up catch-all rows ("Skills", "Core Competencies") into natural themes.
 */
export function reclassifyCatchAllSkills(skillMap) {
  const out = {};
  const toPlace = [];
  for (const [cat, list] of Object.entries(skillMap || {})) {
    if (!Array.isArray(list)) continue;
    if (isCatchAllCategoryName(cat)) {
      toPlace.push(...list);
      continue;
    }
    out[cat] = [...list];
  }
  if (toPlace.length === 0) return skillMap;
  return placeUncategorizedSkills(out, toPlace);
}

/**
 * Guarantee every JD requirement term appears in the Skills section.
 * Missing terms are filed under a natural themed row (never a single dump list).
 */
export function ensureJdTermsInSkills(skillMap, jd) {
  const terms = extractJdRequirementTerms(jd);
  if (terms.length === 0) return skillMap;
  const out = {};
  for (const [k, v] of Object.entries(skillMap || {})) {
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  const missing = findMissingJdTerms(terms, Object.values(out).flat());
  if (missing.length === 0) return out;
  return placeUncategorizedSkills(out, missing);
}

function skillMatchesAnyTerm(token, terms) {
  const t = String(token ?? "").trim();
  if (!t || !terms?.length) return false;
  const hay = t.toLowerCase();
  return terms.some((term) => {
    const tl = String(term).toLowerCase();
    if (tl.length < 2) return false;
    return hay.includes(tl) || tl.includes(hay);
  });
}

/** Frontend techniques that belong under Frontend engineering, not practices. */
const FRONTEND_TECHNIQUE_SKILL =
  /server[-\s]?side\s+render(?:ing)?|client[-\s]?side\s+rout(?:ing)?|client[-\s]?side\s+render(?:ing)?|server\s+components?|app\s+router|pages?\s+router|\bssr\b|\bcsr\b|\bssg\b|\bisr\b|responsive\s*design|web\s+accessibility|\baccessibility\b|\ba11y\b/i;

/** Practices/methods — not concrete languages, frameworks, platforms, or frontend techniques. */
const METHOD_LIKE_SKILL =
  /\b(internationali[sz]ation|\bi18n\b|locali[sz]ation|\bl10n\b|frontend\s+architecture|reusable\s+components?|component\s+design|browser\s+rendering|core\s+web\s+vitals|caching|code\s+review|pair\s+programming|agile|scrum|kanban|mentorship|mentoring|collaboration|knowledge\s+sharing|incremental\s+delivery|technical\s+design\s+reviews?|design\s+review|scalable\s+architecture|software\s+design|cross[-\s]?functional|engineering\s+mentorship|performance\s+measurement|conversion\s+optimi[sz]ation|user\s+experience\s+optimi[sz]ation|growth\s+experimentation|publishing\s+workflows?|content\s+modeling|website\s+modernization|crawlability|canonicalization|redirect\s+management|site\s+architecture|structured\s+content|structured\s+data|metadata|search\s+indexing|technical\s+seo|progressive\s+web|service\s+workers?|multiplatform\s+application\s+development|front\s*end\s+development)\b/i;

/** Concrete named tech: languages, frameworks, libraries, platforms, protocols. */
const CONCRETE_TECH_SKILL =
  /\b(react(?:\.?js)?|next\.?js|nuxt|vue(?:\.?js)?|angular|svelte|astro|gatsby|remix|ember|backbone|jquery|typescript|javascript|python|django|fastapi|flask|java\b|spring|kotlin|swift|c\+\+|c#|\.net|node(?:\.?js)?|express(?:\.?js)?|nestjs|graphql|rest\b|openapi|html5?|css3?|sass|less|tailwind|bootstrap|aws|azure|gcp|docker|kubernetes|helm|terraform|ansible|postgres(?:ql)?|mysql|mongodb|redis|kafka|rabbitmq|elasticsearch|opensearch|datadog|prometheus|grafana|jest|cypress|playwright|pytest|junit|git\b|github|gitlab|jenkins|lambda|s3|ec2|rds|sql\b|nosql|pandas|numpy|pytorch|tensorflow|scikit|fastapi|laravel|rails|php|go\b|golang|rust|ruby|scala|hadoop|spark|airflow|snowflake|bigquery|dremel|matlab|fastapi|prisma|typeorm|sequelize|webpack|vite|babel|eslint|prettier|storybook|figma|jira|confluence|splunk|sentry|new\s*relic|pagerduty|openai|langchain|pinecone|weaviate|payload\s*cms|contentful|sanity|strapi|wordpress|shopify|salesforce|service\s*now)\b/i;

function isMethodLikeSkill(token) {
  const t = String(token ?? "");
  if (FRONTEND_TECHNIQUE_SKILL.test(t)) return false;
  return METHOD_LIKE_SKILL.test(t);
}

function isConcreteTechSkill(token) {
  const t = String(token ?? "").trim();
  if (!t) return false;
  if (isMethodLikeSkill(t)) return false;
  if (CONCRETE_TECH_SKILL.test(t)) return true;
  // CamelCase / dotted product names (Next.js, GraphQL) already covered; short ALLCAPS acronyms
  if (/^[A-Z]{2,8}$/.test(t)) return true;
  // Multi-word Proper tech phrases without method cues
  if (/^[A-Z][A-Za-z0-9+.#/\-]+(?:\s+[A-Z][A-Za-z0-9+.#/\-]+)+$/.test(t) && !isMethodLikeSkill(t))
    return true;
  return false;
}

function isTechCategoryName(cat) {
  return /framework|language|runtime|backend|frontend|front-end|api|cloud|container|orchestrat|data|database|ai\b|intelligent|testing|ci\/?cd|cross|multi.?platform|mobile/i.test(
    String(cat ?? "")
  );
}

/**
 * Move method/practice tokens out of framework/language/tech rows into
 * Architecture & delivery (or Engineering practices).
 */
export function relocateMethodsFromTechCategories(skillMap) {
  if (!skillMap || typeof skillMap !== "object") return skillMap;
  const out = {};
  const methods = [];
  const frontendTechniques = [];
  for (const [cat, list] of Object.entries(skillMap)) {
    if (!Array.isArray(list)) continue;
    if (!isTechCategoryName(cat)) {
      // Pull frontend techniques out of Engineering practices / dump rows
      if (/engineering practice|architecture|delivery|collaborat/i.test(cat)) {
        const kept = [];
        for (const tok of list) {
          if (FRONTEND_TECHNIQUE_SKILL.test(String(tok ?? ""))) frontendTechniques.push(tok);
          else kept.push(tok);
        }
        if (kept.length) out[cat] = kept;
        continue;
      }
      out[cat] = [...list];
      continue;
    }
    const kept = [];
    for (const tok of list) {
      if (FRONTEND_TECHNIQUE_SKILL.test(String(tok ?? ""))) {
        frontendTechniques.push(tok);
        continue;
      }
      if (isMethodLikeSkill(tok)) methods.push(tok);
      else kept.push(tok);
    }
    if (kept.length) out[cat] = kept;
  }

  if (frontendTechniques.length) {
    const frontKey =
      Object.keys(out).find((c) => /frontend|front-end|ui|web/i.test(c)) ||
      Object.keys(out).find((c) => !isCatchAllCategoryName(c)) ||
      null;
    if (frontKey) {
      out[frontKey] = dedupeSkillsPreserveOrder(
        out[frontKey] || [],
        frontendTechniques,
      );
    }
    // If there is no suitable row (e.g. pure DevOps resume), drop UI technique labels.
  }

  if (methods.length === 0) return out;

  const dest =
    Object.keys(out).find((c) => /engineering practice|practice/i.test(c)) ||
    Object.keys(out).find((c) => /architecture|delivery/i.test(c)) ||
    Object.keys(out).find((c) => !isCatchAllCategoryName(c)) ||
    null;
  if (dest) {
    out[dest] = dedupeSkillsPreserveOrder(out[dest] || [], methods);
  }
  return out;
}

function categoryOrderIndex(cat) {
  const c = String(cat ?? "");
  const idx = CATEGORY_ORDER.findIndex((re) => re.test(c));
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

/**
 * Within each skills row: concrete languages/frameworks first (JD-required first),
 * then methods/practices. Category rows stay in natural stack-layer order.
 */
export function prioritizeJdTermsInSkills(skillMap, jd) {
  if (!skillMap || typeof skillMap !== "object") return skillMap;
  const required = jd ? extractJdMustHavePhrases(jd) : [];
  const allTerms = jd ? extractJdRequirementTerms(jd) : [];

  const rankToken = (token) => {
    const t = String(token ?? "").trim();
    // Named frameworks first, then languages/markup, then acronyms, then methods
    let concrete = 0;
    if (isMethodLikeSkill(t)) concrete = 0;
    else if (
      /\b(react|next\.?js|vue|angular|astro|svelte|django|fastapi|flask|express|nestjs|spring|rails|laravel|flutter|react\s*native)\b/i.test(
        t
      )
    )
      concrete = 12;
    else if (CONCRETE_TECH_SKILL.test(t)) concrete = 8;
    else if (/^[A-Z]{2,8}$/.test(t)) concrete = 3;
    else if (isConcreteTechSkill(t)) concrete = 5;
    else concrete = 2;
    const jdBoost = skillMatchesAnyTerm(t, required)
      ? 2
      : skillMatchesAnyTerm(t, allTerms)
        ? 1
        : 0;
    return concrete + jdBoost;
  };

  const entries = Object.entries(skillMap).map(([cat, list]) => {
    const arr = Array.isArray(list) ? [...list] : [];
    arr.sort((a, b) => {
      const d = rankToken(b) - rankToken(a);
      if (d !== 0) return d;
      // Prefer shorter product names ahead of long phrases within same tier
      return String(a).length - String(b).length;
    });
    return { cat, arr };
  });

  entries.sort((a, b) => {
    const oa = categoryOrderIndex(a.cat);
    const ob = categoryOrderIndex(b.cat);
    if (oa !== ob) return oa - ob;
    const sa = a.arr.reduce((s, t) => s + rankToken(t), 0);
    const sb = b.arr.reduce((s, t) => s + rankToken(t), 0);
    return sb - sa;
  });

  const out = {};
  for (const { cat, arr } of entries) {
    if (arr.length) out[cat] = arr;
  }
  return out;
}

/**
 * Normalize profile / AI certifications for export.
 * Accepts string[], or objects with name/title (+ optional issuer, date/year).
 * Profile wins; AI entries are appended only when not already present.
 * Never invents certifications — empty when neither source has any.
 */
export function normalizeCertifications(profileCerts, aiCerts = null) {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    if (raw == null) return;
    if (typeof raw === "string") {
      const name = raw.trim();
      if (!name) return;
      const k = name.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ name });
      return;
    }
    if (typeof raw === "object") {
      const name = String(raw.name || raw.title || raw.certification || "").trim();
      if (!name) return;
      const k = name.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      const issuer = String(raw.issuer || raw.org || raw.organization || "").trim();
      const date = String(
        raw.date || raw.year || raw.issued || raw.end_year || ""
      ).trim();
      out.push({
        name,
        ...(issuer ? { issuer } : {}),
        ...(date ? { date } : {}),
      });
    }
  };
  const fromProfile = Array.isArray(profileCerts) ? profileCerts : [];
  const fromAi = Array.isArray(aiCerts) ? aiCerts : [];
  fromProfile.forEach(add);
  fromAi.forEach(add);
  return out;
}

function dedupeSkillsPreserveOrder(primary, secondary) {
  const seen = new Set();
  const out = [];
  for (const s of [...primary, ...secondary]) {
    const t = String(s).trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Outcome/metrics prose from profile — belongs in Experience bullets, not Summary or Skills. */
function isImpactHighlightsCategoryName(cat) {
  const c = String(cat ?? "")
    .trim()
    .toLowerCase();
  if (!c) return false;
  return /\bimpact\s+highlights?\b/.test(c);
}

/** Categories that are résumé prose (belong in Summary), not the Skills section. */
function isNarrativeSkillsCategoryName(cat) {
  const c = String(cat ?? "")
    .trim()
    .toLowerCase();
  if (!c) return false;
  if (isImpactHighlightsCategoryName(cat)) return false;
  return (
    /\bprofessional\s+summary\b/.test(c) ||
    /\bcareer\s+summary\b/.test(c) ||
    /\bexecutive\s+summary\b/.test(c) ||
    /\bprofile\s+summary\b/.test(c) ||
    /\bkey\s+highlights?\b/.test(c)
  );
}

function canonicalSkillCategoryKey(cat) {
  return String(cat ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Only fold obvious duplicate / junk titles. Preserve AI-invented stack-specific
 * names (DevOps/SRE/IaC/etc.) — do NOT remap everything onto a Full-Stack taxonomy.
 */
const CATEGORY_ALIASES = [
  {
    match: /^(technical |core |key )?skills$|^miscellaneous$|^other$|^general$/i,
    target: "Engineering practices",
  },
  {
    match: /target\s+stack|stack\s+requirements?|required\s+skills?|jd\s+requirements?/i,
    target: "Engineering practices",
  },
];

/** Lead theme word used to collapse near-duplicate titles (Architecture & X / Architecture & Y). */
function categoryThemeKey(cat) {
  const c = canonicalSkillCategoryKey(resolveCategoryAlias(cat));
  const stop = new Set([
    "and",
    "or",
    "the",
    "of",
    "for",
    "with",
    "to",
    "in",
    "a",
    "an",
  ]);
  const words = c.split(" ").filter((w) => w && !stop.has(w));
  return words[0] || c;
}

function resolveCategoryAlias(cat) {
  const c = String(cat ?? "").trim();
  if (!c) return c;
  for (const { match, target } of CATEGORY_ALIASES) {
    if (match.test(c)) return target;
  }
  return c;
}

/**
 * Merge skill categories whose names differ only by punctuation (e.g. "Cloud and DevOps" vs "Cloud & DevOps"),
 * fold odd AI titles (e.g. "Modern Web Frameworks"), and collapse duplicate themes
 * (e.g. "Architecture & Engineering Leadership" + "Architecture & delivery").
 */
export function mergeDuplicateSkillCategories(skillMap) {
  const entries = Object.entries(skillMap || {}).filter(
    ([, v]) => Array.isArray(v) && v.length > 0
  );
  const buckets = new Map();
  const order = [];
  for (const [cat, list] of entries) {
    const label = resolveCategoryAlias(cat);
    // Theme key collapses "Architecture & …" duplicates onto one bucket
    const can = categoryThemeKey(label);
    if (!buckets.has(can)) {
      buckets.set(can, { label, items: [] });
      order.push(can);
    } else {
      // Prefer the aliased canonical label when we already have a bucket
      const preferred = resolveCategoryAlias(buckets.get(can).label);
      if (preferred !== buckets.get(can).label) {
        buckets.get(can).label = preferred;
      }
      // If new label is the alias target, upgrade the display name
      if (label === resolveCategoryAlias(label) && /architecture|cloud|data|frontend|backend|ci\/?cd/i.test(label)) {
        buckets.get(can).label = label;
      }
    }
    const b = buckets.get(can);
    b.items = dedupeSkillsPreserveOrder(b.items, normalizeStringList(list));
  }
  const out = {};
  for (const can of order) {
    const { label, items } = buckets.get(can);
    out[label] = items;
  }
  return out;
}

/**
 * Cap skills to 7–10 distinct rows. If over max, fold the smallest overflow rows
 * into the closest remaining theme (or Engineering practices).
 */
export function limitSkillCategoryCount(skillMap, { min = 7, max = 10 } = {}) {
  const entries = Object.entries(skillMap || {}).filter(
    ([, v]) => Array.isArray(v) && v.length > 0
  );
  if (entries.length <= max) return skillMap;

  // Keep the densest / earliest categories; fold the rest
  const ranked = entries
    .map(([cat, list]) => ({
      cat,
      list,
      score: list.length * 2 + (categoryOrderIndex(cat) < 99 ? 1 : 0),
      order: categoryOrderIndex(cat),
    }))
    .sort((a, b) => a.order - b.order || b.score - a.score);

  const keep = ranked.slice(0, max);
  const drop = ranked.slice(max);
  const out = {};
  for (const { cat, list } of keep) out[cat] = [...list];

  for (const { list } of drop) {
    const cats = Object.keys(out);
    // Only fold into an existing kept row — never create an 11th category
    let target =
      findCompatibleCategory(cats, resolveCategoryAlias(list[0] || "")) ||
      pickCategoryForToken(list[0] || "", cats) ||
      cats[cats.length - 1];
    if (!target || !out[target]) target = cats[0];
    out[target] = dedupeSkillsPreserveOrder(out[target], list);
  }

  // min is soft — we don't invent empty categories
  void min;
  return out;
}

/**
 * Adjacent stack packs: when the JD (or skills) mention a family, add common
 * related languages / frameworks so Skills is dense — never a thin required-only list.
 */
const ADJACENT_STACK_PACKS = [
  {
    cue: /python|django|fastapi|flask/i,
    add: {
      "Languages & runtimes": ["Python"],
      "Backend & APIs": ["Django", "FastAPI", "Flask", "REST", "OpenAPI"],
    },
  },
  {
    cue: /javascript|typescript|react|node|front.?end|\bfed\b|vue|angular/i,
    add: {
      "Languages & runtimes": ["TypeScript", "JavaScript", "Node.js"],
      "Frontend frameworks": ["React.js", "Next.js", "HTML5", "CSS3"],
      "Backend & APIs": ["Express.js", "REST", "GraphQL"],
    },
  },
  {
    cue: /multiplatform|cross[-\s]?platform|mobile/i,
    add: {
      "Cross-platform development": ["React Native", "Flutter"],
    },
  },
  {
    cue: /java\b|spring/i,
    add: {
      "Languages & runtimes": ["Java"],
      "Backend & APIs": ["Spring Boot", "REST"],
    },
  },
  {
    cue: /\.net|c#|csharp/i,
    add: {
      "Languages & runtimes": ["C#"],
      "Backend & APIs": [".NET", "ASP.NET Core", "REST"],
    },
  },
  {
    cue: /aws|azure|gcp|cloud/i,
    add: {
      "Cloud services": ["AWS (Lambda, S3, EC2, RDS)", "Docker"],
      "Containers & orchestration": ["Docker", "Kubernetes"],
    },
  },
  {
    cue: /sql|database|postgres|mysql|mongodb|redis/i,
    add: {
      "Data & analytics": ["SQL", "PostgreSQL", "Redis"],
    },
  },
  {
    cue: /agile|scrum|devops|ci\/?cd|git|version control/i,
    add: {
      "CI/CD & quality": ["Git", "GitHub Actions", "Jenkins"],
      "Architecture & delivery": ["Agile", "Scrum", "Code review"],
    },
  },
];

/**
 * Add related languages/frameworks for stacks already present in the JD or skills map.
 */
export function enrichAdjacentStackSkills(skillMap, jd = "") {
  const hay = [
    String(jd ?? ""),
    ...Object.keys(skillMap || {}),
    ...Object.values(skillMap || {}).flat(),
  ]
    .join(" ")
    .toLowerCase();

  const out = {};
  for (const [k, v] of Object.entries(skillMap || {})) {
    out[k] = Array.isArray(v) ? [...v] : [];
  }
  const have = new Set(
    Object.values(out)
      .flat()
      .map((s) => skillKey(s))
  );

  const existingCats = Object.keys(out).filter((c) => !isCatchAllCategoryName(c));
  if (existingCats.length === 0) return out;

  for (const pack of ADJACENT_STACK_PACKS) {
    if (!pack.cue.test(hay)) continue;
    for (const [cat, tokens] of Object.entries(pack.add)) {
      for (const tok of tokens) {
        const k = skillKey(tok);
        if (!k || have.has(k)) continue;
        const target = resolveSkillCategory(out, tok, cat);
        if (
          !out[target] &&
          isForcedFullStackCategoryName(cat) &&
          isForcedFullStackCategoryName(target)
        ) {
          continue;
        }
        have.add(k);
        if (!out[target]) out[target] = [];
        out[target].push(tok);
      }
    }
  }
  return out;
}

/**
 * One paragraph for PDF/Word: strip paragraph breaks and collapse whitespace.
 * Kept for callers that still want a single paragraph.
 */
export function normalizeSummaryToSingleParagraph(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coerce AI `summary` / `summaryBullets` into a clean string[] for export.
 * Accepts: string[], newline-separated string, or "• "-prefixed lines.
 */
export function coerceSummaryBullets(summary) {
  if (Array.isArray(summary)) {
    return summary.map((s) => String(s ?? "").trim()).filter(Boolean).map((s) =>
      s.replace(/^[-•*]\s+/, "").trim()
    );
  }
  const raw = String(summary ?? "").trim();
  if (!raw) return [];
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((s) => s.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines;
  // Single blob — keep as one line (legacy paragraph summaries still render)
  return [raw.replace(/\s+/g, " ").trim()].filter(Boolean);
}

/**
 * Export summary as ONE paragraph (accepts string or string[]; arrays are joined with spaces).
 */
export function normalizeSummaryForExport(summary) {
  return normalizeSummaryToSingleParagraph(
    coerceSummaryBullets(summary).join(" ")
  );
}

/**
 * Remove narrative categories from a skill map: summary prose vs quantified outcome blurbs.
 * `snippets` fold into exported Summary; `experienceContextSnippets` must be covered in work bullets only.
 */
export function extractNarrativeSnippetsFromSkillMap(skillMap) {
  const map = skillMap && typeof skillMap === "object" ? { ...skillMap } : {};
  const snippets = [];
  const experienceContextSnippets = [];
  for (const [cat, val] of Object.entries(map)) {
    const blob = Array.isArray(val)
      ? val.map((x) => String(x).trim()).filter(Boolean).join(" ")
      : typeof val === "string" && val.trim()
        ? val.trim()
        : "";
    if (!blob) continue;

    if (isImpactHighlightsCategoryName(cat)) {
      delete map[cat];
      experienceContextSnippets.push(blob);
      continue;
    }
    if (!isNarrativeSkillsCategoryName(cat)) continue;
    delete map[cat];
    snippets.push(blob);
  }
  return { skillMap: map, snippets, experienceContextSnippets };
}

/**
 * Normalize profile `base_skills` to a category → skills[] map for merge + PDF.
 * @param {unknown} baseSkills
 * @returns {Record<string, string[]>}
 */
export function normalizeBaseSkillsToSkillMap(baseSkills) {
  if (baseSkills == null) return {};

  if (Array.isArray(baseSkills)) {
    const out = {};
    for (const row of baseSkills) {
      const s = String(row).trim();
      if (!s) continue;
      const ci = s.indexOf(":");
      let cat;
      let rest;
      if (ci === -1) {
        // Bare token / comma list with no "Category:" — never becomes its own "Skills" row
        cat = UNCATEGORIZED_SKILLS_KEY;
        rest = s;
      } else {
        cat = s.slice(0, ci).trim() || UNCATEGORIZED_SKILLS_KEY;
        rest = s.slice(ci + 1).trim();
      }
      // A literal "Skills:" / "Technical Skills:" label is just as uncategorized
      if (/^(technical\s+|core\s+|key\s+)?skills$/i.test(cat)) {
        cat = UNCATEGORIZED_SKILLS_KEY;
      }
      const parts =
        isNarrativeSkillsCategoryName(cat) || isImpactHighlightsCategoryName(cat)
          ? rest
            ? [rest]
            : []
          : splitSkillsListLine(rest);
      if (!parts.length) continue;
      if (!out[cat]) out[cat] = [];
      out[cat].push(...parts);
    }
    for (const k of Object.keys(out)) {
      out[k] = dedupeSkillsPreserveOrder(out[k], []);
    }
    return out;
  }

  if (typeof baseSkills === "object") {
    const out = {};
    for (const [k, v] of Object.entries(baseSkills)) {
      if (Array.isArray(v)) {
        if (isNarrativeSkillsCategoryName(k) || isImpactHighlightsCategoryName(k)) {
          const blob = normalizeStringList(v).join(" ").replace(/\s+/g, " ").trim();
          out[k] = blob ? [blob] : [];
        } else {
          out[k] = dedupeSkillsPreserveOrder(normalizeStringList(v), []);
        }
      } else if (typeof v === "string") {
        out[k] =
          isNarrativeSkillsCategoryName(k) || isImpactHighlightsCategoryName(k)
            ? dedupeSkillsPreserveOrder(
                v.trim() ? [v.replace(/\s+/g, " ").trim()] : [],
                []
              )
            : dedupeSkillsPreserveOrder(splitSkillsListLine(v), []);
      }
    }
    return out;
  }

  return {};
}

export function profileHasPermanentContent(profileData) {
  if (!profileData || typeof profileData !== "object") return false;
  const skillMap = normalizeBaseSkillsToSkillMap(profileData.base_skills);
  if (Object.values(skillMap).some((arr) => arr.length > 0)) return true;
  const jobs = profileData.experience;
  if (!Array.isArray(jobs)) return false;
  return jobs.some((job) => {
    const b = normalizeStringList(job?.base_bullets ?? job?.base_details);
    return b.length > 0;
  });
}

/**
 * Text block for the AI prompt: permanent bullets per role + base skills.
 */
export function formatPermanentContextForPrompt(profileData) {
  if (!profileData || typeof profileData !== "object") {
    return "None — generate full skills and experience bullets from the profile and JD.";
  }

  const lines = [];
  const jobs = Array.isArray(profileData.experience)
    ? profileData.experience
    : [];

  jobs.forEach((job, idx) => {
    const bullets = normalizeStringList(job.base_bullets ?? job.base_details);
    if (bullets.length === 0) return;
    const company = job.company || `Role ${idx + 1}`;
    const title = job.title ? ` — ${job.title}` : "";
    lines.push(`**${company}${title}**`);
    bullets.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
  });

  const skillMap = normalizeBaseSkillsToSkillMap(profileData.base_skills);
  const {
    skillMap: techSkillMap,
    snippets: narrativeSnippets,
    experienceContextSnippets,
  } = extractNarrativeSnippetsFromSkillMap(skillMap);

  if (narrativeSnippets.length > 0) {
    lines.push(
      "**Base prose for Summary (context only).** The exported summary uses only your JSON summary field. Distill this into one fresh paragraph under the Professional Summary rules. Do not paste it verbatim. Weave missing facts into details and skills. Do not echo this prose as skill categories:"
    );
    narrativeSnippets.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  if (experienceContextSnippets.length > 0) {
    lines.push(
      "**Profile quantified outcomes** (the exporter does not put these in summary; weave every documented fact into the matching role's details, never as skill tokens or a second summary paragraph):"
    );
    experienceContextSnippets.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  const uncategorizedBase = techSkillMap[UNCATEGORIZED_SKILLS_KEY] || [];
  const skillEntries = Object.entries(techSkillMap).filter(
    ([cat, arr]) => cat !== UNCATEGORIZED_SKILLS_KEY && arr.length > 0
  );
  if (skillEntries.length > 0) {
    lines.push(
      "**Base classified skill groups (always kept in the Skills section; comma-separated technical tokens only):**"
    );
    for (const [cat, arr] of skillEntries) {
      lines.push(`- **${cat}:** ${arr.join(", ")}`);
    }
    lines.push("");
  }
  if (uncategorizedBase.length > 0) {
    lines.push(
      "**Base skills with NO category** (every one must still appear in the final Skills section, but **do NOT create a row called “Skills”** and **do NOT list a skill twice**): place each into the single best-fitting category row you create, e.g. languages, data, ML, engineering practices. Tokens: " +
        uncategorizedBase.join(", ")
    );
    lines.push("");
  }

  const certs = normalizeCertifications(profileData.certifications);
  if (certs.length > 0) {
    lines.push(
      "**Profile certifications** (include in JSON `\"certifications\"` exactly — never invent new ones):"
    );
    certs.forEach((c) => {
      const bits = [c.name, c.issuer, c.date].filter(Boolean);
      lines.push(`- ${bits.join(" · ")}`);
    });
    lines.push("");
  }

  if (lines.length === 0) {
    return "None — generate full skills and experience bullets from the profile and JD.";
  }

  return (
    lines.join("\n").trim() +
    "\n\n**Merge rules:** Keep every classified base skill. You may rename or regroup categories for the detected job family, but do not drop a verified technology and do not add tools the profile does not support. Professional summary prose is context only: write a fresh one-paragraph summary and do not paste it verbatim. Impact highlights belong in the most recent roles' experience details, not as skill categories. Every base bullet fact must remain represented in that role's details (rewrite, merge, or split is fine). Do not invent employers, dates, degrees, certifications, years of experience, metrics, or undocumented tools."
  );
}

/**
 * Merge `profileData.base_skills` (first) with AI `skills` object by category.
 */
export function mergeBaseSkillsIntoAi(baseSkills, aiSkills) {
  const base = normalizeBaseSkillsToSkillMap(baseSkills);
  const ai = aiSkills && typeof aiSkills === "object" ? aiSkills : {};
  const categories = new Set([
    ...Object.keys(base),
    ...Object.keys(ai),
  ]);
  const isGenericLabel = (c) =>
    c === UNCATEGORIZED_SKILLS_KEY ||
    /^(technical\s+|core\s+|key\s+)?skills$/i.test(String(c).trim());

  const out = {};
  const uncategorized = [];
  for (const cat of categories) {
    const b = normalizeStringList(base[cat]);
    const rawAi = ai[cat];
    const a = Array.isArray(rawAi)
      ? normalizeStringList(rawAi)
      : typeof rawAi === "string"
        ? splitSkillsListLine(rawAi)
        : [];
    if (isGenericLabel(cat)) {
      // No "Skills:" row — these tokens get folded into proper categories below
      uncategorized.push(...b, ...a);
      continue;
    }
    out[cat] = dedupeSkillsPreserveOrder(b, a);
  }
  return placeUncategorizedSkills(out, uncategorized);
}

/**
 * Normalize AI JSON so both the app schema and the alternate shape (summaryBullets / skillsBullets / bullets) work:
 * - summaryBullets → summary
 * - skillsBullets ("Category: a, b") → skills object
 * - experience[].bullets → experience[].details
 * - optional fallbackTitle when model omitted `title`
 */
export function normalizeAiResumeContent(raw, { fallbackTitle } = {}) {
  if (!raw || typeof raw !== "object") return raw;
  const out = { ...raw };

  if (
    (out.summary == null || out.summary === "") &&
    out.summaryBullets != null
  ) {
    out.summary = out.summaryBullets;
  }

  const skillsEmpty =
    out.skills == null ||
    Array.isArray(out.skills) ||
    (typeof out.skills === "object" && Object.keys(out.skills).length === 0);
  if (skillsEmpty && Array.isArray(out.skillsBullets)) {
    out.skills = normalizeBaseSkillsToSkillMap(out.skillsBullets);
  }

  if (Array.isArray(out.experience)) {
    out.experience = out.experience.map((exp) => {
      if (!exp || typeof exp !== "object") return exp;
      const details = exp.details ?? exp.bullets;
      return {
        ...exp,
        details: Array.isArray(details) ? details : exp.details,
      };
    });
  }

  if (!out.title && fallbackTitle) {
    out.title = fallbackTitle;
  }

  return out;
}

/**
 * Résumé export shape: Summary = model `summary` (paragraph string; arrays are joined)
 * when non-empty; fallback joins narrative snippets if the model omitted summary.
 * Skills = base merged with model lists. Summary is exported as ONE paragraph.
 */
const RELATED_STACKS = [
  {
    when: /\b(typescript|javascript|node\.?js|nest\.?js|express(?:\.js)?|react|next\.?js|angular|vue(?:\.js)?)\b/i,
    items: [
      ["JavaScript", "Languages"],
      ["TypeScript", "Languages"],
      ["Node.js", "Backend engineering"],
      ["Nest.js", "Backend engineering"],
      ["Express.js", "Backend engineering"],
    ],
  },
  {
    when: /\b(typescript|javascript|node\.?js|nest\.?js|express(?:\.js)?)\b/i,
    items: [
      ["OpenAPI", "Backend engineering"],
      ["Redis", "Databases"],
      ["Kafka", "Messaging"],
      ["Docker", "DevOps"],
      ["Terraform", "DevOps"],
      ["Jest", "Testing"],
    ],
  },
  {
    when: /\bpython\b|\b(django|flask|fastapi)\b/i,
    items: [
      ["Python", "Languages"],
      ["FastAPI", "Backend engineering"],
      ["Django", "Backend engineering"],
      ["Flask", "Backend engineering"],
      ["Pandas", "Data engineering"],
      ["NumPy", "Data engineering"],
    ],
  },
  {
    when: /\bjava\b(?!script)|\bspring(?:\s+boot)?\b/i,
    items: [
      ["Java", "Languages"],
      ["Spring Boot", "Backend engineering"],
    ],
  },
  {
    when: /\bc#|\.net\b|\basp\.net\b/i,
    items: [
      ["C#", "Languages"],
      ["ASP.NET Core", "Backend engineering"],
    ],
  },
  {
    when: /\bgolang\b|\bgo\b|\bgin\b/i,
    items: [
      ["Go", "Languages"],
      ["Gin", "Backend engineering"],
    ],
  },
  {
    when: /\bruby\b|\brails\b/i,
    items: [
      ["Ruby", "Languages"],
      ["Ruby on Rails", "Backend engineering"],
    ],
  },
  {
    when: /\bphp\b|\blaravel\b/i,
    items: [
      ["PHP", "Languages"],
      ["Laravel", "Backend engineering"],
    ],
  },
  {
    when: /\bkotlin\b|\bswift\b/i,
    items: [["Mobile development", "Mobile engineering"]],
  },
  {
    when: /\breact\b|\bnext\.?js\b/i,
    items: [
      ["React.js", "Frontend engineering"],
      ["Next.js", "Frontend engineering"],
    ],
  },
  {
    when: /\bvue(?:\.?js)?\b/i,
    items: [
      ["Vue.js", "Frontend engineering"],
      ["Nuxt", "Frontend engineering"],
    ],
  },
  {
    when: /\bangular\b/i,
    items: [["Angular", "Frontend engineering"]],
  },
  {
    when: /\bpostgres/i,
    items: [["PostgreSQL", "Databases"]],
  },
  {
    when: /\bmysql\b/i,
    items: [["MySQL", "Databases"]],
  },
  {
    when: /\bspark\b|\bpyspark\b/i,
    items: [
      ["Python", "Languages"],
      ["PySpark", "Data engineering"],
    ],
  },
  {
    when: /\bkafka\b/i,
    items: [["Kafka", "Messaging"]],
  },
  {
    when: /\b(machine learning|deep learning|artificial intelligence|pytorch|tensorflow|scikit-learn|keras)\b|\b(ai|ml)\s+engineer(?:ing)?\b/i,
    items: [
      ["Python", "Languages"],
      ["PyTorch", "AI & machine learning"],
      ["TensorFlow", "AI & machine learning"],
      ["scikit-learn", "AI & machine learning"],
      ["Keras", "AI & machine learning"],
      ["XGBoost", "AI & machine learning"],
      ["NumPy", "Data engineering"],
      ["Pandas", "Data engineering"],
    ],
  },
  {
    when: /\bkubernetes\b|\bk8s\b/i,
    items: [
      ["Docker", "DevOps"],
      ["Kubernetes", "DevOps"],
      ["Helm", "DevOps"],
    ],
  },
  {
    when: /\bterraform\b/i,
    items: [["Terraform", "DevOps"]],
  },
  {
    when: /\baws\b|\bamazon web services\b/i,
    items: [["AWS", "Cloud engineering"]],
  },
  {
    when: /\bazure\b/i,
    items: [["Azure", "Cloud engineering"]],
  },
  {
    when: /\bgcp\b|\bgoogle cloud\b/i,
    items: [["GCP", "Cloud engineering"]],
  },
];

const GUARDED_PRODUCTS = new Set([
  "react",
  "react.js",
  "next.js",
  "convex",
  "vue.js",
  "nuxt",
  "angular",
  "nest.js",
  "express.js",
  "node.js",
  "fastapi",
  "django",
  "flask",
  "spring boot",
  "gin",
  "laravel",
  "ruby on rails",
  "asp.net core",
  "pytorch",
  "tensorflow",
  "scikit-learn",
  "keras",
  "xgboost",
  "pandas",
  "numpy",
  "postgresql",
  "mysql",
  "mongodb",
  "docker",
  "kubernetes",
  "helm",
  "terraform",
  "aws",
  "azure",
  "gcp",
  "kafka",
  "graphql",
  "typescript",
  "javascript",
  "python",
  "java",
  "go",
  "c#",
  "redis",
]);

function productIsGuarded(name) {
  const key = String(name || "").toLowerCase();
  if (GUARDED_PRODUCTS.has(key)) return key;
  for (const product of GUARDED_PRODUCTS) {
    if (key.startsWith(product + " ") || key.startsWith(product + "(")) return product;
  }
  return "";
}

function textNamesProduct(text, product) {
  const blob = String(text || "");
  if (product === "react" || product === "react.js") {
    return /\breact(?:\.js)?\b/i.test(blob);
  }
  const escaped = product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(blob);
}

/** Drop product names the candidate materials do not contain. Related libraries are added later from documented stacks. */
export function dropUnevidencedProducts(skillMap, evidenceText = "") {
  const out = {};
  const seen = new Set();
  for (const [cat, list] of Object.entries(skillMap || {})) {
    out[cat] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const name = canonicalSkillName(raw);
      if (!name) continue;
      const guarded = productIsGuarded(name);
      if (guarded && !textNamesProduct(evidenceText, guarded)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out[cat].push(name);
    }
    if (!out[cat].length) delete out[cat];
  }
  return out;
}

/**
 * Add related tools for stacks named in the candidate materials.
 * Places companions into the model's existing categories — does not invent a
 * Full-Stack Languages/Frontend/Backend taxonomy on top of DevOps/SRE/etc.
 */
export function enrichRelatedStacks(skillMap, extraText = "") {
  const blob = String(extraText || "");
  const out = {};
  const seen = new Set();
  for (const [cat, list] of Object.entries(skillMap || {})) {
    out[cat] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const name = String(raw ?? "").trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out[cat].push(name);
    }
    if (!out[cat].length) delete out[cat];
  }
  const existingCats = Object.keys(out);
  if (existingCats.length === 0) return out;

  for (const group of RELATED_STACKS) {
    group.when.lastIndex = 0;
    if (!group.when.test(blob)) continue;
    for (const [name, preferredCat] of group.items) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      // Skip companions that would only create a forced full-stack row.
      const target = resolveSkillCategory(out, name, preferredCat);
      if (
        !out[target] &&
        isForcedFullStackCategoryName(preferredCat) &&
        isForcedFullStackCategoryName(target)
      ) {
        continue;
      }
      seen.add(key);
      if (!out[target]) out[target] = [];
      out[target].push(name);
    }
  }
  return out;
}

export function finalizeExportedResumeSummaryAndSkills(
  baseSkills,
  aiSummary,
  aiSkills,
  jd = null,
  evidenceText = ""
) {
  const baseMap = normalizeBaseSkillsToSkillMap(baseSkills);
  const { skillMap: baseTech, snippets: baseNar } =
    extractNarrativeSnippetsFromSkillMap(baseMap);

  const aiMap = normalizeBaseSkillsToSkillMap(
    aiSkills && typeof aiSkills === "object" ? aiSkills : {}
  );
  const { skillMap: aiTech, snippets: aiNar } =
    extractNarrativeSnippetsFromSkillMap(aiMap);

  const candidateText = [evidenceText, ...Object.values(baseTech).flat()]
    .filter(Boolean)
    .join(" ");
  const stackText = [candidateText, jd].filter(Boolean).join(" ");
  const merged = enrichRelatedStacks(
    dropUnevidencedProducts(
      addDemonstratedSkills(mergeBaseSkillsIntoAi(baseTech, aiTech), stackText),
      stackText
    ),
    stackText
  );
  // One row per theme. Required JD languages and their related stacks stay in skills.
  const skills = sanitizeSkillMap(
    prioritizeJdTermsInSkills(
      limitSkillCategoryCount(
        relocateMethodsFromTechCategories(
          dedupeSkillsAcrossCategories(
            reclassifyCatchAllSkills(mergeDuplicateSkillCategories(merged))
          )
        ),
        { min: 7, max: 12 }
      ),
      jd
    )
  );

  const fromAi = coerceSummaryBullets(aiSummary);
  const summary = stripDraftWording(toAsciiPunctuation(
    normalizeSummaryForExport(
      fromAi.length
        ? fromAi
        : [...baseNar, ...aiNar].filter(Boolean)
    )
  ));

  return { summary, skills };
}

/**
 * Per job: merge AI `details` with `base_bullets` so **no base facts are lost** (heuristic + same-count glue).
 * Bullet count may differ from the profile when the model merges lines.
 */
export function mergeExperienceDetails(profileJobs, aiExperience) {
  const jobs = Array.isArray(profileJobs) ? profileJobs : [];
  const ai = Array.isArray(aiExperience) ? aiExperience : [];
  return jobs.map((job, idx) => {
    const base = normalizeStringList(job.base_bullets ?? job.base_details);
    const fromAi = normalizeStringList(ai[idx]?.details);
    return mergeDetailsForOneRole(base, fromAi);
  });
}
