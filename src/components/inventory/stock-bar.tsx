"use client";

import { cn } from "@/lib/utils";
import type { Product, StockStatus } from "@/types/product";
import {
  getStockBarColor,
  getStockBarPercentage,
  getStockStatus,
} from "@/lib/utils/inventory";

interface StockBarProps {
  product: Product;
  merchantThreshold?: number;
  className?: string;
}

export function StockBar({
  product,
  merchantThreshold,
  className,
}: StockBarProps) {
  const status: StockStatus = getStockStatus(product, merchantThreshold);
  const percentage = getStockBarPercentage(product, merchantThreshold);
  const barColor = getStockBarColor(status);

  return (
    <div
      className={cn("h-1.5 w-full rounded-full bg-muted overflow-hidden", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-300", barColor)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
