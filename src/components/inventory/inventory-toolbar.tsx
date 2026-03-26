"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import type { StockStatus } from "@/types/product";

export type SortOption =
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "quantity-asc"
  | "quantity-desc";

export type FilterStatus = "all" | StockStatus;
export type ViewMode = "grid" | "list";

interface InventoryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterStatus;
  onFilterChange: (value: FilterStatus) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  onAddProduct: () => void;
}

export function InventoryToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  onAddProduct,
}: InventoryToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search products..."
          className="ps-8"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {/* Filter */}
        <Select
          value={filter}
          onValueChange={(v) => v && onFilterChange(v as FilterStatus)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="low_stock">Low Stock</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={sort}
          onValueChange={(v) => v && onSortChange(v as SortOption)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name A-Z</SelectItem>
            <SelectItem value="name-desc">Name Z-A</SelectItem>
            <SelectItem value="price-asc">Price Low-High</SelectItem>
            <SelectItem value="price-desc">Price High-Low</SelectItem>
            <SelectItem value="quantity-asc">Qty Low-High</SelectItem>
            <SelectItem value="quantity-desc">Qty High-Low</SelectItem>
          </SelectContent>
        </Select>

        {/* View Toggle */}
        <div className="flex border rounded-lg">
          <Button
            variant={view === "grid" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => onViewChange("grid")}
            className="rounded-e-none"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => onViewChange("list")}
            className="rounded-s-none"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Add Product */}
        <Button onClick={onAddProduct}>
          <Plus className="me-2 h-4 w-4" />
          Add Product
        </Button>
      </div>
    </div>
  );
}
