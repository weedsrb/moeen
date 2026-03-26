import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateProductSchema } from "@/lib/validations/product";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ product });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateProductSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};
  const fields = parsed.data;
  if (fields.name !== undefined) updateData.name = fields.name;
  if (fields.price !== undefined) updateData.price = fields.price;
  if (fields.currency !== undefined) updateData.currency = fields.currency;
  if (fields.quantity_total !== undefined)
    updateData.quantity_total = fields.quantity_total;
  if (fields.description !== undefined)
    updateData.description = fields.description;
  if (fields.alternative_names !== undefined)
    updateData.alternative_names = fields.alternative_names;
  if (fields.low_stock_threshold !== undefined)
    updateData.low_stock_threshold = fields.low_stock_threshold;
  if (fields.variants !== undefined) updateData.variants = fields.variants;
  if (fields.image_url !== undefined) updateData.image_url = fields.image_url;
  if (fields.is_active !== undefined) updateData.is_active = fields.is_active;

  const { data: product, error } = await supabase
    .from("products")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Soft delete
  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
