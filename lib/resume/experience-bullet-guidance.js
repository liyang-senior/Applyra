/**
 * Shared experience / skills guidance aligned with prompts/default.txt.
 * These floors are MANDATORY for generation — the model must fill to them.
 */

export const EXPERIENCE_BULLET_RULES = {
  /** Most recent 2 roles: 8-12 bullets each. */
  recentRolesMin: 8,
  recentRolesMax: 12,
  secondRecentRolesMax: 12,
  recentRolesCount: 2,
  /** Older roles: at least 5, up to 8 by tenure. */
  olderRolesMin: 5,
  olderRolesMax: 8,
  /** ~1 printed line ≈ this many words (PDF ~90–100 chars/line). */
  shortBulletMinWords: 12,
  shortBulletMaxWords: 20,
  /** At most 1-2 one-line bullets per role; the rest are 2- or 3-line. */
  shortBulletsPerRoleMax: 2,
  /** ~2 printed lines ≈ this many words. */
  mediumBulletMinWords: 22,
  mediumBulletMaxWords: 32,
  /** ~3 printed lines ≈ this many words. */
  longBulletMinWords: 36,
  longBulletMaxWords: 48,
  /** Every role: at least this many ~3-line bullets. */
  longBulletsPerRoleMin: 3,
  /** Each of the 2 most recent roles: at least this many ~3-line bullets. */
  longBulletsRecentMin: 5,
  /** Summary word band. */
  summaryMinWords: 90,
  summaryMaxWords: 120,
};

const R = EXPERIENCE_BULLET_RULES;

/** Minimum `details.length` the model must return for role index (0-based). */
export function minBulletCountForRole(index) {
  return index < R.recentRolesCount ? R.recentRolesMin : R.olderRolesMin;
}

/**
 * Roles whose `details` arrays are below the mandatory floor.
 * @param {Array<{ details?: string[] }>} experience
 * @returns {{ index: number, have: number, need: number }[]}
 */
export function findUnderfilledExperienceRoles(experience) {
  const list = Array.isArray(experience) ? experience : [];
  const gaps = [];
  for (let i = 0; i < list.length; i += 1) {
    const have = Array.isArray(list[i]?.details)
      ? list[i].details.map((d) => String(d ?? "").trim()).filter(Boolean).length
      : 0;
    const need = minBulletCountForRole(i);
    if (have < need) gaps.push({ index: i, have, need });
  }
  return gaps;
}

const SHAPE =
  `Roles 1-2: ${R.recentRolesMin}-${R.recentRolesMax} bullets each with >=${R.longBulletsRecentMin} three-line (${R.longBulletMinWords}-${R.longBulletMaxWords} words). ` +
  `Every older role: ${R.olderRolesMin}-${R.olderRolesMax} bullets with >=${R.longBulletsPerRoleMin} three-line. ` +
  `Every role: at most ${R.shortBulletsPerRoleMax} one-line (${R.shortBulletMinWords}-${R.shortBulletMaxWords} words); most remaining bullets medium (${R.mediumBulletMinWords}-${R.mediumBulletMaxWords}) or three-line. ` +
  `Most bullets must be hands-on (ACTION+TECH+IMPLEMENTATION+PURPOSE). Fill by generating. ` +
  `100% JD skills+related skills in skills; every JD skill has related experience. Summary ${R.summaryMinWords}-${R.summaryMaxWords} words.`;

/** Injected as {{experienceBulletGuidance}} when the profile has permanent base content. */
export const EXPERIENCE_BULLET_GUIDANCE_WITH_BASE =
  `Preserve every meaningful base_bullets fact and classified base_skills technology. ADD JD coverage. ${SHAPE}`;

/** Injected when the profile has no permanent base_skills / base_bullets. */
export const EXPERIENCE_BULLET_GUIDANCE_NO_BASE =
  `No base_bullets/base_skills supplied — GENERATE complete hands-on experience from titles, dates, and JD. ${SHAPE}`;
