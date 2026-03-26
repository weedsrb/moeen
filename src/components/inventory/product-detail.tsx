"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockBar } from "./stock-bar";
import { StockAdjustmentDialog } from "./stock-adjustment-dialog";
import { ProductForm } from "./product-form";
import {
  ArrowLeft,
  Edit,
  Package,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import type { Product, StockAdjustment } from "@/types/product";
import {
  getStockStatus,
  getStockBadgeVariant,
  getStockLabel,
  getAvailableQuantity,
  formatPrice,
} from "@/lib/utils/inventory";

interface ProductDetailProps {
  product: Product;
  adjustments: StockAdjustment[];
  merchantId: string;
  merchantThreshold: number;
}

export function ProductDetail({
  product: initialProduct,
  adjustments: initialAdjustments,
  merchantId,
  merchantThreshold,
}: ProductDetailProps) {
  const router = useRouter();
  const [product, setProduct] = useState(initialProduct);
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [editOpen, setEditOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"add" | "remove">("add");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const status = getStockStatus(product, merchantThreshold);
  const available = getAvailableQuantity(product);

  async function refresh() {
    const res = await fetch(`/api/products/${product.id}`);
    const data = await res.json();
    if (data.product) setProduct(data.product);
    router.refresh();
  }

  async function handleDeactivate() {
    if (!confirm("Deactivate this product? It will be hidden from your catalog.")) return;
    await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    router.push("/inventory");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/inventory"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Edit className="me-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="ghost" onClick={handleDeactivate}>
            <Trash2 className="me-2 h-4 w-4" />
            Deactivate
          </Button>
        </div>
      </div>

      {/* Product Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Image */}
        <div className="aspect-square rounded-lg bg-muted overflow-hidden flex items-center justify-center">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-16 w-16 text-muted-foreground/40" />
          )}
        </div>

        {/* Details */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">{product.name}</h2>
              <Badge variant={getStockBadgeVariant(status)}>
                {getStockLabel(status)}
              </Badge>
            </div>
            <p className="text-2xl font-mono mt-1">
              {formatPrice(product.price, product.currency)}
            </p>
          </div>

          {product.alternative_names.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Alternative Names
              </p>
              <div className="flex flex-wrap gap-1.5">
                {product.alternative_names.map((n) => (
                  <Badge key={n} variant="secondary">
                    {n}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {product.description && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{product.description}</p>
            </div>
          )}

          {product.variants && product.variants.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Variants</p>
              <div className="space-y-1">
                {product.variants.map((v) => (
                  <p key={v.name} className="text-sm">
                    <span className="font-medium">{v.name}:</span>{" "}
                    {v.options.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inventory Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Inventory</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdjustMode("add");
                setAdjustOpen(true);
              }}
            >
              <Plus className="me-1 h-4 w-4" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdjustMode("remove");
                setAdjustOpen(true);
              }}
            >
              <Minus className="me-1 h-4 w-4" />
              Remove
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold font-mono">
                {product.quantity_total}
              </p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">
                {product.quantity_reserved}
              </p>
              <p className="text-xs text-muted-foreground">Reserved</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{available}</p>
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
          </div>

          <StockBar product={product} merchantThreshold={merchantThreshold} />

          {product.low_stock_threshold !== null && (
            <p className="text-xs text-muted-foreground">
              Low stock threshold:{" "}
              <span className="font-mono">{product.low_stock_threshold}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Adjustment History */}
      {adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stock Adjustments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-end">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adj) => (
                  <TableRow key={adj.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(adj.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell
                      className={`font-mono ${
                        adj.adjustment > 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {adj.adjustment > 0 ? "+" : ""}
                      {adj.adjustment}
                    </TableCell>
                    <TableCell className="text-sm">{adj.reason}</TableCell>
                    <TableCell className="text-end font-mono">
                      {adj.new_quantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <StockAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        productId={product.id}
        productName={product.name}
        currentQuantity={product.quantity_total}
        mode={adjustMode}
        onSuccess={refresh}
      />

      <ProductForm
        open={editOpen}
        onOpenChange={setEditOpen}
        product={product}
        merchantId={merchantId}
        onSuccess={refresh}
      />
    </div>
  );
}
