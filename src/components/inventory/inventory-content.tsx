"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Package, Trash2, RotateCcw, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ProductGrid } from "./product-grid";
import { ProductTable } from "./product-table";

const ProductForm = dynamic(
  () => import("./product-form").then((m) => m.ProductForm),
  { ssr: false, loading: () => null },
);
const ImportDialog = dynamic(
  () => import("./import/import-dialog").then((m) => m.ImportDialog),
  { ssr: false, loading: () => null },
);
import {
  InventoryToolbar,
  type SortOption,
  type FilterStatus,
  type ViewMode,
  type VisibilityFilter,
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
  const [visibility, setVisibility] = useState<VisibilityFilter>("active");
  const [selectMode, setSelectMode] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");

  const viewingInactive = visibility === "inactive";

  async function refreshProducts(vis: VisibilityFilter = visibility) {
    const res = await fetch(
      `/api/products${vis === "inactive" ? "?active=false" : ""}`
    );
    const data = await res.json();
    if (data.products) setProducts(data.products);
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleSelectMode() {
    setSelectMode((on) => {
      if (on) clearSelection(); // leaving select mode clears the selection
      return !on;
    });
  }

  function handleVisibilityChange(v: VisibilityFilter) {
    if (v === visibility) return;
    setVisibility(v);
    clearSelection();
    refreshProducts(v);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Archive (is_active:false) or reactivate (true) the current selection.
  async function applyBulkStatus(isActive: boolean) {
    setWorking(true);
    setActionError("");
    try {
      const res = await fetch("/api/products/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds], is_active: isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Something went wrong.");
        return;
      }
      setConfirmOpen(false);
      clearSelection();
      await refreshProducts();
    } catch {
      setActionError("Something went wrong.");
    } finally {
      setWorking(false);
    }
  }

  // Permanently delete the selection. Products referenced by orders can't be
  // hard-deleted; the API returns them as `blocked` and we surface guidance.
  async function applyBulkDelete() {
    setWorking(true);
    setActionError("");
    try {
      const res = await fetch("/api/products/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Something went wrong.");
        return;
      }
      setConfirmOpen(false);
      const blocked: string[] = data.blocked ?? [];
      await refreshProducts();
      if (blocked.length > 0) {
        const n = blocked.length;
        const noun = n === 1 ? "product is" : "products are";
        if (viewingInactive) {
          setActionError(`${n} ${noun} used in orders and can't be permanently deleted.`);
          clearSelection();
        } else {
          // Keep the blocked ones selected so the merchant can deactivate them.
          setActionError(`${n} ${noun} used in orders and can only be deactivated, not deleted.`);
          setSelectedIds(new Set(blocked));
        }
      } else {
        clearSelection();
        setActionError("");
      }
    } catch {
      setActionError("Something went wrong.");
    } finally {
      setWorking(false);
    }
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

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allSelected =
        filtered.length > 0 && filtered.every((p) => prev.has(p.id));
      return allSelected ? new Set() : new Set(filtered.map((p) => p.id));
    });
  }

  const merchantCurrency = products[0]?.currency ?? "ILS";
  const selectedCount = selectedIds.size;

  return (
    <>
      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        visibility={visibility}
        onVisibilityChange={handleVisibilityChange}
        view={view}
        onViewChange={setView}
        selectMode={selectMode}
        onToggleSelectMode={toggleSelectMode}
        onAddProduct={handleAddProduct}
        onImport={() => setImportOpen(true)}
      />

      {selectMode && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">
              {selectedCount > 0 ? `${selectedCount} selected` : "Select items"}
            </span>
            {filtered.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="h-7"
              >
                {filtered.every((p) => selectedIds.has(p.id))
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actionError && (
              <span className="max-w-[18rem] text-xs text-destructive">
                {actionError}
              </span>
            )}
            {viewingInactive ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedCount === 0 || working}
                onClick={() => applyBulkStatus(true)}
                className="h-7"
              >
                {working ? (
                  <Loader2 className="me-1 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="me-1 h-4 w-4" />
                )}
                Reactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={selectedCount === 0 || working}
                onClick={() => applyBulkStatus(false)}
                className="h-7"
              >
                {working ? (
                  <Loader2 className="me-1 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="me-1 h-4 w-4" />
                )}
                Deactivate
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedCount === 0}
              onClick={() => {
                setActionError("");
                setConfirmOpen(true);
              }}
              className="h-7"
            >
              <Trash2 className="me-1 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">
            {viewingInactive
              ? "No archived products"
              : products.length === 0
                ? "No products yet"
                : "No matching products"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {viewingInactive
              ? "Deactivated products will appear here, where you can reactivate them."
              : products.length === 0
                ? "Add your first product to get started. Your catalog will be used by AI to match customer orders."
                : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : view === "grid" ? (
        <ProductGrid
          products={filtered}
          merchantThreshold={merchantThreshold}
          selectedIds={selectedIds}
          onToggleSelect={selectMode ? toggleSelect : undefined}
        />
      ) : (
        <ProductTable
          products={filtered}
          merchantThreshold={merchantThreshold}
          selectedIds={selectedIds}
          onToggleSelect={selectMode ? toggleSelect : undefined}
          onToggleAll={selectMode ? toggleSelectAll : undefined}
        />
      )}

      <ProductForm
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
        merchantId={merchantId}
        onSuccess={refreshProducts}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        merchantCurrency={merchantCurrency}
        onSuccess={refreshProducts}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Permanently delete {selectedCount}{" "}
              {selectedCount === 1 ? "product" : "products"}?
            </DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Any of these that appear in existing
              orders can&apos;t be deleted and will be kept — deactivate those
              instead to hide them from your catalog. If you just want to hide a
              product, use Deactivate.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <p className="text-sm text-destructive">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={working}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={applyBulkDelete}
              disabled={working}
            >
              {working && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
