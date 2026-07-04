import { PageTransition } from "@/components/layout/page-transition";
import { OrdersContent } from "@/components/orders/orders-content";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/auth/require-merchant";
import type { OrderWithCustomer } from "@/types/order";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await searchParams;
  await requireMerchant();
  const { merchant } = await requireMerchant();
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*, customers(id, name, phone, platform), order_items(*)")
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const orders = (data ?? []) as OrderWithCustomer[];
  return (
    <PageTransition>
      <OrdersContent initialOrders={orders} merchantId={merchant.id} />
    </PageTransition>
  );
}
