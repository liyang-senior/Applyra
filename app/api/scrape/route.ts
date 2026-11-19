import { NextResponse } from "next/server";
import { userCanAccessProfile } from "@/lib/profiles";
import { isJobPlatform } from "@/lib/scrape/platforms";
import {
  jobrightIdFromLink,
  markJobrightApplied,
  parseJobrightAuth,
  parseJobrightFilters,
  recommendJobright,
  resolveJobrightSession,
  searchJobright,
  verifyJobrightLogin,
} from "@/lib/scrape/jobright";
import {
  deleteAllScrapedJobs,
  deleteScrapedJobs,
  deleteScrapedJobsForProfiles,
  listScrapedJobs,
  listScrapedJobsByIds,
  saveScrapedJobs,
  verifyScrapedJobs,
} from "@/lib/scrape/store";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { canManageAccounts } from "@/lib/server/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const url = new URL(request.url);
  const profileId = (url.searchParams.get("profileId") || "").trim();
  const platform = url.searchParams.get("platform") || "";
  if (!profileId) return jsonError("Select a profile.", 400);
  if (platform && !isJobPlatform(platform)) {
    return jsonError("Unknown platform.", 400);
  }
  if (!(await userCanAccessProfile(user, profileId))) {
    return jsonError("Profile not found.", 404);
  }

  const { jobs } = await listScrapedJobs(user.id, [profileId], platform, {
    allUsers: true,
  });
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: {
    profileId?: string;
    platform?: string;
    mode?: string;
    filters?: unknown;
    auth?: unknown;
    ids?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (body.mode === "login") {
    try {
      await verifyJobrightLogin(parseJobrightAuth(body.auth));
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Jobright sign-in failed. Try again.";
      const status =
        message.startsWith("Enter") ||
        message.startsWith("Paste") ||
        message.startsWith("Jobright email") ||
        message.startsWith("Jobright rejected")
          ? 400
          : 502;
      return jsonError(message, status);
    }
  }

  if (body.mode === "applied") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return jsonError("Select at least one link.", 400);
    try {
      const sessionId = await resolveJobrightSession(parseJobrightAuth(body.auth));
      const rows = await listScrapedJobsByIds(user.id, ids, {
        allUsers: canManageAccounts(user.role),
      });
      if (rows.length === 0) return jsonError("Job links not found.", 404);
      const removedIds: string[] = [];
      let missing = 0;
      let failed = 0;
      for (const row of rows) {
        const jobId = row.jobrightJobId || jobrightIdFromLink(row.jobLink);
        if (!jobId) {
          missing += 1;
          continue;
        }
        try {
          await markJobrightApplied(sessionId, jobId);
          removedIds.push(row.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (
            message.startsWith("Jobright rejected") ||
            message.startsWith("Jobright email") ||
            message.startsWith("Enter") ||
            message.startsWith("Paste")
          ) {
            throw error;
          }
          failed += 1;
        }
      }
      if (removedIds.length > 0) {
        await deleteScrapedJobs(user.id, removedIds, {
          allUsers: canManageAccounts(user.role),
        });
      }
      return NextResponse.json({
        ok: true,
        applied: removedIds.length,
        missing,
        failed,
        removedIds,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Jobright could not mark those jobs applied.";
      const status =
        message.startsWith("Enter") ||
        message.startsWith("Paste") ||
        message.startsWith("Jobright email") ||
        message.startsWith("Jobright rejected")
          ? 400
          : 502;
      return jsonError(message, status);
    }
  }

  const profileId = String(body.profileId || "");
  const platform = String(body.platform || "");
  if (!profileId) return jsonError("Select a profile.", 400);
  if (!isJobPlatform(platform)) {
    return jsonError("Select a job platform.", 400);
  }
  if (!(await userCanAccessProfile(user, profileId))) {
    return jsonError("Profile not found.", 404);
  }

  try {
    const recommended = body.mode === "recommended";
    const filters = parseJobrightFilters(body.filters, {
      requireKeywords: !recommended,
    });
    const auth = parseJobrightAuth(body.auth);
    const foundJobs = recommended
      ? await recommendJobright(filters, auth, request.signal)
      : await searchJobright(filters, auth, request.signal);
    const saved = await saveScrapedJobs({
      userId: user.id,
      profileId,
      platform,
      jobs: foundJobs,
    });
    const listed = await listScrapedJobs(user.id, [profileId], platform, {
      allUsers: true,
    });
    return NextResponse.json({
      found: foundJobs.length,
      added: saved.added,
      skipped: saved.skipped,
      jobs: listed.jobs,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Jobright search failed. Try again.";
    const status =
      message.startsWith("Enter") ||
      message.startsWith("Paste") ||
      message.startsWith("Jobright email") ||
      message.startsWith("Jobright rejected")
        ? 400
        : 502;
    return jsonError(message, status);
  }
}

export async function PATCH(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: { ids?: string[]; verified?: boolean };
  try {
    body = (await request.json()) as { ids?: string[]; verified?: boolean };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (ids.length === 0) return jsonError("Select at least one link.", 400);
  if (typeof body.verified !== "boolean") {
    return jsonError("Choose whether the links are verified.", 400);
  }
  const updated = await verifyScrapedJobs(user.id, ids, body.verified, {
    allUsers: canManageAccounts(user.role),
  });
  if (updated === 0) return jsonError("Job links not found.", 404);
  return NextResponse.json({ ok: true, updated, verified: body.verified });
}

export async function DELETE(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: { ids?: string[]; all?: boolean; profileIds?: string[] };
  try {
    body = (await request.json()) as {
      ids?: string[];
      all?: boolean;
      profileIds?: string[];
    };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (body.all === true) {
    const profileIds = Array.isArray(body.profileIds)
      ? body.profileIds.map(String)
      : [];
    if (!canManageAccounts(user.role)) {
      for (const profileId of profileIds) {
        if (!(await userCanAccessProfile(user, profileId))) {
          return jsonError("Profile not found.", 404);
        }
      }
    }
    const deleted =
      profileIds.length > 0
        ? await deleteScrapedJobsForProfiles(profileIds)
        : canManageAccounts(user.role)
          ? 0
          : await deleteAllScrapedJobs(user.id);
    return NextResponse.json({ ok: true, deleted });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (ids.length === 0) return jsonError("Select at least one link.", 400);
  const deleted = await deleteScrapedJobs(user.id, ids, {
    allUsers: canManageAccounts(user.role),
  });
  if (deleted === 0) return jsonError("Job links not found.", 404);
  return NextResponse.json({ ok: true, deleted });
}
