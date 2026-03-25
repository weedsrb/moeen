export type OrderStatus =
  | "incoming"
  | "pending"
  | "confirmed"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface Order {
  id: string;
  merchant_id: string;
  customer_id: string;
  conversation_id: string;
  order_number: string;
  status: OrderStatus;
  delivery_address: string | null;
  subtotal: number;
  total: number;
  currency: string;
  notes: string | null;
  ai_confidence: number | null;
  ai_extracted: boolean;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
}

export interface OrderItem {
  id: string;
  merchant_id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  ai_confidence: number | null;
  ai_matched: boolean;
}

export interface OrderTimelineEntry {
  id: string;
  merchant_id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: "merchant" | "ai" | "system";
  note: string | null;
  created_at: string;
}
