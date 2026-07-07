export type OrderStatus =
  | "collecting"
  | "ai_proposal"
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

export interface OrderCustomerLite {
  id: string;
  name: string | null;
  phone: string | null;
  platform: string;
}

export interface OrderWithCustomer extends Order {
  customers: OrderCustomerLite | null;
  order_items: OrderItem[];
}

export interface OrderDetail extends OrderWithCustomer {
  order_timeline: OrderTimelineEntry[];
}

export interface OrderBoardColumn {
  status: OrderStatus;
  orders: OrderWithCustomer[];
}

export const ORDER_BOARD_STATUSES: OrderStatus[] = [
  "collecting",
  "ai_proposal",
  "incoming",
  "pending",
  "confirmed",
  "out_for_delivery",
  "delivered",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  collecting: "Collecting",
  ai_proposal: "AI Proposal",
  incoming: "Incoming",
  pending: "Pending",
  confirmed: "Confirmed",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ORDER_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // Collecting orders are still being taken by the AI in chat. The merchant can
  // take over (-> incoming, finalizing it themselves) or cancel
  // (-> cancelled). No status transitions INTO collecting.
  collecting: ["incoming", "cancelled"],
  // Proposals are only ever created by the AI pipeline. The merchant either
  // confirms (-> incoming, joining the live pipeline) or rejects
  // (-> cancelled). No status transitions INTO ai_proposal.
  ai_proposal: ["incoming", "cancelled"],
  incoming: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled", "incoming"],
  confirmed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_ALLOWED_TRANSITIONS[from].includes(to);
}
