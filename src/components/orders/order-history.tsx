"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrdersList } from "./orders-list";
import type { OrderWithCustomer } from "@/types/order";

const PAGE_SIZE = 50;
// The shared /api/orders endpoint applies the `search` filter in-memory
// AFTER the DB-level range/pagination, so a page can come back short even
// when more matching rows exist further out. Rather than build a second
// search path, we mirror the main Orders list's own convention (Phase 2:
// client/server post-filter over a bounded fetch) — a single wide batch
// while searching, real offset pagination ("Load more") otherwise.
const SEARCH_BATCH_SIZE = 500;

interface DateRange {
  from?: string;
  to?: string;
}

type HistoryStatusFilter = "all" | "delivered" | "cancelled";

export function OrderHistory() {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // useTransition tracks the in-flight fetch for us (isPending flips true/false
  // around the async callback) instead of a manually-managed loading state,
  // so nothing sets state synchronously inside the mount/filter-change effect.
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const isSearching = search.trim().length > 0;

  const fetchPage = useCallback(
    (offset: number, append: boolean) => {
      startTransition(async () => {
        const limit = isSearching ? SEARCH_BATCH_SIZE : PAGE_SIZE;
        const params = new URLSearchParams();
        if (statusFilter === "all") {
          params.set("history", "true");
        } else {
          params.set("status", statusFilter);
        }
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        if (search) params.set("search", search);
        if (dateRange?.from) params.set("from", dateRange.from);
        if (dateRange?.to) params.set("to", `${dateRange.to}T23:59:59`);

        const response = await fetch(`/api/orders?${params.toString()}`);
        const data = response.ok
          ? ((await response.json()) as { orders?: OrderWithCustomer[] })
          : { orders: [] };
        const page = data.orders ?? [];

        setOrders((current) => (append ? [...current, ...page] : page));
        setHasMore(!isSearching && page.length === PAGE_SIZE);
      });
    },
    [statusFilter, search, dateRange, isSearching, startTransition]
  );

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  function handleDateRangeChange(from: string | undefined, to: string | undefined) {
    setDateRange(from || to ? { from, to } : null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search orders, customers, phones..."
          className="sm:max-w-xs"
        />

        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as HistoryStatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Delivered + Cancelled</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <DateRangePicker
          from={dateRange?.from}
          to={dateRange?.to}
          onChange={handleDateRangeChange}
          className="w-full sm:w-auto"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {orders.length === 0 && !isPending ? (
          <p className="text-sm text-muted-foreground">
            No delivered or cancelled orders yet.
          </p>
        ) : (
          <OrdersList orders={orders} />
        )}
      </div>

      {hasMore && (
        <div className="flex shrink-0 justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => fetchPage(orders.length, true)}
          >
            {isPending ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
