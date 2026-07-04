import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InstagramProvider } from "@/lib/messaging/instagram";

/**
 * GET /api/cron/instagram-refresh
 * Refreshes Instagram long-lived tokens (~60 day lifetime) that are within 7
 * days of expiry. Intended to run daily via Vercel Cron (or n8n). Protected by
 * CRON_SECRET when set. On failure, raises a flag so a merchant isn't silently
 * disconnected.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("merchant_settings")
    .select(
      "merchant_id, instagram_access_token, instagram_token_expires_at"
    )
    .eq("instagram_connected", true)
    .not("instagram_access_token", "is", null)
    .lte("instagram_token_expires_at", cutoff);

  let refreshed = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    if (!row.instagram_access_token) continue;
    try {
      const result = await InstagramProvider.refreshLongLivedToken(
        row.instagram_access_token
      );
      const expiresAt = new Date(
        Date.now() + result.expires_in * 1000
      ).toISOString();

      await supabase
        .from("merchant_settings")
        .update({
          instagram_access_token: result.access_token,
          instagram_token_expires_at: expiresAt,
        })
        .eq("merchant_id", row.merchant_id);
      refreshed++;
    } catch (err) {
      failed++;
      await supabase.from("flags").insert({
        merchant_id: row.merchant_id,
        priority: "critical",
        category: "instagram_disconnected",
        title: "Instagram token refresh failed",
        description:
          `Could not refresh the Instagram access token — the connection may drop. ${err instanceof Error ? err.message : ""}`.trim(),
        recommended_action: "Reconnect your Instagram account in Settings.",
      });
    }
  }

  return NextResponse.json({ success: true, refreshed, failed });
}
