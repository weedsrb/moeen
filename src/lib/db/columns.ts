export const PRODUCT_COLUMNS =
  "id, merchant_id, name, alternative_names, description, price, currency, image_url, quantity_total, quantity_reserved, low_stock_threshold, variants, is_active, instagram_post_id, created_at, updated_at" as const;

export const MESSAGE_COLUMNS =
  "id, merchant_id, conversation_id, platform_message_id, direction, sender_type, content, message_type, media_url, reply_to_message_id, has_order_signal, ai_processed, created_at" as const;

export const CONVERSATION_COLUMNS =
  "id, merchant_id, customer_id, platform, platform_chat_id, last_message_at, last_message_preview, unread_count, automation_mode, takeover_reason, taken_over_at, resumed_at, created_at, updated_at" as const;

export const CONVERSATION_WITH_CUSTOMER_COLUMNS =
  `${CONVERSATION_COLUMNS}, customers(name, platform_user_id, avatar_url)` as const;

// Conversation list on the Messages page: adds customer phone (for search) and
// the conversation's orders' statuses (for the order-status filter).
export const CONVERSATION_LIST_COLUMNS =
  `${CONVERSATION_COLUMNS}, customers(name, platform_user_id, avatar_url, phone), orders(status)` as const;

export const FLAG_COLUMNS =
  "id, merchant_id, order_id, conversation_id, message_id, priority, category, title, description, recommended_action, is_resolved, resolved_at, created_at" as const;
