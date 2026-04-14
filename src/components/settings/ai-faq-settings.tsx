"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  display_order: number;
}

interface PendingEntry {
  tempId: string;
  question: string;
  answer: string;
  saving: boolean;
  error: string | null;
}

interface AIFAQSettingsProps {
  initialFaq: FAQEntry[];
}

export function AIFAQSettings({ initialFaq }: AIFAQSettingsProps) {
  const [faq, setFaq] = useState<FAQEntry[]>(initialFaq);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  function addPendingRow() {
    setPending((prev) => [
      ...prev,
      {
        tempId: `temp-${Date.now()}`,
        question: "",
        answer: "",
        saving: false,
        error: null,
      },
    ]);
  }

  function updatePending(tempId: string, field: "question" | "answer", value: string) {
    setPending((prev) =>
      prev.map((p) => (p.tempId === tempId ? { ...p, [field]: value } : p))
    );
  }

  function removePending(tempId: string) {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  async function savePending(tempId: string) {
    const entry = pending.find((p) => p.tempId === tempId);
    if (!entry) return;

    if (!entry.question.trim() || !entry.answer.trim()) {
      setPending((prev) =>
        prev.map((p) =>
          p.tempId === tempId ? { ...p, error: "Both question and answer are required." } : p
        )
      );
      return;
    }

    setPending((prev) =>
      prev.map((p) => (p.tempId === tempId ? { ...p, saving: true, error: null } : p))
    );

    try {
      const res = await fetch("/api/settings/ai/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: entry.question.trim(),
          answer: entry.answer.trim(),
          display_order: faq.length,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPending((prev) =>
          prev.map((p) =>
            p.tempId === tempId
              ? { ...p, saving: false, error: data.error ?? "Failed to save" }
              : p
          )
        );
        return;
      }

      setFaq((prev) => [...prev, data.faq]);
      setPending((prev) => prev.filter((p) => p.tempId !== tempId));
    } catch {
      setPending((prev) =>
        prev.map((p) =>
          p.tempId === tempId ? { ...p, saving: false, error: "Network error." } : p
        )
      );
    }
  }

  async function deleteEntry(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));

    try {
      const res = await fetch(`/api/settings/ai/faq/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFaq((prev) => prev.filter((f) => f.id !== id));
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Knowledge Base</CardTitle>
          <Button size="sm" variant="outline" onClick={addPendingRow}>
            <Plus className="me-1.5 h-3.5 w-3.5" />
            Add Question
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {faq.length === 0 && pending.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No questions yet. Add common questions customers ask about your business — delivery
            times, payment methods, return policy, etc.
          </p>
        )}

        {/* Saved entries */}
        {faq.map((entry) => (
          <div
            key={entry.id}
            className="flex gap-3 items-start rounded-lg border border-border p-3"
          >
            <div className="flex-1 space-y-2 min-w-0">
              <Input
                defaultValue={entry.question}
                placeholder="Question"
                className="text-sm"
                readOnly
              />
              <Textarea
                defaultValue={entry.answer}
                placeholder="Answer"
                rows={2}
                className="text-sm resize-none"
                readOnly
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-red-500 shrink-0 mt-0.5"
              onClick={() => deleteEntry(entry.id)}
              disabled={deletingIds.has(entry.id)}
            >
              {deletingIds.has(entry.id) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        ))}

        {/* Pending (unsaved) entries */}
        {pending.map((entry) => (
          <div
            key={entry.tempId}
            className="flex gap-3 items-start rounded-lg border border-dashed border-border p-3 bg-muted/30"
          >
            <div className="flex-1 space-y-2 min-w-0">
              <Input
                value={entry.question}
                onChange={(e) => updatePending(entry.tempId, "question", e.target.value)}
                placeholder="e.g. What are your delivery hours?"
                className="text-sm"
                maxLength={300}
                autoFocus
              />
              <Textarea
                value={entry.answer}
                onChange={(e) => updatePending(entry.tempId, "answer", e.target.value)}
                placeholder="e.g. We deliver 9am–5pm, Saturday–Thursday."
                rows={2}
                className="text-sm resize-none"
                maxLength={1000}
              />
              {entry.error && (
                <p className="text-xs text-red-500">{entry.error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => savePending(entry.tempId)}
                  disabled={entry.saving}
                >
                  {entry.saving ? (
                    <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="me-1.5 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removePending(entry.tempId)}
                  disabled={entry.saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
