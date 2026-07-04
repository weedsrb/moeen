import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { createManualOrderSchema, orderStatusSchema } from "@/lib/validations/order";
import type { OrderWithCustomer } from "@/types/order";

export async function GET(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const statusParam = searchParams.get("status");
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limitParam = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 500)
    : 100;

  const status = statusParam ? orderStatusSchema.safeParse(statusParam) : null;
  if (statusParam && !status?.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let query = supabase
    .from("orders")
    .select("*, customers(id, name, phone, platform), order_items(*)")
    .eq("merchant_id", auth.merchant.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status?.success) {
    query = query.eq("status", status.data);
  } else {
    query = query.neq("status", "cancelled");
  }

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = ((data ?? []) as OrderWithCustomer[]).filter((order) => {
    if (!search) return true;
    const customer = order.customers;
    return (
      order.order_number.toLowerCase().includes(search) ||
      (customer?.name?.toLowerCase().includes(search) ?? false) ||
      (customer?.phone?.toLowerCase().includes(search) ?? false)
    );
  });

  return NextResponse.json({ orders });
}

export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const supabase = await createClient();
  const body = await request.json();
  const parsed = createManualOrderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", parsed.data.customer_id)
    .eq("merchant_id", auth.merchant.id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("merchant_id", auth.merchant.id)
    .eq("customer_id", parsed.data.customer_id)
    .eq("platform", "manual")
    .maybeSingle();

  let conversationId = existingConversation?.id ?? null;

  if (!conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        merchant_id: auth.merchant.id,
        customer_id: parsed.data.customer_id,
        platform: "manual",
        platform_chat_id: `manual:${parsed.data.customer_id}`,
        last_message_at: new Date().toISOString(),
        last_message_preview: "Manual order",
        unread_count: 0,
      })
      .select("id")
      .single();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: conversationError?.message ?? "Failed to create conversation" },
        { status: 500 }
      );
    }

    conversationId = conversation.id;
  }

  type ManualOrderResult = {
    order_id: string;
    order_number: string;
  };

  const { data, error } = await supabase.rpc("create_manual_order", {
    p_merchant_id: auth.merchant.id,
    p_customer_id: parsed.data.customer_id,
    p_conversation_id: conversationId,
    p_delivery_address: parsed.data.delivery_address ?? null,
    p_notes: parsed.data.notes ?? null,
    p_currency: parsed.data.currency,
    p_items: parsed.data.items,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const created = (Array.isArray(data) ? data[0] : data) as
    | ManualOrderResult
    | null;

  if (!created) {
    return NextResponse.json(
      { error: "Manual order was not created" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { order_id: created.order_id, order_number: created.order_number },
    { status: 201 }
  );
}
