import { NextResponse } from "next/server";
import { getQueueSnapshot } from "@/lib/generate/queue";
import { getCapacitySnapshot } from "@/lib/server/capacity";
import { getRequestAccount } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { canManageAccounts } from "@/lib/server/types";

export async function GET(request: Request) {
  const user = await getRequestAccount(request);
  if (!user) return jsonError("Sign in required.", 401);
  if (!canManageAccounts(user.role)) {
    return jsonError("Only owners and admins can view server status.", 403);
  }

  return NextResponse.json({
    capacity: getCapacitySnapshot(),
    queue: getQueueSnapshot(),
    now: new Date().toISOString(),
  });
}
