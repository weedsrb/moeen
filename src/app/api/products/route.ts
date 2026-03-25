import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // TODO: Phase 2 — List products for authenticated merchant
  return NextResponse.json({ products: [] });
}

export async function POST(request: NextRequest) {
  // TODO: Phase 2 — Create product
  const body = await request.json();
  return NextResponse.json({ product: null }, { status: 201 });
}
