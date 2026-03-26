"use client";

import Link from "next/link";
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
}

export function ProductTable({
  products,
  merchantThreshold,
}: ProductTableProps) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
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

            return (
              <TableRow
                key={product.id}
                className={cn("cursor-pointer", getStockRowClass(status))}
              >
                <TableCell>
                  <Link href={`/inventory/${product.id}`}>
                    <div className="h-8 w-8 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
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
