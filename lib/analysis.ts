import { withDb } from "@/lib/server/db";
import type { Account } from "@/lib/server/types";
import { canManageAccounts } from "@/lib/server/types";

export type AnalysisPoint = {
  date: string;
  generated: number;
  applied: number;
};

export type AnalysisSummary = {
  generated: number;
  applied: number;
  clearance: number;
  points: AnalysisPoint[];
};

export type TeamAnalysisUser = {
  userId: string;
  userName: string;
  userEmail: string;
  generated: number;
  applied: number;
  clearance: number;
};

export type TeamAnalysisSummary = {
  generated: number;
  applied: number;
  clearance: number;
  users: TeamAnalysisUser[];
};

function toDayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor <= end) {
    days.push(toDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function parseRange(fromRaw: string, toRaw: string) {
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid date range.");
  }
  if (from > to) throw new Error("Start date must be before end date.");
  const fromIso = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const toExclusive = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1),
  );
  return { fromIso, toExclusive };
}

/**
 * Daily totals graph.
 * - Normal users: always their own applications.
 * - Admins: optional userIds (empty = all users).
 */
export async function getAnalysisFor(
  viewer: Account,
  input: {
    from: string;
    to: string;
    userIds?: string[] | null;
  },
): Promise<AnalysisSummary> {
  const { fromIso, toExclusive } = parseRange(input.from, input.to);
  const isAdmin = canManageAccounts(viewer.role);
  const selectedIds = isAdmin
    ? [...new Set((input.userIds || []).map(String).filter(Boolean))]
    : [viewer.id];

  return withDb(async (client) => {
    const params: unknown[] = [fromIso, toExclusive];
    const clauses = [`a.created_at >= $1`, `a.created_at < $2`];

    if (!isAdmin) {
      params.push(viewer.id);
      clauses.push(`a.user_id = $${params.length}`);
    } else if (selectedIds.length > 0) {
      params.push(selectedIds);
      clauses.push(`a.user_id = ANY($${params.length}::uuid[])`);
    }

    const where = clauses.join(" AND ");
    const result = await client.query<{
      created_at: Date;
      applied_at: Date | null;
      requires_clearance: boolean | null;
      status: string;
    }>(
      `SELECT a.created_at, a.applied_at, a.requires_clearance, a.status
       FROM applications a
       WHERE ${where}`,
      params,
    );

    const dayKeys = eachDay(fromIso, new Date(toExclusive.getTime() - 1));
    const map = new Map<string, AnalysisPoint>(
      dayKeys.map((date) => [date, { date, generated: 0, applied: 0 }]),
    );

    let generated = 0;
    let applied = 0;
    let clearance = 0;

    for (const row of result.rows) {
      generated += 1;
      if (row.requires_clearance) clearance += 1;
      const createdKey = toDayKey(new Date(row.created_at));
      const createdPoint = map.get(createdKey);
      if (createdPoint) createdPoint.generated += 1;

      if (row.applied_at) {
        const appliedDate = new Date(row.applied_at);
        if (appliedDate >= fromIso && appliedDate < toExclusive) {
          applied += 1;
          const appliedKey = toDayKey(appliedDate);
          const appliedPoint = map.get(appliedKey);
          if (appliedPoint) appliedPoint.applied += 1;
        }
      }
    }

    const appliedParams: unknown[] = [fromIso, toExclusive];
    const appliedClauses = [
      `a.applied_at IS NOT NULL`,
      `a.applied_at >= $1`,
      `a.applied_at < $2`,
      `(a.created_at < $1 OR a.created_at >= $2)`,
    ];
    if (!isAdmin) {
      appliedParams.push(viewer.id);
      appliedClauses.push(`a.user_id = $${appliedParams.length}`);
    } else if (selectedIds.length > 0) {
      appliedParams.push(selectedIds);
      appliedClauses.push(
        `a.user_id = ANY($${appliedParams.length}::uuid[])`,
      );
    }

    const appliedResult = await client.query<{ applied_at: Date }>(
      `SELECT a.applied_at
       FROM applications a
       WHERE ${appliedClauses.join(" AND ")}`,
      appliedParams,
    );

    for (const row of appliedResult.rows) {
      applied += 1;
      const key = toDayKey(new Date(row.applied_at));
      const point = map.get(key);
      if (point) point.applied += 1;
    }

    return {
      generated,
      applied,
      clearance,
      points: dayKeys.map((date) => map.get(date)!),
    };
  });
}

/** Per-user totals for a period (admins only). */
export async function getTeamAnalysisFor(
  viewer: Account,
  input: { from: string; to: string; userIds?: string[] | null },
): Promise<TeamAnalysisSummary> {
  if (!canManageAccounts(viewer.role)) {
    throw new Error("Only admins can view team analysis.");
  }

  const { fromIso, toExclusive } = parseRange(input.from, input.to);
  const selectedIds = [
    ...new Set((input.userIds || []).map(String).filter(Boolean)),
  ];

  return withDb(async (client) => {
    const userParams: unknown[] = [];
    let userWhere = "active = true";
    if (selectedIds.length > 0) {
      userParams.push(selectedIds);
      userWhere += ` AND id = ANY($1::uuid[])`;
    }

    const usersResult = await client.query<{
      id: string;
      name: string;
      email: string;
    }>(
      `SELECT id, name, email
       FROM users
       WHERE ${userWhere}
       ORDER BY name ASC, email ASC`,
      userParams,
    );

    const rangeParams: unknown[] = [fromIso, toExclusive];
    let userFilter = "";
    if (selectedIds.length > 0) {
      rangeParams.push(selectedIds);
      userFilter = ` AND a.user_id = ANY($${rangeParams.length}::uuid[])`;
    }

    const generatedResult = await client.query<{
      user_id: string;
      generated: string;
      clearance: string;
    }>(
      `SELECT
         a.user_id,
         COUNT(*)::text AS generated,
         COUNT(*) FILTER (WHERE a.requires_clearance)::text AS clearance
       FROM applications a
       WHERE a.created_at >= $1 AND a.created_at < $2${userFilter}
       GROUP BY a.user_id`,
      rangeParams,
    );

    const appliedResult = await client.query<{
      user_id: string;
      applied: string;
    }>(
      `SELECT a.user_id, COUNT(*)::text AS applied
       FROM applications a
       WHERE a.applied_at IS NOT NULL
         AND a.applied_at >= $1
         AND a.applied_at < $2${userFilter}
       GROUP BY a.user_id`,
      rangeParams,
    );

    const generatedMap = new Map(
      generatedResult.rows.map((row) => [
        row.user_id,
        {
          generated: Number(row.generated) || 0,
          clearance: Number(row.clearance) || 0,
        },
      ]),
    );
    const appliedMap = new Map(
      appliedResult.rows.map((row) => [
        row.user_id,
        Number(row.applied) || 0,
      ]),
    );

    const users: TeamAnalysisUser[] = usersResult.rows.map((account) => {
      const gen = generatedMap.get(account.id);
      return {
        userId: account.id,
        userName: account.name || "",
        userEmail: account.email,
        generated: gen?.generated || 0,
        applied: appliedMap.get(account.id) || 0,
        clearance: gen?.clearance || 0,
      };
    });

    users.sort((a, b) => {
      const aTotal = a.generated + a.applied;
      const bTotal = b.generated + b.applied;
      if (bTotal !== aTotal) return bTotal - aTotal;
      return (a.userName || a.userEmail).localeCompare(
        b.userName || b.userEmail,
      );
    });

    return {
      generated: users.reduce((sum, row) => sum + row.generated, 0),
      applied: users.reduce((sum, row) => sum + row.applied, 0),
      clearance: users.reduce((sum, row) => sum + row.clearance, 0),
      users,
    };
  });
}
