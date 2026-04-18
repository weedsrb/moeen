"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Package } from "lucide-react";
import { ProductGrid } from "./product-grid";
import { ProductTable } from "./product-table";

const ProductForm = dynamic(
  () => import("./product-form").then((m) => m.ProductForm),
  { ssr: false, loading: () => null },
);
import {
  InventoryToolbar,
  type SortOption,
  type FilterStatus,
  type ViewMode,
} from "./inventory-toolbar";
import type { Product } from "@/types/product";
import { getStockStatus, getAvailableQuantity } from "@/lib/utils/inventory";

interface InventoryContentProps {
  initialProducts: Product[];
  merchantId: string;
  merchantThreshold: number;
}

export function InventoryContent({
  initialProducts,
  merchantId,
  merchantThreshold,
}: InventoryContentProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [view, setView] = useState<ViewMode>("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | undefined>();

  async function refreshProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    if (data.products) setProducts(data.products);
  }

  const filtered = useMemo(() => {
    let result = products;

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.alternative_names.some((n) => n.toLowerCase().includes(q))
      );
    }

    // Filter by status
    if (filter !== "all") {
      result = result.filter(
        (p) => getStockStatus(p, merchantThreshold) === filter
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "quantity-asc":
          return getAvailableQuantity(a) - getAvailableQuantity(b);
        case "quantity-desc":
          return getAvailableQuantity(b) - getAvailableQuantity(a);
        default:
          return 0;
      }
    });

    return result;
  }, [products, search, filter, sort, merchantThreshold]);

  function handleAddProduct() {
    setEditProduct(undefined);
    setFormOpen(true);
  }

  return (
    <>
      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
        onAddProduct={handleAddProduct}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">
            {products.length === 0 ? "No products yet" : "No matching products"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {products.length === 0
              ? "Add your first product to get started. Your catalog will be used by AI to match customer orders."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : view === "grid" ? (
        <ProductGrid
          products={filtered}
          merchantThreshold={merchantThreshold}
        />
      ) : (
        <ProductTable
          products={filtered}
          merchantThreshold={merchantThreshold}
        />
      )}

      <ProductForm
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
        merchantId={merchantId}
        onSuccess={refreshProducts}
      />
    </>
  );
}
