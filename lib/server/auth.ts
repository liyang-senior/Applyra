import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  getAccountForSession,
  rotateSessionVersion,
} from "@/lib/server/users";
import type { Account } from "@/lib/server/types";

export const SESSION_COOKIE = "applyra_session";

const WEEK_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not set. Add it to .env.local.");
  }
  return value;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function signToken(userId: string, version: number) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      v: version,
      exp: Date.now() + WEEK_SECONDS * 1000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function readToken(token: string | undefined): { sub: string; v: number } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: string;
      v?: number;
      exp?: number;
    };
    if (
      !data.sub ||
      typeof data.v !== "number" ||
      typeof data.exp !== "number" ||
      data.exp < Date.now()
    ) {
      return null;
    }
    return { sub: data.sub, v: data.v };
  } catch {
    return null;
  }
}

async function accountFromToken(token: string | undefined): Promise<Account | null> {
  const parsed = readToken(token);
  if (!parsed) return null;
  return getAccountForSession(parsed.sub, parsed.v);
}

export function isExtensionClient(request: Request) {
  return request.headers.get("x-applyra-client") === "extension";
}

export async function startSession(userId: string) {
  const version = await rotateSessionVersion(userId);
  if (version === null) {
    throw new Error("Account not found.");
  }
  const token = signToken(userId, version);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(WEEK_SECONDS));
  return token;
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", cookieOptions(0));
}

export async function endSession(token: string | undefined) {
  const parsed = readToken(token);
  if (!parsed) return;
  const account = await getAccountForSession(parsed.sub, parsed.v);
  if (account) await rotateSessionVersion(parsed.sub);
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

export async function tokenFromRequest(request?: Request) {
  const fromHeader = request ? bearerToken(request) : undefined;
  if (fromHeader) return fromHeader;
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function getRequestAccount(request?: Request): Promise<Account | null> {
  return accountFromToken(await tokenFromRequest(request));
}

export async function getCurrentAccount(): Promise<Account | null> {
  return getRequestAccount();
}
