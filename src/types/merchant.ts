export interface Merchant {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string | null;
  city: string | null;
  phone: string | null;
  logo_url: string | null;
  onboarding_completed: boolean;
  plan: string;
  monthly_order_count: number;
  created_at: string;
  updated_at: string;
}

export interface MerchantSettings {
  id: string;
  merchant_id: string;
  telegram_bot_token: string | null;
  telegram_connected: boolean;
  whatsapp_connected: boolean;
  ai_confidence_threshold: number;
  ai_auto_clarify: boolean;
  ai_handoff_message: string;
  low_stock_threshold: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}
