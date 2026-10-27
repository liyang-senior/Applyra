import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
try {
  const envText = await fs.readFile(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
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
  // rely on process env
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const seedDir = path.join(root, "data", "seed-profiles");
const seeds = [
  {
    file: "Joshua_Eric_Person.json",
    gender: "male",
    techStack:
      "AWS, Terraform, CloudFormation, Salesforce, ServiceNow, Linux, SQL",
  },
  {
    file: "Elvis_Edinge.json",
    gender: "male",
    techStack:
      "AWS, Terraform, Ansible, Jenkins, Docker, Prometheus, Grafana, Linux",
  },
];

await pool.query(`
  CREATE TABLE IF NOT EXISTS resume_profiles (
    id uuid PRIMARY KEY,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )
`);

for (const seed of seeds) {
  const raw = JSON.parse(
    await fs.readFile(path.join(seedDir, seed.file), "utf8"),
  );
  const data = {
    ...raw,
    gender: seed.gender,
    techStack: seed.techStack,
    street: raw.street || "",
    birthday: raw.birthday || "",
    ssn: raw.ssn || "",
    website: raw.website || "",
    github: raw.github || "",
    cvLink: raw.cvLink || "",
    zip: raw.zip || "",
  };
  const existing = await pool.query(
    `SELECT id FROM resume_profiles
     WHERE LOWER(data->>'email') = LOWER($1)
        OR LOWER(data->>'name') = LOWER($2)
     LIMIT 1`,
    [data.email, data.name],
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE resume_profiles SET data = $2::jsonb, updated_at = $3 WHERE id = $1`,
      [existing.rows[0].id, JSON.stringify(data), new Date()],
    );
    console.log(`Updated ${data.name}`);
  } else {
    await pool.query(
      `INSERT INTO resume_profiles (id, data, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $3)`,
      [randomUUID(), JSON.stringify(data), new Date()],
    );
    console.log(`Inserted ${data.name}`);
  }
}

await pool.end();
