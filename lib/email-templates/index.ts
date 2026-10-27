import { randomUUID } from "crypto";
import { withDb } from "@/lib/server/db";
import type { Account } from "@/lib/server/types";
import { canManageAccounts } from "@/lib/server/types";

export type EmailTemplate = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  name: string;
  body: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

function toTemplate(row: TemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body || "",
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  return withDb(async (client) => {
    const result = await client.query<TemplateRow>(
      `SELECT * FROM email_templates
       ORDER BY sort_order ASC, name ASC`,
    );
    return result.rows.map(toTemplate);
  });
}

export async function upsertEmailTemplate(
  viewer: Account,
  input: {
    id?: string | null;
    name: string;
    body: string;
    sortOrder?: number;
  },
): Promise<{ ok: true; template: EmailTemplate } | { ok: false; error: string }> {
  if (!canManageAccounts(viewer.role)) {
    return { ok: false, error: "Only admins can manage email templates." };
  }
  const name = String(input.name || "").trim();
  const body = String(input.body || "");
  if (!name) return { ok: false, error: "Enter a template name." };

  return withDb(async (client) => {
    const now = new Date();
    if (input.id) {
      const result = await client.query<TemplateRow>(
        `UPDATE email_templates SET
           name = $2,
           body = $3,
           sort_order = COALESCE($4, sort_order),
           updated_at = $5
         WHERE id = $1
         RETURNING *`,
        [
          input.id,
          name,
          body,
          input.sortOrder == null ? null : Number(input.sortOrder),
          now,
        ],
      );
      const row = result.rows[0];
      if (!row) return { ok: false, error: "Template not found." };
      return { ok: true, template: toTemplate(row) };
    }

    const maxOrder = await client.query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM email_templates`,
    );
    const sortOrder =
      input.sortOrder == null
        ? (maxOrder.rows[0]?.max || 0) + 10
        : Number(input.sortOrder);
    const id = randomUUID();
    try {
      const result = await client.query<TemplateRow>(
        `INSERT INTO email_templates (id, name, body, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING *`,
        [id, name, body, sortOrder, now],
      );
      return { ok: true, template: toTemplate(result.rows[0]) };
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      ) {
        return { ok: false, error: "A template with that name already exists." };
      }
      throw error;
    }
  });
}

export async function deleteEmailTemplate(
  viewer: Account,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canManageAccounts(viewer.role)) {
    return { ok: false, error: "Only admins can manage email templates." };
  }
  const templateId = String(id || "").trim();
  if (!templateId) return { ok: false, error: "Template not found." };

  return withDb(async (client) => {
    const result = await client.query(
      `DELETE FROM email_templates WHERE id = $1`,
      [templateId],
    );
    if (!result.rowCount) return { ok: false, error: "Template not found." };
    return { ok: true };
  });
}
