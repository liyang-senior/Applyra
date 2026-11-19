import { randomUUID } from "crypto";
import { isLinkedInJobLink, jobDedupeKey } from "@/lib/scrape/dedupe";
import { jobrightIdFromLink, type ScrapedJobDraft } from "@/lib/scrape/jobright";
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
  jobrightJobId: string;
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
  external_job_id: string | null;
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
    jobrightJobId: row.external_job_id || jobrightIdFromLink(row.job_link),
  };
}

export async function listScrapedJobs(
  userId: string,
  profileIds: string[],
  platform = "",
  options: { allUsers?: boolean } = {},
) {
  const ids = jobIds(profileIds);
  if (ids.length === 0) return { jobs: [] as SavedJobLink[] };
  return withDb(async (client) => {
    const params: unknown[] = [ids];
    let userClause = "";
    if (!options.allUsers) {
      params.push(userId);
      userClause = `AND j.user_id = $${params.length}`;
    }
    let platformClause = "";
    if (platform) {
      params.push(platform);
      platformClause = `AND j.platform = $${params.length}`;
    }
    const result = await client.query<JobRow>(
      `SELECT id, job_title, company_name, job_link, profile_id, profile_name,
              verified, created_at, match_score, posted_at, external_job_id
       FROM (
         SELECT DISTINCT ON (COALESCE(NULLIF(j.dedupe_key, ''), j.id::text))
           j.id, j.job_title, j.company_name, j.job_link,
           (
             SELECT pid
             FROM unnest(j.profile_ids) AS ids(pid)
             WHERE pid = ANY($1::uuid[])
             LIMIT 1
           ) AS profile_id,
           COALESCE(p.data->>'name', '') AS profile_name,
           j.verified, j.created_at, j.match_score, j.posted_at, j.external_job_id
         FROM scraped_jobs j
         JOIN resume_profiles p ON p.id = (
           SELECT pid
           FROM unnest(j.profile_ids) AS ids(pid)
           WHERE pid = ANY($1::uuid[])
           LIMIT 1
         )
         WHERE j.profile_ids && $1::uuid[]
           ${userClause}
           ${platformClause}
           AND j.job_link !~* '(^|://|\\.)linkedin\\.com([/:?#]|$)'
           AND j.job_link !~* '(^|://|\\.)lnkd\\.in([/:?#]|$)'
         ORDER BY COALESCE(NULLIF(j.dedupe_key, ''), j.id::text),
                  j.verified DESC,
                  j.created_at DESC
       ) jobs
       ORDER BY verified ASC, created_at DESC`,
      params,
    );
    const allowed = new Set(ids);
    return {
      jobs: result.rows
        .map(toJob)
        .filter((job) => allowed.has(job.profileId)),
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
           id, user_id, profile_ids, platform, job_title, company_name,
           job_link, dedupe_key, verified, created_at, match_score, posted_at,
           source, external_job_id
         )
         SELECT $1, $2, ARRAY[$3::uuid], $4, $5, $6, $7, $8,
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
           $12,
           $13
         ON CONFLICT (user_id, dedupe_key) DO UPDATE
         SET profile_ids = (
               SELECT ARRAY(
                 SELECT DISTINCT pid
                 FROM unnest(scraped_jobs.profile_ids || EXCLUDED.profile_ids) AS ids(pid)
               )
             ),
             match_score = COALESCE(EXCLUDED.match_score, scraped_jobs.match_score),
             posted_at = COALESCE(EXCLUDED.posted_at, scraped_jobs.posted_at),
             source = COALESCE(NULLIF(scraped_jobs.source, ''), EXCLUDED.source),
             external_job_id = COALESCE(
               NULLIF(EXCLUDED.external_job_id, ''),
               scraped_jobs.external_job_id
             )
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
          job.jobrightJobId || jobrightIdFromLink(job.jobLink),
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

export async function deleteScrapedJobsForProfiles(profileIds: string[]) {
  const clean = jobIds(profileIds);
  if (clean.length === 0) return 0;
  return withDb(async (client) => {
    const removed = await client.query(
      `DELETE FROM scraped_jobs
       WHERE profile_ids && $1::uuid[]
         AND NOT EXISTS (
           SELECT 1
           FROM unnest(profile_ids) AS ids(pid)
           WHERE NOT (pid = ANY($1::uuid[]))
         )`,
      [clean],
    );
    await client.query(
      `UPDATE scraped_jobs
       SET profile_ids = ARRAY(
         SELECT pid
         FROM unnest(profile_ids) AS ids(pid)
         WHERE NOT (pid = ANY($1::uuid[]))
       )
       WHERE profile_ids && $1::uuid[]`,
      [clean],
    );
    return removed.rowCount || 0;
  });
}

export async function listScrapedJobsByIds(
  userId: string,
  ids: string[],
  options: { allUsers?: boolean } = {},
) {
  const clean = jobIds(ids);
  if (clean.length === 0) return [] as SavedJobLink[];
  return withDb(async (client) => {
    const result = options.allUsers
      ? await client.query<JobRow>(
          `SELECT j.id, j.job_title, j.company_name, j.job_link,
                  j.profile_ids[1] AS profile_id,
                  COALESCE(p.data->>'name', '') AS profile_name,
                  j.verified, j.created_at, j.match_score, j.posted_at, j.external_job_id
           FROM scraped_jobs j
           LEFT JOIN resume_profiles p ON p.id = j.profile_ids[1]
           WHERE j.id = ANY($1::uuid[])`,
          [clean],
        )
      : await client.query<JobRow>(
          `SELECT j.id, j.job_title, j.company_name, j.job_link,
                  j.profile_ids[1] AS profile_id,
                  COALESCE(p.data->>'name', '') AS profile_name,
                  j.verified, j.created_at, j.match_score, j.posted_at, j.external_job_id
           FROM scraped_jobs j
           LEFT JOIN resume_profiles p ON p.id = j.profile_ids[1]
           WHERE j.id = ANY($2::uuid[])
             AND EXISTS (
               SELECT 1 FROM resume_profile_assignees assignee
               WHERE assignee.profile_id = ANY(j.profile_ids)
                 AND assignee.user_id = $1
             )`,
          [userId, clean],
        );
    return result.rows.map(toJob);
  });
}

export async function deleteScrapedJobs(
  userId: string,
  ids: string[],
  options: { allUsers?: boolean } = {},
) {
  const clean = jobIds(ids);
  if (clean.length === 0) return 0;
  return withDb(async (client) => {
    const result = options.allUsers
      ? await client.query(
          `DELETE FROM scraped_jobs WHERE id = ANY($1::uuid[])`,
          [clean],
        )
      : await client.query(
          `DELETE FROM scraped_jobs AS target
           WHERE target.id = ANY($2::uuid[])
             AND EXISTS (
               SELECT 1 FROM resume_profile_assignees assignee
               WHERE assignee.profile_id = ANY(target.profile_ids)
                 AND assignee.user_id = $1
             )`,
          [userId, clean],
        );
    return result.rowCount || 0;
  });
}

export async function verifyScrapedJobs(
  userId: string,
  ids: string[],
  verified: boolean,
  options: { allUsers?: boolean } = {},
) {
  const clean = jobIds(ids);
  if (clean.length === 0) return 0;
  return withDb(async (client) => {
    const result = options.allUsers
      ? await client.query(
          `UPDATE scraped_jobs AS target
           SET verified = $2
           WHERE EXISTS (
             SELECT 1
             FROM scraped_jobs AS source
             WHERE source.id = ANY($1::uuid[])
               AND source.dedupe_key = target.dedupe_key
           )`,
          [clean, verified],
        )
      : await client.query(
          `UPDATE scraped_jobs AS target
           SET verified = $3
           WHERE EXISTS (
               SELECT 1 FROM resume_profile_assignees assignee
               WHERE assignee.profile_id = ANY(target.profile_ids)
                 AND assignee.user_id = $1
             )
             AND EXISTS (
               SELECT 1
               FROM scraped_jobs AS source
               WHERE source.id = ANY($2::uuid[])
                 AND source.dedupe_key = target.dedupe_key
                 AND EXISTS (
                   SELECT 1 FROM resume_profile_assignees assignee
                   WHERE assignee.profile_id = ANY(source.profile_ids)
                     AND assignee.user_id = $1
                 )
             )`,
          [userId, clean, verified],
        );
    return result.rowCount || 0;
  });
}
