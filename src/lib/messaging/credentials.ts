import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderCredentials } from "./index";

export interface ResolvedChannel {
  platform: string;
  credentials: ProviderCredentials;
  chatId?: string;
}

/**
 * Load the outbound messaging credentials for a merchant on a given platform.
 * Returns null when the channel is not connected / not configured, so callers
 * can respond with a clean "channel not connected" error.
 *
 * Centralizes the per-platform column mapping so the send route, AI reprocess
 * route, and webhook all agree on the credential shape consumed by
 * getProvider(platform, credentials).
 */
export async function getMerchantCredentials(
  supabase: SupabaseClient,
  merchantId: string,
  platform: string
): Promise<ProviderCredentials | null> {
  if (platform === "whatsapp") {
    const { data } = await supabase
      .from("merchant_settings")
      .select(
        "whatsapp_phone_number_id, whatsapp_access_token, whatsapp_connected"
      )
      .eq("merchant_id", merchantId)
      .single();
    if (
      !data?.whatsapp_connected ||
      !data.whatsapp_phone_number_id ||
      !data.whatsapp_access_token
    ) {
      return null;
    }
    return {
      phoneNumberId: data.whatsapp_phone_number_id,
      accessToken: data.whatsapp_access_token,
    };
  }

  if (platform === "instagram") {
    const { data } = await supabase
      .from("merchant_settings")
      .select("instagram_user_id, instagram_access_token, instagram_connected")
      .eq("merchant_id", merchantId)
      .single();
    if (
      !data?.instagram_connected ||
      !data.instagram_user_id ||
      !data.instagram_access_token
    ) {
      return null;
    }
    return {
      igUserId: data.instagram_user_id,
      accessToken: data.instagram_access_token,
    };
  }

  return null;
}
