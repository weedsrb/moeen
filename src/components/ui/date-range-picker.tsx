"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// The rest of the app stores date-range filters as plain "yyyy-MM-dd"
// strings (the native <input type="date"> format), so this wraps
// react-day-picker's Date-based range selection and speaks that format
// at the boundary.
function toDate(value?: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function toValue(date?: Date) {
  return date ? format(date, "yyyy-MM-dd") : undefined;
}

interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "Date range",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const range: DateRange | undefined = React.useMemo(
    () => ({ from: toDate(from), to: toDate(to) }),
    [from, to]
  );

  const label =
    range.from && range.to
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`
      : range.from
        ? format(range.from, "MMM d, yyyy")
        : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "justify-start text-start font-normal",
              !range.from && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon className="opacity-60" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(next) => onChange(toValue(next?.from), toValue(next?.to))}
          numberOfMonths={2}
          defaultMonth={range.from}
        />
        {(range.from || range.to) && (
          <div className="flex justify-end border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(undefined, undefined);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
