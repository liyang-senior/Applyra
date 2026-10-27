import type { Pool } from "pg";
import { randomUUID } from "crypto";

/** Ported from resume-retailor/public/email-snippets.json */
const DEFAULT_TEMPLATES: Array<{ name: string; body: string; sortOrder: number }> =
  [
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
      name: "Reschedule",
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

export async function seedEmailTemplates(pool: Pool) {
  const existing = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM email_templates`,
  );
  if (Number(existing.rows[0]?.count || 0) > 0) return;

  const now = new Date();
  for (const template of DEFAULT_TEMPLATES) {
    await pool.query(
      `INSERT INTO email_templates (id, name, body, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (name) DO NOTHING`,
      [randomUUID(), template.name, template.body, template.sortOrder, now],
    );
  }
}
