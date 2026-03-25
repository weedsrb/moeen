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
