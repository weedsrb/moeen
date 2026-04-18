import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_COLUMNS } from "@/lib/db/columns";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";

export async function GET(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("merchant_id", auth.merchant.id)
    .single();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);

  return NextResponse.json({ messages: messages ?? [] });
}
