"use server";

import { createClient } from "@/lib/supabase/server";
import { ACTIVE_MERCHANT_COOKIE } from "@/lib/auth/require-merchant";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

const ACTIVE_MERCHANT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const onboardingSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  businessType: z.enum(["food", "clothing", "handmade", "home", "other"]),
  city: z.string().optional(),
  phone: z.string().optional(),
});

export type OnboardingState = {
  error?: string;
};

export async function createMerchantProfile(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const parsed = onboardingSchema.safeParse({
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    city: formData.get("city") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .insert({
      user_id: user.id,
      business_name: parsed.data.businessName,
      business_type: parsed.data.businessType,
      city: parsed.data.city || null,
      phone: parsed.data.phone || null,
      onboarding_completed: true,
    })
    .select("id")
    .single();

  if (merchantError) {
    return { error: merchantError.message };
  }

  // Create default merchant settings
  const { error: settingsError } = await supabase
    .from("merchant_settings")
    .insert({ merchant_id: merchant.id });

  if (settingsError) {
    return { error: settingsError.message };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MERCHANT_COOKIE, merchant.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ACTIVE_MERCHANT_COOKIE_MAX_AGE,
    path: "/",
  });

  redirect("/dashboard");
}
