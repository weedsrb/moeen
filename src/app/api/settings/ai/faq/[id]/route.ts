import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateFAQSchema } from "@/lib/validations/ai-settings";

async function getOwnershipContext(faqId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Unauthorized" as const };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!merchant) return { supabase, error: "Merchant not found" as const };

  // Verify ownership
  const { data: faqEntry } = await supabase
    .from("merchant_faq")
    .select("id, merchant_id")
    .eq("id", faqId)
    .single();

  if (!faqEntry) return { supabase, error: "Not found" as const };
  if (faqEntry.merchant_id !== merchant.id) return { supabase, error: "Forbidden" as const };

  return { supabase, merchant, faqEntry };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getOwnershipContext(id);

  if ("error" in ctx) {
    const status = ctx.error === "Unauthorized" ? 401
      : ctx.error === "Forbidden" ? 403
      : ctx.error === "Not found" ? 404
      : 404;
    return NextResponse.json({ error: ctx.error }, { status });
  }

  const body = await request.json();
  const parsed = updateFAQSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await ctx.supabase
    .from("merchant_faq")
    .update(parsed.data)
    .eq("id", id)
    .select("id, question, answer, display_order")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ faq: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getOwnershipContext(id);

  if ("error" in ctx) {
    const status = ctx.error === "Unauthorized" ? 401
      : ctx.error === "Forbidden" ? 403
      : 404;
    return NextResponse.json({ error: ctx.error }, { status });
  }

  const { error } = await ctx.supabase
    .from("merchant_faq")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
