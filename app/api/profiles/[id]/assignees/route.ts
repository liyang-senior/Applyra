import { NextResponse } from "next/server";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { assignResumeProfile, getResumeProfile } from "@/lib/profiles";
import { canManageAccounts } from "@/lib/server/types";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  if (!canManageAccounts(user.role)) {
    return jsonError("Only admins can assign profiles.", 403);
  }

  const { id } = await params;
  let body: { assigneeIds?: string[] };
  try {
    body = (await request.json()) as { assigneeIds?: string[] };
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await assignResumeProfile(
    id,
    Array.isArray(body.assigneeIds) ? body.assigneeIds.map(String) : [],
  );
  if (!result.ok) return jsonError(result.error, 404);

  const profile = await getResumeProfile(id);
  return NextResponse.json({ profile });
}
