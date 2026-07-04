import { notFound } from "next/navigation";
import { PageTransition } from "@/components/layout/page-transition";
import { OrderDetailContent } from "@/components/orders/detail/order-detail-content";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/auth/require-merchant";
import type { OrderDetail } from "@/types/order";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select("*, customers(id, name, phone, platform), order_items(*), order_timeline(*)")
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .single();

  if (!data) notFound();

  const order = {
    ...(data as OrderDetail),
    order_timeline: [...((data as OrderDetail).order_timeline ?? [])].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  };

  return (
    <PageTransition className="flex flex-col overflow-hidden">
      <OrderDetailContent initialOrder={order} merchantId={merchant.id} />
    </PageTransition>
  );
}
