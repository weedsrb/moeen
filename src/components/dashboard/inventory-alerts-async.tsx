import { createClient } from "@/lib/supabase/server";
import { PRODUCT_COLUMNS } from "@/lib/db/columns";
import { getStockStatus } from "@/lib/utils/inventory";
import type { Product } from "@/types/product";
import { InventoryAlerts } from "./inventory-alerts";

interface InventoryAlertsAsyncProps {
  merchantId: string;
  threshold: number;
}

export async function InventoryAlertsAsync({
  merchantId,
  threshold,
}: InventoryAlertsAsyncProps) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("is_active", true);

  const products = (data ?? []) as Product[];
  const outOfStock = products.filter(
    (p) => getStockStatus(p, threshold) === "out_of_stock",
  );
  const lowStock = products.filter(
    (p) => getStockStatus(p, threshold) === "low_stock",
  );

  return <InventoryAlerts outOfStock={outOfStock} lowStock={lowStock} />;
}
