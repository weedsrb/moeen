import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type Merchant = {
  id: string;
  business_name: string;
  business_type: string | null;
  city: string | null;
  onboarding_completed: boolean;
};

export const getUserCached = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getMerchantCached = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("merchants")
    .select("id, business_name, business_type, city, onboarding_completed")
    .eq("user_id", userId)
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
