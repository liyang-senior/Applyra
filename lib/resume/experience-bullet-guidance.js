/**
 * Shared experience / skills guidance aligned with prompts/default.txt.
 * First 3 roles richer; last role capped 5–7 (merge if needed).
 * Per role: mix 3-line / 2-line / 1-line; at most 3 one-line; prefer 3–5 three-line.
 */

export const EXPERIENCE_BULLET_RULES = {
  /** First 3 roles get more bullets than older ones. */
  recentRolesMin: 6,
  recentRolesMax: 8,
  recentRolesCount: 3,
  /** Middle/older roles (not last). */
  olderRolesMin: 4,
  olderRolesMax: 6,
  /** Last role (oldest employment entry) — hard cap; merge to fit. */
  lastRoleMin: 5,
  lastRoleMax: 7,
  /** 1-line bullets — max 3 per role. */
  shortBulletMinWords: 12,
  shortBulletMaxWords: 18,
  shortBulletsPerRoleMax: 3,
  /** 2-line bullets — remainder. */
  mediumBulletMinWords: 22,
  mediumBulletMaxWords: 32,
  /** 3-line bullets — 3–5 required per role. */
  longBulletMinWords: 35,
  longBulletMaxWords: 48,
  longBulletsPerRoleMin: 3,
  longBulletsPerRoleMax: 5,
  summaryMinWords: 70,
  summaryMaxWords: 95,
};

const R = EXPERIENCE_BULLET_RULES;

/** True when index is the last employment role (oldest). */
export function isLastExperienceRole(index, totalRoles) {
  const n = Number(totalRoles) || 0;
  return n > 0 && index === n - 1;
}

/** Minimum `details.length` for role index (0-based). */
export function minBulletCountForRole(index, totalRoles = 0) {
  if (isLastExperienceRole(index, totalRoles)) return R.lastRoleMin;
  return index < R.recentRolesCount ? R.recentRolesMin : R.olderRolesMin;
}

/** Maximum `details.length` for role index (0-based). */
export function maxBulletCountForRole(index, totalRoles = 0) {
  if (isLastExperienceRole(index, totalRoles)) return R.lastRoleMax;
  return index < R.recentRolesCount ? R.recentRolesMax : R.olderRolesMax;
}

/**
 * Hard length-count targets for one role.
 * @returns {{ longMin: number, longMax: number, shortMax: number }}
 */
export function bulletLengthMixCounts() {
  return {
    longMin: R.longBulletsPerRoleMin,
    longMax: R.longBulletsPerRoleMax,
    shortMax: R.shortBulletsPerRoleMax,
  };
}

function roleDetailCount(role) {
  return Array.isArray(role?.details)
    ? role.details.map((d) => String(d ?? "").trim()).filter(Boolean).length
    : 0;
}

/**
 * Roles whose `details` arrays are below the mandatory floor.
 * @param {Array<{ details?: string[] }>} experience
 * @returns {{ index: number, have: number, need: number }[]}
 */
export function findUnderfilledExperienceRoles(experience) {
  const list = Array.isArray(experience) ? experience : [];
  const total = list.length;
  const gaps = [];
  for (let i = 0; i < total; i += 1) {
    const have = roleDetailCount(list[i]);
    const need = minBulletCountForRole(i, total);
    if (have < need) gaps.push({ index: i, have, need });
  }
  return gaps;
}

/**
 * Roles whose `details` exceed the max (esp. last role 5–7).
 * @param {Array<{ details?: string[] }>} experience
 * @returns {{ index: number, have: number, max: number }[]}
 */
export function findOverfilledExperienceRoles(experience) {
  const list = Array.isArray(experience) ? experience : [];
  const total = list.length;
  const excess = [];
  for (let i = 0; i < total; i += 1) {
    const have = roleDetailCount(list[i]);
    const max = maxBulletCountForRole(i, total);
    if (have > max) excess.push({ index: i, have, max });
  }
  return excess;
}

/**
 * Word-count length-mix violations per role.
 * @param {Array<{ details?: string[] }>} experience
 * @returns {{ index: number, long: number, short: number, issues: string[] }[]}
 */
export function findBulletLengthMixViolations(experience) {
  const list = Array.isArray(experience) ? experience : [];
  const violations = [];
  for (let i = 0; i < list.length; i += 1) {
    const details = Array.isArray(list[i]?.details)
      ? list[i].details.map((d) => String(d ?? "").trim()).filter(Boolean)
      : [];
    let long = 0;
    let short = 0;
    let medium = 0;
    let other = 0;
    for (const d of details) {
      const words = d.split(/\s+/).filter(Boolean).length;
      if (words >= R.longBulletMinWords && words <= R.longBulletMaxWords) long += 1;
      else if (words >= R.shortBulletMinWords && words <= R.shortBulletMaxWords) short += 1;
      else if (words >= R.mediumBulletMinWords && words <= R.mediumBulletMaxWords) medium += 1;
      else other += 1;
    }
    const issues = [];
    if (long < R.longBulletsPerRoleMin) {
      issues.push(
        `need ${R.longBulletsPerRoleMin}-${R.longBulletsPerRoleMax} bullets at ${R.longBulletMinWords}-${R.longBulletMaxWords} words (have ${long})`,
      );
    }
    if (long > R.longBulletsPerRoleMax) {
      issues.push(
        `at most ${R.longBulletsPerRoleMax} bullets at ${R.longBulletMinWords}-${R.longBulletMaxWords} words (have ${long})`,
      );
    }
    if (short > R.shortBulletsPerRoleMax) {
      issues.push(
        `at most ${R.shortBulletsPerRoleMax} bullets at ${R.shortBulletMinWords}-${R.shortBulletMaxWords} words (have ${short})`,
      );
    }
    if (other > 0) {
      issues.push(
        `${other} bullet(s) outside 12-18 / 22-32 / 35-48 word bands — rewrite or MERGE into those bands`,
      );
    }
    // medium is the remainder — only flag if we have shorts that should have been merged
    // and we somehow have zero medium+long when we should — covered by long/short checks
    void medium;
    if (issues.length > 0) violations.push({ index: i, long, short, issues });
  }
  return violations;
}

const SHAPE =
  `Counts: first3 ${R.recentRolesMin}-${R.recentRolesMax}; middle ${R.olderRolesMin}-${R.olderRolesMax}; last ${R.lastRoleMin}-${R.lastRoleMax}. ` +
  `Mix: ${R.longBulletsPerRoleMin}-${R.longBulletsPerRoleMax}×${R.longBulletMinWords}-${R.longBulletMaxWords}w; ` +
  `≤${R.shortBulletsPerRoleMax}×${R.shortBulletMinWords}-${R.shortBulletMaxWords}w; rest ${R.mediumBulletMinWords}-${R.mediumBulletMaxWords}w. ` +
  `JD tools in Skills + bullets when possible. Summary ${R.summaryMinWords}-${R.summaryMaxWords}w. JSON only.`;

export const EXPERIENCE_BULLET_GUIDANCE_WITH_BASE =
  `Keep JD-fit base facts; ignore clashes; add JD coverage. ${SHAPE}`;

export const EXPERIENCE_BULLET_GUIDANCE_NO_BASE =
  `No base bullets — generate from titles/dates/JD. ${SHAPE}`;
