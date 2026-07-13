"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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

interface ProductCardProps {
  product: Product;
  merchantThreshold?: number;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function ProductCard({
  product,
  merchantThreshold,
  selected = false,
  onToggleSelect,
}: ProductCardProps) {
  const status = getStockStatus(product, merchantThreshold);
  const available = getAvailableQuantity(product);
  const href = `/inventory/${product.id}`;
  const router = useRouter();

  return (
    <Link
      href={href}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
    >
      <Card
        className={cn(
          "transition-colors hover:border-foreground/20 cursor-pointer",
          getStockRowClass(status),
          selected && "ring-2 ring-primary"
        )}
      >
        <CardContent className="p-4 space-y-3">
          {/* Image */}
          <div className="relative aspect-square rounded-md bg-muted overflow-hidden flex items-center justify-center">
            {onToggleSelect && (
              <span
                className="absolute top-2 start-2 z-10 flex"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect(product.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  readOnly
                  aria-label={`Select ${product.name}`}
                  className="h-4 w-4 cursor-pointer rounded accent-[var(--color-primary)]"
                />
              </span>
            )}
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <Package className="h-8 w-8 text-muted-foreground/40" />
            )}
          </div>

          {/* Info */}
          <div className="space-y-1">
            <h3 className="font-medium text-sm truncate">{product.name}</h3>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">
                {formatPrice(product.price, product.currency)}
              </span>
              <Badge variant={getStockBadgeVariant(status)}>
                {getStockLabel(status)}
              </Badge>
            </div>
          </div>

          {/* Stock bar */}
          <StockBar product={product} merchantThreshold={merchantThreshold} />

          {/* Quantities */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Total: <span className="font-mono">{product.quantity_total}</span>
            </span>
            <span>
              Reserved:{" "}
              <span className="font-mono">{product.quantity_reserved}</span>
            </span>
            <span>
              Avail: <span className="font-mono">{available}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
