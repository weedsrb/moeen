import type { Product, StockStatus } from "@/types/product";

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function getAvailableQuantity(product: Product): number {
  return product.quantity_total - product.quantity_reserved;
}

export function getStockStatus(
  product: Product,
  merchantThreshold?: number
): StockStatus {
  const available = getAvailableQuantity(product);
  if (available <= 0) return "out_of_stock";
  const threshold =
    product.low_stock_threshold ??
    merchantThreshold ??
    DEFAULT_LOW_STOCK_THRESHOLD;
  if (available <= threshold) return "low_stock";
  return "in_stock";
}

export function getStockBarColor(status: StockStatus): string {
  switch (status) {
    case "in_stock":
      return "bg-green-500";
    case "low_stock":
      return "bg-amber-500";
    case "out_of_stock":
      return "bg-red-500";
  }
}

export function getStockRowClass(status: StockStatus): string {
  switch (status) {
    case "out_of_stock":
      return "bg-red-500/10 border-red-500/30";
    case "low_stock":
      return "bg-amber-500/10 border-amber-500/30";
    case "in_stock":
      return "";
  }
}

export function getStockBadgeVariant(
  status: StockStatus
): "destructive" | "outline" | "secondary" {
  switch (status) {
    case "out_of_stock":
      return "destructive";
    case "low_stock":
      return "outline";
    case "in_stock":
      return "secondary";
  }
}

export function getStockLabel(status: StockStatus): string {
  switch (status) {
    case "in_stock":
      return "In Stock";
    case "low_stock":
      return "Low Stock";
    case "out_of_stock":
      return "Out of Stock";
  }
}

export function formatPrice(price: number, currency: string = "ILS"): string {
  const symbols: Record<string, string> = {
    ILS: "₪",
    USD: "$",
    JOD: "JD",
  };
  const symbol = symbols[currency] ?? currency;
  return `${symbol}${price.toFixed(2)}`;
}

export function getStockBarPercentage(
  product: Product,
  merchantThreshold?: number
): number {
  const available = getAvailableQuantity(product);
  if (available <= 0) return 0;
  const threshold =
    product.low_stock_threshold ??
    merchantThreshold ??
    DEFAULT_LOW_STOCK_THRESHOLD;
  // Use 4x threshold as "full" reference, minimum 1 to avoid division by zero
  const fullMark = Math.max(threshold * 4, 1);
  return Math.min((available / fullMark) * 100, 100);
}
