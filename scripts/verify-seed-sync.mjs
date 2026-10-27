import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Inline email seed (avoid TS import)
const emailSeed = JSON.parse(
  await fs.readFile(path.join(root, "data", "seed-email-templates.json"), "utf8"),
);
const now = new Date();
for (const template of emailSeed) {
  await pool.query(
    `INSERT INTO email_templates (id, name, body, sort_order, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $4)
     ON CONFLICT (name) DO UPDATE SET
       body = EXCLUDED.body,
       sort_order = EXCLUDED.sort_order,
       updated_at = EXCLUDED.updated_at`,
    [template.name, template.body, template.sortOrder, now],
  );
}

const profiles = await pool.query(
  `SELECT data->>'name' AS name, data->>'techStack' AS stack
   FROM resume_profiles ORDER BY data->>'name'`,
);
const templates = await pool.query(
  `SELECT name, sort_order FROM email_templates ORDER BY sort_order, name`,
);
const cols = await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'applications'
     AND column_name IN ('is_remote', 'requires_clearance', 'job_link')
   ORDER BY 1`,
);

console.log("profiles", profiles.rows);
console.log("templates", templates.rows);
console.log(
  "app cols",
  cols.rows.map((row) => row.column_name),
);
await pool.end();
