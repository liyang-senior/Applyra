import {
  clearSession,
  endSession,
  getRequestAccount,
  tokenFromRequest,
} from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { canManageAccounts } from "@/lib/server/types";
import {
  deleteAccount,
  resetAccountPassword,
  updateAccount,
} from "@/lib/server/users";
import { NextResponse } from "next/server";

async function requireManager(request: Request) {
  const current = await getRequestAccount(request);
  if (!current) return { error: jsonError("Sign in to manage accounts.", 401) };
  if (!canManageAccounts(current.role)) {
    return { error: jsonError("An admin has to manage accounts.", 403) };
  }
  return { current };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager(request);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Choose an account change.", 400);
  }
  if (!body || typeof body !== "object") {
    return jsonError("Choose an account change.", 400);
  }

  const { id } = await context.params;
  const record = body as Record<string, unknown>;

  if (record.resetPassword === true) {
    const result = await resetAccountPassword(id, auth.current);
    if (!result.ok) return jsonError(result.error, 400);
    return NextResponse.json({
      account: result.account,
      resetPassword: true,
    });
  }

  const patch: { role?: "admin" | "user"; active?: boolean } = {};
  if (record.role === "admin" || record.role === "user") patch.role = record.role;
  else if (record.role !== undefined) {
    return jsonError("Choose admin or user.", 400);
  }
  if (typeof record.active === "boolean") patch.active = record.active;
  if (patch.role === undefined && patch.active === undefined) {
    return jsonError("Choose an account change.", 400);
  }

  if (patch.active === false && id === auth.current.id) {
    return jsonError("You can't deactivate your own account.", 400);
  }

  const result = await updateAccount(id, patch, auth.current);
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ account: result.account });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireManager(request);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const result = await deleteAccount(id, auth.current);
  if (!result.ok) return jsonError(result.error, 400);

  if (id === auth.current.id) {
    await endSession(await tokenFromRequest(request));
    await clearSession();
  }
  return new Response(null, { status: 204 });
}
