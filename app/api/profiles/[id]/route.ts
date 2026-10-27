import { NextResponse } from "next/server";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import {
  deleteResumeProfile,
  getResumeProfile,
  updateResumeProfile,
  userCanAccessProfile,
} from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  const { id } = await params;

  if (!(await userCanAccessProfile(user, id))) {
    return jsonError("Profile not found.", 404);
  }

  const profile = await getResumeProfile(id);
  if (!profile) return jsonError("Profile not found.", 404);
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  if (!canManageAccounts(user.role)) {
    return jsonError("Only admins can update profiles.", 403);
  }

  const { id } = await params;
  let body: { data?: unknown };
  try {
    body = (await request.json()) as { data?: unknown };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await updateResumeProfile(id, body.data);
  if (!result.ok) {
    return jsonError(result.error, result.error === "Profile not found." ? 404 : 400);
  }
  return NextResponse.json({ profile: result.profile });
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  if (!canManageAccounts(user.role)) {
    return jsonError("Only admins can remove profiles.", 403);
  }

  const { id } = await params;
  const removed = await deleteResumeProfile(id);
  if (!removed) return jsonError("Profile not found.", 404);
  return NextResponse.json({ ok: true });
}
