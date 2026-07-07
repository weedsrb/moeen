import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  if (typeof body.unread_count !== "number" || body.unread_count < 0) {
    return NextResponse.json(
      { error: "unread_count must be a non-negative number" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: conversation, error } = await supabase
    .from("conversations")
    .update({ unread_count: body.unread_count })
    .eq("id", id)
    .eq("merchant_id", auth.merchant.id)
    .select()
    .single();

  if (error || !conversation) {
    return NextResponse.json(
      { error: error?.message ?? "Conversation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ conversation });
}
