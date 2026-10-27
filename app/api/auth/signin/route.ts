import { NextResponse } from "next/server";
import { isExtensionClient, startSession } from "@/lib/server/auth";
import { readCredentials } from "@/lib/server/credentials";
import { jsonError } from "@/lib/server/http";
import { verifyAccount } from "@/lib/server/users";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Enter an email address and password.", 400);
  }

  const credentials = readCredentials(body);
  if ("error" in credentials) return jsonError(credentials.error, 400);

  const verified = await verifyAccount(credentials.email, credentials.password);
  if (!verified.ok) return jsonError(verified.error, 401);

  const token = await startSession(verified.account.id);
  return NextResponse.json(
    isExtensionClient(request)
      ? { account: verified.account, token }
      : { account: verified.account },
  );
}
