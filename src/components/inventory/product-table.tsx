"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { StockBar } from "./stock-bar";
import type { Product } from "@/types/product";
import {
  getStockStatus,
  getStockRowClass,
  getStockBadgeVariant,
  getStockLabel,
  getAvailableQuantity,
  formatPrice,
} from "@/lib/utils/inventory";

interface ProductTableProps {
  products: Product[];
  merchantThreshold?: number;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
}

export function ProductTable({
  products,
  merchantThreshold,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: ProductTableProps) {
  const selectable = !!onToggleSelect;
  const allSelected =
    selectable &&
    products.length > 0 &&
    products.every((p) => selectedIds?.has(p.id));

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all products"
                  className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]"
                />
              </TableHead>
            )}
            <TableHead className="w-12" />
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead className="text-center">Total</TableHead>
            <TableHead className="text-center">Reserved</TableHead>
            <TableHead className="text-center">Available</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const status = getStockStatus(product, merchantThreshold);
            const available = getAvailableQuantity(product);

            const isSelected = selectedIds?.has(product.id) ?? false;

            return (
              <TableRow
                key={product.id}
                className={cn(
                  "cursor-pointer",
                  getStockRowClass(status),
                  isSelected && "bg-primary/5"
                )}
              >
                {selectable && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect?.(product.id)}
                      aria-label={`Select ${product.name}`}
                      className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/inventory/${product.id}`}>
                    <div className="h-8 w-8 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          width={32}
                          height={32}
                          sizes="32px"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/inventory/${product.id}`}
                    className="font-medium hover:underline"
                  >
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono">
                  {formatPrice(product.price, product.currency)}
                </TableCell>
                <TableCell className="text-center font-mono">
                  {product.quantity_total}
                </TableCell>
                <TableCell className="text-center font-mono">
                  {product.quantity_reserved}
                </TableCell>
                <TableCell className="text-center font-mono">
                  {available}
                </TableCell>
                <TableCell className="w-24">
                  <StockBar
                    product={product}
                    merchantThreshold={merchantThreshold}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={getStockBadgeVariant(status)}>
                    {getStockLabel(status)}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
