import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { updateOrderSchema } from "@/lib/validations/order";
import type { OrderDetail, OrderItem, OrderStatus } from "@/types/order";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const order = await fetchOrderDetail(supabase, id, auth.merchant.id);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
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
  const parsed = updateOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .eq("merchant_id", auth.merchant.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const lockedStatuses: OrderStatus[] = [
    "confirmed",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ];

  if (parsed.data.items && lockedStatuses.includes(existing.status as OrderStatus)) {
    return NextResponse.json(
      { error: "Items are only editable for incoming or pending orders" },
      { status: 400 }
    );
  }

  interface OrderUpdateFields {
    delivery_address?: string | null;
    notes?: string | null;
    subtotal?: number;
    total?: number;
  }

  const updateFields: OrderUpdateFields = {};

  if (parsed.data.delivery_address !== undefined) {
    updateFields.delivery_address = parsed.data.delivery_address;
  }
  if (parsed.data.notes !== undefined) {
    updateFields.notes = parsed.data.notes;
  }

  if (parsed.data.items) {
    const subtotal = parsed.data.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );
    updateFields.subtotal = subtotal;
    updateFields.total = subtotal;

    const { error: deleteError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", id)
      .eq("merchant_id", auth.merchant.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const items: Omit<OrderItem, "id">[] = parsed.data.items.map((item) => ({
      merchant_id: auth.merchant.id,
      order_id: id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant: item.variant,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.quantity * item.unit_price,
      ai_confidence: null,
      ai_matched: false,
    }));

    const { error: insertError } = await supabase
      .from("order_items")
      .insert(items);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase
      .from("orders")
      .update(updateFields)
      .eq("id", id)
      .eq("merchant_id", auth.merchant.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const order = await fetchOrderDetail(supabase, id, auth.merchant.id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}
