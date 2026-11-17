import { randomUUID } from "crypto";
import { isLinkedInJobLink, jobDedupeKey } from "@/lib/scrape/dedupe";
import type { ScrapedJobDraft } from "@/lib/scrape/jobright";
import { withDb } from "@/lib/server/db";

export type SavedJobLink = {
  id: string;
  jobTitle: string;
  companyName: string;
  jobLink: string;
  profileId: string;
  profileName: string;
  verified: boolean;
  createdAt: string;
  matchScore: number | null;
  postedAt: string | null;
};

type JobRow = {
  id: string;
  job_title: string;
  company_name: string;
  job_link: string;
  profile_id: string;
  profile_name: string;
  verified: boolean;
  created_at: Date | string;
  match_score: number | null;
  posted_at: Date | string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jobIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => UUID.test(id)))];
}

function toJob(row: JobRow): SavedJobLink {
  return {
    id: row.id,
    jobTitle: row.job_title,
    companyName: row.company_name,
    jobLink: row.job_link,
    profileId: row.profile_id,
    profileName: row.profile_name || "",
    verified: row.verified,
    createdAt: new Date(row.created_at).toISOString(),
    matchScore: row.match_score == null ? null : Number(row.match_score),
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
  };
}

const JOB_SELECT = `
  SELECT j.id, j.job_title, j.company_name, j.job_link, j.profile_id,
         COALESCE(p.data->>'name', '') AS profile_name,
         j.verified, j.created_at, j.match_score, j.posted_at
  FROM scraped_jobs j
  JOIN resume_profiles p ON p.id = j.profile_id
`;

const SHARED_PROFILE_FILTER = `
  AND NOT EXISTS (
    SELECT 1
    FROM scraped_jobs other
    WHERE other.user_id = j.user_id
      AND other.dedupe_key = j.dedupe_key
      AND other.profile_id <> j.profile_id
  )
`;

export async function listScrapedJobs(
  userId: string,
  profileId: string,
  platform: string,
) {
  return withDb(async (client) => {
    const params = [userId, profileId, platform];
    const visible = `
      WHERE j.user_id = $1 AND j.profile_id = $2 AND j.platform = $3
        AND j.job_link !~* '(^|://|\\.)linkedin\\.com([/:?#]|$)'
        AND j.job_link !~* '(^|://|\\.)lnkd\\.in([/:?#]|$)'
    `;
    const result = await client.query<JobRow>(
      `${JOB_SELECT}
       ${visible}
       ${SHARED_PROFILE_FILTER}
       ORDER BY j.verified ASC, j.created_at DESC`,
      params,
    );
    const held = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM scraped_jobs j
       ${visible}
         AND EXISTS (
           SELECT 1
           FROM scraped_jobs other
           WHERE other.user_id = j.user_id
             AND other.dedupe_key = j.dedupe_key
             AND other.profile_id <> j.profile_id
         )`,
      params,
    );
    return {
      jobs: result.rows.map(toJob),
      held: Number(held.rows[0]?.count || 0),
    };
  });
}

export async function saveScrapedJobs({
  userId,
  profileId,
  platform,
  jobs,
}: {
  userId: string;
  profileId: string;
  platform: string;
  jobs: ScrapedJobDraft[];
}) {
  return withDb(async (client) => {
    let added = 0;
    let skipped = 0;
    for (const job of jobs) {
      if (isLinkedInJobLink(job.jobLink)) {
        skipped += 1;
        continue;
      }
      const result = await client.query<{ inserted: boolean }>(
        `INSERT INTO scraped_jobs (
           id, user_id, profile_id, platform, job_title, company_name,
           job_link, dedupe_key, verified, created_at, match_score, posted_at,
           source
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8,
           EXISTS (
             SELECT 1
             FROM scraped_jobs existing
             WHERE existing.user_id = $2
               AND existing.verified = true
               AND existing.dedupe_key = $9
           ),
           NOW(),
           $10,
           $11,
           $12
         ON CONFLICT (user_id, profile_id, dedupe_key) DO UPDATE
         SET match_score = COALESCE(EXCLUDED.match_score, scraped_jobs.match_score),
             posted_at = COALESCE(EXCLUDED.posted_at, scraped_jobs.posted_at),
             source = COALESCE(NULLIF(scraped_jobs.source, ''), EXCLUDED.source)
         RETURNING (xmax = 0) AS inserted`,
        [
          randomUUID(),
          userId,
          profileId,
          platform,
          job.jobTitle,
          job.companyName,
          job.jobLink,
          job.dedupeKey,
          jobDedupeKey(job.jobTitle, job.companyName),
          job.matchScore,
          job.postedAt,
          platform,
        ],
      );
      if (result.rows[0]?.inserted) added += 1;
      else skipped += 1;
    }
    return { added, skipped };
  });
}

export async function deleteAllScrapedJobs(userId: string) {
  return withDb(async (client) => {
    const result = await client.query(
      `DELETE FROM scraped_jobs WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount || 0;
  });
}

export async function deleteScrapedJobs(userId: string, ids: string[]) {
  const clean = jobIds(ids);
  if (clean.length === 0) return 0;
  return withDb(async (client) => {
    const result = await client.query(
      `DELETE FROM scraped_jobs
       WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, clean],
    );
    return result.rowCount || 0;
  });
}

export async function verifyScrapedJobs(
  userId: string,
  ids: string[],
  verified: boolean,
) {
  const clean = jobIds(ids);
  if (clean.length === 0) return 0;
  return withDb(async (client) => {
    const result = await client.query(
      `UPDATE scraped_jobs AS target
       SET verified = $3
       WHERE target.user_id = $1
         AND EXISTS (
           SELECT 1
           FROM scraped_jobs AS source
           WHERE source.user_id = target.user_id
             AND source.id = ANY($2::uuid[])
             AND source.dedupe_key = target.dedupe_key
         )`,
      [userId, clean, verified],
    );
    return result.rowCount || 0;
  });
}
