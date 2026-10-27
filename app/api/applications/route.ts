import { NextResponse } from "next/server";
import { getRequestAccount } from "@/lib/server/auth";
import { analyzeJobDescription } from "@/lib/jd-checks";
import {
  deleteHistoryRecords,
  markHistoryApplied,
  listHistoryFor,
  rejectHistoryRecords,
} from "@/lib/history";
import { jsonError } from "@/lib/server/http";
import { userCanAccessProfile } from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (userId && !canManageAccounts(user.role)) {
    return jsonError("Only admins can filter by user.", 403);
  }

  const records = await listHistoryFor(user, userId);
  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: {
    companyName?: string;
    jobTitle?: string;
    jobDescription?: string;
    jobLink?: string;
    profileId?: string;
    historyId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const profileId = body.profileId ? String(body.profileId) : null;
  if (profileId && !(await userCanAccessProfile(user, profileId))) {
    return jsonError("Profile not found.", 404);
  }

  const jobDescription = String(body.jobDescription || "");
  const jobLink = String(body.jobLink || "").trim();
  if (!jobLink) return jsonError("Enter a job link.", 400);
  const jdCheck = analyzeJobDescription(jobDescription);

  const result = await markHistoryApplied({
    userId: user.id,
    historyId: body.historyId || null,
    profileId,
    companyName: String(body.companyName || ""),
    jobTitle: String(body.jobTitle || ""),
    jobDescription,
    jobLink,
    requiresClearance: jdCheck.requiresClearance,
    isRemote: jdCheck.isRemote,
  });
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({
    id: result.id,
    status: "applied",
    requiresClearance: jdCheck.requiresClearance,
    isRemote: jdCheck.isRemote,
    clearanceWarning: jdCheck.clearanceWarning,
    remoteWarning: jdCheck.remoteWarning,
  });
}

export async function PATCH(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: { action?: string; ids?: string[]; comment?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  if (body.action !== "reject") {
    return jsonError("Unsupported action.", 400);
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const result = await rejectHistoryRecords(
    user,
    ids,
    String(body.comment || ""),
  );
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ ok: true, rejected: result.rejected });
}

export async function DELETE(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: { ids?: string[] };
  try {
    body = (await request.json()) as { ids?: string[] };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const result = await deleteHistoryRecords(user, ids);
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ ok: true, deleted: result.deleted });
}
