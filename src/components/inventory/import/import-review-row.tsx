"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftProduct } from "@/types/catalog-import";

interface ImportReviewRowProps {
  draft: DraftProduct;
  onPatch: (draftId: string, patch: Partial<DraftProduct>) => void;
}

export function ImportReviewRow({ draft, onPatch }: ImportReviewRowProps) {
  const included = draft.action !== "skip";
  const isUpdate = draft.action === "update";

  function toggleInclude(checked: boolean) {
    onPatch(draft.draftId, {
      action: checked ? (draft.duplicateOf ? "update" : "create") : "skip",
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-3 transition-colors",
        !included && "opacity-50",
        draft.needsReview
          ? "border-ai/40 border-dashed bg-ai/5"
          : "border-border"
      )}
    >
      {/* Header: include toggle + source row + issues */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => toggleInclude(e.target.checked)}
            aria-label="Include this product"
            className="h-4 w-4 accent-[var(--color-ai)] cursor-pointer"
          />
          <span className="font-mono text-[10px] text-muted-foreground">
            Row {draft.sourceRow}
          </span>
          {draft.category && (
            <Badge variant="secondary" className="text-[10px]">
              {draft.category}
            </Badge>
          )}
        </div>
        {draft.needsReview && (
          <div className="flex flex-wrap justify-end gap-1">
            {draft.issues.map((issue) => (
              <Badge
                key={issue}
                variant="outline"
                className="gap-1 border-ai/40 bg-ai/10 text-[10px] text-ai"
              >
                <AlertTriangle className="h-3 w-3" />
                {issue}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => onPatch(draft.draftId, { name: e.target.value })}
            placeholder="Product name"
            disabled={!included}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Price</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={draft.price ?? ""}
            onChange={(e) =>
              onPatch(draft.draftId, {
                price: e.target.value === "" ? null : parseFloat(e.target.value),
              })
            }
            className="font-mono"
            disabled={!included}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={draft.quantity ?? ""}
            onChange={(e) =>
              onPatch(draft.draftId, {
                quantity:
                  e.target.value === "" ? null : parseInt(e.target.value, 10),
              })
            }
            className="font-mono"
            disabled={!included}
          />
        </div>
      </div>

      {/* Variant breakdown (read-only — collapses to one stock number on save) */}
      {draft.variantBreakdown && draft.variantBreakdown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            Variants (summed into quantity):
          </span>
          {draft.variantBreakdown.map((v) => (
            <Badge key={v.label} variant="secondary" className="text-[10px]">
              {v.label}: <span className="font-mono ms-1">{v.quantity}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Duplicate resolution */}
      {draft.duplicateOf && included && (
        <div className="flex flex-col gap-1.5 rounded-md bg-amber-500/10 p-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Matches existing product{" "}
            <span className="font-medium">{draft.duplicateOf.name}</span>
          </span>
          <Select
            value={draft.action}
            onValueChange={(v) =>
              v && onPatch(draft.draftId, { action: v as DraftProduct["action"] })
            }
          >
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="create">Create new</SelectItem>
              <SelectItem value="update">Update existing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {isUpdate && (
        <p className="text-[10px] text-muted-foreground">
          Will overwrite {draft.duplicateOf?.name}&apos;s name, price, quantity &
          variants.
        </p>
      )}
    </div>
  );
}
