import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { commitRequestSchema } from "@/lib/validations/catalog-import";

/**
 * Stage 3 — commit reviewed drafts to the real catalog. Every row here has been
 * seen and confirmed by the merchant (nothing auto-commits). `create` rows are
 * bulk-inserted; `update` rows patch an existing product's name/price/quantity/
 * variants/alt-names. The batch is recorded in `catalog_imports` for audit —
 * best-effort, so a missing audit table never blocks the import itself.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;
  const merchantId = auth.merchant.id;

  const supabase = await createClient();

  const body = await request.json();
  const parsed = commitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { drafts, fileName, sheetName, rowCount } = parsed.data;

  const creates = drafts.filter((d) => d.action === "create");
  const updates = drafts.filter((d) => d.action === "update");

  let createdCount = 0;
  let updatedCount = 0;

  // --- Bulk-insert the new products ---
  if (creates.length > 0) {
    const rows = creates.map((d) => ({
      merchant_id: merchantId,
      name: d.name,
      price: d.price,
      currency: d.currency,
      quantity_total: d.quantity_total,
      description: d.description,
      alternative_names: d.alternative_names,
      variants: d.variants,
      is_active: true,
    }));
    const { data, error } = await supabase
      .from("products")
      .insert(rows)
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: `Failed to import products: ${error.message}` },
        { status: 500 }
      );
    }
    createdCount = data?.length ?? 0;
  }

  // --- Patch existing products (fuzzy-matched duplicates the merchant chose to
  //     update). Ownership is enforced by the merchant_id filter + RLS. ---
  for (const d of updates) {
    if (!d.productId) continue;
    const { error } = await supabase
      .from("products")
      .update({
        name: d.name,
        price: d.price,
        currency: d.currency,
        quantity_total: d.quantity_total,
        alternative_names: d.alternative_names,
        variants: d.variants,
      })
      .eq("id", d.productId)
      .eq("merchant_id", merchantId);
    if (error) {
      return NextResponse.json(
        { error: `Failed to update "${d.name}": ${error.message}` },
        { status: 500 }
      );
    }
    updatedCount += 1;
  }

  // --- Audit log (best-effort: never block the import on a logging failure) ---
  const { error: logError } = await supabase.from("catalog_imports").insert({
    merchant_id: merchantId,
    source: "excel",
    file_name: fileName,
    sheet_name: sheetName,
    row_count: rowCount,
    confirmed_count: createdCount + updatedCount,
  });
  if (logError) {
    console.warn(
      "[Catalog Import] audit log skipped (catalog_imports unavailable?):",
      logError.message
    );
  }

  return NextResponse.json({
    created: createdCount,
    updated: updatedCount,
  });
}
