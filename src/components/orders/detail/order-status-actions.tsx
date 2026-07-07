"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ORDER_ALLOWED_TRANSITIONS,
  ORDER_STATUS_LABELS,
} from "@/types/order";
import type { OrderDetail, OrderStatus } from "@/types/order";

interface OrderStatusActionsProps {
  order: OrderDetail;
  onOrderChange: (order: OrderDetail) => void;
}

export function OrderStatusActions({
  order,
  onOrderChange,
}: OrderStatusActionsProps) {
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProposal = order.status === "ai_proposal";
  const isCollecting = order.status === "collecting";

  const nextStatuses = ORDER_ALLOWED_TRANSITIONS[order.status]
    .filter((status) => !(order.status === "pending" && status === "incoming"))
    .sort((a, b) => {
      if (a === "cancelled") return 1;
      if (b === "cancelled") return -1;
      return 0;
    });

  if (nextStatuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No further status actions are available.
      </p>
    );
  }

  async function updateStatus(status: OrderStatus) {
    setPendingStatus(status);
    setError(null);

    const response = await fetch(`/api/orders/${order.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const data = (await response.json()) as {
      order?: OrderDetail;
      error?: string;
    };

    setPendingStatus(null);

    if (!response.ok || !data.order) {
      setError(data.error ?? "Status update failed");
      return;
    }

    onOrderChange(data.order);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => (
          <Button
            key={status}
            type="button"
            variant={status === "cancelled" ? "destructive" : "default"}
            disabled={pendingStatus !== null}
            onClick={() => updateStatus(status)}
          >
            {pendingStatus === status
              ? "Updating..."
              : isProposal && status === "incoming"
                ? "Confirm proposal"
                : isProposal && status === "cancelled"
                  ? "Reject proposal"
                  : isCollecting && status === "incoming"
                    ? "Mark as Incoming"
                    : status === "cancelled"
                      ? "Cancel order"
                      : ORDER_STATUS_LABELS[status]}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
