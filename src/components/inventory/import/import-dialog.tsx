"use client";

import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet,
  Loader2,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { ImportReviewRow } from "./import-review-row";
import {
  parseWorkbook,
  buildSample,
  extractDrafts,
} from "@/lib/inventory/spreadsheet";
import { findDuplicate } from "@/lib/inventory/match";
import type {
  RawWorkbook,
  DetectionResult,
  DraftProduct,
  CommitDraft,
} from "@/types/catalog-import";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantCurrency: string;
  onSuccess: () => void;
}

type Step = "upload" | "working" | "review" | "done";

const ACCEPTED = ".xlsx,.xls,.csv";
const PAGE_SIZE = 25;

export function ImportDialog({
  open,
  onOpenChange,
  merchantCurrency,
  onSuccess,
}: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [workbook, setWorkbook] = useState<RawWorkbook | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [drafts, setDrafts] = useState<DraftProduct[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(
    null
  );

  function reset() {
    setStep("upload");
    setStatusText("");
    setError("");
    setWorkbook(null);
    setDetection(null);
    setDrafts([]);
    setVisibleCount(PAGE_SIZE);
    setResult(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function detectAndExtract(wb: RawWorkbook, preferSheet?: string) {
    setStep("working");
    setError("");
    setStatusText("Reading your spreadsheet's layout…");

    const sample = buildSample(wb);
    const res = await fetch("/api/inventory/import/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample, preferSheet }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Structure detection failed.");
      setStep("upload");
      return;
    }
    const det = data.detection as DetectionResult;
    setDetection(det);
    await extractForSheet(wb, det, preferSheet ?? det.chosenSheet);
  }

  async function extractForSheet(
    wb: RawWorkbook,
    det: DetectionResult,
    sheetName: string
  ) {
    setStatusText("Extracting products…");
    const rawSheet = wb.sheets.find((s) => s.name === sheetName);
    const sheetDet =
      det.sheets.find((s) => s.sheetName === sheetName) ??
      det.sheets.find((s) => s.sheetName === det.chosenSheet);
    if (!rawSheet || !sheetDet) {
      setError("Couldn't find product data in the selected sheet.");
      setStep("upload");
      return;
    }

    const extracted = extractDrafts(rawSheet, sheetDet, merchantCurrency);

    // Fuzzy-match against the existing catalog so duplicates can be updated
    // instead of blindly re-created.
    let existing: { id: string; name: string }[] = [];
    try {
      const pr = await fetch("/api/products");
      const pd = await pr.json();
      existing = (pd.products ?? []).map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      }));
    } catch {
      // Non-fatal — proceed without duplicate detection.
    }

    const withDupes = extracted.map((d) => {
      const dup = d.name ? findDuplicate(d.name, existing) : null;
      return { ...d, duplicateOf: dup };
    });

    setDrafts(withDupes);
    setVisibleCount(PAGE_SIZE);
    setStep("review");
  }

  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
      setError("Please upload an .xlsx, .xls, or .csv file.");
      return;
    }
    try {
      setStep("working");
      setStatusText("Opening file…");
      const wb = await parseWorkbook(file);
      if (wb.sheets.length === 0) {
        setError("That file has no sheets.");
        setStep("upload");
        return;
      }
      setWorkbook(wb);
      await detectAndExtract(wb);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't read that file."
      );
      setStep("upload");
    }
  }

  function handleSheetChange(sheetName: string) {
    if (!workbook || !detection) return;
    // Reuse the AI detection if it already covered this sheet; otherwise
    // re-run detection with the merchant's explicit choice.
    if (detection.sheets.some((s) => s.sheetName === sheetName)) {
      setStep("working");
      extractForSheet(workbook, detection, sheetName);
    } else {
      detectAndExtract(workbook, sheetName);
    }
  }

  function patchDraft(draftId: string, patch: Partial<DraftProduct>) {
    setDrafts((prev) =>
      prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d))
    );
  }

  // --- Derived selection state ---
  const included = useMemo(
    () => drafts.filter((d) => d.action !== "skip"),
    [drafts]
  );
  const committable = useMemo(
    () =>
      included.filter(
        (d) => d.name.trim() !== "" && d.price !== null && d.price > 0
      ),
    [included]
  );
  const blockedCount = included.length - committable.length;

  function includeAll() {
    setDrafts((prev) =>
      prev.map((d) => ({
        ...d,
        action: d.action === "skip" ? (d.duplicateOf ? "update" : "create") : d.action,
      }))
    );
  }
  function excludeFlagged() {
    setDrafts((prev) =>
      prev.map((d) => (d.needsReview ? { ...d, action: "skip" } : d))
    );
  }

  async function handleCommit() {
    if (!detection || committable.length === 0) return;
    setStep("working");
    setStatusText(`Saving ${committable.length} products…`);

    const payload: CommitDraft[] = committable.map((d) => ({
      action: d.action === "update" ? "update" : "create",
      productId: d.action === "update" ? d.duplicateOf?.id : undefined,
      name: d.name.trim(),
      price: d.price as number,
      currency: d.currency as CommitDraft["currency"],
      quantity_total: d.quantity ?? 0,
      alternative_names: d.altNames,
      description: d.description,
      variants: d.variants.length > 0 ? d.variants : null,
    }));

    const chosenSheet = detection.chosenSheet;
    const rowCount =
      workbook?.sheets.find((s) => s.name === chosenSheet)?.rows.length ?? 0;

    const res = await fetch("/api/inventory/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: workbook?.fileName ?? "import",
        sheetName: chosenSheet,
        rowCount,
        drafts: payload,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save products.");
      setStep("review");
      return;
    }
    setResult({ created: data.created ?? 0, updated: data.updated ?? 0 });
    setStep("done");
    onSuccess();
  }

  const flaggedCount = drafts.filter((d) => d.needsReview).length;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import from Excel / Spreadsheet</SheetTitle>
          <SheetDescription>
            Upload your existing product list in any layout — we&apos;ll detect
            the columns and let you review everything before saving.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {error && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {/* --- Upload --- */}
          {step === "upload" && (
            <div
              className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-foreground/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">
                Click to upload a spreadsheet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                .xlsx, .xls or .csv — multiple sheets supported
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* --- Working --- */}
          {step === "working" && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-ai" />
              <p className="mt-3 text-sm text-muted-foreground">{statusText}</p>
            </div>
          )}

          {/* --- Review --- */}
          {step === "review" && detection && (
            <>
              {/* Detection summary + sheet picker */}
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-ai" />
                  <span className="font-medium">AI read your layout</span>
                  <Badge
                    variant="outline"
                    className="border-ai/40 bg-ai/10 font-mono text-[10px] text-ai"
                  >
                    {(detection.confidence * 100).toFixed(0)}% confident
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{detection.notes}</p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-xs text-muted-foreground">Sheet:</span>
                  <Select
                    value={detection.chosenSheet}
                    onValueChange={(v) => v && handleSheetChange(v)}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-[220px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workbook?.sheets.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {detection.ambiguous && (
                    <Badge variant="outline" className="text-[10px]">
                      Multiple sheets — confirm this is the right one
                    </Badge>
                  )}
                </div>
              </div>

              {/* Summary + bulk actions */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{included.length}</span> of{" "}
                  {drafts.length} selected
                  {flaggedCount > 0 && (
                    <span className="ms-2 text-ai">
                      · {flaggedCount} need review
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={includeAll}>
                    Include all
                  </Button>
                  {flaggedCount > 0 && (
                    <Button variant="outline" size="sm" onClick={excludeFlagged}>
                      Exclude flagged
                    </Button>
                  )}
                </div>
              </div>

              {drafts.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3">
                    No products found in this sheet. Try a different one above.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {drafts.slice(0, visibleCount).map((draft) => (
                    <ImportReviewRow
                      key={draft.draftId}
                      draft={draft}
                      onPatch={patchDraft}
                    />
                  ))}
                  {visibleCount < drafts.length && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Show {Math.min(PAGE_SIZE, drafts.length - visibleCount)} more
                      ({drafts.length - visibleCount} remaining)
                    </Button>
                  )}
                </div>
              )}

              {/* Commit bar */}
              {drafts.length > 0 && (
                <div className="sticky bottom-0 space-y-2 border-t bg-background pt-3">
                  {blockedCount > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {blockedCount} selected{" "}
                      {blockedCount === 1 ? "row is" : "rows are"} missing a name
                      or price and won&apos;t be saved. Fix or deselect them.
                    </p>
                  )}
                  <Button
                    className="w-full"
                    disabled={committable.length === 0}
                    onClick={handleCommit}
                  >
                    Import {committable.length}{" "}
                    {committable.length === 1 ? "product" : "products"}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* --- Done --- */}
          {step === "done" && result && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-lg font-medium">Import complete</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.created > 0 && `${result.created} added`}
                {result.created > 0 && result.updated > 0 && " · "}
                {result.updated > 0 && `${result.updated} updated`}
              </p>
              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={reset}>
                  Import another
                </Button>
                <Button onClick={() => handleClose(false)}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
