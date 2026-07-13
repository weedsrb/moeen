import { NextRequest, NextResponse } from "next/server";
import { requireMerchantForApi } from "@/lib/auth/require-merchant";
import { detectRequestSchema } from "@/lib/validations/catalog-import";
import { detectStructure } from "@/lib/inventory/import-detection";

/**
 * Stage 1 — AI structure detection. Receives only a small sample of the
 * workbook (parsed client-side) and returns the column mapping / header row /
 * variant layout. Auth-gated; the file itself never reaches the server.
 */
export async function POST(request: NextRequest) {
  const auth = await requireMerchantForApi();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const parsed = detectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  try {
    const detection = await detectStructure(
      parsed.data.sample,
      parsed.data.preferSheet
    );
    return NextResponse.json({ detection });
  } catch (err) {
    console.error("[Catalog Import] structure detection failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't automatically read this spreadsheet's layout. Try uploading the sheet with a clear header row, or add products manually.",
      },
      { status: 502 }
    );
  }
}
