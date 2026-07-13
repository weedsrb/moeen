"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_MERCHANT_COOKIE } from "@/lib/auth/require-merchant";

const ACTIVE_MERCHANT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Switches the caller's active business to merchantId, after verifying
 * server-side that they actually own it, then redirects to the dashboard.
 */
export async function switchActiveMerchant(merchantId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: owned } = await supabase
    .from("merchants")
    .select("id")
    .eq("id", merchantId)
    .eq("user_id", user.id)
    .single();

  if (!owned) return;

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MERCHANT_COOKIE, merchantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ACTIVE_MERCHANT_COOKIE_MAX_AGE,
    path: "/",
  });

  redirect("/dashboard");
}
