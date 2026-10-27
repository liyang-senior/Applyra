/**
 * Export live resume_profiles + email_templates into seed sources
 * so a fresh migrate matches the current DB without follow-up updates.
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await fs.readFile(path.join(root, file), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (!match) continue;
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // optional
    }
  }
}

function fileNameForProfile(data) {
  const name = String(data?.name || "profile")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");
  return `${name || "profile"}.json`;
}

await loadEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const seedDir = path.join(root, "data", "seed-profiles");
await fs.mkdir(seedDir, { recursive: true });

const profiles = await pool.query(
  `SELECT id, data, updated_at
   FROM resume_profiles
   ORDER BY updated_at DESC`,
);

const written = [];
const seenNames = new Set();
for (const row of profiles.rows) {
  const data =
    typeof row.data === "string" ? JSON.parse(row.data) : row.data || {};
  const key = String(data.name || data.email || row.id).toLowerCase();
  if (seenNames.has(key)) continue;
  seenNames.add(key);

  const file = fileNameForProfile(data);
  const outPath = path.join(seedDir, file);
  await fs.writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  written.push({
    file,
    name: data.name || "",
    email: data.email || "",
    gender: data.gender || "male",
    techStack: data.techStack || "",
  });
  console.log(`Wrote ${file}`);
}

const manifestPath = path.join(seedDir, "manifest.json");
await fs.writeFile(
  manifestPath,
  `${JSON.stringify({ profiles: written }, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote manifest (${written.length} profiles)`);

const templates = await pool.query(
  `SELECT name, body, sort_order
   FROM email_templates
   ORDER BY sort_order ASC, name ASC`,
);

const emailSeedPath = path.join(root, "data", "seed-email-templates.json");
const emailSeed = templates.rows.map((row) => ({
  name: row.name,
  body: row.body,
  sortOrder: row.sort_order,
}));
await fs.writeFile(
  emailSeedPath,
  `${JSON.stringify(emailSeed, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote seed-email-templates.json (${emailSeed.length} templates)`);

await pool.end();
