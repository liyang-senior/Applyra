import { Pool, type PoolClient } from "pg";

const SCHEMA_VERSION = 9;

const globalForPg = globalThis as typeof globalThis & {
  applyraPool?: Pool;
  applyraSchema?: Promise<void>;
  applyraSchemaVersion?: number;
};

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local.");
  }
  if (!globalForPg.applyraPool) {
    globalForPg.applyraPool = new Pool({ connectionString });
  }
  return globalForPg.applyraPool;
}

export async function ensureSchema() {
  if (
    globalForPg.applyraSchema &&
    globalForPg.applyraSchemaVersion === SCHEMA_VERSION
  ) {
    await globalForPg.applyraSchema;
    // Cheap idempotent safety net — version cache must never skip critical columns.
    await ensureCriticalApplicationColumns();
    return;
  }
  globalForPg.applyraSchemaVersion = SCHEMA_VERSION;
  globalForPg.applyraSchema = createSchema().catch((error) => {
    globalForPg.applyraSchema = undefined;
    globalForPg.applyraSchemaVersion = undefined;
    throw error;
  });
  await globalForPg.applyraSchema;
}

async function ensureCriticalApplicationColumns() {
  const pool = getPool();
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS requires_clearance boolean NOT NULL DEFAULT false
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS is_remote boolean NOT NULL DEFAULT true
  `);
}

async function createSchema() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text NOT NULL DEFAULT '',
      password_hash text NOT NULL,
      role text NOT NULL CHECK (role IN ('owner', 'admin', 'user')),
      active boolean NOT NULL DEFAULT true,
      session_version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL
    )
  `);
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
  `);
  await pool.query(`
    UPDATE users
    SET role = 'owner'
    WHERE role = 'super_admin'
  `);
  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('owner', 'admin', 'user'))
  `);
  await pool.query(`
    UPDATE users
    SET role = 'owner'
    WHERE id = (
      SELECT id FROM users ORDER BY created_at ASC LIMIT 1
    )
    AND role <> 'owner'
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resume_profiles (
      id uuid PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resume_profile_assignees (
      profile_id uuid NOT NULL REFERENCES resume_profiles(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (profile_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id uuid REFERENCES resume_profiles(id) ON DELETE SET NULL,
      company_name text NOT NULL DEFAULT '',
      job_title text NOT NULL DEFAULT '',
      job_description text NOT NULL DEFAULT '',
      job_link text NOT NULL DEFAULT '',
      resume_json jsonb,
      cover_letter text,
      status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'applied', 'rejected')),
      provider text,
      model text,
      requires_clearance boolean NOT NULL DEFAULT false,
      is_remote boolean NOT NULL DEFAULT true,
      generated_at timestamptz,
      created_at timestamptz NOT NULL,
      applied_at timestamptz,
      rejected_at timestamptz,
      reject_comment text NOT NULL DEFAULT '',
      rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS resume_json jsonb
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS cover_letter text
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS status text
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS provider text
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS model text
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS applied_at timestamptz
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS updated_at timestamptz
  `);
  await ensureCriticalApplicationColumns();
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS job_link text NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS generated_at timestamptz
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS rejected_at timestamptz
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS reject_comment text NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`
    UPDATE applications
    SET generated_at = COALESCE(generated_at, updated_at, created_at)
    WHERE resume_json IS NOT NULL
      AND generated_at IS NULL
  `);
  await pool.query(`
    ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check
  `);
  await pool.query(`
    ALTER TABLE applications
    ADD CONSTRAINT applications_status_check
    CHECK (status IN ('draft', 'applied', 'rejected'))
  `);
  await pool.query(`
    UPDATE applications
    SET status = 'applied',
        applied_at = COALESCE(applied_at, created_at),
        updated_at = COALESCE(updated_at, created_at)
    WHERE status IS NULL
  `);
  await pool.query(`
    UPDATE applications
    SET status = 'draft'
    WHERE status IS NULL
  `);
  await pool.query(`
    ALTER TABLE applications
    ALTER COLUMN status SET DEFAULT 'draft'
  `);
  await pool.query(`
    UPDATE applications SET updated_at = created_at WHERE updated_at IS NULL
  `);
  await pool.query(`
    ALTER TABLE applications
    ALTER COLUMN updated_at SET DEFAULT NOW()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE,
      body text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    )
  `);

  const { seedResumeProfiles } = await import("@/lib/profiles/seed");
  await seedResumeProfiles(pool);
  const { seedEmailTemplates } = await import("@/lib/email-templates/seed");
  await seedEmailTemplates(pool);
}

export async function withDb<T>(fn: (client: PoolClient) => Promise<T>) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
