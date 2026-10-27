import { NextResponse } from "next/server";
import { getAnalysisFor, getTeamAnalysisFor } from "@/lib/analysis";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { canManageAccounts } from "@/lib/server/types";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return jsonError("Choose a start and end date.", 400);

  const scopeParam = url.searchParams.get("scope");
  const scope =
    scopeParam === "team"
      ? "team"
      : scopeParam === "daily"
        ? "daily"
        : "personal";
  const userIds = url.searchParams.getAll("userId").filter(Boolean);

  if (
    (scope === "team" || scope === "daily" || userIds.length > 0) &&
    !canManageAccounts(user.role)
  ) {
    return jsonError("Only admins can view team analysis.", 403);
  }

  try {
    if (scope === "team") {
      const summary = await getTeamAnalysisFor(user, { from, to, userIds });
      return NextResponse.json({ scope, summary });
    }

    const summary = await getAnalysisFor(user, {
      from,
      to,
      userIds: scope === "daily" || userIds.length > 0 ? userIds : undefined,
    });
    return NextResponse.json({ scope: scope === "daily" ? "daily" : "personal", summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load analysis.";
    return jsonError(message, 400);
  }
}
