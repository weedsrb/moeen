// ============================================================
// Excel / spreadsheet catalog import
// ============================================================
//
// The import runs in two stages mirroring the AI pipeline's rules/AI split:
//
//   Stage 1 (AI, ambiguous): Gemini reads a small SAMPLE of the workbook —
//     sheet names + the first N non-empty rows per sheet — and returns a
//     `SheetDetection` (which sheet, which header row, column → field mapping,
//     variant layout). Structure/language ambiguity only.
//
//   Stage 2 (rules, deterministic): code applies the mapping to EVERY row of
//     the chosen sheet and produces `DraftProduct[]`. No AI per row.
//
// Nothing touches the real `products` table until the merchant confirms the
// drafts in the review UI.

/** Canonical product fields the importer can map spreadsheet columns onto. */
export type CanonicalField =
  | "name"
  | "price"
  | "quantity"
  | "variant"
  | "sku"
  | "alt_names"
  | "category"
  | "description"
  | "currency";

/**
 * Column → field mapping for one sheet. Values are 0-based column indices into
 * the raw row arrays (indices, not header strings, so duplicate headers are
 * unambiguous). `null` means the field is absent from the sheet.
 */
export type ColumnMapping = Record<CanonicalField, number | null>;

/**
 * When variants are laid out as SEPARATE COLUMNS (e.g. one quantity column per
 * size: Small / Medium / Large), this captures the variant group name and the
 * per-option quantity columns so Stage 2 can fold them back into ONE product
 * with variants instead of importing three separate products.
 */
export interface VariantColumns {
  /** The variant dimension, e.g. "Size" or "Color". Best-effort from headers. */
  groupName: string;
  /** Each variant option and the column index holding its quantity. */
  options: { label: string; columnIndex: number }[];
}

export type VariantLayout = "none" | "rows" | "columns";

/** Gemini's structural read of a single sheet. */
export interface SheetDetection {
  sheetName: string;
  /** True if this sheet holds product rows (vs. a notes/summary/other tab). */
  isProductSheet: boolean;
  /** 0-based index of the real header row (may not be row 0 — title/banner rows). */
  headerRow: number;
  variantLayout: VariantLayout;
  /** Present only when variantLayout === "columns". */
  variantColumns: VariantColumns | null;
  mapping: ColumnMapping;
  /**
   * A currency that applies to the whole sheet when there is no per-row currency
   * column (e.g. a "Prices in ILS" banner). null → fall back to merchant default.
   */
  sheetCurrency: string | null;
}

/** Full Stage-1 result across the workbook. */
export interface DetectionResult {
  /** Every sheet Gemini looked at, with its structural read. */
  sheets: SheetDetection[];
  /** The sheet Gemini judged most likely to hold the catalog. */
  chosenSheet: string;
  /** Overall confidence in the mapping (0-1). Drives the review-UI banner. */
  confidence: number;
  /** True when multiple sheets plausibly hold products — merchant should pick. */
  ambiguous: boolean;
  /** Short human-readable note on what was detected / uncertain. */
  notes: string;
}

// ------------------------------------------------------------
// Raw workbook (client-side parse output)
// ------------------------------------------------------------

/** One parsed sheet: its name and every row as an array of cell strings. */
export interface RawSheet {
  name: string;
  /** rows[r][c] — computed cell values coerced to strings; "" for blanks. */
  rows: string[][];
}

export interface RawWorkbook {
  fileName: string;
  sheets: RawSheet[];
}

/** The trimmed sample sent to Gemini for Stage-1 detection. */
export interface ImportSample {
  fileName: string;
  sheets: {
    name: string;
    /** First N non-empty rows, each capped in width. */
    sampleRows: string[][];
    /** Total non-empty row count in the full sheet (context for the model). */
    totalRows: number;
  }[];
}

// ------------------------------------------------------------
// Draft products (Stage-2 output → review UI)
// ------------------------------------------------------------

/** A per-variant quantity breakdown carried alongside a draft for merchant
 *  visibility. The underlying products table stores a single stock number, so
 *  these are summed into quantity_total on save — surfaced read-only so nothing
 *  is silently collapsed. */
export interface DraftVariantBreakdown {
  label: string;
  quantity: number;
}

/** What the merchant does with a draft on commit. */
export type DraftAction = "create" | "update" | "skip";

/**
 * A candidate product produced deterministically from one (or, for column-
 * variant layouts, one grouped) spreadsheet row. Editable in the review UI
 * before anything is written.
 */
export interface DraftProduct {
  /** Stable client-side id for React keys + selection. */
  draftId: string;
  /** 1-based source row number in the sheet, for "where did this come from". */
  sourceRow: number;
  name: string;
  price: number | null;
  currency: string;
  quantity: number | null;
  variants: { name: string; options: string[] }[];
  variantBreakdown: DraftVariantBreakdown[] | null;
  altNames: string[];
  category: string | null;
  description: string | null;
  sku: string | null;
  /**
   * Non-fatal parse problems (unparseable price, "out of stock" text, duplicate
   * name, missing name). Rendered as violet AI-flag chips — the row is never
   * silently dropped. Empty → clean row.
   */
  issues: string[];
  /** True when `issues` is non-empty — drives the review-UI flag styling. */
  needsReview: boolean;
  /** Populated in the review UI if a close existing catalog product is found. */
  duplicateOf: { id: string; name: string } | null;
  /** Merchant's chosen commit action. Defaults to "create". */
  action: DraftAction;
}

/** One row to commit — sent to the bulk commit endpoint. */
export interface CommitDraft {
  action: Exclude<DraftAction, "skip">;
  /** Present when action === "update": the existing product to update. */
  productId?: string;
  name: string;
  price: number;
  currency: string;
  quantity_total: number;
  alternative_names: string[];
  description: string | null;
  variants: { name: string; options: string[] }[] | null;
}
