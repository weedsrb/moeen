import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { FLAG_COLUMNS } from "@/lib/db/columns";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const { data: flag, error } = await supabase
    .from("flags")
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("merchant_id", auth.merchant.id)
    .select(FLAG_COLUMNS)
    .single();

  if (error || !flag) {
    return NextResponse.json(
      { error: error?.message ?? "Flag not found" },
      { status: 400 },
    );
  }

  return NextResponse.json({ flag });
}
