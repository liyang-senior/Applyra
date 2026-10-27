import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function extensionOrigin(origin: string | null) {
  if (!origin) return null;
  if (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://")
  ) {
    return origin;
  }
  return null;
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Applyra-Client",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

export function middleware(request: NextRequest) {
  const origin = extensionOrigin(request.headers.get("origin"));
  if (!origin) return NextResponse.next();

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
