"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/utils/inventory";
import type { OrderCustomerLite } from "@/types/order";
import type { Product } from "@/types/product";

interface ManualOrderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ManualItem {
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
}

type Step = "customer" | "items" | "details";

export function ManualOrderSheet({ open, onOpenChange }: ManualOrderSheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("customer");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<OrderCustomerLite[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<OrderCustomerLite | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<ManualItem[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState<"ILS" | "USD" | "JOD">("ILS");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    async function loadCustomers() {
      const response = await fetch(
        `/api/customers?q=${encodeURIComponent(customerSearch)}`
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        customers?: OrderCustomerLite[];
      };
      setCustomers(data.customers ?? []);
    }

    const timer = window.setTimeout(loadCustomers, 200);
    return () => window.clearTimeout(timer);
  }, [customerSearch, open]);

  useEffect(() => {
    if (!open) return;

    async function loadProducts() {
      const response = await fetch("/api/products");
      if (!response.ok) return;
      const data = (await response.json()) as { products?: Product[] };
      setProducts(data.products ?? []);
    }

    loadProducts();
  }, [open]);

  const filteredProducts = useMemo(() => {
    const normalized = productSearch.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(normalized)
    );
  }, [productSearch, products]);

  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  function reset() {
    setStep("customer");
    setCustomerSearch("");
    setSelectedCustomer(null);
    setShowNewCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setProductSearch("");
    setItems([]);
    setDeliveryAddress("");
    setNotes("");
    setCurrency("ILS");
    setError(null);
  }

  async function createCustomer() {
    setError(null);
    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCustomerName,
        phone: newCustomerPhone,
        delivery_address: newCustomerAddress || undefined,
      }),
    });

    const data = (await response.json()) as {
      customer?: OrderCustomerLite;
      error?: string;
    };

    if (!response.ok || !data.customer) {
      setError(data.error ?? "Failed to add customer");
      return;
    }

    setSelectedCustomer(data.customer);
    setDeliveryAddress(newCustomerAddress);
    setShowNewCustomer(false);
    setStep("items");
  }

  function addProduct(product: Product) {
    setCurrency(product.currency as "ILS" | "USD" | "JOD");
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

  function updateItem(index: number, patch: Partial<ManualItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit() {
    if (!selectedCustomer || items.length === 0) return;

    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: selectedCustomer.id,
        delivery_address: deliveryAddress || null,
        notes: notes || null,
        currency,
        items,
      }),
    });

    const data = (await response.json()) as {
      order_id?: string;
      error?: string;
    };

    setSubmitting(false);

    if (!response.ok || !data.order_id) {
      setError(data.error ?? "Failed to create order");
      return;
    }

    onOpenChange(false);
    reset();
    router.push(`/orders/${data.order_id}`);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New manual order</SheetTitle>
          <SheetDescription>
            Create an order from a customer, products, and delivery details.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <div className="flex gap-2 text-xs">
            {(["customer", "items", "details"] as Step[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-md px-2 py-1 capitalize ${
                  step === item
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
                onClick={() => setStep(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {step === "customer" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Search customer</Label>
                <Input
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Name or phone"
                />
              </div>

              <div className="space-y-2">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-start text-sm hover:bg-muted"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setStep("items");
                    }}
                  >
                    <span>{customer.name ?? "Unnamed customer"}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewCustomer((current) => !current)}
              >
                + Add new customer
              </Button>

              {showNewCustomer && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={newCustomerPhone}
                      onChange={(event) => setNewCustomerPhone(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery address</Label>
                    <Input
                      value={newCustomerAddress}
                      onChange={(event) =>
                        setNewCustomerAddress(event.target.value)
                      }
                    />
                  </div>
                  <Button type="button" onClick={createCustomer}>
                    Save customer
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "items" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                Customer:{" "}
                <span className="font-medium">
                  {selectedCustomer?.name ?? "None selected"}
                </span>
              </div>

              <div className="space-y-2">
                <Label>Product picker</Label>
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search products"
                />
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{product.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatPrice(product.price, product.currency)}
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => addProduct(product)}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={`${item.product_id ?? item.product_name}-${index}`}
                    className="space-y-2 rounded-lg border border-border p-3"
                  >
                    <Input
                      value={item.product_name}
                      onChange={(event) =>
                        updateItem(index, { product_name: event.target.value })
                      }
                    />
                    <Input
                      value={item.variant ?? ""}
                      onChange={(event) =>
                        updateItem(index, {
                          variant: event.target.value || null,
                        })
                      }
                      placeholder="Variant"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(index, {
                            quantity: Number(event.target.value),
                          })
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_price}
                        onChange={(event) =>
                          updateItem(index, {
                            unit_price: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">
                        {formatPrice(item.quantity * item.unit_price, currency)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => removeItem(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">
                  Total {formatPrice(total, currency)}
                </span>
                <Button
                  type="button"
                  disabled={!selectedCustomer || items.length === 0}
                  onClick={() => setStep("details")}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) =>
                    v && setCurrency(v as "ILS" | "USD" | "JOD")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">ILS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="JOD">JOD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delivery address</Label>
                <Textarea
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">
                  {formatPrice(total, currency)}
                </span>
                <Button type="button" disabled={submitting} onClick={submit}>
                  {submitting ? "Creating..." : "Create order"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
