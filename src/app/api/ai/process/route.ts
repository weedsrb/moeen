import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // TODO: Phase 4 — Gemini AI processing endpoint
  const body = await request.json();
  return NextResponse.json({ result: null });
}
