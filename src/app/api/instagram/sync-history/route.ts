import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { importInstagramHistory } from "@/lib/messaging/import-history";

// Walking many conversations (each a couple of Graph calls) can take a while.
export const maxDuration = 60;

/**
 * POST /api/instagram/sync-history
 * Manually re-run the Instagram DM history backfill for the signed-in merchant.
 * Idempotent — messages already stored are skipped.
 */
export async function POST() {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("merchant_settings")
    .select("instagram_connected, instagram_user_id, instagram_access_token")
    .eq("merchant_id", auth.merchant.id)
    .single();

  if (
    !settings?.instagram_connected ||
    !settings.instagram_user_id ||
    !settings.instagram_access_token
  ) {
    return NextResponse.json(
      { error: "Instagram not connected" },
      { status: 400 }
    );
  }

  try {
    const result = await importInstagramHistory({
      merchantId: auth.merchant.id,
      igUserId: settings.instagram_user_id,
      accessToken: settings.instagram_access_token,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[IG History Sync] failed:", err);
    return NextResponse.json(
      { error: "Failed to sync Instagram history" },
      { status: 500 }
    );
  }
}
