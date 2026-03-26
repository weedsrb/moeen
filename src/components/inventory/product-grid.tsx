"use client";

import { motion } from "framer-motion";
import { ProductCard } from "./product-card";
import type { Product } from "@/types/product";

interface ProductGridProps {
  products: Product[];
  merchantThreshold?: number;
}

export function ProductGrid({ products, merchantThreshold }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product, index) => (
        <motion.div
          key={product.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
        >
          <ProductCard
            product={product}
            merchantThreshold={merchantThreshold}
          />
        </motion.div>
      ))}
    </div>
  );
}
