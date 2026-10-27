import { NextResponse } from "next/server";

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}
