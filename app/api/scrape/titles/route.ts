import { NextResponse } from "next/server";
import { suggestJobTitles } from "@/lib/scrape/jobright";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const input = new URL(request.url).searchParams.get("input") || "";
  try {
    const titles = await suggestJobTitles(input);
    return NextResponse.json({ titles });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Job function search failed. Try again.";
    return jsonError(message, 502);
  }
}
