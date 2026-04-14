import { PageTransition } from "@/components/layout/page-transition";
import { InventoryContent } from "@/components/inventory/inventory-content";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) redirect("/onboarding");

  // Parallel fetch: products + settings
  const [productsResult, settingsResult] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("merchant_settings")
      .select("low_stock_threshold")
      .eq("merchant_id", merchant.id)
      .single(),
  ]);

  const products = productsResult.data;
  const merchantThreshold = settingsResult.data?.low_stock_threshold ?? 5;

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <InventoryContent
          initialProducts={products ?? []}
          merchantId={merchant.id}
          merchantThreshold={merchantThreshold}
        />
      </div>
    </PageTransition>
  );
}
