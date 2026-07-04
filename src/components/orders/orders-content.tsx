"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import {
  useOrdersCount,
  useOrdersCountSetter,
} from "@/components/layout/orders-count-provider";
import { ORDER_STATUS_LABELS, canTransition } from "@/types/order";
import type { Order, OrderStatus, OrderWithCustomer } from "@/types/order";

// Statuses counted by the sidebar Orders badge (mirror OrdersCountSubscriber).
const BADGE_STATUSES: OrderStatus[] = ["incoming", "pending"];
import { OrdersToolbar } from "./orders-toolbar";
import { OrdersBoard } from "./orders-board";
import { OrdersList } from "./orders-list";

interface OrdersContentProps {
  initialOrders: OrderWithCustomer[];
  merchantId: string;
}

interface DateRange {
  from?: string;
  to?: string;
}

function parseStatus(value: string | null): OrderStatus | "all" {
  if (!value) return "all";
  return value in ORDER_STATUS_LABELS ? (value as OrderStatus) : "all";
}

async function fetchOrder(id: string): Promise<OrderWithCustomer | null> {
  const response = await fetch(`/api/orders/${id}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { order?: OrderWithCustomer };
  return data.order ?? null;
}

export function OrdersContent({ initialOrders, merchantId }: OrdersContentProps) {
  const searchParams = useSearchParams();
  const ordersCount = useOrdersCount();
  const setOrdersCount = useOrdersCountSetter();
  const [orders, setOrders] = useState<OrderWithCustomer[]>(initialOrders);
  const [view, setView] = useState<"board" | "list">("board");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">(() =>
    parseStatus(searchParams.get("status"))
  );
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleRealtimeOrder = useCallback(
    async (order: Order, eventType: "INSERT" | "UPDATE" | "DELETE") => {
      if (eventType === "DELETE") {
        setOrders((current) => current.filter((item) => item.id !== order.id));
        return;
      }

      const fresh = await fetchOrder(order.id);
      if (!fresh) return;

      setOrders((current) => {
        const exists = current.some((item) => item.id === fresh.id);
        if (!exists) return [fresh, ...current];
        return current.map((item) => (item.id === fresh.id ? fresh : item));
      });
    },
    []
  );

  useRealtimeOrders(merchantId, handleRealtimeOrder);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (dateRange?.from && order.created_at < dateRange.from) return false;
      if (dateRange?.to && order.created_at > `${dateRange.to}T23:59:59`) {
        return false;
      }
      if (!normalizedSearch) return true;
      return (
        order.order_number.toLowerCase().includes(normalizedSearch) ||
        (order.customers?.name?.toLowerCase().includes(normalizedSearch) ??
          false) ||
        (order.customers?.phone?.toLowerCase().includes(normalizedSearch) ??
          false)
      );
    });
  }, [dateRange, orders, search, statusFilter]);

  async function handleStatusChange(orderId: string, toStatus: OrderStatus) {
    const previousOrders = orders;
    const order = orders.find((item) => item.id === orderId);
    if (!order) throw new Error("Order not found");
    if (!canTransition(order.status, toStatus)) {
      throw new Error(`Invalid transition to ${toStatus}`);
    }

    setOrders((current) =>
      current.map((item) =>
        item.id === orderId
          ? { ...item, status: toStatus, updated_at: new Date().toISOString() }
          : item
      )
    );

    // Optimistically adjust the sidebar Orders badge the instant the status
    // changes (e.g. confirming an order removes it from the count). Realtime
    // reconciles once the PATCH lands.
    const wasCounted = BADGE_STATUSES.includes(order.status);
    const willCount = BADGE_STATUSES.includes(toStatus);
    if (wasCounted && !willCount) {
      setOrdersCount(Math.max(0, ordersCount - 1));
    } else if (!wasCounted && willCount) {
      setOrdersCount(ordersCount + 1);
    }

    const response = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toStatus }),
    });

    if (!response.ok) {
      setOrders(previousOrders);
      // Roll the badge back to its pre-change value on failure.
      setOrdersCount(ordersCount);
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error ?? "Status update failed");
    }

    const data = (await response.json()) as { order: OrderWithCustomer };
    setOrders((current) =>
      current.map((item) => (item.id === orderId ? data.order : item))
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {filteredOrders.length}
        </p>
      </div>

      <OrdersToolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        view={view}
        onViewChange={setView}
        isCreateOpen={isCreateOpen}
        onCreateOpenChange={setIsCreateOpen}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "board" ? (
          <OrdersBoard orders={filteredOrders} onStatusChange={handleStatusChange} />
        ) : (
          <div className="h-full overflow-auto">
            <OrdersList orders={filteredOrders} />
          </div>
        )}
      </div>
    </div>
  );
}
