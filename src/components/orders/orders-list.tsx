"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/inventory";
import { statusColorClass, timeElapsed } from "@/lib/utils/orders";
import { ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderWithCustomer } from "@/types/order";

interface OrdersListProps {
  orders: OrderWithCustomer[];
}

type SortKey = "number" | "customer" | "items" | "total" | "status" | "created";
type SortDirection = "asc" | "desc";

function itemLabel(order: OrderWithCustomer): string {
  return order.order_items.map((item) => item.product_name).join(", ");
}

export function OrdersList({ orders }: OrdersListProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let result = 0;
      if (sortKey === "number") result = a.order_number.localeCompare(b.order_number);
      if (sortKey === "customer") {
        result = (a.customers?.name ?? "").localeCompare(b.customers?.name ?? "");
      }
      if (sortKey === "items") result = itemLabel(a).localeCompare(itemLabel(b));
      if (sortKey === "total") result = a.total - b.total;
      if (sortKey === "status") result = a.status.localeCompare(b.status);
      if (sortKey === "created") {
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDirection === "asc" ? result : -result;
    });
  }, [orders, sortDirection, sortKey]);

  function setSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "created" ? "desc" : "asc");
  }

  function header(label: string, key: SortKey) {
    return (
      <button
        type="button"
        className="font-medium hover:text-foreground"
        onClick={() => setSort(key)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{header("#", "number")}</TableHead>
            <TableHead>{header("Customer", "customer")}</TableHead>
            <TableHead>{header("Items", "items")}</TableHead>
            <TableHead>{header("Total", "total")}</TableHead>
            <TableHead>{header("Status", "status")}</TableHead>
            <TableHead>{header("Created", "created")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOrders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer"
              onClick={() => router.push(`/orders/${order.id}`)}
            >
              <TableCell className="font-mono">{order.order_number}</TableCell>
              <TableCell>{order.customers?.name ?? "Unknown customer"}</TableCell>
              <TableCell className="max-w-64 truncate">{itemLabel(order)}</TableCell>
              <TableCell className="font-mono">
                {formatPrice(order.total, order.currency)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn("font-medium", statusColorClass(order.status))}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {timeElapsed(order.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
