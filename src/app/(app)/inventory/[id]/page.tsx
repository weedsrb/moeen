import { PageTransition } from "@/components/layout/page-transition";
import { ProductDetail } from "@/components/inventory/product-detail";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { requireMerchant } from "@/lib/auth/require-merchant";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  // Parallel fetch: product, settings, adjustments
  const [productResult, settingsResult, adjustmentsResult] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("merchant_id", merchant.id)
      .single(),
    supabase
      .from("merchant_settings")
      .select("low_stock_threshold")
      .eq("merchant_id", merchant.id)
      .single(),
    supabase
      .from("stock_adjustments")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const product = productResult.data;
  if (!product) notFound();

  const merchantThreshold = settingsResult.data?.low_stock_threshold ?? 5;
  const adjustments = adjustmentsResult.data;

  return (
    <PageTransition>
      <ProductDetail
        product={product}
        adjustments={adjustments ?? []}
        merchantId={merchant.id}
        merchantThreshold={merchantThreshold}
      />
    </PageTransition>
  );
}
