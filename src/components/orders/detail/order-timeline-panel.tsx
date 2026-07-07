"use client";

import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus, OrderTimelineEntry } from "@/types/order";

interface OrderTimelinePanelProps {
  entries: OrderTimelineEntry[];
  currentStatus: OrderStatus;
}

// Timeline entries are historical and immutable — rows logged before the
// order lifecycle v2 migration (020) can still carry retired status strings
// like "pending"/"ai_proposal" in from_status/to_status. Fall back to a
// neutral dot for any status outside the current 6-value set rather than
// rendering nothing.
function statusDotClass(status: OrderStatus): string {
  switch (status) {
    case "collecting":
      return "bg-ai/60";
    case "incoming":
      return "bg-status-incoming";
    case "confirmed":
      return "bg-status-confirmed";
    case "out_for_delivery":
      return "bg-status-delivery";
    case "delivered":
      return "bg-status-delivered";
    case "cancelled":
      return "bg-status-cancelled";
    default:
      return "bg-muted-foreground";
  }
}

// Same rationale as statusDotClass above — historical timeline entries may
// reference a retired status no longer present in ORDER_STATUS_LABELS.
function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function OrderTimelinePanel({
  entries,
  currentStatus,
}: OrderTimelinePanelProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
    );
  }

  const lastIndex = entries.length - 1;

  return (
    <div>
      {entries.map((entry, i) => {
        const isCurrent =
          i === lastIndex && entry.to_status === currentStatus;
        const dotClass = statusDotClass(entry.to_status);
        const isLast = i === lastIndex;

        return (
          <div key={entry.id} className="grid grid-cols-[16px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
                {isCurrent && (
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                      dotClass
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    dotClass
                  )}
                />
              </span>
              {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className={cn("space-y-1", !isLast && "pb-6")}>
              <p className="text-sm font-medium">
                {entry.from_status
                  ? `${statusLabel(entry.from_status)} -> ${statusLabel(entry.to_status)}`
                  : `Created as ${statusLabel(entry.to_status)}`}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {entry.changed_by} - {new Date(entry.created_at).toLocaleString()}
              </p>
              {entry.note && (
                <p className="text-sm italic text-muted-foreground">{entry.note}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
