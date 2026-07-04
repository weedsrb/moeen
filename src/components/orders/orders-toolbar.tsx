"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_STATUS_LABELS } from "@/types/order";
import type { OrderStatus } from "@/types/order";
import { ManualOrderSheet } from "./manual-order-sheet";

interface DateRange {
  from?: string;
  to?: string;
}

interface OrdersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: OrderStatus | "all";
  onStatusFilterChange: (value: OrderStatus | "all") => void;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  view: "board" | "list";
  onViewChange: (view: "board" | "list") => void;
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}

export function OrdersToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  dateRange,
  onDateRangeChange,
  view,
  onViewChange,
  isCreateOpen,
  onCreateOpenChange,
}: OrdersToolbarProps) {
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const timer = window.setTimeout(() => onSearchChange(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [onSearchChange, searchInput]);

  function setDate(field: "from" | "to", value: string) {
    const next = { ...(dateRange ?? {}), [field]: value || undefined };
    onDateRangeChange(next.from || next.to ? next : null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search orders, customers, phones..."
            className="sm:max-w-xs"
          />

          <Select
            value={statusFilter}
            onValueChange={(v) =>
              v && onStatusFilterChange(v as OrderStatus | "all")
            }
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(ORDER_STATUS_LABELS).map(([status, label]) => (
                <SelectItem key={status} value={status}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input
              type="date"
              value={dateRange?.from ?? ""}
              onChange={(event) => setDate("from", event.target.value)}
              className="w-full sm:w-36"
            />
            <Input
              type="date"
              value={dateRange?.to ?? ""}
              onChange={(event) => setDate("to", event.target.value)}
              className="w-full sm:w-36"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-1">
            <Button
              type="button"
              size="sm"
              variant={view === "board" ? "secondary" : "ghost"}
              onClick={() => onViewChange("board")}
            >
              Board
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "list" ? "secondary" : "ghost"}
              onClick={() => onViewChange("list")}
            >
              List
            </Button>
          </div>
          <Button type="button" onClick={() => onCreateOpenChange(true)}>
            New Order
          </Button>
        </div>
      </div>

      <ManualOrderSheet open={isCreateOpen} onOpenChange={onCreateOpenChange} />
    </div>
  );
}
