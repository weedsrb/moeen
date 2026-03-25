export type FlagPriority = "critical" | "medium" | "low";

export type FlagCategory =
  | "out_of_stock"
  | "customer_waiting"
  | "ai_low_confidence"
  | "human_requested"
  | "unusual_volume"
  | "ai_unavailable"
  | "stale_order";

export interface Flag {
  id: string;
  merchant_id: string;
  order_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  priority: FlagPriority;
  category: FlagCategory;
  title: string;
  description: string | null;
  recommended_action: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}
