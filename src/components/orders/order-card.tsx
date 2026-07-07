"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/inventory";
import {
  formatOrderNumber,
  statusColorClass,
  timeElapsed,
} from "@/lib/utils/orders";
import { ORDER_ALLOWED_TRANSITIONS, ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus, OrderWithCustomer } from "@/types/order";

interface OrderCardProps {
  order: OrderWithCustomer;
  draggable?: boolean;
  onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
}

function itemsSummary(order: OrderWithCustomer): string {
  const count = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const names = order.order_items.map((item) => item.product_name);
  const visible = names.slice(0, 2).join(", ");
  const suffix = names.length > 2 ? ` +${names.length - 2}` : "";
  return `${count} ${count === 1 ? "item" : "items"} - ${visible}${suffix}`;
}

export function OrderCard({ order, draggable, onStatusChange }: OrderCardProps) {
  const colorClass = statusColorClass(order.status);
  const customerName = order.customers?.name ?? "Unknown customer";
  const nextStatuses = ORDER_ALLOWED_TRANSITIONS[order.status];

  const card = (
    <motion.div
      layout
      layoutId={order.id}
      transition={{ duration: 0.2 }}
      className={cn(draggable && "cursor-grab active:cursor-grabbing")}
    >
      <Link
        href={`/orders/${order.id}`}
        className={cn(
          "block rounded-lg border border-border border-s-4 bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          colorClass
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium text-foreground">
              {formatOrderNumber(order.order_number)}
            </p>
            <p className="mt-1 truncate font-medium text-foreground">
              {customerName}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {timeElapsed(order.updated_at ?? order.created_at)}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {itemsSummary(order)}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatPrice(order.total, order.currency)}
          </span>
          {order.ai_extracted && (
            <Badge
              variant="outline"
              className="border-ai/30 bg-ai/10 font-mono text-[10px] text-ai"
              title={`AI extracted - ${Math.round((order.ai_confidence ?? 0) * 100)}% confidence`}
            >
              AI {Math.round((order.ai_confidence ?? 0) * 100)}%
            </Badge>
          )}
        </div>
      </Link>
    </motion.div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger>{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => navigator.clipboard.writeText(order.order_number)}
        >
          Copy order number
        </ContextMenuItem>
        {onStatusChange && nextStatuses.length > 0 && (
          <>
            <ContextMenuSeparator />
            {nextStatuses.map((status) => (
              <ContextMenuItem
                key={status}
                variant={status === "cancelled" ? "destructive" : "default"}
                onClick={() => {
                  onStatusChange(order.id, status).catch(() => {});
                }}
              >
                {status === "cancelled"
                  ? "Cancel order"
                  : `Mark as ${ORDER_STATUS_LABELS[status]}`}
              </ContextMenuItem>
            ))}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SortableOrderCard({
  order,
  onStatusChange,
}: {
  order: OrderWithCustomer;
  onStatusChange?: (orderId: string, status: OrderStatus) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: order.id,
    data: { type: "order", orderId: order.id, status: order.status },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <OrderCard order={order} draggable onStatusChange={onStatusChange} />
    </div>
  );
}
