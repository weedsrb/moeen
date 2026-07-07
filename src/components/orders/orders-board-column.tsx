"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";
import { SortableOrderCard } from "./order-card";

interface OrdersBoardColumnProps {
  status: OrderStatus;
  orders: OrderWithCustomer[];
  errorOrderId: string | null;
  errorMessage: string | null;
  onStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
}

export function OrdersBoardColumn({
  status,
  orders,
  errorOrderId,
  errorMessage,
  onStatusChange,
}: OrdersBoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: "column", status },
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-80 w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/20 p-3",
        isOver && "border-primary/50 bg-muted/40"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{ORDER_STATUS_LABELS[status]}</h2>
        <span className="rounded-full bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {orders.length}
        </span>
      </div>

      <SortableContext
        items={orders.map((order) => order.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-3">
          {orders.map((order) => (
            <div key={order.id} className="space-y-1">
              <SortableOrderCard order={order} onStatusChange={onStatusChange} />
              {errorOrderId === order.id && errorMessage && (
                <p className="px-1 text-xs text-destructive">{errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
