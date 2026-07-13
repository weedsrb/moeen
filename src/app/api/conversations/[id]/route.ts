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
  const isUnreadUpdate =
    typeof body.unread_count === "number" && body.unread_count >= 0;
  const isAutomationUpdate =
    body.automation_mode === "ai" || body.automation_mode === "human_takeover";

  if (!isUnreadUpdate && !isAutomationUpdate) {
    return NextResponse.json(
      {
        error:
          "Provide a non-negative unread_count or automation_mode of ai/human_takeover",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const update = isAutomationUpdate
    ? body.automation_mode === "human_takeover"
      ? {
          automation_mode: "human_takeover",
          takeover_reason: "merchant_paused",
          taken_over_at: now,
          resumed_at: null,
        }
      : {
          automation_mode: "ai",
          takeover_reason: null,
          taken_over_at: null,
          resumed_at: now,
        }
    : { unread_count: body.unread_count };

  const supabase = await createClient();

  const { data: conversation, error } = await supabase
    .from("conversations")
    .update(update)
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
