import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { ensureSchema, withDb } from "@/lib/server/db";
import type { Account, AccountRole } from "@/lib/server/types";

type AccountResult =
  | { ok: true; account: Account; credentialsChanged?: boolean }
  | { ok: false; error: string };

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  active: boolean;
  session_version: number;
  created_at: Date;
};

const legacyPath = path.join(process.cwd(), "data", "users.json");

function asRole(role: string): AccountRole {
  if (role === "owner" || role === "super_admin") return "owner";
  if (role === "admin") return "admin";
  return "user";
}

function toAccount(row: UserRow): Account {
  return {
    id: row.id,
    email: row.email,
    name: row.name || "",
    role: asRole(row.role),
    active: row.active,
    createdAt: row.created_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function importLegacyAccounts(client: PoolClient) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('applyra-users'))");
  const count = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM users",
  );
  if (count.rows[0]?.count !== "0") return;

  let raw: string;
  try {
    raw = await fs.readFile(legacyPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const parsed = JSON.parse(raw) as {
    users?: Array<{
      id?: string;
      email?: string;
      name?: string;
      passwordHash?: string;
      role?: string;
      active?: boolean;
      sessionVersion?: number;
      createdAt?: string;
    }>;
  };
  const records = Array.isArray(parsed.users) ? parsed.users : [];
  const sorted = [...records].sort((a, b) =>
    String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
  );

  for (const [index, record] of sorted.entries()) {
    if (!record.email || !record.passwordHash) continue;
    const email = record.email.trim().toLowerCase();
    const name =
      (record.name || "").trim() || email.split("@")[0] || "Admin";
    const role = index === 0 ? "owner" : "user";
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, role, active, session_version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO NOTHING`,
      [
        record.id ?? randomUUID(),
        email,
        name,
        record.passwordHash,
        role,
        record.active !== false,
        record.sessionVersion ?? 0,
        record.createdAt ?? new Date().toISOString(),
      ],
    );
  }
}

async function ready(client: PoolClient) {
  await ensureSchema();
  await importLegacyAccounts(client);
}

export async function listAccounts(): Promise<Account[]> {
  return withDb(async (client) => {
    await ready(client);
    const result = await client.query<UserRow>(
      "SELECT * FROM users ORDER BY created_at ASC",
    );
    return result.rows.map(toAccount);
  });
}

export async function listAccountsFor(viewer: Account): Promise<Account[]> {
  const accounts = await listAccounts();
  if (viewer.role === "owner") return accounts;
  if (viewer.role === "admin") {
    return accounts.filter((account) => account.role === "user");
  }
  return [];
}

export async function getAccountById(id: string): Promise<Account | null> {
  return withDb(async (client) => {
    await ready(client);
    const result = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1",
      [id],
    );
    return result.rows[0] ? toAccount(result.rows[0]) : null;
  });
}

export async function createAccount(
  email: string,
  password: string,
  name: string,
): Promise<AccountResult> {
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    return await withDb(async (client) => {
      await ready(client);
      const existing = await client.query(
        "SELECT 1 FROM users LIMIT 1",
      );
      const result = await client.query<UserRow>(
        `INSERT INTO users (id, email, name, password_hash, role, active, session_version, created_at)
         VALUES ($1, $2, $3, $4, $5, true, 0, now())
         RETURNING *`,
        [
          randomUUID(),
          email,
          name,
          passwordHash,
          existing.rowCount ? "user" : "owner",
        ],
      );
      return { ok: true, account: toAccount(result.rows[0]) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw error;
  }
}

export async function verifyAccount(
  email: string,
  password: string,
): Promise<AccountResult> {
  return withDb(async (client) => {
    await ready(client);
    const result = await client.query<UserRow>(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return { ok: false, error: "Email or password is incorrect." };
    }
    if (!user.active) {
      return { ok: false, error: "This account is deactivated." };
    }
    return { ok: true, account: toAccount(user) };
  });
}

export async function rotateSessionVersion(userId: string): Promise<number | null> {
  return withDb(async (client) => {
    await ready(client);
    const result = await client.query<{ session_version: number }>(
      `UPDATE users
       SET session_version = session_version + 1
       WHERE id = $1
       RETURNING session_version`,
      [userId],
    );
    return result.rows[0]?.session_version ?? null;
  });
}

export async function getAccountForSession(
  userId: string,
  version: number,
): Promise<Account | null> {
  return withDb(async (client) => {
    await ready(client);
    const result = await client.query<UserRow>(
      `SELECT * FROM users
       WHERE id = $1 AND active = true AND session_version = $2`,
      [userId, version],
    );
    return result.rows[0] ? toAccount(result.rows[0]) : null;
  });
}

export async function updateOwnProfile(
  userId: string,
  patch: {
    name: string;
    email: string;
    password?: string;
    currentPassword?: string;
  },
): Promise<AccountResult> {
  try {
    return await withDb(async (client) => {
      await ready(client);
      const current = await client.query<UserRow>(
        "SELECT * FROM users WHERE id = $1 FOR UPDATE",
        [userId],
      );
      const user = current.rows[0];
      if (!user) return { ok: false, error: "That account is already gone." };

      let passwordHash = user.password_hash;
      if (patch.password) {
        if (!patch.currentPassword) {
          return { ok: false, error: "Enter your current password." };
        }
        if (!bcrypt.compareSync(patch.currentPassword, user.password_hash)) {
          return { ok: false, error: "Current password is incorrect." };
        }
        passwordHash = bcrypt.hashSync(patch.password, 10);
      }

      const result = await client.query<UserRow>(
        `UPDATE users
         SET name = $2,
             email = $3,
             password_hash = $4
         WHERE id = $1
         RETURNING *`,
        [userId, patch.name, patch.email, passwordHash],
      );
      return {
        ok: true,
        account: toAccount(result.rows[0]),
        credentialsChanged:
          Boolean(patch.password) || patch.email !== user.email,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw error;
  }
}

export async function deactivateOwnAccount(userId: string): Promise<AccountResult> {
  return withDb(async (client) => {
    await ready(client);
    const current = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = current.rows[0];
    if (!user) return { ok: false, error: "That account is already gone." };
    const target = toAccount(user);

    if (target.role === "owner" && target.active) {
      const others = await client.query(
        `SELECT 1 FROM users
         WHERE id <> $1 AND role = 'owner' AND active = true
         LIMIT 1`,
        [userId],
      );
      if (!others.rowCount) {
        return { ok: false, error: "Keep at least one active owner." };
      }
    }

    const result = await client.query<UserRow>(
      `UPDATE users
       SET active = false,
           session_version = session_version + 1
       WHERE id = $1
       RETURNING *`,
      [userId],
    );
    return { ok: true, account: toAccount(result.rows[0]) };
  });
}

export async function deleteOwnAccount(userId: string): Promise<AccountResult> {
  return withDb(async (client) => {
    await ready(client);
    const current = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = current.rows[0];
    if (!user) return { ok: false, error: "That account is already gone." };
    const target = toAccount(user);

    if (target.role === "owner" && target.active) {
      const others = await client.query(
        `SELECT 1 FROM users
         WHERE id <> $1 AND role = 'owner' AND active = true
         LIMIT 1`,
        [userId],
      );
      if (!others.rowCount) {
        return { ok: false, error: "Keep at least one active owner." };
      }
    }

    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    return { ok: true, account: target };
  });
}

export const DEFAULT_RESET_PASSWORD = "qwe123QWE!@#";

export async function resetAccountPassword(
  id: string,
  actor: Account,
): Promise<AccountResult> {
  return withDb(async (client) => {
    await ready(client);
    const current = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [id],
    );
    const user = current.rows[0];
    if (!user) return { ok: false, error: "That account is already gone." };
    const target = toAccount(user);

    if (actor.role === "admin") {
      if (target.role !== "user") {
        return { ok: false, error: "Admins can only manage normal users." };
      }
    } else if (actor.role !== "owner") {
      return { ok: false, error: "An admin has to manage accounts." };
    }

    const passwordHash = bcrypt.hashSync(DEFAULT_RESET_PASSWORD, 10);
    const result = await client.query<UserRow>(
      `UPDATE users
       SET password_hash = $2,
           session_version = session_version + 1
       WHERE id = $1
       RETURNING *`,
      [id, passwordHash],
    );
    return { ok: true, account: toAccount(result.rows[0]) };
  });
}

export async function updateAccount(
  id: string,
  patch: { role?: AccountRole; active?: boolean },
  actor: Account,
): Promise<AccountResult> {
  return withDb(async (client) => {
    await ready(client);
    const current = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [id],
    );
    const user = current.rows[0];
    if (!user) return { ok: false, error: "That account is already gone." };
    const target = toAccount(user);

    if (actor.role === "admin") {
      if (target.role !== "user") {
        return { ok: false, error: "Admins can only manage normal users." };
      }
      if (patch.role !== undefined) {
        return { ok: false, error: "Only an owner can change admin roles." };
      }
    } else if (actor.role !== "owner") {
      return { ok: false, error: "An admin has to manage accounts." };
    }

    if (patch.role === "owner") {
      return { ok: false, error: "You can't assign the owner role." };
    }
    if (
      actor.role === "owner" &&
      patch.role !== undefined &&
      patch.role !== "admin" &&
      patch.role !== "user"
    ) {
      return { ok: false, error: "Choose admin or user." };
    }
    if (target.role === "owner" && patch.role !== undefined) {
      return { ok: false, error: "You can't change the owner role." };
    }

    const nextRole = patch.role ?? target.role;
    const nextActive = patch.active ?? target.active;

    if (target.role === "owner" && (!(nextRole === "owner") || !nextActive)) {
      const others = await client.query(
        `SELECT 1 FROM users
         WHERE id <> $1 AND role = 'owner' AND active = true
         LIMIT 1`,
        [id],
      );
      if (!others.rowCount) {
        return { ok: false, error: "Keep at least one active owner." };
      }
    }

    const result = await client.query<UserRow>(
      `UPDATE users
       SET role = $2,
           active = $3,
           session_version = CASE WHEN $4 THEN session_version + 1 ELSE session_version END
       WHERE id = $1
       RETURNING *`,
      [id, nextRole, nextActive, patch.active === false],
    );
    return { ok: true, account: toAccount(result.rows[0]) };
  });
}

export async function deleteAccount(
  id: string,
  actor: Account,
): Promise<AccountResult> {
  return withDb(async (client) => {
    await ready(client);
    const current = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [id],
    );
    const user = current.rows[0];
    if (!user) return { ok: false, error: "That account is already gone." };
    const target = toAccount(user);

    if (actor.role === "admin") {
      if (target.role !== "user") {
        return { ok: false, error: "Admins can only manage normal users." };
      }
    } else if (actor.role !== "owner") {
      return { ok: false, error: "An admin has to manage accounts." };
    }

    if (target.role === "owner" && target.active) {
      const others = await client.query(
        `SELECT 1 FROM users
         WHERE id <> $1 AND role = 'owner' AND active = true
         LIMIT 1`,
        [id],
      );
      if (!others.rowCount) {
        return { ok: false, error: "Keep at least one active owner." };
      }
    }

    await client.query("DELETE FROM users WHERE id = $1", [id]);
    return { ok: true, account: target };
  });
}
