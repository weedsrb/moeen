import { PageTransition } from "@/components/layout/page-transition";
import { ProductDetail } from "@/components/inventory/product-detail";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  // Fetch product
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .single();

  if (!product) notFound();

  // Fetch merchant settings
  const { data: settings } = await supabase
    .from("merchant_settings")
    .select("low_stock_threshold")
    .eq("merchant_id", merchant.id)
    .single();

  const merchantThreshold = settings?.low_stock_threshold ?? 5;

  // Fetch stock adjustments
  const { data: adjustments } = await supabase
    .from("stock_adjustments")
    .select("*")
    .eq("product_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

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
