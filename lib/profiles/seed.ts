import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Pool } from "pg";
import { sanitizeProfileData } from "@/lib/profiles/types";

const SEED_DIR = path.join(process.cwd(), "data", "seed-profiles");

const SEED_FILES = [
  {
    file: "Joshua_Eric_Person.json",
    gender: "male" as const,
    techStack:
      "AWS, Terraform, CloudFormation, Salesforce, ServiceNow, Linux, SQL",
  },
  {
    file: "Elvis_Edinge.json",
    gender: "male" as const,
    techStack:
      "AWS, Terraform, Ansible, Jenkins, Docker, Prometheus, Grafana, Linux",
  },
];

/**
 * Idempotent seed of Joshua + Elvis résumé profiles into Postgres.
 * Source JSON lives under data/seed-profiles (copied from Origin); Origin is not required at runtime.
 */
export async function seedResumeProfiles(pool: Pool) {
  for (const seed of SEED_FILES) {
    const filePath = path.join(SEED_DIR, seed.file);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const data = sanitizeProfileData({
      ...(parsed as object),
      gender: seed.gender,
      techStack: seed.techStack,
    });
    if (!data) continue;

    const existing = await pool.query(
      `SELECT id FROM resume_profiles
       WHERE LOWER(data->>'email') = LOWER($1)
          OR LOWER(data->>'name') = LOWER($2)
       LIMIT 1`,
      [data.email, data.name],
    );
    if (existing.rows[0]) continue;

    const now = new Date();
    await pool.query(
      `INSERT INTO resume_profiles (id, data, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $3)`,
      [randomUUID(), JSON.stringify(data), now],
    );
  }
}
