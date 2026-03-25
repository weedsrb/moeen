import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // TODO: Phase 3 — Telegram webhook handler
  const body = await request.json();
  return NextResponse.json({ ok: true });
}
