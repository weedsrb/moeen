import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserCached, getMerchantCached } from "@/lib/auth/require-merchant";
import { InstagramProvider } from "@/lib/messaging/instagram";
import { importInstagramHistory } from "@/lib/messaging/import-history";

/**
 * GET /api/auth/instagram/callback
 * OAuth redirect target. Exchanges the code for a long-lived token, subscribes
 * the account to the `messages` webhook, and saves the connection. The merchant
 * is identified from the active Mo'een session; `state` guards against CSRF.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const settingsUrl = new URL("/settings", appUrl);

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const fail = (reason: string) => {
    settingsUrl.searchParams.set("ig_error", reason);
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete("ig_oauth_state");
    return res;
  };

  if (oauthError || !code) {
    return fail(oauthError ?? "no_code");
  }

  // CSRF: state must match the cookie set at connect time.
  const cookieState = request.cookies.get("ig_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  // Identify the merchant from the active session.
  const user = await getUserCached();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl));
  const merchant = await getMerchantCached(user.id);
  if (!merchant) return NextResponse.redirect(new URL("/onboarding", appUrl));

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    return fail("not_configured");
  }

  try {
    // 1. code → short-lived token
    const shortLived = await InstagramProvider.exchangeCodeForToken({
      appId,
      appSecret,
      redirectUri,
      code,
    });

    // 2. short-lived → long-lived token (~60 days)
    const longLived = await InstagramProvider.exchangeForLongLivedToken({
      appSecret,
      shortLivedToken: shortLived.access_token,
    });

    // 3. fetch IG user id + username
    const self = await InstagramProvider.getSelf(longLived.access_token);
    if (!self.user_id) return fail("no_user_id");

    // 4. subscribe this account to the app's `messages` webhook field
    await InstagramProvider.subscribeToMessages(
      self.user_id,
      longLived.access_token
    );

    // 5. persist connection
    const expiresAt = new Date(
      Date.now() + longLived.expires_in * 1000
    ).toISOString();

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("merchant_settings")
      .update({
        instagram_connected: true,
        instagram_user_id: self.user_id,
        instagram_username: self.username,
        instagram_access_token: longLived.access_token,
        instagram_token_expires_at: expiresAt,
      })
      .eq("merchant_id", merchant.id);

    if (updateError) return fail("save_failed");

    // Backfill existing DM history in the background so conversations that
    // predate the connection show up immediately. Fire-and-forget — the OAuth
    // redirect must not wait on it.
    after(() =>
      importInstagramHistory({
        merchantId: merchant.id,
        igUserId: self.user_id,
        accessToken: longLived.access_token,
      }).catch((err) =>
        console.error("[Instagram OAuth] history backfill failed:", err)
      )
    );

    settingsUrl.searchParams.set("ig_connected", "1");
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete("ig_oauth_state");
    return res;
  } catch (err) {
    console.error("[Instagram OAuth] callback failed:", err);
    return fail("exchange_failed");
  }
}
