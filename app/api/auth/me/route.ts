import {
  clearSession,
  endSession,
  getRequestAccount,
  startSession,
  tokenFromRequest,
} from "@/lib/server/auth";
import {
  readEmail,
  readName,
  readOptionalPassword,
} from "@/lib/server/credentials";
import { jsonError } from "@/lib/server/http";
import {
  deactivateOwnAccount,
  deleteOwnAccount,
  updateOwnProfile,
} from "@/lib/server/users";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const account = await getRequestAccount(request);
  if (!account) return jsonError("Sign in to continue.", 401);
  return NextResponse.json({ account });
}

export async function PATCH(request: Request) {
  const current = await getRequestAccount(request);
  if (!current) return jsonError("Sign in to continue.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Update your profile details.", 400);
  }

  if (!body || typeof body !== "object") {
    return jsonError("Update your profile details.", 400);
  }

  const record = body as Record<string, unknown>;

  if (record.action === "deactivate") {
    const result = await deactivateOwnAccount(current.id);
    if (!result.ok) return jsonError(result.error, 400);
    await endSession(await tokenFromRequest(request));
    await clearSession();
    return NextResponse.json({ account: result.account });
  }

  const name = readName(body);
  if ("error" in name) return jsonError(name.error, 400);
  const email = readEmail(body);
  if ("error" in email) return jsonError(email.error, 400);
  const password = readOptionalPassword(body);
  if ("error" in password) return jsonError(password.error, 400);

  let currentPassword: string | undefined;
  if (password.password) {
    if (
      typeof record.currentPassword !== "string" ||
      record.currentPassword.length === 0
    ) {
      return jsonError("Enter your current password.", 400);
    }
    currentPassword = record.currentPassword;
  }

  const result = await updateOwnProfile(current.id, {
    name: name.name,
    email: email.email,
    password: password.password,
    currentPassword,
  });
  if (!result.ok) {
    const status =
      result.error === "An account with that email already exists." ? 409 : 400;
    return jsonError(result.error, status);
  }

  // Re-issue the session cookie when email/password change so the UI stays signed in.
  if (result.credentialsChanged) {
    await startSession(current.id);
  }

  return NextResponse.json({
    account: result.account,
    passwordUpdated: Boolean(password.password),
  });
}

export async function DELETE(request: Request) {
  const current = await getRequestAccount(request);
  if (!current) return jsonError("Sign in to continue.", 401);

  const result = await deleteOwnAccount(current.id);
  if (!result.ok) return jsonError(result.error, 400);

  await endSession(await tokenFromRequest(request));
  await clearSession();
  return new Response(null, { status: 204 });
}
