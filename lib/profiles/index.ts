import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { withDb } from "@/lib/server/db";
import {
  sanitizeProfileData,
  type ResumeProfile,
  type ResumeProfileData,
  type ResumeProfileListItem,
} from "@/lib/profiles/types";
import type { Account } from "@/lib/server/types";
import { isStaff } from "@/lib/server/types";

type ProfileRow = {
  id: string;
  data: ResumeProfileData;
  created_at: Date;
  updated_at: Date;
};

type AssigneeRow = {
  profile_id: string;
  user_id: string;
  name: string;
  email: string;
};

export type ProfileFilters = {
  userName?: string;
  userEmail?: string;
  gender?: string;
  techStack?: string;
};

function toProfile(
  row: ProfileRow,
  assigneeIds: string[] = [],
): ResumeProfile {
  return {
    id: row.id,
    data: row.data,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    assigneeIds,
  };
}

async function loadAssignees(
  client: PoolClient,
  profileIds: string[],
): Promise<Map<string, Array<{ id: string; name: string; email: string }>>> {
  const map = new Map<
    string,
    Array<{ id: string; name: string; email: string }>
  >();
  if (profileIds.length === 0) return map;

  const result = await client.query<AssigneeRow>(
    `SELECT a.profile_id, a.user_id, u.name, u.email
     FROM resume_profile_assignees a
     JOIN users u ON u.id = a.user_id
     WHERE a.profile_id = ANY($1::uuid[])
     ORDER BY u.name ASC, u.email ASC`,
    [profileIds],
  );

  for (const row of result.rows) {
    const list = map.get(row.profile_id) || [];
    list.push({ id: row.user_id, name: row.name || "", email: row.email });
    map.set(row.profile_id, list);
  }
  return map;
}

export async function listAssignableAccounts(): Promise<Account[]> {
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      active: boolean;
      created_at: Date;
    }>(
      `SELECT id, email, name, role, active, created_at
       FROM users
       WHERE role <> 'owner'
       ORDER BY name ASC, email ASC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name || "",
      role: row.role === "admin" ? "admin" : "user",
      active: row.active,
      createdAt: row.created_at.toISOString(),
    }));
  });
}

export async function listResumeProfiles(
  filters: ProfileFilters = {},
): Promise<ResumeProfileListItem[]> {
  return withDb(async (client) => {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.gender && filters.gender !== "all") {
      params.push(filters.gender);
      clauses.push(`data->>'gender' = $${params.length}`);
    }
    if (filters.techStack?.trim()) {
      params.push(`%${filters.techStack.trim().toLowerCase()}%`);
      clauses.push(`LOWER(COALESCE(data->>'techStack', '')) LIKE $${params.length}`);
    }
    if (filters.userName?.trim()) {
      params.push(`%${filters.userName.trim().toLowerCase()}%`);
      clauses.push(`EXISTS (
        SELECT 1 FROM resume_profile_assignees a
        JOIN users u ON u.id = a.user_id
        WHERE a.profile_id = resume_profiles.id
          AND LOWER(COALESCE(u.name, '')) LIKE $${params.length}
      )`);
    }
    if (filters.userEmail?.trim()) {
      params.push(`%${filters.userEmail.trim().toLowerCase()}%`);
      clauses.push(`EXISTS (
        SELECT 1 FROM resume_profile_assignees a
        JOIN users u ON u.id = a.user_id
        WHERE a.profile_id = resume_profiles.id
          AND LOWER(u.email) LIKE $${params.length}
      )`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query<ProfileRow>(
      `SELECT * FROM resume_profiles ${where} ORDER BY updated_at DESC`,
      params,
    );
    const assignees = await loadAssignees(
      client,
      result.rows.map((row) => row.id),
    );

    return result.rows.map((row) => {
      const people = assignees.get(row.id) || [];
      return {
        id: row.id,
        name: row.data.name,
        email: row.data.email,
        title: row.data.title,
        gender: row.data.gender,
        techStack: row.data.techStack,
        linkedin: row.data.linkedin,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        assignees: people,
      };
    });
  });
}

export async function listProfilesForUser(
  userId: string,
): Promise<ResumeProfileListItem[]> {
  return withDb(async (client) => {
    const result = await client.query<ProfileRow>(
      `SELECT p.*
       FROM resume_profiles p
       JOIN resume_profile_assignees a ON a.profile_id = p.id
       WHERE a.user_id = $1
       ORDER BY p.updated_at DESC`,
      [userId],
    );
    const assignees = await loadAssignees(
      client,
      result.rows.map((row) => row.id),
    );
    return result.rows.map((row) => {
      const people = assignees.get(row.id) || [];
      return {
        id: row.id,
        name: row.data.name,
        email: row.data.email,
        title: row.data.title,
        gender: row.data.gender,
        techStack: row.data.techStack,
        linkedin: row.data.linkedin,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        assignees: people,
      };
    });
  });
}

export async function getResumeProfile(
  id: string,
): Promise<ResumeProfile | null> {
  return withDb(async (client) => {
    const result = await client.query<ProfileRow>(
      "SELECT * FROM resume_profiles WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const assignees = await loadAssignees(client, [id]);
    return toProfile(
      row,
      (assignees.get(id) || []).map((person) => person.id),
    );
  });
}

export async function userCanAccessProfile(
  viewer: Account,
  profileId: string,
): Promise<boolean> {
  if (isStaff(viewer.role)) return true;
  return withDb(async (client) => {
    const result = await client.query(
      `SELECT 1 FROM resume_profile_assignees
       WHERE profile_id = $1 AND user_id = $2`,
      [profileId, viewer.id],
    );
    return result.rowCount !== 0;
  });
}

export async function createResumeProfile(
  dataInput: unknown,
  assigneeIds: string[] = [],
): Promise<{ ok: true; profile: ResumeProfile } | { ok: false; error: string }> {
  const data = sanitizeProfileData(dataInput);
  if (!data) return { ok: false, error: "Enter a profile name." };
  if (!data.techStack.trim()) {
    return { ok: false, error: "Enter a tech stack." };
  }
  if (data.gender !== "male" && data.gender !== "female") {
    return { ok: false, error: "Select Male or Female." };
  }

  return withDb(async (client) => {
    const id = randomUUID();
    const now = new Date();
    await client.query(
      `INSERT INTO resume_profiles (id, data, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $3)`,
      [id, JSON.stringify(data), now],
    );
    await setAssignees(client, id, assigneeIds);
    return { ok: true, profile: toProfile({ id, data, created_at: now, updated_at: now }, assigneeIds) };
  });
}

export async function updateResumeProfile(
  id: string,
  dataInput: unknown,
): Promise<{ ok: true; profile: ResumeProfile } | { ok: false; error: string }> {
  const data = sanitizeProfileData(dataInput);
  if (!data) return { ok: false, error: "Enter a profile name." };
  if (!data.techStack.trim()) {
    return { ok: false, error: "Enter a tech stack." };
  }
  if (data.gender !== "male" && data.gender !== "female") {
    return { ok: false, error: "Select Male or Female." };
  }

  return withDb(async (client) => {
    const existing = await client.query<ProfileRow>(
      "SELECT * FROM resume_profiles WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!existing.rows[0]) return { ok: false, error: "Profile not found." };

    const now = new Date();
    const result = await client.query<ProfileRow>(
      `UPDATE resume_profiles
       SET data = $2::jsonb, updated_at = $3
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(data), now],
    );
    const assignees = await loadAssignees(client, [id]);
    return {
      ok: true,
      profile: toProfile(
        result.rows[0],
        (assignees.get(id) || []).map((person) => person.id),
      ),
    };
  });
}

export async function deleteResumeProfile(id: string): Promise<boolean> {
  return withDb(async (client) => {
    const result = await client.query(
      "DELETE FROM resume_profiles WHERE id = $1",
      [id],
    );
    return (result.rowCount || 0) > 0;
  });
}

async function setAssignees(
  client: PoolClient,
  profileId: string,
  assigneeIds: string[],
) {
  const unique = [...new Set(assigneeIds.filter(Boolean))];
  await client.query(
    "DELETE FROM resume_profile_assignees WHERE profile_id = $1",
    [profileId],
  );
  if (unique.length === 0) return;

  const allowed = await client.query<{ id: string }>(
    `SELECT id FROM users
     WHERE id = ANY($1::uuid[]) AND role <> 'owner'`,
    [unique],
  );
  for (const row of allowed.rows) {
    await client.query(
      `INSERT INTO resume_profile_assignees (profile_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [profileId, row.id],
    );
  }
}

export async function assignResumeProfile(
  profileId: string,
  assigneeIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withDb(async (client) => {
    const existing = await client.query(
      "SELECT 1 FROM resume_profiles WHERE id = $1",
      [profileId],
    );
    if (!existing.rows[0]) return { ok: false, error: "Profile not found." };
    await setAssignees(client, profileId, assigneeIds);
    return { ok: true };
  });
}
