export type MessageDirection = "inbound" | "outbound";
export type SenderType = "customer" | "merchant" | "ai" | "system";
export type MessageType = "text" | "image" | "voice" | "document";

export interface Message {
  id: string;
  merchant_id: string;
  conversation_id: string;
  platform_message_id: string | null;
  direction: MessageDirection;
  sender_type: SenderType;
  content: string;
  message_type: MessageType;
  media_url: string | null;
  has_order_signal: boolean;
  ai_processed: boolean;
  ai_result: Record<string, unknown> | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  merchant_id: string;
  customer_id: string;
  platform: string;
  platform_chat_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  merchant_id: string;
  platform: string;
  platform_user_id: string;
  name: string | null;
  phone: string | null;
  delivery_address: string | null;
  total_orders: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
