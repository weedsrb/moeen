import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // TODO: Phase 5 — List orders for authenticated merchant
  return NextResponse.json({ orders: [] });
}

export async function POST(request: NextRequest) {
  // TODO: Phase 5 — Create order
  const body = await request.json();
  return NextResponse.json({ order: null }, { status: 201 });
}
