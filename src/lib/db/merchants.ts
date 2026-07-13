import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface OwnedMerchant {
  id: string;
  business_name: string;
  business_type: string | null;
  city: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

/**
 * All businesses owned by this user, oldest first. Single source of truth
 * for the top-bar switcher and the Manage Businesses settings page.
 */
export const listOwnedMerchants = cache(
  async (userId: string): Promise<OwnedMerchant[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("merchants")
      .select("id, business_name, business_type, city, onboarding_completed, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    return (data ?? []) as OwnedMerchant[];
  }
);
