"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/utils/inventory";
import type { OrderDetail, OrderItem } from "@/types/order";
import type { Product } from "@/types/product";
import { OrderStatusActions } from "./order-status-actions";

interface OrderDataPanelProps {
  order: OrderDetail;
  onOrderChange: (order: OrderDetail) => void;
}

interface EditableItem {
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
}

function toEditableItem(item: OrderItem): EditableItem {
  return {
    product_id: item.product_id,
    product_name: item.product_name,
    variant: item.variant,
    quantity: item.quantity,
    unit_price: item.unit_price,
  };
}

export function OrderDataPanel({ order, onOrderChange }: OrderDataPanelProps) {
  const editable =
    order.status === "collecting" ||
    order.status === "incoming" ||
    order.status === "pending";
  const [items, setItems] = useState<EditableItem[]>(
    order.order_items.map(toEditableItem)
  );
  const [prevOrder, setPrevOrder] = useState(order);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState(
    order.delivery_address ?? ""
  );
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (order !== prevOrder) {
    setPrevOrder(order);
    setItems(order.order_items.map(toEditableItem));
    setDeliveryAddress(order.delivery_address ?? "");
    setNotes(order.notes ?? "");
  }

  useEffect(() => {
    if (!editable) return;

    async function loadProducts() {
      const response = await fetch("/api/products");
      if (!response.ok) return;
      const data = (await response.json()) as { products?: Product[] };
      setProducts(data.products ?? []);
    }

    loadProducts();
  }, [editable]);

  const filteredProducts = useMemo(() => {
    const normalized = productSearch.trim().toLowerCase();
    if (!normalized) return products.slice(0, 8);
    return products
      .filter((product) => product.name.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [productSearch, products]);

  const itemTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  function updateItem(index: number, patch: Partial<EditableItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addProduct(product: Product) {
    setItems((current) => [
      ...current,
      {
        product_id: product.id,
        product_name: product.name,
        variant: null,
        quantity: 1,
        unit_price: product.price,
      },
    ]);
  }

  async function patchOrder(payload: {
    delivery_address?: string | null;
    notes?: string | null;
    items?: EditableItem[];
  }) {
    setSaving(true);
    setError(null);

    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      order?: OrderDetail;
      error?: string;
    };

    setSaving(false);

    if (!response.ok || !data.order) {
      setError(data.error ?? "Order update failed");
      return;
    }

    onOrderChange(data.order);
  }

  function saveItems() {
    patchOrder({ items });
  }

  function saveDeliveryAddress() {
    const value = deliveryAddress || null;
    if (value === order.delivery_address) return;
    patchOrder({ delivery_address: value });
  }

  function saveNotes() {
    const value = notes || null;
    if (value === order.notes) return;
    patchOrder({ notes: value });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {order.ai_extracted && (
          <Badge
            variant="outline"
            className="border-ai/30 bg-ai/10 font-mono text-ai"
            title={`AI extracted - ${Math.round((order.ai_confidence ?? 0) * 100)}% confidence`}
          >
            AI {Math.round((order.ai_confidence ?? 0) * 100)}%
          </Badge>
        )}
        <p className="font-mono text-xs text-muted-foreground">
          Created {new Date(order.created_at).toLocaleString()}
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Customer</h3>
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">
            {order.customers?.name ?? "Unknown customer"}
          </p>
          <p className="font-mono text-muted-foreground">
            {order.customers?.phone ?? "No phone"}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Line items</h3>
          {editable && (
            <Button
              type="button"
              size="sm"
              disabled={saving || items.length === 0}
              onClick={saveItems}
            >
              {saving ? "Saving..." : "Save items"}
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Subtotal</TableHead>
              {editable && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={`${item.product_id ?? item.product_name}-${index}`}>
                <TableCell>{item.product_name}</TableCell>
                <TableCell>{item.variant ?? "-"}</TableCell>
                <TableCell>
                  {editable ? (
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, {
                          quantity: Number(event.target.value),
                        })
                      }
                      className="w-20"
                    />
                  ) : (
                    <span className="font-mono">{item.quantity}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono">
                  {formatPrice(item.unit_price, order.currency)}
                </TableCell>
                <TableCell className="font-mono">
                  {formatPrice(item.quantity * item.unit_price, order.currency)}
                </TableCell>
                {editable && (
                  <TableCell>
                    <Button
                      type="button"
                      size="xs"
                      variant="destructive"
                      onClick={() => removeItem(index)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {editable && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label>Add item</Label>
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search products"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-start text-sm hover:bg-muted"
                  onClick={() => addProduct(product)}
                >
                  <span className="truncate">{product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatPrice(product.price, product.currency)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <div className="min-w-48 space-y-1 rounded-lg border border-border p-3">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">
                {formatPrice(itemTotal, order.currency)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-sm font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatPrice(itemTotal, order.currency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <Label>Delivery address</Label>
          <Textarea
            value={deliveryAddress}
            onChange={(event) => setDeliveryAddress(event.target.value)}
            onBlur={saveDeliveryAddress}
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={saveNotes}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>
        <OrderStatusActions order={order} onOrderChange={onOrderChange} />
      </section>
    </div>
  );
}
