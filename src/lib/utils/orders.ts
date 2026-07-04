import type { OrderStatus } from "@/types/order";

export function formatOrderNumber(n: string): string {
  return n;
}

export function statusColorClass(s: OrderStatus): string {
  switch (s) {
    case "incoming":
      return "text-status-incoming border-status-incoming bg-status-incoming/10";
    case "pending":
      return "text-status-pending border-status-pending bg-status-pending/10";
    case "confirmed":
      return "text-status-confirmed border-status-confirmed bg-status-confirmed/10";
    case "out_for_delivery":
      return "text-status-delivery border-status-delivery bg-status-delivery/10";
    case "delivered":
      return "text-status-delivered border-status-delivered bg-status-delivered/10";
    case "cancelled":
      return "text-status-cancelled border-status-cancelled bg-status-cancelled/10";
  }
}

export function timeElapsed(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minute = 60000;
  const hour = minute * 60;
  const day = hour * 24;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < day * 2) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function orderLineItemSubtotal(qty: number, price: number): number {
  return qty * price;
}
