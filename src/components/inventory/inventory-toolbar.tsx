"use client";

import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  FileSpreadsheet,
  SlidersHorizontal,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
export type VisibilityFilter = "active" | "inactive";

const SORT_LABELS: Record<SortOption, string> = {
  "name-asc": "Name A-Z",
  "name-desc": "Name Z-A",
  "price-asc": "Price Low-High",
  "price-desc": "Price High-Low",
  "quantity-asc": "Qty Low-High",
  "quantity-desc": "Qty High-Low",
};

const STATUS_LABELS: Record<FilterStatus, string> = {
  all: "All",
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
};

interface InventoryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: FilterStatus;
  onFilterChange: (value: FilterStatus) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  visibility: VisibilityFilter;
  onVisibilityChange: (value: VisibilityFilter) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  onAddProduct: () => void;
  onImport: () => void;
}

export function InventoryToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  visibility,
  onVisibilityChange,
  view,
  onViewChange,
  selectMode,
  onToggleSelectMode,
  onAddProduct,
  onImport,
}: InventoryToolbarProps) {
  // Highlight the Filter button when anything is narrowed from its default.
  const filtersActive =
    filter !== "all" || visibility !== "active" || sort !== "name-asc";

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
        {/* Consolidated Filters menu (Status / Sort / Show as side submenus) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              filtersActive && "border-foreground/30"
            )}
          >
            <SlidersHorizontal className="me-2 h-4 w-4" />
            Filter
            {filtersActive && (
              <span className="ms-1.5 h-1.5 w-1.5 rounded-full bg-foreground" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Status
                <span className="ms-auto text-xs text-muted-foreground">
                  {STATUS_LABELS[filter]}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={filter}
                  onValueChange={(v) => v && onFilterChange(v as FilterStatus)}
                >
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="in_stock">
                    In Stock
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="low_stock">
                    Low Stock
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="out_of_stock">
                    Out of Stock
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Sort
                <span className="ms-auto text-xs text-muted-foreground">
                  {SORT_LABELS[sort]}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(v) => v && onSortChange(v as SortOption)}
                >
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                    <DropdownMenuRadioItem key={opt} value={opt}>
                      {SORT_LABELS[opt]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Show
                <span className="ms-auto text-xs text-muted-foreground">
                  {visibility === "active" ? "Active" : "Inactive"}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={visibility}
                  onValueChange={(v) =>
                    v && onVisibilityChange(v as VisibilityFilter)
                  }
                >
                  <DropdownMenuRadioItem value="active">
                    Active
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="inactive">
                    Inactive (archived)
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Toggle */}
        <div className="flex h-8 items-center gap-0.5 rounded-lg border border-input p-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => onViewChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => onViewChange("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Select mode toggle — checkboxes only appear while this is on */}
        <Button
          variant={selectMode ? "secondary" : "outline"}
          onClick={onToggleSelectMode}
        >
          <ListChecks className="me-2 h-4 w-4" />
          {selectMode ? "Done" : "Select"}
        </Button>

        {/* Import from spreadsheet */}
        <Button variant="outline" onClick={onImport}>
          <FileSpreadsheet className="me-2 h-4 w-4" />
          Import
        </Button>

        {/* Add Product */}
        <Button onClick={onAddProduct}>
          <Plus className="me-2 h-4 w-4" />
          Add Product
        </Button>
      </div>
    </div>
  );
}
