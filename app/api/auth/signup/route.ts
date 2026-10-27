import { NextResponse } from "next/server";
import { isExtensionClient, startSession } from "@/lib/server/auth";
import { readCredentials, readName } from "@/lib/server/credentials";
import { jsonError } from "@/lib/server/http";
import { createAccount } from "@/lib/server/users";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Enter a name, email address, and password.", 400);
  }

  const name = readName(body);
  if ("error" in name) return jsonError(name.error, 400);

  const credentials = readCredentials(body);
  if ("error" in credentials) return jsonError(credentials.error, 400);

  const result = await createAccount(
    credentials.email,
    credentials.password,
    name.name,
  );
  if (!result.ok) return jsonError(result.error, 409);

  const token = await startSession(result.account.id);
  return NextResponse.json(
    isExtensionClient(request)
      ? { account: result.account, token }
      : { account: result.account },
    { status: 201 },
  );
}
