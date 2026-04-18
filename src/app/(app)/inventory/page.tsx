import { PageTransition } from "@/components/layout/page-transition";
import { InventoryContent } from "@/components/inventory/inventory-content";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_COLUMNS } from "@/lib/db/columns";
import { requireMerchant } from "@/lib/auth/require-merchant";

export default async function InventoryPage() {
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  // Parallel fetch: products + settings
  const [productsResult, settingsResult] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
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
