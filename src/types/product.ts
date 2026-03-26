export interface ProductVariant {
  name: string;
  options: string[];
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  alternative_names: string[];
  description: string | null;
  price: number;
  currency: string;
  image_url: string | null;
  quantity_total: number;
  quantity_reserved: number;
  low_stock_threshold: number | null;
  variants: ProductVariant[] | null;
  is_active: boolean;
  instagram_post_id: string | null;
  created_at: string;
  updated_at: string;
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface StockAdjustment {
  id: string;
  merchant_id: string;
  product_id: string;
  adjustment: number;
  reason: string;
  previous_quantity: number;
  new_quantity: number;
  created_at: string;
}
