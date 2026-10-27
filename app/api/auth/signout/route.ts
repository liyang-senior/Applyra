import { clearSession, endSession, tokenFromRequest } from "@/lib/server/auth";

export async function POST(request: Request) {
  await endSession(await tokenFromRequest(request));
  await clearSession();
  return new Response(null, { status: 204 });
}
