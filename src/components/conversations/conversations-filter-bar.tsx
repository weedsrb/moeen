"use client";

import { useEffect, useState } from "react";
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
import { Search, SlidersHorizontal } from "lucide-react";
import {
  ORDER_BOARD_STATUSES,
  ORDER_HISTORY_STATUSES,
  ORDER_STATUS_LABELS,
} from "@/types/order";
import type { OrderStatus } from "@/types/order";

export interface ConversationFilters {
  search: string;
  status: OrderStatus | "all";
  from: string;
  to: string;
}

interface ConversationsFilterBarProps {
  value: ConversationFilters;
  onChange: (value: ConversationFilters) => void;
}

const ALL_STATUSES: OrderStatus[] = [
  ...ORDER_BOARD_STATUSES,
  ...ORDER_HISTORY_STATUSES,
];

export function ConversationsFilterBar({
  value,
  onChange,
}: ConversationsFilterBarProps) {
  const [searchInput, setSearchInput] = useState(value.search);
  const [expanded, setExpanded] = useState(false);

  // Debounce the free-text search so filtering doesn't run on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onChange({ ...value, search: searchInput });
    }, 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasActiveFilters =
    value.status !== "all" || !!value.from || !!value.to;

  return (
    <div className="space-y-2 border-b border-border p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, username, phone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="ps-9 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setExpanded((v) => !v)}
          aria-label="Filters"
          aria-expanded={expanded}
          className="relative shrink-0"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {hasActiveFilters && (
            <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="flex items-center gap-2">
          <Select
            value={value.status}
            onValueChange={(v) =>
              v && onChange({ ...value, status: v as OrderStatus | "all" })
            }
          >
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All order statuses</SelectItem>
              {ALL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            from={value.from}
            to={value.to}
            onChange={(from, to) =>
              onChange({ ...value, from: from ?? "", to: to ?? "" })
            }
            className="shrink-0"
          />
        </div>
      )}
    </div>
  );
}
