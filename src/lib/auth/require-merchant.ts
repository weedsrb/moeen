import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listOwnedMerchants } from "@/lib/db/merchants";
import type { User } from "@supabase/supabase-js";

export type Merchant = {
  id: string;
  business_name: string;
  business_type: string | null;
  city: string | null;
  phone: string | null;
  onboarding_completed: boolean;
};

export const ACTIVE_MERCHANT_COOKIE = "active_merchant_id";

export const getUserCached = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Resolves which of the user's owned businesses is "active" for this
 * request: the cookie's merchant_id if it's actually owned by this user,
 * otherwise the oldest owned business, otherwise null (user owns none yet).
 */
export const getActiveMerchantId = cache(
  async (userId: string): Promise<string | null> => {
    const cookieStore = await cookies();
    const requested = cookieStore.get(ACTIVE_MERCHANT_COOKIE)?.value;

    if (requested) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", requested)
        .eq("user_id", userId)
        .single();
      if (data) return data.id;
    }

    const owned = await listOwnedMerchants(userId);
    return owned[0]?.id ?? null;
  }
);

export const getMerchantCached = cache(async (userId: string) => {
  const activeMerchantId = await getActiveMerchantId(userId);
  if (!activeMerchantId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("merchants")
    .select("id, business_name, business_type, city, phone, onboarding_completed")
    .eq("id", activeMerchantId)
    .single();
  return data as Merchant | null;
});

export async function requireUser(): Promise<{ user: User }> {
  const user = await getUserCached();
  if (!user) redirect("/login");
  return { user };
}

export async function requireMerchant(): Promise<{
  user: User;
  merchant: Merchant;
}> {
  const { user } = await requireUser();
  const merchant = await getMerchantCached(user.id);
  if (!merchant || !merchant.onboarding_completed) redirect("/onboarding");
  return { user, merchant };
}

export async function requireNoAuth(): Promise<void> {
  const user = await getUserCached();
  if (user) redirect("/dashboard");
}

export async function requireMerchantForApi(): Promise<
  { error: NextResponse } | { user: User; merchant: Merchant }
> {
  const user = await getUserCached();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const merchant = await getMerchantCached(user.id);
  if (!merchant) {
    return {
      error: NextResponse.json(
        { error: "Merchant not found" },
        { status: 404 }
      ),
    };
  }
  return { user, merchant };
}
