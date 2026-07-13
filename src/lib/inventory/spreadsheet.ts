// ============================================================
// Spreadsheet parsing + deterministic draft extraction
// ============================================================
//
// Runs entirely client-side (the file never leaves the browser — only a small
// sample is sent to the server for Stage-1 structure detection). This module is
// the Stage-2 "rules, not AI" half: once Gemini has told us which sheet, which
// header row, and the column → field mapping, everything here is mechanical.

import type {
  RawWorkbook,
  RawSheet,
  ImportSample,
  SheetDetection,
  DraftProduct,
  DraftVariantBreakdown,
} from "@/types/catalog-import";

const MAX_SAMPLE_ROWS = 18; // first non-empty rows per sheet sent to Gemini
const MAX_SAMPLE_COLS = 20; // cap sample width so a runaway sheet can't blow up the prompt

// ------------------------------------------------------------
// Parsing (SheetJS)
// ------------------------------------------------------------

/**
 * Parse an uploaded .xlsx/.xls/.csv File into a RawWorkbook. Reads every sheet;
 * cell values are the COMPUTED values (formulas are evaluated by SheetJS on
 * read, so a `=A1*B1` cell yields its number, never the formula string).
 * xlsx is dynamically imported so it never lands in a server bundle.
 */
export async function parseWorkbook(file: File): Promise<RawWorkbook> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheets: RawSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    // header:1 → array-of-arrays; raw:false → formatted/computed values as
    // strings; defval:"" → blank cells become "" instead of being dropped, so
    // column positions stay aligned across rows.
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    });
    // Coerce everything to trimmed strings — downstream parsing owns typing.
    const stringRows = rows.map((row) =>
      (row ?? []).map((cell) => (cell == null ? "" : String(cell).trim()))
    );
    return { name, rows: stringRows };
  });

  return { fileName: file.name, sheets };
}

/** A row counts as "empty" when every cell is blank after trimming. */
function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === "");
}

/**
 * Build the trimmed sample sent to Gemini for Stage-1 detection: sheet names +
 * the first MAX_SAMPLE_ROWS non-empty rows per sheet (each capped to
 * MAX_SAMPLE_COLS wide), plus the full non-empty row count for context. This is
 * the ONLY spreadsheet data that leaves the browser.
 */
export function buildSample(workbook: RawWorkbook): ImportSample {
  return {
    fileName: workbook.fileName,
    sheets: workbook.sheets.map((sheet) => {
      const nonEmpty = sheet.rows.filter((r) => !isBlankRow(r));
      const sampleRows = nonEmpty
        .slice(0, MAX_SAMPLE_ROWS)
        .map((r) => r.slice(0, MAX_SAMPLE_COLS));
      return {
        name: sheet.name,
        sampleRows,
        totalRows: nonEmpty.length,
      };
    }),
  };
}

// ------------------------------------------------------------
// Value normalization
// ------------------------------------------------------------

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Normalize Arabic-Indic / Persian digits to ASCII so numbers parse. */
function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const ai = ARABIC_INDIC.indexOf(ch);
    const ei = EXTENDED_ARABIC_INDIC.indexOf(ch);
    if (ai >= 0) out += String(ai);
    else if (ei >= 0) out += String(ei);
    else out += ch;
  }
  return out;
}

/** Phrases that mean "no stock" in the merchants' common languages. */
const OUT_OF_STOCK_PATTERNS = [
  "out of stock",
  "sold out",
  "unavailable",
  "غير متوفر",
  "غير متوفرة",
  "نفذ",
  "نفد",
  "خلص",
  "مباع",
];

function isOutOfStockText(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return OUT_OF_STOCK_PATTERNS.some((p) => t.includes(p));
}

/**
 * Parse a price cell. Strips currency symbols/words and thousands separators,
 * normalizes digits, and pulls the first numeric token. Returns null when there
 * is no parseable number (caller flags the row).
 */
export function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const normalized = normalizeDigits(raw)
    .replace(/[,٬،]/g, "") // thousands separators incl. Arabic comma
    .replace(/[^\d.\-]/g, " ") // drop symbols/words (₪, $, شيكل, ILS…)
    .trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Parse a quantity cell into a whole number.
 *   - explicit "out of stock" phrasing → 0 (with an issue string)
 *   - a parseable number → floored non-negative integer
 *   - otherwise → null (with an issue string)
 */
export function parseQuantity(raw: string): {
  quantity: number | null;
  issue: string | null;
} {
  if (!raw || raw.trim() === "") return { quantity: null, issue: null };
  if (isOutOfStockText(raw)) return { quantity: 0, issue: null };
  const normalized = normalizeDigits(raw).replace(/[,٬]/g, "");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return { quantity: null, issue: `Couldn't read quantity "${raw}"` };
  }
  const value = Math.floor(parseFloat(match[0]));
  if (!Number.isFinite(value) || value < 0) {
    return { quantity: null, issue: `Couldn't read quantity "${raw}"` };
  }
  return { quantity: value, issue: null };
}

/** Supported currency codes; the catalog stores one of these. */
const CURRENCY_CODES = ["ILS", "USD", "JOD"] as const;
type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * Coerce a currency cell (code, symbol, or word in any of the merchants'
 * languages) to a supported code. Falls back to the merchant default when it
 * can't be recognized, so a draft always carries a valid code.
 */
export function normalizeCurrency(
  raw: string | null,
  fallback: string
): CurrencyCode {
  const fb = (CURRENCY_CODES as readonly string[]).includes(fallback)
    ? (fallback as CurrencyCode)
    : "ILS";
  if (!raw) return fb;
  const t = raw.trim().toLowerCase();
  if (t.includes("₪") || t.includes("ils") || t.includes("shekel") || t.includes("شيكل") || t.includes("شيقل"))
    return "ILS";
  if (t.includes("$") || t.includes("usd") || t.includes("dollar") || t.includes("دولار"))
    return "USD";
  if (t.includes("jod") || t.includes("dinar") || t.includes("دينار") || t.includes("jd"))
    return "JOD";
  return fb;
}

// ------------------------------------------------------------
// Stage 2 — deterministic extraction
// ------------------------------------------------------------

function cell(row: string[], index: number | null): string {
  if (index === null || index < 0 || index >= row.length) return "";
  return row[index].trim();
}

let draftCounter = 0;
function nextDraftId(): string {
  draftCounter += 1;
  return `draft_${Date.now().toString(36)}_${draftCounter}`;
}

/**
 * Apply a validated SheetDetection to every row of a sheet and produce draft
 * products. Deterministic — no AI. Handles: blank/spacer rows (skipped),
 * merged category cells (forward-filled), subtotal/section-header rows
 * (excluded, not miscounted), non-numeric price/quantity (normalized or
 * flagged), and column-layout variants (grouped into one product).
 *
 * `merchantCurrency` is the fallback when the sheet has neither a currency
 * column nor a sheet-level currency.
 */
export function extractDrafts(
  sheet: RawSheet,
  detection: SheetDetection,
  merchantCurrency: string
): DraftProduct[] {
  const { mapping, headerRow, variantLayout, variantColumns } = detection;
  const drafts: DraftProduct[] = [];
  const seenNames = new Map<string, DraftProduct[]>();
  let currentCategory: string | null = null;

  for (let r = headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (isBlankRow(row)) continue; // spacer row

    const name = cell(row, mapping.name);
    const rawPrice = cell(row, mapping.price);
    const rawQuantity = cell(row, mapping.quantity);
    const categoryCell = cell(row, mapping.category);

    // Forward-fill category (merged cells leave only the top row populated).
    if (categoryCell) currentCategory = categoryCell;

    const price = parsePrice(rawPrice);

    // Column-variant layout: quantity is the SUM of the per-option columns.
    let quantity: number | null = null;
    let quantityIssue: string | null = null;
    let variantBreakdown: DraftVariantBreakdown[] | null = null;
    let variants: { name: string; options: string[] }[] = [];

    if (variantLayout === "columns" && variantColumns) {
      const breakdown: DraftVariantBreakdown[] = [];
      let sum = 0;
      let anyParsed = false;
      for (const opt of variantColumns.options) {
        const parsed = parseQuantity(cell(row, opt.columnIndex));
        if (parsed.quantity !== null) {
          anyParsed = true;
          sum += parsed.quantity;
          breakdown.push({ label: opt.label, quantity: parsed.quantity });
        } else {
          breakdown.push({ label: opt.label, quantity: 0 });
        }
      }
      quantity = anyParsed ? sum : null;
      variantBreakdown = breakdown;
      if (breakdown.length > 0) {
        variants = [
          {
            name: variantColumns.groupName || "Variant",
            options: variantColumns.options.map((o) => o.label),
          },
        ];
      }
    } else {
      const parsed = parseQuantity(rawQuantity);
      quantity = parsed.quantity;
      quantityIssue = parsed.issue;
    }

    // Section-header / subtotal heuristic: a named row with NO parseable price
    // AND no parseable quantity is a category banner or a subtotal disguised as
    // a data row — record it as the running category and don't count it as a
    // product.
    const looksLikeData = price !== null || quantity !== null;
    if (name && !looksLikeData) {
      currentCategory = name;
      continue;
    }
    // A row with neither a name nor any data is noise — skip.
    if (!name && !looksLikeData) continue;

    const issues: string[] = [];
    if (!name) issues.push("Missing product name");
    if (price === null) issues.push("Missing or unreadable price");
    if (quantityIssue) issues.push(quantityIssue);

    // Row-layout variant: a per-row variant label becomes a one-option variant.
    if (variantLayout === "rows") {
      const variantLabel = cell(row, mapping.variant);
      if (variantLabel) {
        variants = [{ name: "Variant", options: [variantLabel] }];
      }
    }

    const altNamesCell = cell(row, mapping.alt_names);
    const altNames = altNamesCell
      ? altNamesCell.split(/[,،;/|]/).map((s) => s.trim()).filter(Boolean)
      : [];

    const currencyCell = cell(row, mapping.currency);
    const currency = normalizeCurrency(
      currencyCell || detection.sheetCurrency,
      merchantCurrency
    );

    const draft: DraftProduct = {
      draftId: nextDraftId(),
      sourceRow: r + 1, // 1-based for humans
      name: name || "",
      price,
      currency,
      quantity,
      variants,
      variantBreakdown,
      altNames,
      category: currentCategory,
      description: cell(row, mapping.description) || null,
      sku: cell(row, mapping.sku) || null,
      issues,
      needsReview: issues.length > 0,
      duplicateOf: null,
      action: "create",
    };

    drafts.push(draft);
    const key = draft.name.trim().toLowerCase();
    if (key) {
      const bucket = seenNames.get(key) ?? [];
      bucket.push(draft);
      seenNames.set(key, bucket);
    }
  }

  // Flag intra-sheet duplicate names (merchant decides: merge or keep).
  for (const bucket of seenNames.values()) {
    if (bucket.length > 1) {
      for (const d of bucket) {
        d.issues.push("Duplicate name in this sheet");
        d.needsReview = true;
      }
    }
  }

  return drafts;
}
