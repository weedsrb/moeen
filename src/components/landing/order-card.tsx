import { cn } from "@/lib/utils";
import type { OrderPreview } from "@/lib/landing-data";

interface OrderCardProps {
  order: OrderPreview;
  className?: string;
}

const statusColors: Record<OrderPreview["status"], string> = {
  incoming: "border-s-status-incoming",
  confirmed: "border-s-status-confirmed",
  pending: "border-s-status-pending",
};

const statusLabels: Record<OrderPreview["status"], string> = {
  incoming: "Incoming",
  confirmed: "Confirmed",
  pending: "Pending",
};

export function OrderCard({ order, className }: OrderCardProps) {
  return (
    <div
      className={cn(
        "w-64 rounded-lg border border-border border-s-[3px] bg-card p-3 shadow-md",
        statusColors[order.status],
        className
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {order.id}
        </span>
        <span className="text-xs text-muted-foreground">
          {statusLabels[order.status]}
        </span>
      </div>
      <p className="text-sm font-semibold font-arabic text-foreground">
        {order.customer}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{order.items}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-sm font-medium text-foreground">
          {order.total}
        </span>
        <span className="rounded-sm bg-ai/10 px-1.5 py-0.5 font-mono text-xs text-ai">
          AI {order.confidence}%
        </span>
      </div>
    </div>
  );
}
