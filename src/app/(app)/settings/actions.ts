"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/auth/require-merchant";

const businessProfileSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  businessType: z.enum(["food", "clothing", "handmade", "home", "other"]),
  city: z.string().optional(),
  phone: z.string().optional(),
});

export type BusinessProfileState = {
  error?: string;
  success?: boolean;
};

export async function updateBusinessProfile(
  _prevState: BusinessProfileState,
  formData: FormData
): Promise<BusinessProfileState> {
  const { merchant } = await requireMerchant();

  const parsed = businessProfileSchema.safeParse({
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    city: formData.get("city") || undefined,
    phone: formData.get("phone") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({
      business_name: parsed.data.businessName,
      business_type: parsed.data.businessType,
      city: parsed.data.city || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", merchant.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}
