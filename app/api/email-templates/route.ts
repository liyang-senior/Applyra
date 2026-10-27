import { NextResponse } from "next/server";
import {
  deleteEmailTemplate,
  listEmailTemplates,
  upsertEmailTemplate,
} from "@/lib/email-templates";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { canManageAccounts } from "@/lib/server/types";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  if (!canManageAccounts(user.role)) {
    return jsonError("Only admins can manage email templates.", 403);
  }
  const templates = await listEmailTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: {
    id?: string;
    name?: string;
    body?: string;
    sortOrder?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await upsertEmailTemplate(user, {
    id: body.id || null,
    name: String(body.name || ""),
    body: String(body.body || ""),
    sortOrder: body.sortOrder,
  });
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ template: result.template });
}

export async function DELETE(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  let body: { id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = await deleteEmailTemplate(user, String(body.id || ""));
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ ok: true });
}
