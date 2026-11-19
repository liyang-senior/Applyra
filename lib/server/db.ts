import { Pool, type PoolClient } from "pg";

const SCHEMA_VERSION = 17;

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
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS external_job_id text NOT NULL DEFAULT ''
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scraped_jobs (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_ids uuid[] NOT NULL DEFAULT '{}',
      platform text NOT NULL,
      job_title text NOT NULL,
      company_name text NOT NULL,
      job_link text NOT NULL,
      dedupe_key text NOT NULL,
      verified boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL,
      UNIQUE (user_id, dedupe_key)
    )
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS match_score smallint
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS posted_at timestamptz
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS source text
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS external_job_id text NOT NULL DEFAULT ''
  `);
  await pool.query(`
    UPDATE scraped_jobs
    SET source = COALESCE(NULLIF(source, ''), platform, 'jobright')
    WHERE source IS NULL OR source = ''
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ALTER COLUMN source SET DEFAULT 'jobright'
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ALTER COLUMN source SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE scraped_jobs
    ADD COLUMN IF NOT EXISTS profile_ids uuid[] NOT NULL DEFAULT '{}'
  `);
  await pool.query(`
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scraped_jobs'
          AND column_name = 'profile_id'
      ) THEN
        UPDATE scraped_jobs
        SET profile_ids = ARRAY(
          SELECT DISTINCT pid
          FROM unnest(COALESCE(profile_ids, '{}') || ARRAY[profile_id]) AS ids(pid)
          WHERE pid IS NOT NULL
        )
        WHERE profile_id IS NOT NULL;

        UPDATE scraped_jobs AS keep
        SET profile_ids = (
          SELECT ARRAY(
            SELECT DISTINCT pid
            FROM scraped_jobs AS row
            CROSS JOIN LATERAL unnest(row.profile_ids) AS ids(pid)
            WHERE row.user_id = keep.user_id
              AND row.dedupe_key = keep.dedupe_key
              AND pid IS NOT NULL
          )
        )
        WHERE keep.id IN (
          SELECT (array_agg(id ORDER BY created_at DESC))[1]
          FROM scraped_jobs
          GROUP BY user_id, dedupe_key
        );

        DELETE FROM scraped_jobs AS extra
        USING (
          SELECT user_id,
                 dedupe_key,
                 (array_agg(id ORDER BY created_at DESC))[1] AS keep_id
          FROM scraped_jobs
          GROUP BY user_id, dedupe_key
          HAVING count(*) > 1
        ) AS grouped
        WHERE extra.user_id = grouped.user_id
          AND extra.dedupe_key = grouped.dedupe_key
          AND extra.id <> grouped.keep_id;

        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
          WHERE con.conrelid = 'scraped_jobs'::regclass
            AND con.contype = 'f'
            AND att.attname = 'profile_id'
        LOOP
          EXECUTE format('ALTER TABLE scraped_jobs DROP CONSTRAINT %I', constraint_name);
        END LOOP;

        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          WHERE con.conrelid = 'scraped_jobs'::regclass
            AND con.contype = 'u'
            AND pg_get_constraintdef(con.oid) LIKE '%profile_id%'
        LOOP
          EXECUTE format('ALTER TABLE scraped_jobs DROP CONSTRAINT %I', constraint_name);
        END LOOP;

        DROP INDEX IF EXISTS scraped_jobs_lookup_idx;
        ALTER TABLE scraped_jobs DROP COLUMN profile_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'scraped_jobs'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) LIKE '%user_id%'
          AND pg_get_constraintdef(oid) LIKE '%dedupe_key%'
          AND pg_get_constraintdef(oid) NOT LIKE '%profile_id%'
      ) THEN
        ALTER TABLE scraped_jobs
          ADD CONSTRAINT scraped_jobs_user_dedupe_key
          UNIQUE (user_id, dedupe_key);
      END IF;
    END $$;
  `);
  await pool.query(`
    DROP INDEX IF EXISTS scraped_jobs_lookup_idx
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS scraped_jobs_lookup_idx
    ON scraped_jobs (user_id, platform, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS scraped_jobs_profile_ids_idx
    ON scraped_jobs USING GIN (profile_ids)
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION scraped_jobs_drop_profile()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      UPDATE scraped_jobs
      SET profile_ids = ARRAY(
        SELECT pid
        FROM unnest(profile_ids) AS ids(pid)
        WHERE pid <> OLD.id
      )
      WHERE profile_ids && ARRAY[OLD.id];
      DELETE FROM scraped_jobs
      WHERE cardinality(profile_ids) = 0;
      RETURN OLD;
    END;
    $fn$
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS scraped_jobs_drop_profile ON resume_profiles
  `);
  await pool.query(`
    CREATE TRIGGER scraped_jobs_drop_profile
    BEFORE DELETE ON resume_profiles
    FOR EACH ROW
    EXECUTE FUNCTION scraped_jobs_drop_profile()
  `);
  await pool.query(`
    DELETE FROM scraped_jobs
    WHERE job_link ~* '(^|://|\\.)linkedin\\.com([/:?#]|$)'
       OR job_link ~* '(^|://|\\.)lnkd\\.in([/:?#]|$)'
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
