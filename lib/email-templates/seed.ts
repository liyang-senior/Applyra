import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Pool } from "pg";

type SeedTemplate = { name: string; body: string; sortOrder: number };

/** Fallback if data/seed-email-templates.json is missing. */
const DEFAULT_TEMPLATES: SeedTemplate[] = [
  {
    name: "Interest",
    sortOrder: 10,
    body: "Hi,\n\nThank you for reaching out.\nI am very interested in this position and would appreciate learning about the next steps.\n\nWarm regards,",
  },
  {
    name: "Interest+CV",
    sortOrder: 20,
    body: "Hi,\n\nThank you for reaching out.\nI am very interested in this position and would appreciate learning about the next steps.\nPlease find my updated resume attached to this email\n\nBest regards,",
  },
  {
    name: "Remote",
    sortOrder: 30,
    body: "Hi,\n\nThank you so much for reaching out—I really appreciate you thinking of me.\nRight now, I'm focusing only on fully remote roles, so I won't be able to move forward with an onsite position. I'd love to stay in touch though, and please feel free to reach out if any remote opportunities come up.\n\nThank you again!",
  },
  {
    name: "Nobody@Meeting",
    sortOrder: 40,
    body: "Hi,\n\nI joined the meeting about 10 minutes ago using the provided link, but it looks like no one has joined yet. Just wanted to check if everything is okay or if there's been any change in timing.\nHappy to reschedule if needed—please let me know.\n\nThanks,",
  },
  {
    name: "Reschedule Today's Meeting",
    sortOrder: 50,
    body: "Hi,\n\nI wanted to let you know that something urgent came up today, and I won't be able to make our meeting. Sorry for the short notice.\nCould we please reschedule for another time? I'm happy to work around your availability.\nThanks for understanding, and I look forward to connecting soon.\n\nBest,",
  },
  {
    name: "Missed Phone",
    sortOrder: 60,
    body: "Hi,\n\nSorry I missed your call earlier. I'm tied up with a few back-to-back commitments today and won't be available for a phone call.\nI'd be happy to connect at another time—please let me know what works for you, and I'll do my best to accommodate.\n\nThanks,",
  },
  {
    name: "Salary",
    sortOrder: 70,
    body: "Hi,\n\nI'm targeting around $60/hour on W2, but I'm open to discussing based on the role and overall scope.\nHappy to chat further!\n\nBest,",
  },
];

const SEED_FILE = path.join(
  process.cwd(),
  "data",
  "seed-email-templates.json",
);

async function loadTemplates(): Promise<SeedTemplate[]> {
  try {
    const raw = await fs.readFile(SEED_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TEMPLATES;
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as Record<string, unknown>;
        const name = String(item.name ?? "").trim();
        const body = String(item.body ?? "");
        const sortOrder = Number(item.sortOrder ?? item.sort_order ?? 0);
        if (!name) return null;
        return { name, body, sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0 };
      })
      .filter((row): row is SeedTemplate => Boolean(row));
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

/**
 * Seed email templates from data/seed-email-templates.json (exported from live DB).
 * Inserts missing names; updates body/sort_order for names that already exist.
 */
export async function seedEmailTemplates(pool: Pool) {
  const templates = await loadTemplates();
  if (templates.length === 0) return;

  const now = new Date();
  for (const template of templates) {
    await pool.query(
      `INSERT INTO email_templates (id, name, body, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (name) DO UPDATE SET
         body = EXCLUDED.body,
         sort_order = EXCLUDED.sort_order,
         updated_at = EXCLUDED.updated_at`,
      [randomUUID(), template.name, template.body, template.sortOrder, now],
    );
  }
}
