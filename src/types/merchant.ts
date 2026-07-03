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
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_verify_token: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_display_phone: string | null;
  whatsapp_connected: boolean;
  instagram_connected: boolean;
  instagram_user_id: string | null;
  instagram_username: string | null;
  instagram_access_token: string | null;
  instagram_token_expires_at: string | null;
  ai_confidence_threshold: number;
  ai_auto_clarify: boolean;
  ai_handoff_message: string;
  ai_persona_name: string | null;
  ai_tone: string;
  ai_greeting: string | null;
  ai_business_context: string | null;
  ai_custom_instructions: string | null;
  ai_response_language: string;
  ai_auto_acknowledge: boolean;
  ai_acknowledge_template: string | null;
  low_stock_threshold: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerchantFAQ {
  id: string;
  merchant_id: string;
  question: string;
  answer: string;
  display_order: number;
  created_at: string;
}
