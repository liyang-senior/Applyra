/**
 * Export-time cleanup. Removes template keyword bullets and unsupported
 * technology claims. Does not invent experience or skills.
 */

const TEMPLATE_BULLET =
  /^(delivered production features with|owned end-to-end work on|improved systems involving|built and shipped features using|applied .+ to maintain and improve production systems|delivered client-facing work with|collaborated across design, product, and operations on)\b/i;

const FORBIDDEN_FRAGMENTS = [
  /using experience and capabilities/gi,
  /owned end-to-end work on capabilities/gi,
  /delivered production features with code review/gi,
  /partnering with product and engineering peers to validate outcomes, document decisions, and sustain reliable delivery under changing priorities/gi,
  /\s+[—–]\s+with hands-on use of [^.]+\.?/gi,
];

const MEANINGLESS_SKILL =
  /^(experience|capabilities|requirements|responsibilities|skills|technical skills|computer skills|software skills|hard skills|problem solving|fast learner|technology|modern development|programming|full[-\s]?stack development|backend application development|user interface development|website development|software maintenance|application development|technical problem[-\s]?solving|data loading|form handling|error handling|user management|database indexing|schema validation|application routing|module provisioning|production debugging|deployment workflows|configuration management|performance optimization|third[-\s]?party api integration|secure credential management|business requirements|developer coordination|product design collaboration|in[-\s]?house desktop application development|mvp development|technical leadership|technical specifications|server[-\s]?side engineering|data[-\s]?backed web applications|database development|database maintenance|database design)$/i;

const PROGRAMMING_LANGUAGE =
  /^(c\+\+|c#|sql|googlesql|matlab|python|java|javascript|typescript|go|golang|rust|php|ruby|kotlin|swift|scala|bash)$/i;

const TECH_TOKEN =
  /\b(python|java|javascript|typescript|c\+\+|c#|golang|go|rust|php|ruby|kotlin|swift|matlab|spring(?:\s+boot)?|fastapi|django|flask|mongodb|postgres(?:ql)?|mysql|redis|react(?:\.js)?|next\.js|convex|nest\.js|express(?:\.js)?|vue(?:\.js)?|angular|node(?:\.js)?|kubernetes|terraform|docker|aws|azure|gcp|kafka|spark|pytorch|tensorflow|scikit-learn|sklearn)\b/gi;

const SYNONYM_CANON = [
  [/^(google\s+)?dremel$/i, "Dremel"],
  [/^(amazon web services|aws)$/i, "AWS"],
  [/^(google cloud platform|gcp)$/i, "GCP"],
  [/^(react\.js|reactjs|react)$/i, "React.js"],
  [/^(node\.js|nodejs)$/i, "Node.js"],
  [/^(nest\.?js|nestjs)$/i, "Nest.js"],
  [/^(express\.?js|expressjs)$/i, "Express.js"],
  [/^(next\.?js|nextjs)$/i, "Next.js"],
  [/^(vue\.?js|vuejs)$/i, "Vue.js"],
  [/^(sklearn|scikit[\s-]?learn)$/i, "scikit-learn"],
  [
    /^convex(?:\s+(?:database|schemas?|queries|mutations|actions|scheduling|access\s+control|validation|background\s+jobs?))?$/i,
    "Convex",
  ],
  [/^(ruby on rails|rails)$/i, "Ruby on Rails"],
  [/^(entity framework)$/i, "Entity Framework"],
  [/^(tailwind css|tailwind)$/i, "Tailwind CSS"],
  [/^(shadcn\/ui|shadcn)$/i, "shadcn/ui"],
];

export function toAsciiPunctuation(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

export function isMeaninglessSkill(token) {
  return MEANINGLESS_SKILL.test(String(token ?? "").trim());
}

export function canonicalSkillName(token) {
  const t = stripReviewLabels(toAsciiPunctuation(token)).replace(/\s+/g, " ").trim();
  if (!t || isMeaninglessSkill(t)) return "";
  for (const [re, name] of SYNONYM_CANON) {
    if (re.test(t)) return name;
  }
  return t;
}

export function containsForbiddenPhrase(text) {
  const s = String(text ?? "");
  return (
    TEMPLATE_BULLET.test(s.trim()) ||
    FORBIDDEN_FRAGMENTS.some((re) => {
      re.lastIndex = 0;
      return re.test(s);
    })
  );
}

/** Remove review labels the model sometimes writes into resume text. */
export function stripReviewLabels(value) {
  return String(value ?? "")
    // Bracketed / parenthetical labels
    .replace(/\[\s*draft\s*[-–—:]\s*verify\s*\]/gi, "")
    .replace(/\[\s*(draft|proposed|unverified|verify|needs verification|illustrative)[^\]]*\]/gi, "")
    .replace(/\(\s*(draft|proposed|unverified|needs verification|illustrative)[^)]*\)/gi, "")
    // Leading "Draft - verify" / "Draft: verify" (with or without colon after)
    .replace(/^\s*draft\s*[-–—:]\s*verify(?:ified)?\b\s*[-–—:]?\s*/i, "")
    .replace(/^\s*draft\s*[-–—:]\s*unverified\b\s*[-–—:]?\s*/i, "")
    // Leading single-word draft markers
    .replace(
      /^\s*(?:draft|proposed|unverified|needs?\s+verification|verify)\s*[-–—:]\s*/i,
      ""
    )
    .replace(
      /^\s*(illustrative\s+responsibility|illustrative\s+example|suggested\s+responsibility|example\s+responsibility|example|suggested)\s*[-–—:]\s*/i,
      ""
    );
}

const DRAFT_SENTENCE =
  /\b(resume draft|draft resume|proposed experience|proposed responsibilities|jd-targeted draft|require(?:s)? confirmation|pending confirmation|unverified claims?|not documented in (the )?supplied materials|not (present |listed |found )?in (the )?supplied materials|absent from (the )?(supplied materials|profile|candidate materials)|not confirmed in (the )?(profile|candidate materials|supplied materials)|inferred from the (job description|jd)|added from the (job description|jd)|assumed from the (job description|jd))\b/i;

/** Remove wording that makes a finished resume sound like an unreviewed draft. */
export function stripDraftWording(value) {
  let s = stripReviewLabels(value);
  const sentences = s.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((part) => part.trim() && !DRAFT_SENTENCE.test(part));
  s = kept.length > 0 && kept.length < sentences.length ? kept.join(" ") : s;
  s = s.replace(/\bthis\s+resume\s+draft\b/gi, "This resume");
  s = s.replace(/\bresume\s+draft\b/gi, "");
  s = s.replace(/\bdraft\s+resume\b/gi, "");
  s = s.replace(/\bproposed\s+experience\b/gi, "");
  s = s.replace(/\bproposed\s+responsibilities\b/gi, "");
  s = s.replace(/\bthis\s+jd-targeted\s+draft\b[^.]*\.?\s*/gi, "");
  s = s.replace(/\bjd-targeted\s+draft\b/gi, "");
  s = s.replace(/\b(responsibilities|statements|claims|details|experience)\s+(that\s+)?require(?:s)?\s+confirmation\b[^.]*\.?\s*/gi, "");
  s = s.replace(/\brequire(?:s)?\s+confirmation\b/gi, "");
  s = s.replace(/\bpending\s+confirmation\b/gi, "");
  s = s.replace(/\bunverified\s+claims?\b/gi, "");
  s = s.replace(/\bnot\s+documented\s+in\s+(the\s+)?supplied\s+materials\b/gi, "");
  s = s.replace(/\bnot\s+(present\s+|listed\s+|found\s+)?in\s+(the\s+)?supplied\s+materials\b/gi, "");
  s = s.replace(/\babsent\s+from\s+(the\s+)?(supplied\s+materials|profile|candidate\s+materials)\b/gi, "");
  s = s.replace(/\bnot\s+confirmed\s+in\s+(the\s+)?(profile|candidate\s+materials|supplied\s+materials)\b/gi, "");
  s = s.replace(/\b(inferred|assumed|added)\s+from\s+the\s+(job\s+description|jd)\b/gi, "");
  s = s.replace(/\([^)]*(supplied materials|not documented|unverified|require confirmation)[^)]*\)/gi, "");
  return s.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").replace(/^\s*[,;]\s*/, "").trim();
}

export function cleanBulletText(bullet) {
  let s = stripDraftWording(toAsciiPunctuation(bullet)).replace(/\s+/g, " ").trim();
  for (const re of FORBIDDEN_FRAGMENTS) {
    re.lastIndex = 0;
    s = s.replace(re, "");
  }
  return s.replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}

function techsIn(text) {
  return [...String(text ?? "").matchAll(TECH_TOKEN)].map((m) =>
    m[0].toLowerCase().replace(/\s+/g, " ")
  );
}

function isTemplateBullet(bullet) {
  return TEMPLATE_BULLET.test(String(bullet ?? "").trim());
}

/**
 * Keep generated hands-on bullets. Drop only template/forbidden phrasing.
 * Evidence grounding is intentionally NOT used to empty roles — the prompt
 * requires AI-generated JD coverage when originals are sparse.
 */
export function filterExperienceBullets(bullets, _evidenceText = "") {
  const out = [];
  for (const raw of bullets || []) {
    const bullet = cleanBulletText(raw);
    if (!bullet || isTemplateBullet(bullet) || containsForbiddenPhrase(bullet)) continue;
    out.push(bullet);
  }
  return out;
}

/**
 * Keep AI-generated details (draft tool). Restore original facts the model omitted.
 * Does not strip JD-aligned generated bullets for lacking profile evidence.
 */
export function prepareExperienceForExport(jobs, detailLists, skillText = "", jdText = "") {
  const list = Array.isArray(jobs) ? jobs : [];
  const details = Array.isArray(detailLists) ? detailLists : [];
  void skillText;
  void jdText;
  return list.map((job, idx) => {
    const base = []
      .concat(job?.base_bullets || [], job?.base_details || [])
      .map((b) => cleanBulletText(b))
      .filter(Boolean);
    const kept = filterExperienceBullets(details[idx] || []);
    const joined = kept.join(" ").toLowerCase();
    for (const original of base) {
      const tokens = techsIn(original);
      const covered =
        joined.includes(original.toLowerCase().slice(0, Math.min(48, original.length))) ||
        (tokens.length > 0 && tokens.every((t) => joined.includes(t)));
      if (!covered) kept.push(original);
    }
    return dedupeSimilarBullets(kept);
  });
}

function tokenSet(text) {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((word) => word.length > 3)
  );
}

function bulletsTooSimilar(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size < 4 || b.size < 4) return false;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits / Math.min(a.size, b.size) >= 0.72;
}

export function dedupeSimilarBullets(bullets) {
  const kept = [];
  for (const bullet of bullets || []) {
    if (kept.some((existing) => bulletsTooSimilar(existing, bullet))) continue;
    kept.push(bullet);
  }
  return kept;
}

const COUNT_TARGETS = [
  { min: 8, label: "Most recent role" },
  { min: 8, label: "Second most recent role" },
  { min: 6, label: "Third role" },
  { min: 5, label: "Fourth role" },
];

const DEMONSTRATED_SKILLS = [
  [/\bgoogle\s*sql\b/i, "GoogleSQL", "Data & analytics"],
  [/\bdremel\b/i, "Dremel", "Data & analytics"],
  [/\bmachine learning\b/i, "Machine Learning", "AI & intelligent features"],
  [/\bc\+\+\b/i, "C++", "Languages & runtimes"],
  [/\bpostgresql\b/i, "PostgreSQL", "Data & analytics"],
  [/\bmongodb\b/i, "MongoDB", "Data & analytics"],
  [/\bpython\b/i, "Python", "Languages & runtimes"],
  [/\bjava\b/i, "Java", "Languages & runtimes"],
  [/\bspring boot\b/i, "Spring Boot", "Backend & APIs"],
  [/\breact(?:\.js)?\b/i, "React.js", "Frontend engineering"],
  [/\btypescript\b/i, "TypeScript", "Languages & runtimes"],
  [/\bjavascript\b/i, "JavaScript", "Languages & runtimes"],
  [/\bterraform\b/i, "Terraform", "IaC & environments"],
  [/\bkubernetes\b/i, "Kubernetes", "Containers & orchestration"],
  [/\bdocker\b/i, "Docker", "Containers & orchestration"],
  [/\bpytorch\b/i, "PyTorch", "AI & intelligent features"],
  [/\bkafka\b/i, "Kafka", "Messaging & streaming"],
  [/\bnext\.js\b/i, "Next.js", "Frontend frameworks"],
  [/\bgraphql\b/i, "GraphQL", "Backend & APIs"],
  [/\bhelm\b/i, "Helm", "Containers & orchestration"],
  [/\bspark\b/i, "Spark", "Data & analytics"],
  [/\bairflow\b/i, "Airflow", "Data & analytics"],
  [/\bsnowflake\b/i, "Snowflake", "Data & analytics"],
  [/\bbigquery\b/i, "BigQuery", "Data & analytics"],
  [/\blangchain\b/i, "LangChain", "AI & intelligent features"],
  [/\bprometheus\b/i, "Prometheus", "Observability"],
  [/\bgrafana\b/i, "Grafana", "Observability"],
  [/\baws\b/i, "AWS", "Cloud services"],
  [/\bazure\b/i, "Azure", "Cloud services"],
  [/\bgcp\b/i, "GCP", "Cloud services"],
  [/\blinux\b/i, "Linux", "Infrastructure"],
  [/\bgit\b/i, "Git", "DevOps"],
];

/** Named technologies that actually appear in candidate text. The JD is not evidence. */
export function demonstratedSkillsFromText(text) {
  const found = [];
  const seen = new Set();
  for (const [re, name, cat] of DEMONSTRATED_SKILLS) {
    re.lastIndex = 0;
    if (!re.test(String(text ?? ""))) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ name, cat });
  }
  return found;
}

export function addDemonstratedSkills(skillMap, evidenceText) {
  const out = {};
  const seen = new Set();
  for (const [cat, list] of Object.entries(skillMap || {})) {
    out[cat] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const name = canonicalSkillName(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out[cat].push(name);
    }
    if (!out[cat].length) delete out[cat];
  }
  for (const { name, cat } of demonstratedSkillsFromText(evidenceText)) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!out[cat]) out[cat] = [];
    out[cat].push(name);
  }
  return out;
}

function roleLabel(job, index) {
  const company = job?.company || `Role ${index + 1}`;
  return job?.title ? `${company} (${job.title})` : company;
}

function originalBulletCount(job) {
  const list = []
    .concat(job?.base_bullets || [], job?.base_details || [])
    .map((b) => String(b ?? "").trim())
    .filter(Boolean);
  return list.length;
}

/**
 * A resume is incomplete when any job lacks enough original bullets.
 * This does not invent the missing bullets.
 */
export function assessProfileCompleteness(jobs) {
  const gaps = [];
  (Array.isArray(jobs) ? jobs : []).forEach((job, i) => {
    const n = originalBulletCount(job);
    const min = i < COUNT_TARGETS.length ? COUNT_TARGETS[i].min : 5;
    const label = roleLabel(job, i);
    if (n === 0) {
      gaps.push(
        `${label}: no original experience bullets. Add the responsibilities, technologies, projects, and outcomes for this job.`
      );
    } else if (n < min) {
      gaps.push(
        `${label}: ${n} original bullet${n === 1 ? "" : "s"}. A completed resume needs at least ${min} documented accomplishments for this role.`
      );
    }
  });
  return gaps;
}

/** Gaps only. Does not invent bullets to close them. */
export function assessExperienceGaps(detailLists) {
  const gaps = [];
  (detailLists || []).forEach((bullets, i) => {
    const n = Array.isArray(bullets) ? bullets.length : 0;
    const spec =
      i < COUNT_TARGETS.length
        ? COUNT_TARGETS[i]
        : { min: 5, label: `Role ${i + 1}` };
    if (n < spec.min) {
      gaps.push(
        `${spec.label} has ${n} documented bullet${n === 1 ? "" : "s"} (target at least ${spec.min}). Add original responsibilities for that job before expecting a fuller section.`
      );
    }
  });
  return gaps;
}

function isProgrammingLanguage(name) {
  return PROGRAMMING_LANGUAGE.test(String(name ?? "").trim());
}

function stackCategoryForSkill(name) {
  const n = String(name ?? "");
  if (
    /\b(pytorch|tensorflow|scikit-learn|keras|xgboost|lightgbm|hugging\s*face|langchain|spacy|opencv)\b/i.test(
      n
    ) ||
    /machine learning/i.test(n)
  ) {
    return "AI & machine learning";
  }
  if (/^algorithms?$/i.test(n)) return "Engineering practices";
  if (isProgrammingLanguage(n)) return "Languages";
  // Frontend techniques and UI stack (before bare "server-side" backend rules elsewhere)
  if (
    /server[-\s]?side\s+render(?:ing)?|client[-\s]?side\s+rout(?:ing)?|client[-\s]?side\s+render(?:ing)?|server\s+components?|app\s+router|pages?\s+router|\bssr\b|\bcsr\b|\bssg\b|\bisr\b/i.test(
      n
    ) ||
    /\b(react(?:\.js)?|next\.js|vue\.js|nuxt|angular|svelte|astro|tailwind(?:\s*css)?|shadcn(?:\/ui)?|html5?|css3?|sass|less|bootstrap|storybook)\b/i.test(
      n
    ) ||
    /user\s+interface|responsive\s+design|web\s+accessibility|\baccessibility\b|\ba11y\b/i.test(n)
  ) {
    return "Frontend engineering";
  }
  if (
    /\b(node\.js|nest\.js|express\.js|fastapi|django|flask|spring boot|gin|laravel|ruby on rails|asp\.net core|graphql|openapi|webhooks|rest apis?|api\s+integrations?)\b/i.test(
      n
    )
  ) {
    return "Backend engineering";
  }
  if (
    /\b(postgres(?:ql)?|mysql|mongodb|redis|convex|snowflake|bigquery|entity framework)\b/i.test(n)
  ) {
    return "Databases";
  }
  if (
    /\b(docker|kubernetes|helm|terraform|ci\/?cd|github\s*actions|jenkins|bitbucket|gitlab|github)\b/i.test(
      n
    ) ||
    /^git$/i.test(n)
  ) {
    return "DevOps";
  }
  if (/\b(aws|azure|gcp|amazon\s+ec2|amazon\s+s3|aws\s+lambda)\b/i.test(n)) {
    return "Cloud engineering";
  }
  if (/\b(kafka|rabbitmq|sqs|pubsub)\b/i.test(n)) return "Messaging";
  if (/\b(pandas|numpy|spark|pyspark|airflow|dremel)\b/i.test(n)) return "Data engineering";
  if (
    /\b(jest|pytest|junit|cypress|playwright|vitest|mocha|testing\s+library|unit\s+tests?(?:ing)?|integration\s+tests?(?:ing)?|end[-\s]?to[-\s]?end\s+tests?(?:ing)?)\b/i.test(
      n
    )
  ) {
    return "Testing";
  }
  if (
    /\b(authentication|authorization|role[-\s]?based\s+access|rbac|multi[-\s]?tenant(?:\s+access(?:\s+control)?)?|iam|oauth(?:\s*2(?:\.0)?)?|jwt)\b/i.test(
      n
    )
  ) {
    return "Security";
  }
  // Practices / process only — not source control or frontend techniques
  if (
    /\b(jira|confluence|code review|agile|scrum|kanban|pair programming|technical documentation|software architecture)\b/i.test(
      n
    )
  ) {
    return "Engineering practices";
  }
  return "";
}

const CANONICAL_CATEGORIES = [
  ["languages", "Languages"],
  ["frontend engineering", "Frontend engineering"],
  ["backend engineering", "Backend engineering"],
  ["databases", "Databases"],
  ["data engineering", "Data engineering"],
  ["devops", "DevOps"],
  ["cloud engineering", "Cloud engineering"],
  ["ai & machine learning", "AI & machine learning"],
  ["messaging", "Messaging"],
  ["security", "Security"],
  ["testing", "Testing"],
  ["engineering practices", "Engineering practices"],
];

const CANONICAL_CATEGORY_SET = new Set(CANONICAL_CATEGORIES.map(([, label]) => label));

function canonicalCategoryName(cat) {
  const key = String(cat ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  for (const [norm, label] of CANONICAL_CATEGORIES) {
    if (key === norm) return label;
  }
  return "";
}

function destinationCategory(name, cat) {
  const stacked = stackCategoryForSkill(name);
  if (stacked) return stacked;
  if (/code review/i.test(name) && /algorithm|language|framework|frontend|backend|engineering/i.test(cat)) {
    return "Engineering practices";
  }
  if (/language|programming/i.test(String(cat ?? "")) && !isProgrammingLanguage(name)) {
    return "Engineering practices";
  }
  const canon = canonicalCategoryName(cat);
  if (canon) return canon;
  // Dump / non-stack categories (Target stack requirements, Software Engineering, etc.)
  return "Engineering practices";
}

export function sanitizeSkillMap(skillMap) {
  const seen = new Set();
  const out = {};
  for (const [cat, list] of Object.entries(skillMap || {})) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const name = canonicalSkillName(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let dest = destinationCategory(name, cat);
      if (!CANONICAL_CATEGORY_SET.has(dest)) dest = "Engineering practices";
      if (!out[dest]) out[dest] = [];
      out[dest].push(name);
    }
  }
  return out;
}

export function skillEvidenceText(profile) {
  const skills = profile?.base_skills;
  const parts = [];
  if (Array.isArray(skills)) parts.push(skills.join(" "));
  else if (skills && typeof skills === "object") {
    for (const value of Object.values(skills)) {
      parts.push(Array.isArray(value) ? value.join(" ") : String(value ?? ""));
    }
  }
  return parts.join(" ");
}
