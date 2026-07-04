export const PRODUCT_COLUMNS =
  "id, merchant_id, name, alternative_names, description, price, currency, image_url, quantity_total, quantity_reserved, low_stock_threshold, variants, is_active, instagram_post_id, created_at, updated_at" as const;

export const MESSAGE_COLUMNS =
  "id, merchant_id, conversation_id, platform_message_id, direction, sender_type, content, message_type, media_url, has_order_signal, ai_processed, created_at" as const;

export const CONVERSATION_COLUMNS =
  "id, merchant_id, customer_id, platform, platform_chat_id, last_message_at, last_message_preview, unread_count, created_at, updated_at" as const;

export const CONVERSATION_WITH_CUSTOMER_COLUMNS =
  `${CONVERSATION_COLUMNS}, customers(name, platform_user_id, avatar_url)` as const;

export const FLAG_COLUMNS =
  "id, merchant_id, order_id, conversation_id, message_id, priority, category, title, description, recommended_action, is_resolved, resolved_at, created_at" as const;
