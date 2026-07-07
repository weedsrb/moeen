"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "done" | "error";

/**
 * Manually re-run the Instagram DM history backfill. On success we do a full
 * reload so freshly-imported conversations and their messages are guaranteed
 * visible (the list is seeded once from the server component).
 */
export function SyncHistoryButton() {
  const [state, setState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    if (state === "syncing") return;
    setState("syncing");
    setMessage(null);

    try {
      const res = await fetch("/api/instagram/sync-history", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Sync failed");
        return;
      }

      setState("done");
      const imported = data.messages ?? 0;
      setMessage(
        imported > 0
          ? `Imported ${imported} message${imported === 1 ? "" : "s"}`
          : "Up to date"
      );

      // Give the merchant a beat to read the result, then reload to surface it.
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setState("error");
      setMessage("Sync failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span
          className={cn(
            "text-xs",
            state === "error" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {message}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={state === "syncing"}
        aria-label="Sync Instagram history"
      >
        {state === "syncing" ? (
          <RefreshCw className="animate-spin" />
        ) : state === "done" ? (
          <Check />
        ) : state === "error" ? (
          <AlertCircle />
        ) : (
          <RefreshCw />
        )}
        {state === "syncing" ? "Syncing…" : "Sync history"}
      </Button>
    </div>
  );
}
