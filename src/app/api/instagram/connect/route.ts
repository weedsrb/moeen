import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getUserCached, getMerchantCached } from "@/lib/auth/require-merchant";

/**
 * GET /api/instagram/connect
 * Starts the Instagram Login OAuth flow. Redirects the merchant to Instagram's
 * authorization screen, storing a CSRF `state` in an httpOnly cookie that the
 * callback verifies.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const user = await getUserCached();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }
  const merchant = await getMerchantCached(user.id);
  if (!merchant) {
    return NextResponse.redirect(new URL("/onboarding", appUrl));
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !redirectUri) {
    return NextResponse.redirect(
      new URL("/settings?ig_error=not_configured", appUrl)
    );
  }

  const state = randomBytes(16).toString("hex");

  const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "scope",
    "instagram_business_basic,instagram_business_manage_messages"
  );
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

/**
 * DELETE /api/instagram/connect
 * Disconnects Instagram by clearing all instagram_* fields.
 */
export async function DELETE() {
  const user = await getUserCached();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const merchant = await getMerchantCached(user.id);
  if (!merchant) {
    return NextResponse.json({ error: "No merchant" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchant_settings")
    .update({
      instagram_connected: false,
      instagram_user_id: null,
      instagram_username: null,
      instagram_access_token: null,
      instagram_token_expires_at: null,
    })
    .eq("merchant_id", merchant.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
