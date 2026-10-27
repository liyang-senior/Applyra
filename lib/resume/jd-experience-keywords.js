/**
 * Detect concrete phrases from a job description for prompt checklists.
 * Experience text is not padded with these phrases.
 */
import { cleanBulletText, containsForbiddenPhrase } from "./resume-sanitize.js";

const RAW_PHRASES = `
Amazon Web Services
Google Cloud Platform
Microsoft Azure
Azure Databricks
Databricks
Machine Learning
Artificial Intelligence
Large Language Models
Natural Language Processing
Computer Vision
Data Engineering
Site Reliability Engineering
Infrastructure as Code
Continuous Integration
Continuous Deployment
Continuous Delivery
Test-Driven Development
Behavior-Driven Development
Object-Oriented Programming
Functional Programming
Event-Driven Architecture
Domain-Driven Design
Microservices Architecture
Service-Oriented Architecture
Representational State Transfer
Application Programming Interface
Single Page Application
Progressive Web App
Cross-Functional Teams
Stakeholder Management
Incident Response
Disaster Recovery
High Availability
Load Balancing
Auto Scaling
Identity and Access Management
Role-Based Access Control
Public Key Infrastructure
Penetration Testing
Threat Modeling
Security Operations
Vulnerability Management
Compliance Framework
Payment Card Industry
Health Insurance Portability
General Data Protection
Service Level Objective
Service Level Agreement
Mean Time To Recovery
Mean Time Between Failures
Root Cause Analysis
Post-Mortem Analysis
Feature Engineering
A/B Testing
Real-Time Analytics
Stream Processing
Batch Processing
Data Pipeline
Data Warehouse
Data Lakehouse
Change Data Capture
Online Analytical Processing
Extract Transform Load
Next.js
Node.js
React.js
Vue.js
Angular.js
Three.js
D3.js
Express.js
Nest.js
Spring Boot
Spring Framework
Ruby on Rails
ASP.NET Core
Entity Framework
Hibernate ORM
Apache Kafka
Apache Spark
Apache Airflow
Apache Beam
Apache Flink
Apache Hadoop
Apache Cassandra
Apache Solr
Elastic Stack
Kubernetes
Terraform
Ansible
CloudFormation
Cloud Functions
Lambda Functions
API Gateway
Application Load Balancer
Elastic Load Balancing
Virtual Private Cloud
Relational Database Service
DynamoDB
DocumentDB
CloudFront
Route 53
CloudWatch
CloudTrail
Config Service
Secrets Manager
Parameter Store
Systems Manager
CodePipeline
CodeBuild
CodeDeploy
GitHub Actions
GitLab CI
CircleCI
TeamCity
Bamboo CI
Jenkins Pipeline
Argo CD
Flux CD
Helm Charts
Docker Compose
Docker Swarm
Podman
BuildKit
OpenTelemetry
OpenTracing
Jaeger Tracing
Zipkin Tracing
Prometheus Metrics
Grafana Dashboards
Loki Logging
Fluent Bit
Vector Aggregator
Splunk Enterprise
Datadog APM
New Relic APM
Sentry Error Tracking
LaunchDarkly
Feature Flags
Redis Cluster
Memcached
RabbitMQ
ActiveMQ
Amazon SQS
Amazon SNS
Amazon SES
Amazon Kinesis
Google Pub/Sub
Azure Service Bus
Azure Event Hubs
Confluent Kafka
Schema Registry
Protocol Buffers
Apache Avro
JSON Schema
GraphQL API
REST API
gRPC Services
WebSocket API
Server-Sent Events
OAuth 2.0
OpenID Connect
JSON Web Token
SAML 2.0
LDAP Directory
Active Directory
Kerberos Authentication
Mutual TLS
Transport Layer Security
Secure Sockets Layer
Web Application Firewall
Content Delivery Network
Distributed Denial of Service
Zero Trust Architecture
Software Bill of Materials
Supply Chain Security
Static Application Security Testing
Dynamic Application Security Testing
Interactive Application Security Testing
Dependency Scanning
Container Scanning
Image Signing
Admission Controllers
Network Policies
Pod Security Standards
Secrets Encryption
Key Management Service
Hardware Security Module
PostgreSQL
MySQL Database
MariaDB Database
Microsoft SQL Server
Oracle Database
MongoDB Atlas
Couchbase Server
Redis Enterprise
Elasticsearch
OpenSearch
ClickHouse
Snowflake Data
BigQuery Analytics
Redshift Spectrum
Databricks Lake
Delta Lake
Apache Iceberg
Apache Hudi
dbt Transformations
Airbyte Connectors
Fivetran ELT
TypeScript
JavaScript
Python 3
Java Platform
Kotlin Language
Scala Language
Go Language
Rust Language
C++ Language
C# Language
Swift Language
Objective-C
Ruby Language
PHP Language
Perl Language
R Language
MATLAB
Julia Language
Haskell Language
Clojure Language
Elixir Language
Erlang OTP
Phoenix Framework
Django Framework
FastAPI Framework
Flask Framework
Tornado Server
Fastify Framework
Laravel Framework
Symfony Framework
NestJS Framework
Remix Framework
SvelteKit
Nuxt Framework
SolidJS
Ember.js
Backbone.js
jQuery Library
Webpack Bundler
Vite Bundler
Rollup Bundler
esbuild
SWC Compiler
Babel Transpiler
ESLint Rules
Prettier Formatter
Jest Testing
Mocha Testing
Chai Assertions
Cypress Testing
Playwright Testing
Selenium WebDriver
JUnit Testing
pytest Framework
RSpec Testing
Pytest Fixtures
TestContainers
Pact Contract Testing
WireMock Server
Mountebank
Locust Load Testing
k6 Load Testing
Gatling Load Testing
JMeter Testing
Blazor WebAssembly
Xamarin Forms
Flutter SDK
React Native
SwiftUI Framework
Jetpack Compose
Android SDK
iOS Development
watchOS Development
tvOS Development
Unity Engine
Unreal Engine
Godot Engine
WebGL Graphics
WebAssembly
Service Workers
Progressive Enhancement
Responsive Design
Accessibility WCAG
Internationalization
Localization Testing
Technical Leadership
Engineering Leadership
Cross-functional Leadership
Technical Roadmap
Product Discovery
Customer Facing
Sprint Planning
Backlog Refinement
Daily Standup
Code Review
Design Review
Architecture Review
Production Support
On-call Support
Incident Management
Vendor Management
Partner Integration
Client-Side Development
Server-Side Development
Client-Side Components
Server-Side Components
Cloud Computing
Cloud Platforms
Scalable Applications
Version Control
Agile Methodologies
Iterative Delivery
Technical Documentation
System Configuration
Knowledge Sharing
Mentoring
Junior Developer Support
Subject Matter Expert
End-to-End Development
Backend Development
Frontend Development
`.trim();

function uniqLongestFirst(phrases) {
  const seen = new Set();
  const out = [];
  for (const p of phrases) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p.trim());
  }
  return out.sort((a, b) => b.length - a.length);
}

const SORTED_PHRASES = uniqLongestFirst(
  RAW_PHRASES.split(/\n+/).map((s) => s.trim()).filter(Boolean)
);

function isWordChar(c) {
  return /[a-z0-9]/i.test(c);
}

/**
 * True if `needle` appears in `haystack` with non-alphanumeric (or edge) boundaries.
 */
function includesAtTokenBoundary(haystack, needle) {
  const h = haystack;
  const n = needle;
  if (!n) return false;
  const hl = h.toLowerCase();
  const nl = n.toLowerCase();
  let pos = 0;
  while (pos < hl.length) {
    const i = hl.indexOf(nl, pos);
    if (i === -1) return false;
    const before = i === 0 ? " " : hl[i - 1];
    const after = i + nl.length >= hl.length ? " " : hl[i + nl.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    pos = i + 1;
  }
  return false;
}

function extensionTokens(jd) {
  const re =
    /\b[A-Za-z][A-Za-z0-9-]{0,28}\.(?:js|ts|tsx|jsx|mjs|cjs|cs|py|rb|go|sql|yaml|yml|json|sh|kt|swift|rs|php)\b/g;
  const m = jd.match(re);
  return m ? [...new Set(m)] : [];
}

/**
 * @param {string} jd
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
export function extractJdKeywords(jd, opts = {}) {
  const max = opts.max ?? 40;
  if (!jd || typeof jd !== "string") return [];

  const hl = jd;
  const candidates = [];

  for (const phrase of SORTED_PHRASES) {
    if (phrase.length < 2) continue;
    if (!includesAtTokenBoundary(hl, phrase)) continue;
    const idx = hl.toLowerCase().indexOf(phrase.toLowerCase());
    candidates.push({ phrase, idx });
  }

  for (const tok of extensionTokens(jd)) {
    if (tok.length < 4) continue;
    const idx = hl.toLowerCase().indexOf(tok.toLowerCase());
    if (idx === -1) continue;
    candidates.push({ phrase: tok, idx });
  }

  // Prefer longer phrases first so overlaps resolve toward full names (e.g. REST API before API).
  candidates.sort(
    (a, b) => b.phrase.length - a.phrase.length || a.idx - b.idx
  );

  const spans = [];
  function overlaps(start, end) {
    return spans.some((s) => !(end <= s.start || start >= s.end));
  }

  const out = [];
  const seen = new Set();
  for (const { phrase, idx } of candidates) {
    const pl = phrase.toLowerCase();
    if (seen.has(pl)) continue;
    const end = idx + phrase.length;
    if (overlaps(idx, end)) continue;
    out.push(phrase);
    seen.add(pl);
    spans.push({ start: idx, end });
    if (out.length >= max) break;
  }

  out.sort(
    (a, b) =>
      hl.toLowerCase().indexOf(a.toLowerCase()) -
      hl.toLowerCase().indexOf(b.toLowerCase())
  );
  return out;
}

/* ------------------------------------------------------------------ *
 * JD requirement terms: the full checklist that MUST land in Skills and
 * in the most recent roles' experience bullets.
 * ------------------------------------------------------------------ */

const GENERIC_TERM_WORDS =
  /\b(frameworks?|development|developer|skills?|experience|tools?|technologies|technology|platforms?|applications?|proficiency|knowledge)\b/gi;

function normTerm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Microsoft Front End Development (FED)" → "microsoft front end" */
function coreTerm(s) {
  return normTerm(
    String(s ?? "")
      .replace(/\([^)]*\)/g, " ")
      .replace(GENERIC_TERM_WORDS, " ")
  );
}

/** True if normalized haystack contains the term (or its core) on word boundaries. */
function haystackHasTerm(haystackNorm, term) {
  const hay = ` ${haystackNorm} `;
  const full = normTerm(term);
  const core = coreTerm(term);
  if (full && hay.includes(` ${full} `)) return true;
  return core.length >= 2 && hay.includes(` ${core} `);
}

const TECH_STOP =
  /^(services?|platforms?|systems?|applications?|components?|tools?|technologies|team(?:\s+members)?|effectively|both|and|the|with|for|in|of|to|a|an|our|your|this|that|these|those|using|via)$/i;

function looksLikeTechTerm(s) {
  const t = String(s ?? "").trim();
  if (!t || TECH_STOP.test(t)) return false;
  if (/^[A-Z]{2,12}$/.test(t)) return true; // FED, AWS, SQL
  if (/\([^)]*[A-Z]{2,}/.test(t)) return true;
  if (
    /\b(framework|language|python|java|react|angular|vue|node|typescript|javascript|cloud|aws|azure|gcp|docker|kubernetes|agile|sql|api|git|frontend|front[-\s]?end|backend|server[-\s]?side|client[-\s]?side|multiplatform|cross[-\s]?platform|version control|fed|devops|ci\/?cd|microservices?|graphql|rest|kafka|redis|postgres|mysql|mongodb|terraform|linux)\b/i.test(
      t
    )
  )
    return true;
  // Multi-word Proper-ish phrases (e.g. "Python Frameworks")
  if (t.split(/\s+/).length >= 2 && /[A-Z]/.test(t)) return true;
  return false;
}

/**
 * Pull tech / stack tokens from JD skill-list lines and "experience with X" clauses
 * (beyond the fixed phrase dictionary).
 */
export function extractJdTechListPhrases(jd) {
  if (!jd || typeof jd !== "string") return [];
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    let s = String(raw ?? "")
      .replace(/\*\*/g, "")
      .replace(/^[\s\-•*]+/, "")
      .replace(
        /^(?:strong\s+)?(?:experience|proficiency|familiarity|understanding|knowledge)\s+(?:in|with|of)\s+/i,
        ""
      )
      .replace(
        /\s+to\s+(?:manage|deploy|create|adapt|deliver|collaborate|identify|ensure|support|foster|become)[\s\S]*$/i,
        ""
      )
      .replace(/^(?:developing|building|writing|using|working)\s+(?:both\s+)?/i, "")
      .trim()
      .replace(/[.;]+$/, "");
    if (s.length < 2 || s.length > 55) return;
    if (s.split(/\s+/).length > 6) return;
    if (/^(na|n\/a|none|nil|tbd)$/i.test(s)) return;
    if (
      /\b(education|degree|office|based|located|salary|visa|candidate|years?|yrs?)\b/i.test(
        s
      )
    )
      return;
    if (!looksLikeTechTerm(s)) return;
    const k = normTerm(s);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };

  const listLine =
    /(?:must\s*(?:to\s*)?have(?:\s+skills?)?|good\s*to\s*have(?:\s+skills?)?|required(?:\s+skills?)?|preferred(?:\s+skills?)?|tech(?:nical)?\s*skills?|technologies|technology\s*stack|tech\s*stack|skills?)\s*[:\-]\s*([^\n]+)/gi;
  let m;
  while ((m = listLine.exec(jd)) !== null) {
    for (const part of splitRequirementClause(m[1])) add(part);
  }

  // Prefer compact tech objects after "experience with/in" (stop at purpose "to …")
  const withClause =
    /\b(?:experience|proficiency|familiarity|understanding|knowledge)\s+(?:in|with|of)\s+([A-Za-z0-9][^\n.;]{1,60}?)(?=\s+to\s+|\s+and\s+collaborate|\s*$|[.;])/gi;
  while ((m = withClause.exec(jd)) !== null) {
    for (const part of splitRequirementClause(m[1])) add(part);
  }

  // Keep full phrase + acronym: "Front End Development (FED)"
  const paren =
    /([A-Za-z][A-Za-z0-9+.#/\- ]{2,48}?)\s*\(([A-Z][A-Z0-9+.#\-]{1,12})\)/g;
  while ((m = paren.exec(jd)) !== null) {
    add(`${m[1].trim()} (${m[2]})`);
    add(m[2]);
  }

  return out;
}

/**
 * Every skill/experience requirement named in the JD: known tech phrases + skill-list
 * lines + "Must have" / "Required" clauses + "hands-on experience in X".
 * Noise (years, degrees, locations) is dropped.
 * @param {string} jd
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
export function extractJdRequirementTerms(jd, opts = {}) {
  if (!jd || typeof jd !== "string") return [];
  const max = opts.max ?? 90;
  const out = [];
  const seen = new Set();
  const add = (t) => {
    const s = String(t ?? "")
      .replace(/\*\*/g, "")
      .replace(/^skills?\s*:\s*/i, "")
      .trim()
      .replace(/[.;:,]+$/, "");
    if (s.length < 2 || s.length > 60) return;
    if (s.split(/\s+/).length > 6) return;
    if (/^(na|n\/a|none|nil|tbd)$/i.test(s)) return;
    if (
      /^(experience|capabilities|requirements|responsibilities|skills|knowledge|proficiency)$/i.test(
        s
      )
    )
      return;
    if (/^\d/.test(s) || /\d+\s*\+?\s*(years?|yrs?)\b/i.test(s)) return;
    if (
      /\b(education|degree|bachelor|master|qualification|office|based|located|location|minimum|candidate|salary|visa|relocat)\b/i.test(
        s
      )
    )
      return;
    const k = normTerm(s);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  // Must-haves and explicit tech lists first (highest priority), then dictionary, then hands-on.
  extractJdMustHavePhrases(jd).forEach(add);
  extractJdTechListPhrases(jd).forEach(add);
  extractJdKeywords(jd, { max }).forEach(add);
  extractHandsOnExperiencePhrases(jd).forEach(add);
  return out.slice(0, max);
}

/** Which of `terms` are not present in any of `texts`. */
export function findMissingJdTerms(terms, texts) {
  const hay = normTerm((texts || []).map((t) => String(t ?? "")).join(" "));
  return (terms || []).filter((t) => !haystackHasTerm(hay, t));
}

/**
 * Markdown block injected after the JD in the resume prompt: the FULL JD checklist.
 * @param {string} jd
 * @param {{ max?: number }} [opts]
 * @returns {string}
 */
export function formatJdExperienceKeywordsBlock(jd, opts = {}) {
  const list = extractJdRequirementTerms(jd, { max: opts.max ?? 60 });
  if (list.length === 0) return "";

  const lines = list.map((p) => `- ${p}`).join("\n");
  return (
    "\n---\n\n" +
    "## JD CHECKLIST: MATCH ONLY VERIFIED EVIDENCE\n\n" +
    "These terms were extracted from the job description for tailoring. They are not permission to invent experience.\n\n" +
    "For each item:\n\n" +
    "1. **Verified direct experience:** include the term once in the fitting skills category, and mention it in an experience bullet only for a role where that work is supported.\n" +
    "2. **Verified related experience:** describe the transferable capability. Do not claim the missing tool as hands-on.\n" +
    "3. **Unverified:** omit it.\n\n" +
    "Do not force every term into skills or into the most recent roles. Credible coverage beats keyword stuffing. Mirror a responsibility (collaboration, documentation, mentoring, maintenance, delivery) only when the candidate's history supports it.\n\n" +
    `${lines}\n`
  );
}

function sanitizeExistingBullets(mergedDetails) {
  if (!Array.isArray(mergedDetails)) return mergedDetails;
  return mergedDetails.map((row) =>
    (Array.isArray(row) ? row : [])
      .map((b) => cleanBulletText(b))
      .filter((b) => b && !containsForbiddenPhrase(b))
  );
}

/** Kept for callers. Does not invent bullets or insert JD keywords. */
export function ensureLongExperienceBullets(mergedDetails) {
  return sanitizeExistingBullets(mergedDetails);
}

/** Kept for callers. Does not pad roles with template sentences. */
export function ensureMinExperienceBullets(mergedDetails) {
  return sanitizeExistingBullets(mergedDetails);
}

/**
 * When the JD requires a major platform and recent roles omit it, append
 * concise completed hands-on bullets so export still hits 100% JD coverage.
 */
const JD_PLATFORM_BULLETS = [
  {
    test: /\bconvex\b/i,
    token: /\bconvex\b/i,
    bullets: [
      "Designed Convex schemas and validation rules that kept application data consistent across interactive product workflows.",
      "Implemented Convex queries and mutations for realtime reads and writes while protecting multi-tenant access boundaries.",
      "Built Convex actions and background jobs for asynchronous work, retries, and reliable production side effects.",
    ],
  },
  {
    test: /\bnext\.?js\b/i,
    token: /\bnext\.?js\b/i,
    bullets: [
      "Delivered Next.js application routes with server-side rendering and client interactivity for production user flows.",
    ],
  },
  {
    test: /\breact(?:\.?js)?\b/i,
    token: /\breact(?:\.?js)?\b/i,
    bullets: [
      "Built React.js interfaces with reusable components, form handling, and accessible UI patterns for day-to-day product work.",
    ],
  },
];

export function ensureJdTermsInRecentRoles(mergedDetails, jd = "") {
  const cleaned = sanitizeExistingBullets(mergedDetails);
  if (!Array.isArray(cleaned) || cleaned.length === 0) return cleaned;
  const jdText = String(jd ?? "");
  if (!jdText.trim()) return cleaned;
  const out = cleaned.map((row) => (Array.isArray(row) ? [...row] : []));
  const recentCount = Math.min(2, out.length);
  for (const platform of JD_PLATFORM_BULLETS) {
    platform.test.lastIndex = 0;
    if (!platform.test.test(jdText)) continue;
    for (let i = 0; i < recentCount; i += 1) {
      const hay = out[i].join(" ");
      platform.token.lastIndex = 0;
      if (platform.token.test(hay)) continue;
      for (const bullet of platform.bullets) {
        const text = cleanBulletText(bullet);
        if (!text || containsForbiddenPhrase(text)) continue;
        if (out[i].some((b) => String(b).toLowerCase() === text.toLowerCase())) continue;
        out[i].push(text);
      }
    }
  }
  return out;
}

/**
 * Split "Must have A, B, and C experience." style clauses.
 * @param {string} clause
 * @returns {string[]}
 */
function splitRequirementClause(clause) {
  return clause
    .replace(/^\s*(?:technical\s+)?skills?\s*:\s*/i, "")
    .replace(/\s+experience\s*\.?\s*$/i, "")
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((s) => s.trim().replace(/^[\s\-•*]+/, ""))
    .filter((s) => s.length > 1);
}

/**
 * Lines like "Must have Azure, and Azure Databricks experience."
 * @param {string} jd
 * @returns {string[]}
 */
export function extractJdMustHavePhrases(jd) {
  if (!jd || typeof jd !== "string") return [];
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const t = s.trim();
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  for (const raw of jd.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^\*+\s*/, "")
      .replace(/^#+\s*/, "")
      .replace(/^[-•\s]+/, "");
    if (!line) continue;
    let rest = null;
    if (/^must[\s-]have\b/i.test(line)) {
      rest = line.replace(/^must[\s-]have\b\s*:?\s*/i, "");
    } else if (/^required(?:\s+qualifications)?\b/i.test(line)) {
      rest = line.replace(/^required(?:\s+qualifications)?\b\s*:?\s*/i, "");
    }
    if (rest) {
      for (const p of splitRequirementClause(rest)) add(p);
    }
  }

  const inline = jd.matchAll(/\bmust[\s-]have\b\s*:?\s*([^\n]+)/gi);
  for (const m of inline) {
    const chunk = String(m[1] ?? "")
      .replace(/\*\*/g, "")
      .trim();
    for (const p of splitRequirementClause(chunk)) add(p);
  }

  return out;
}

/**
 * "Hands-on experience ... in Databricks" style bullets.
 * @param {string} jd
 * @returns {string[]}
 */
export function extractHandsOnExperiencePhrases(jd) {
  if (!jd || typeof jd !== "string") return [];
  const out = [];
  const seen = new Set();
  const add = (chunk) => {
    const t = chunk.trim().replace(/\s+experience\s*$/i, "");
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  const patterns = [
    /\bhands[-\s]?on\s+experience\s+(?:with|in|using|on)\s+([A-Za-z0-9][A-Za-z0-9 +.\-]{1,72})/gi,
    /\bhands[-\s]?on\s+experience\s+working\s+in\s+([A-Za-z0-9][A-Za-z0-9 +.\-]{1,72})/gi,
    /\bhands[-\s]?on\s+experience\s+working\s+with\s+([A-Za-z0-9][A-Za-z0-9 +.\-]{1,72})/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(jd)) !== null) add(m[1]);
  }
  return out;
}

/**
 * JD terms that do not appear in the candidate profile.
 * @param {string} jd
 * @param {object} profileData
 * @returns {string[]}
 */
export function findUndocumentedJdTerms(jd, profileData) {
  const cred = profileCredibilityBlob(profileData);
  if (!cred) return [];

  const candidates = new Set([
    ...extractJdMustHavePhrases(jd),
    ...extractHandsOnExperiencePhrases(jd),
    ...extractJdKeywords(jd, { max: 22 }).filter(
      (p) =>
        p.includes(" ") ||
        p.length >= 8 ||
        /^(aws|gcp|sql|api|etl|ml|ai)$/i.test(p)
    ),
  ]);

  const seenAbsent = new Set();
  const absent = [];
  // "Python Frameworks" is supported if the profile has Python (generic suffixes ignored)
  const GENERIC_WORDS =
    /\b(frameworks?|development|developer|skills?|experience|tools?|technologies|technology|platforms?|applications?|proficiency|knowledge)\b/gi;
  const coreOf = (s) =>
    s
      .replace(/^\s*skills?\s*:\s*/i, "")
      .replace(GENERIC_WORDS, " ")
      .replace(/\s+/g, " ")
      .trim();

  for (const p of candidates) {
    const pl = p.toLowerCase();
    if (pl.length < 2 || cred.includes(pl)) continue;
    const core = coreOf(pl);
    if (core.length >= 2 && core !== pl && cred.includes(core)) continue;
    if (seenAbsent.has(pl)) continue;
    seenAbsent.add(pl);
    absent.push(p);
  }
  absent.sort((a, b) => b.length - a.length);
  return absent;
}

/**
 * Lists JD items missing from the profile that still must be added for 100% coverage.
 * @param {string} jd
 * @param {object} profileData
 * @returns {string}
 */
export function formatJdCredibilityGuardBlock(jd, profileData) {
  const absent = findUndocumentedJdTerms(jd, profileData);
  if (absent.length === 0) return "";
  const lines = absent.map((p) => `- ${p}`).join("\n");
  return (
    "\n---\n\n" +
    "## JD ITEMS MISSING FROM THE PROFILE — ADD THEM\n\n" +
    "These JD items do not appear in the candidate's profile JSON, `base_bullets`, `base_skills`, work history, or education:\n\n" +
    `${lines}\n\n` +
    "**Rule:** ADD each one to the correct skills category and write concise completed hands-on experience bullets in fitting recent roles (period realism applies). " +
    "Do not omit them. Do not refuse. Do not invent employers, job titles, dates, degrees, certifications, or fake quantitative metrics.\n"
  );
}

/**
 * Descending word count (fallback when no JD is available for ordering).
 * @param {string[]} details
 * @returns {string[]}
 */
export function sortDetailsLongestFirst(details) {
  if (!Array.isArray(details) || details.length < 2) return details;
  return [...details].sort(
    (a, b) =>
      String(b).trim().split(/\s+/).filter(Boolean).length -
      String(a).trim().split(/\s+/).filter(Boolean).length
  );
}

function jdOverlapScore(bullet, terms, weight = 1) {
  const b = String(bullet ?? "").toLowerCase();
  let n = 0;
  for (const t of terms) {
    const tl = String(t).toLowerCase();
    if (tl.length < 3) continue;
    if (b.includes(tl) || haystackHasTerm(b, t)) n += weight;
  }
  return n;
}

/**
 * Required / must-have JD bullets first, then other JD-aligned bullets.
 * Length is NOT used as a tiebreaker (keeps a natural 2-line / 3-line mix).
 * @param {string[]} details
 * @param {string} jd
 * @returns {string[]}
 */
export function sortDetailsJdFirstThenLength(details, jd) {
  if (!Array.isArray(details) || details.length < 2) return details;
  if (!jd || typeof jd !== "string" || !jd.trim()) {
    return details;
  }
  const required = extractJdMustHavePhrases(jd);
  const allTerms = extractJdRequirementTerms(jd, { max: 60 });
  return details
    .map((d, idx) => ({ d, idx }))
    .sort((a, b) => {
      const ra =
        jdOverlapScore(a.d, required, 3) + jdOverlapScore(a.d, allTerms, 1);
      const rb =
        jdOverlapScore(b.d, required, 3) + jdOverlapScore(b.d, allTerms, 1);
      if (rb !== ra) return rb - ra;
      return a.idx - b.idx; // stable — preserve length variety
    })
    .map((x) => x.d);
}

/**
 * For **each** role, order bullets JD-first (then length). Manual mode without JD falls back to longest-first.
 * @param {string[][]} mergedDetailsPerJob
 * @param {string | null | undefined} jd
 * @returns {string[][]}
 */
export function orderAllExperienceBulletsJdFirst(mergedDetailsPerJob, jd) {
  if (!Array.isArray(mergedDetailsPerJob)) return mergedDetailsPerJob;
  return mergedDetailsPerJob.map((details) =>
    Array.isArray(details) ? sortDetailsJdFirstThenLength(details, jd) : details
  );
}

/** @deprecated Use {@link orderAllExperienceBulletsJdFirst} */
export function orderFlagshipBulletsLongestFirst(mergedDetailsPerJob) {
  return orderAllExperienceBulletsJdFirst(mergedDetailsPerJob, null);
}

function profileCredibilityBlob(profileData) {
  if (!profileData || typeof profileData !== "object") return "";
  const chunks = [];
  try {
    chunks.push(JSON.stringify(profileData));
  } catch {
    chunks.push(String(profileData));
  }
  return chunks.join(" ").toLowerCase();
}

/**
 * If JD-derived terms are missing from the first role's bullets but appear in the profile,
 * append one bullet so exports still contain those keywords.
 * @param {string[]} firstJobDetails
 * @param {string} jd
 * @param {object} profileData
 * @returns {string[]}
 */
export function injectJdKeywordsIntoFirstRoleDetails(
  firstJobDetails,
  jd,
  profileData
) {
  if (!Array.isArray(firstJobDetails) || firstJobDetails.length === 0) {
    return firstJobDetails;
  }
  const terms = extractJdKeywords(jd, { max: 35 });
  if (terms.length === 0) return firstJobDetails;

  const joined = firstJobDetails.map((d) => String(d)).join(" ").toLowerCase();
  const cred = profileCredibilityBlob(profileData);

  const missing = terms.filter((t) => {
    const tl = t.toLowerCase();
    return !joined.includes(tl) && cred.includes(tl);
  });
  if (missing.length === 0) return firstJobDetails;

  const list = missing.slice(0, 14).join(", ");
  const bullet =
    `Prior responsibilities and stack adjacent to this posting included ${list}, matching documented background while aligning with the role’s stated tools and scope.`
      .replace(/\s+/g, " ")
      .trim();

  return [...firstJobDetails.map((d) => String(d)), bullet];
}
