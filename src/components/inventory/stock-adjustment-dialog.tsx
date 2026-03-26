"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentQuantity: number;
  mode: "add" | "remove";
  onSuccess: () => void;
}

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentQuantity,
  mode,
  onSuccess,
}: StockAdjustmentDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const adjustment =
      mode === "add" ? parseInt(amount, 10) : -parseInt(amount, 10);

    try {
      const res = await fetch(`/api/products/${productId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment, reason }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setAmount("");
      setReason("");
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const preview =
    amount && !isNaN(parseInt(amount, 10))
      ? currentQuantity + (mode === "add" ? parseInt(amount, 10) : -parseInt(amount, 10))
      : currentQuantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add Stock" : "Remove Stock"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Add" : "Remove"} stock for {productName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="font-mono"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "add"
                  ? "e.g. Restock from supplier"
                  : "e.g. Damaged goods"
              }
              required
            />
          </div>

          <div className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2 font-mono">
            Current: {currentQuantity} → New: {preview}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              )}
              {mode === "add" ? "Add Stock" : "Remove Stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
