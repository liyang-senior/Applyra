import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Pool } from "pg";
import { sanitizeProfileData } from "@/lib/profiles/types";

const SEED_DIR = path.join(process.cwd(), "data", "seed-profiles");
const MANIFEST_PATH = path.join(SEED_DIR, "manifest.json");

type SeedManifest = {
  profiles: Array<{
    file: string;
    name?: string;
    email?: string;
    gender?: string;
    techStack?: string;
  }>;
};

async function loadManifest(): Promise<SeedManifest["profiles"]> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as SeedManifest;
    if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
      return parsed.profiles;
    }
  } catch {
    // fall through to directory scan
  }

  const entries = await fs.readdir(SEED_DIR).catch(() => [] as string[]);
  return entries
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .map((file) => ({ file }));
}

/**
 * Idempotent seed of résumé profiles into Postgres from data/seed-profiles.
 * Manifest + JSON are exported from the live DB — fresh migrate needs no manual updates.
 * Existing rows matched by email/name are updated to the seed snapshot.
 */
export async function seedResumeProfiles(pool: Pool) {
  const seeds = await loadManifest();
  for (const seed of seeds) {
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
      ...(seed.gender ? { gender: seed.gender } : {}),
      ...(seed.techStack ? { techStack: seed.techStack } : {}),
    });
    if (!data) continue;

    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM resume_profiles
       WHERE LOWER(data->>'email') = LOWER($1)
          OR LOWER(data->>'name') = LOWER($2)
       LIMIT 1`,
      [data.email, data.name],
    );
    const now = new Date();
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE resume_profiles
         SET data = $2::jsonb, updated_at = $3
         WHERE id = $1`,
        [existing.rows[0].id, JSON.stringify(data), now],
      );
      continue;
    }

    await pool.query(
      `INSERT INTO resume_profiles (id, data, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $3)`,
      [randomUUID(), JSON.stringify(data), now],
    );
  }
}
