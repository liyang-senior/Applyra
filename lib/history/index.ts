import { randomUUID } from "crypto";
import { withDb } from "@/lib/server/db";
import type { Account } from "@/lib/server/types";
import { canManageAccounts } from "@/lib/server/types";

export type HistoryStatus = "draft" | "applied" | "rejected";

export type HistoryRecord = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  profileId: string | null;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  jobLink: string;
  resumeJson: unknown | null;
  coverLetter: string | null;
  status: HistoryStatus;
  provider: string | null;
  model: string | null;
  requiresClearance: boolean;
  createdAt: string;
  generatedAt: string | null;
  appliedAt: string | null;
  rejectedAt: string | null;
  rejectComment: string;
  updatedAt: string;
};

type HistoryRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  profile_id: string | null;
  company_name: string;
  job_title: string;
  job_description: string;
  job_link: string | null;
  resume_json: unknown | null;
  cover_letter: string | null;
  status: string;
  provider: string | null;
  model: string | null;
  requires_clearance: boolean | null;
  created_at: Date;
  generated_at: Date | null;
  applied_at: Date | null;
  rejected_at: Date | null;
  reject_comment: string | null;
  updated_at: Date;
};

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toStatus(value: string): HistoryStatus {
  if (value === "applied") return "applied";
  if (value === "rejected") return "rejected";
  return "draft";
}

function toRecord(row: HistoryRow): HistoryRecord {
  const createdAt = asIso(row.created_at) || new Date(0).toISOString();
  const updatedAt = asIso(row.updated_at) || createdAt;
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || "",
    userEmail: row.user_email,
    profileId: row.profile_id,
    companyName: row.company_name || "",
    jobTitle: row.job_title || "",
    jobDescription: row.job_description || "",
    jobLink: row.job_link || "",
    resumeJson: row.resume_json,
    coverLetter: row.cover_letter,
    status: toStatus(row.status),
    provider: row.provider,
    model: row.model,
    requiresClearance: Boolean(row.requires_clearance),
    createdAt,
    generatedAt: asIso(row.generated_at),
    appliedAt: asIso(row.applied_at),
    rejectedAt: asIso(row.rejected_at),
    rejectComment: row.reject_comment || "",
    updatedAt,
  };
}

export async function findAppliedDuplicate(input: {
  userId: string;
  profileId?: string | null;
  companyName: string;
  jobTitle: string;
  jobLink: string;
  excludeId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const companyName = input.companyName.trim();
  const jobTitle = input.jobTitle.trim();
  const jobLink = input.jobLink.trim();
  if (!jobLink) return { ok: false, error: "Enter a job link." };

  return withDb(async (client) => {
    const params: unknown[] = [input.userId, jobLink];
    let excludeClause = "";
    if (input.excludeId) {
      params.push(input.excludeId);
      excludeClause = ` AND id <> $${params.length}`;
    }

    const byLink = await client.query<{ id: string }>(
      `SELECT id FROM applications
       WHERE user_id = $1
         AND status = 'applied'
         AND LOWER(TRIM(job_link)) = LOWER(TRIM($2))
         ${excludeClause}
       LIMIT 1`,
      params,
    );
    if (byLink.rows[0]) {
      return {
        ok: false,
        error: "This job link was already marked Applied. Generate is blocked.",
      };
    }

    const profileId = input.profileId ? String(input.profileId) : "";
    if (profileId && companyName && jobTitle) {
      const comboParams: unknown[] = [
        input.userId,
        profileId,
        companyName,
        jobTitle,
      ];
      let comboExclude = "";
      if (input.excludeId) {
        comboParams.push(input.excludeId);
        comboExclude = ` AND id <> $${comboParams.length}`;
      }
      const byCombo = await client.query<{ id: string }>(
        `SELECT id FROM applications
         WHERE user_id = $1
           AND status = 'applied'
           AND profile_id = $2::uuid
           AND LOWER(TRIM(company_name)) = LOWER(TRIM($3))
           AND LOWER(TRIM(job_title)) = LOWER(TRIM($4))
           ${comboExclude}
         LIMIT 1`,
        comboParams,
      );
      if (byCombo.rows[0]) {
        return {
          ok: false,
          error:
            "This profile, company, and job title were already marked Applied. Generate is blocked.",
        };
      }
    }

    return { ok: true };
  });
}

export async function saveGeneratedHistory(input: {
  userId: string;
  profileId?: string | null;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  jobLink: string;
  resumeJson?: unknown | null;
  coverLetter?: string | null;
  provider?: string | null;
  model?: string | null;
  historyId?: string | null;
  requiresClearance?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyName = input.companyName.trim();
  const jobTitle = input.jobTitle.trim();
  const jobDescription = input.jobDescription.trim();
  const jobLink = input.jobLink.trim();
  if (!jobDescription) return { ok: false, error: "Enter a job description." };
  if (!jobLink) return { ok: false, error: "Enter a job link." };
  const requiresClearance = Boolean(input.requiresClearance);

  const duplicate = await findAppliedDuplicate({
    userId: input.userId,
    profileId: input.profileId,
    companyName,
    jobTitle,
    jobLink,
    excludeId: input.historyId,
  });
  if (!duplicate.ok) return duplicate;

  return withDb(async (client) => {
    const now = new Date();

    if (input.historyId) {
      const existing = await client.query(
        `SELECT id FROM applications
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [input.historyId, input.userId],
      );
      if (existing.rows[0]) {
        const hasOutput =
          input.resumeJson != null || input.coverLetter != null;
        await client.query(
          `UPDATE applications SET
             profile_id = COALESCE($3, profile_id),
             company_name = $4,
             job_title = $5,
             job_description = $6,
             job_link = $7,
             resume_json = COALESCE($8::jsonb, resume_json),
             cover_letter = COALESCE($9, cover_letter),
             provider = COALESCE($10, provider),
             model = COALESCE($11, model),
             requires_clearance = $12,
             generated_at = CASE WHEN $14::boolean THEN $13 ELSE generated_at END,
             updated_at = $13
           WHERE id = $1`,
          [
            input.historyId,
            input.userId,
            input.profileId || null,
            companyName,
            jobTitle,
            jobDescription,
            jobLink,
            input.resumeJson != null ? JSON.stringify(input.resumeJson) : null,
            input.coverLetter ?? null,
            input.provider || null,
            input.model || null,
            requiresClearance,
            now,
            hasOutput,
          ],
        );
        return { ok: true, id: input.historyId };
      }
    }

    // Prefer updating the latest matching draft for the same job.
    const match = await client.query<{ id: string }>(
      `SELECT id FROM applications
       WHERE user_id = $1
         AND status = 'draft'
         AND company_name = $2
         AND job_title = $3
         AND job_description = $4
         AND job_link = $5
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [input.userId, companyName, jobTitle, jobDescription, jobLink],
    );
    if (match.rows[0]) {
      const id = match.rows[0].id;
      const hasOutput =
        input.resumeJson != null || input.coverLetter != null;
      await client.query(
        `UPDATE applications SET
           profile_id = COALESCE($2, profile_id),
           job_link = $3,
           resume_json = COALESCE($4::jsonb, resume_json),
           cover_letter = COALESCE($5, cover_letter),
           provider = COALESCE($6, provider),
           model = COALESCE($7, model),
           requires_clearance = $8,
           generated_at = CASE WHEN $10::boolean THEN $9 ELSE generated_at END,
           updated_at = $9
         WHERE id = $1`,
        [
          id,
          input.profileId || null,
          jobLink,
          input.resumeJson != null ? JSON.stringify(input.resumeJson) : null,
          input.coverLetter ?? null,
          input.provider || null,
          input.model || null,
          requiresClearance,
          now,
          hasOutput,
        ],
      );
      return { ok: true, id };
    }

    const id = randomUUID();
    const hasOutput =
      input.resumeJson != null || input.coverLetter != null;
    await client.query(
      `INSERT INTO applications (
         id, user_id, profile_id, company_name, job_title, job_description, job_link,
         resume_json, cover_letter, status, provider, model, requires_clearance,
         created_at, generated_at, applied_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8::jsonb, $9, 'draft', $10, $11, $12,
         $13, $14, NULL, $13
       )`,
      [
        id,
        input.userId,
        input.profileId || null,
        companyName,
        jobTitle,
        jobDescription,
        jobLink,
        input.resumeJson != null ? JSON.stringify(input.resumeJson) : null,
        input.coverLetter ?? null,
        input.provider || null,
        input.model || null,
        requiresClearance,
        now,
        hasOutput ? now : null,
      ],
    );
    return { ok: true, id };
  });
}

export async function markHistoryApplied(input: {
  userId: string;
  historyId?: string | null;
  profileId?: string | null;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  jobLink: string;
  requiresClearance?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const companyName = input.companyName.trim();
  const jobTitle = input.jobTitle.trim();
  const jobDescription = input.jobDescription.trim();
  const jobLink = input.jobLink.trim();
  if (!companyName) return { ok: false, error: "Enter a company name." };
  if (!jobTitle) return { ok: false, error: "Enter a job title." };
  if (!jobDescription) return { ok: false, error: "Enter a job description." };
  if (!jobLink) return { ok: false, error: "Enter a job link." };
  const requiresClearance = Boolean(input.requiresClearance);

  const duplicate = await findAppliedDuplicate({
    userId: input.userId,
    profileId: input.profileId,
    companyName,
    jobTitle,
    jobLink,
    excludeId: input.historyId,
  });
  if (!duplicate.ok) {
    return {
      ok: false,
      error: duplicate.error.replace("Generate is blocked.", "Applied is blocked."),
    };
  }

  return withDb(async (client) => {
    const now = new Date();

    if (input.historyId) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM applications WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [input.historyId, input.userId],
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE applications SET
             status = 'applied',
             applied_at = $3,
             company_name = $4,
             job_title = $5,
             job_description = $6,
             job_link = $7,
             profile_id = COALESCE($8, profile_id),
             requires_clearance = $9,
             updated_at = $3
           WHERE id = $1`,
          [
            input.historyId,
            input.userId,
            now,
            companyName,
            jobTitle,
            jobDescription,
            jobLink,
            input.profileId || null,
            requiresClearance,
          ],
        );
        return { ok: true, id: input.historyId };
      }
    }

    const draft = await client.query<{ id: string }>(
      `SELECT id FROM applications
       WHERE user_id = $1
         AND status = 'draft'
         AND company_name = $2
         AND job_title = $3
         AND job_description = $4
         AND job_link = $5
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [input.userId, companyName, jobTitle, jobDescription, jobLink],
    );
    if (draft.rows[0]) {
      const id = draft.rows[0].id;
      await client.query(
        `UPDATE applications SET
           status = 'applied',
           applied_at = $2,
           job_link = $3,
           requires_clearance = $4,
           updated_at = $2
         WHERE id = $1`,
        [id, now, jobLink, requiresClearance],
      );
      return { ok: true, id };
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO applications (
         id, user_id, profile_id, company_name, job_title, job_description, job_link,
         resume_json, cover_letter, status, provider, model, requires_clearance,
         created_at, applied_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         NULL, NULL, 'applied', NULL, NULL, $8,
         $9, $9, $9
       )`,
      [
        id,
        input.userId,
        input.profileId || null,
        companyName,
        jobTitle,
        jobDescription,
        jobLink,
        requiresClearance,
        now,
      ],
    );
    return { ok: true, id };
  });
}

export async function listHistoryFor(
  viewer: Account,
  userIdFilter?: string | null,
): Promise<HistoryRecord[]> {
  return withDb(async (client) => {
    const params: unknown[] = [];
    let where = "";

    if (canManageAccounts(viewer.role)) {
      if (userIdFilter) {
        params.push(userIdFilter);
        where = `WHERE a.user_id = $${params.length}`;
      }
    } else {
      params.push(viewer.id);
      where = `WHERE a.user_id = $${params.length}`;
    }

    const result = await client.query<HistoryRow>(
      `SELECT
         a.*,
         u.name AS user_name,
         u.email AS user_email
       FROM applications a
       JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY COALESCE(a.applied_at, a.updated_at, a.created_at) DESC`,
      params,
    );
    return result.rows.map(toRecord);
  });
}

export async function deleteHistoryRecords(
  viewer: Account,
  ids: string[],
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "Select at least one history item." };
  }

  return withDb(async (client) => {
    if (canManageAccounts(viewer.role)) {
      const result = await client.query(
        `DELETE FROM applications WHERE id = ANY($1::uuid[])`,
        [unique],
      );
      return { ok: true, deleted: result.rowCount || 0 };
    }

    const result = await client.query(
      `DELETE FROM applications
       WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [unique, viewer.id],
    );
    return { ok: true, deleted: result.rowCount || 0 };
  });
}

export async function rejectHistoryRecords(
  viewer: Account,
  ids: string[],
  comment: string,
): Promise<{ ok: true; rejected: number } | { ok: false; error: string }> {
  if (!canManageAccounts(viewer.role)) {
    return { ok: false, error: "Only admins can reject history items." };
  }
  const unique = [
    ...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)),
  ];
  if (unique.length === 0) {
    return { ok: false, error: "Select at least one history item." };
  }
  const rejectComment = String(comment || "").trim();
  if (!rejectComment) {
    return { ok: false, error: "Enter a reject comment." };
  }

  return withDb(async (client) => {
    const now = new Date();
    const result = await client.query(
      `UPDATE applications SET
         status = 'rejected',
         reject_comment = $2,
         rejected_at = $3,
         rejected_by = $4,
         updated_at = $3
       WHERE id = ANY($1::uuid[])`,
      [unique, rejectComment, now, viewer.id],
    );
    return { ok: true, rejected: result.rowCount || 0 };
  });
}

export async function getHistoryById(
  id: string,
  viewer: Account,
): Promise<HistoryRecord | null> {
  return withDb(async (client) => {
    const result = await client.query<HistoryRow>(
      `SELECT
         a.*,
         u.name AS user_name,
         u.email AS user_email
       FROM applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!canManageAccounts(viewer.role) && row.user_id !== viewer.id) {
      return null;
    }
    return toRecord(row);
  });
}
