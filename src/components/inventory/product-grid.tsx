import { ProductCard } from "./product-card";
import type { Product } from "@/types/product";

interface ProductGridProps {
  products: Product[];
  merchantThreshold?: number;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function ProductGrid({
  products,
  merchantThreshold,
  selectedIds,
  onToggleSelect,
}: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product, index) => (
        <div
          key={product.id}
          className="animate-fade-up"
          style={{ animationDelay: `${Math.min(index, 20) * 50}ms` }}
        >
          <ProductCard
            product={product}
            merchantThreshold={merchantThreshold}
            selected={selectedIds?.has(product.id) ?? false}
            onToggleSelect={onToggleSelect}
          />
        </div>
      ))}
    </div>
  );
}
