import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { updateOrderStatusSchema } from "@/lib/validations/order";
import { canTransition } from "@/types/order";
import type { OrderDetail, OrderStatus } from "@/types/order";

const DETAIL_SELECT =
  "*, customers(id, name, phone, platform), order_items(*), order_timeline(*)";

function sortTimeline(order: OrderDetail): OrderDetail {
  return {
    ...order,
    order_timeline: [...order.order_timeline].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  };
}

async function fetchOrderDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  merchantId: string
): Promise<OrderDetail | null> {
  const { data } = await supabase
    .from("orders")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .single();

  if (!data) return null;
  return sortTimeline(data as OrderDetail);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const body = await request.json();
  const parsed = updateOrderStatusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: current } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .eq("merchant_id", auth.merchant.id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const fromStatus = current.status as OrderStatus;
  const toStatus = parsed.data.status;

  if (!canTransition(fromStatus, toStatus)) {
    return NextResponse.json(
      { error: `Invalid transition from ${fromStatus} to ${toStatus}` },
      { status: 400 }
    );
  }

  interface StatusUpdateFields {
    status: OrderStatus;
    confirmed_at?: string;
    dispatched_at?: string;
    delivered_at?: string;
  }

  const now = new Date().toISOString();
  const updateFields: StatusUpdateFields = { status: toStatus };
  if (toStatus === "confirmed") updateFields.confirmed_at = now;
  if (toStatus === "out_for_delivery") updateFields.dispatched_at = now;
  if (toStatus === "delivered") updateFields.delivered_at = now;

  const { error: updateError } = await supabase
    .from("orders")
    .update(updateFields)
    .eq("id", id)
    .eq("merchant_id", auth.merchant.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: timelineError } = await supabase
    .from("order_timeline")
    .insert({
      merchant_id: auth.merchant.id,
      order_id: id,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: "merchant",
      note: parsed.data.note ?? null,
    });

  if (timelineError) {
    return NextResponse.json({ error: timelineError.message }, { status: 500 });
  }

  const order = await fetchOrderDetail(supabase, id, auth.merchant.id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}
