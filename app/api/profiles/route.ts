import { NextResponse } from "next/server";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import {
  createResumeProfile,
  listAllProfileInfo,
  listAssignedProfileInfo,
  listProfilesForUser,
  listResumeProfiles,
} from "@/lib/profiles";
import { canManageAccounts, isOwner } from "@/lib/server/types";

const ASSIGNEE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assigneeIdsFrom(url: URL) {
  return [
    ...new Set(
      url.searchParams
        .getAll("assigneeId")
        .map((id) => id.trim())
        .filter((id) => ASSIGNEE_ID.test(id)),
    ),
  ];
}

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const url = new URL(request.url);
  const owner = isOwner(user.role);
  const assigneeIds = owner ? assigneeIdsFrom(url) : [];
  if (url.searchParams.get("view") === "info") {
    const profiles = canManageAccounts(user.role)
      ? await listAllProfileInfo(owner ? assigneeIds : [])
      : await listAssignedProfileInfo(user.id);
    return NextResponse.json({ profiles });
  }
  if (canManageAccounts(user.role)) {
    const profiles = await listResumeProfiles({
      userName: url.searchParams.get("userName") || undefined,
      userEmail: url.searchParams.get("userEmail") || undefined,
      gender: url.searchParams.get("gender") || undefined,
      techStack: url.searchParams.get("techStack") || undefined,
      assigneeIds,
    });
    return NextResponse.json({ profiles });
  }

  const profiles = await listProfilesForUser(user.id);
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  if (!canManageAccounts(user.role)) {
    return jsonError("Only admins can add profiles.", 403);
  }

  let body: { data?: unknown; assigneeIds?: string[] };
  try {
    body = (await request.json()) as { data?: unknown; assigneeIds?: string[] };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await createResumeProfile(
    body.data,
    Array.isArray(body.assigneeIds) ? body.assigneeIds.map(String) : [],
  );
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ profile: result.profile }, { status: 201 });
}
