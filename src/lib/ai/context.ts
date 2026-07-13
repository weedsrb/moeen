import type { SupabaseClient } from "@supabase/supabase-js";
import type { SenderType } from "@/types/message";
import type { AssembledContext, CompressedProduct } from "./types";
import type { CollectionState } from "./order-creator";
import { canAcceptConfirmation } from "./confirmation";

/**
 * assembleContext's return type, augmented with the conversation's open
 * `collecting` order so the pipeline can maintain a multi-turn draft without
 * re-querying. Kept local (extends AssembledContext) so the shared type in
 * types.ts — owned by the Gemini contract — stays untouched.
 */
export interface AssembledContextWithOrder extends AssembledContext {
  /**
   * Readable rendering of the in-progress `collecting` order (items, delivery
   * address, running total) fed to Gemini as ORDER_SO_FAR, or "(no order yet)".
   */
  orderSoFar: string;
  /** True when the conversation has an open `collecting` order. */
  hasOpenCollectingOrder: boolean;
  /** The open `collecting` order's id, or null — so the pipeline can upsert /
   *  promote it without re-querying. */
  collectingOrderId: string | null;
  /** Persisted working state for confirmation and customer-detail continuity. */
  collectionState: CollectionState | null;
  /** True only when a persisted pending readback is the latest AI outbound. */
  canAcceptConfirmation: boolean;
}

/** Shape of the open collecting order row (untyped client → cast locally). */
interface CollectingOrderRow {
  id: string;
  delivery_address: string | null;
  subtotal: number | null;
  total: number | null;
  currency: string | null;
  ai_collection_state: CollectionState | null;
  order_items:
    | Array<{
        product_id: string | null;
        product_name: string;
        variant: string | null;
        quantity: number;
        unit_price: number;
        subtotal: number;
      }>
    | null;
}

/**
 * Assemble the full context needed for a Gemini API call:
 * - Conversation history (last 6 messages)
 * - Compressed product catalog
 * - Merchant AI settings (system + merchant layer)
 * - Merchant context string (injected into Gemini prompt)
 * - Last outbound message sender type (for reply-to-AI detection)
 * - The conversation's open `collecting` order (rendered as ORDER_SO_FAR)
 */
export async function assembleContext(
  supabase: SupabaseClient,
  merchantId: string,
  conversationId: string,
  customerId: string,
  messageContent: string,
  excludeMessageIds: string[] = []
): Promise<AssembledContextWithOrder> {
  // Fetch in parallel: messages, products, settings, business name, FAQ, and
  // the single open collecting order (+ its items) for this conversation.
  const [
    messagesResult,
    productsResult,
    settingsResult,
    merchantResult,
    faqResult,
    collectingResult,
    customerResult,
  ] = await Promise.all([
      supabase
        .from("messages")
        .select("id, content, direction, sender_type")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(12),

      supabase
        .from("products")
        .select(
          "id, name, alternative_names, price, currency, variants, quantity_total, quantity_reserved"
        )
        .eq("merchant_id", merchantId)
        .eq("is_active", true),

      supabase
        .from("merchant_settings")
        .select("ai_confidence_threshold, ai_auto_clarify, ai_handoff_message, ai_persona_name, ai_tone, ai_greeting, ai_business_context, ai_custom_instructions, ai_response_language, ai_auto_acknowledge, ai_acknowledge_template")
        .eq("merchant_id", merchantId)
        .single(),

      supabase
        .from("merchants")
        .select("business_name")
        .eq("id", merchantId)
        .single(),

      supabase
        .from("merchant_faq")
        .select("question, answer")
        .eq("merchant_id", merchantId)
        .order("display_order"),

      supabase
        .from("orders")
        .select(
          "id, delivery_address, subtotal, total, currency, ai_collection_state, order_items(product_id, product_name, variant, quantity, unit_price, subtotal)"
        )
        .eq("merchant_id", merchantId)
        .eq("conversation_id", conversationId)
        .eq("status", "collecting")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("customers")
        .select("name, phone, delivery_address")
        .eq("id", customerId)
        .eq("merchant_id", merchantId)
        .single(),
    ]);

  const failures = [
    ["messages", messagesResult.error],
    ["products", productsResult.error],
    ["settings", settingsResult.error],
    ["merchant", merchantResult.error],
    ["faq", faqResult.error],
    ["collecting_order", collectingResult.error],
    ["customer", customerResult.error],
  ].filter((entry) => entry[1]);
  if (failures.length > 0) {
    const detail = failures
      .map(([source, error]) => `${source}: ${(error as { message: string }).message}`)
      .join("; ");
    throw new Error(`AI context unavailable (${detail})`);
  }

  // --- Conversation history ---
  const excludedIds = new Set(excludeMessageIds);
  const messages = (messagesResult.data ?? [])
    .filter((message) => !excludedIds.has(message.id))
    .reverse()
    .slice(-6); // oldest first, current burst excluded
  const conversationHistory = messages
    .map((msg) => {
      const label = senderLabel(msg.sender_type as SenderType, msg.direction as string);
      return `${label}: ${msg.content}`;
    })
    .join("\n");

  // --- Last outbound sender type (for reply-to-AI detection) ---
  const lastOutbound = messages
    .filter((m) => m.direction === "outbound")
    .at(-1);
  const lastOutboundSenderType = (lastOutbound?.sender_type as SenderType) ?? null;

  // --- Compressed catalog ---
  const rawProducts = productsResult.data ?? [];
  let products = rawProducts;

  const collectingOrder =
    (collectingResult.data as CollectingOrderRow | null) ?? null;
  const openProductIds = new Set(
    (collectingOrder?.order_items ?? [])
      .map((item) => item.product_id)
      .filter((id): id is string => Boolean(id))
  );

  // If catalog is large, filter to products matching message words. Both the
  // message tokens and the product name/alt-names are run through
  // normalizeForMatch first, so Arabic diacritics, alef/hamza/yaa/taa-marbuta
  // variants, and Arabizi punctuation/digit quirks don't silently drop real
  // matches. Matched AND fallback sets are capped so a broad match can't blow
  // the token budget with hundreds of products.
  if (products.length > 50) {
    const messageTokens = tokenize(normalizeForMatch(messageContent));
    const matched = products.filter((p) => {
      const productTokens = tokenize(
        normalizeForMatch([p.name, ...(p.alternative_names ?? [])].join(" "))
      );
      return messageTokens.some((mt) =>
        productTokens.some((pt) => tokensMatch(mt, pt))
      );
    });
    // Products already present in the open order are mandatory context even
    // when the latest message is only "yes", an address, or another detail.
    const mandatory = rawProducts.filter((p) => openProductIds.has(p.id));
    const candidates = matched.length > 0 ? matched : rawProducts;
    const unique = new Map(
      [...mandatory, ...candidates].map((product) => [product.id, product])
    );
    products = [...unique.values()].slice(0, MAX_FILTERED_PRODUCTS);
  }

  const catalog: CompressedProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    alt: p.alternative_names ?? [],
    price: p.price,
    variants: compressVariants(p.variants),
    stock: (p.quantity_total ?? 0) - (p.quantity_reserved ?? 0),
  }));

  // --- Currency (from first product or default) ---
  const currency = rawProducts[0]?.currency ?? "ILS";

  // --- Settings ---
  const s = settingsResult.data;
  const settings = {
    confidenceThreshold: s?.ai_confidence_threshold ?? 0.7,
    autoClarity: s?.ai_auto_clarify ?? true,
    handoffMessage: s?.ai_handoff_message ?? "A team member will assist you shortly.",
    currency,
    personaName: s?.ai_persona_name ?? null,
    tone: s?.ai_tone ?? "friendly",
    greeting: s?.ai_greeting ?? null,
    businessContext: s?.ai_business_context ?? null,
    customInstructions: s?.ai_custom_instructions ?? null,
    responseLanguage: s?.ai_response_language ?? "auto",
    autoAcknowledge: s?.ai_auto_acknowledge ?? false,
    acknowledgeTemplate: s?.ai_acknowledge_template ?? null,
  };

  // --- Merchant context string (merchant layer for Gemini prompt) ---
  const businessName = merchantResult.data?.business_name ?? "This business";
  const faq = faqResult.data ?? [];
  const merchantContext = buildMerchantContext(businessName, settings, faq);

  const customerProfile = {
    name: customerResult.data?.name ?? null,
    phone: customerResult.data?.phone ?? null,
    deliveryAddress: customerResult.data?.delivery_address ?? null,
  };
  const customerContext = [
    `Name: ${customerProfile.name ?? "(unknown)"}`,
    `Phone: ${customerProfile.phone ?? "(unknown)"}`,
    `Known delivery address: ${customerProfile.deliveryAddress ?? "(unknown)"}`,
  ].join("\n");

  // --- Open collecting order (the running "order so far") ---
  const collectingOrderId = collectingOrder?.id ?? null;
  const hasOpenCollectingOrder = collectingOrderId !== null;
  const collectionState = collectingOrder?.ai_collection_state ?? null;
  const confirmationAllowed = canAcceptConfirmation(collectionState, {
    senderType: (lastOutbound?.sender_type as SenderType) ?? null,
    content: lastOutbound?.content ?? null,
  });
  const orderSoFar = collectingOrder
    ? renderOrderSoFar(collectingOrder, currency)
    : "(no order yet)";

  return {
    conversationHistory,
    catalog,
    customerContext,
    customerProfile,
    settings,
    merchantContext,
    lastOutboundSenderType,
    orderSoFar,
    hasOpenCollectingOrder,
    collectingOrderId,
    collectionState,
    canAcceptConfirmation: confirmationAllowed,
  };
}

/**
 * Render an open `collecting` order into the plain-text ORDER_SO_FAR block the
 * Gemini prompt merges the new message into. Lists each line item with quantity,
 * variant, unit price and subtotal, plus the delivery address and running total.
 */
function renderOrderSoFar(
  order: CollectingOrderRow,
  fallbackCurrency: string
): string {
  const currency = order.currency ?? fallbackCurrency;
  const items = order.order_items ?? [];
  const lines: string[] = [];

  if (items.length === 0) {
    lines.push("Items: (none confirmed yet)");
  } else {
    lines.push("Items:");
    for (const it of items) {
      const variant = it.variant ? ` (${it.variant})` : "";
      lines.push(
        `- ${it.quantity}x ${it.product_name}${variant} @ ${it.unit_price} = ${it.subtotal} ${currency}`
      );
    }
  }

  lines.push(
    `Delivery address: ${order.delivery_address ?? "(not provided yet)"}`
  );
  lines.push(`Running total: ${order.total ?? 0} ${currency}`);
  return lines.join("\n");
}

/**
 * Upper bound on how many products the large-catalog pre-filter forwards to
 * Gemini — applied to BOTH the matched set and the no-match fallback so a broad
 * match (e.g. a single common word) can't send hundreds of products and blow
 * the token budget.
 */
const MAX_FILTERED_PRODUCTS = 50;

/**
 * Total character budget for the FAQ block injected into the merchant context.
 * Rows are appended in order until this cumulative budget is reached; the rest
 * are omitted with a short note. Bounds prompt bloat regardless of row count.
 */
const FAQ_CHAR_BUDGET = 4000;

/**
 * Normalize a string for fuzzy catalog matching. Dependency-free, pure string
 * ops. Raises recall for Arabic/dialect/Arabizi by folding away the cosmetic
 * differences that break naive substring matching:
 *   - lowercases (Latin)
 *   - strips Arabic diacritics (harakat/tanwin/shadda/sukun), the superscript
 *     alef, and the tatweel elongation character
 *   - unifies alef/hamza variants (آأإٱ → ا, ؤ → و, ئ → ي, bare ء dropped)
 *   - unifies alef-maksura (ى → ي) and taa-marbuta (ة → ه)
 *   - drops a leading Arabizi glottal digit ("2ahwe" → "ahwe", "3ala" → "ala")
 *   - replaces common Arabic/Latin punctuation with spaces and collapses runs
 * Used ONLY to compare tokens for the catalog pre-filter — the catalog text
 * actually sent to Gemini is left untouched.
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "") // diacritics, superscript alef, tatweel
    .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/ء/g, "") // bare hamza ء → drop
    .replace(/ى/g, "ي") // ى → ي (alef maksura)
    .replace(/ة/g, "ه") // ة → ه (taa marbuta)
    .replace(/[.,!?;:'"«»()\[\]{}\-_\/\\،؛؟…]/g, " ") // punctuation → space
    .replace(/(^|\s)[23]([a-z])/g, "$1$2") // leading Arabizi glottal digit
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split an already-normalized string into comparison tokens, dropping
 * single-character noise (matches the original length>1 guard).
 */
function tokenize(normalized: string): string[] {
  return normalized.split(/\s+/).filter((t) => t.length > 1);
}

/**
 * Conservative token comparison used by the catalog pre-filter. Both inputs
 * are already normalized. Matches on equality, substring containment either
 * direction, or a shared prefix (min length 3 to avoid noisy short matches).
 */
function tokensMatch(messageToken: string, productToken: string): boolean {
  if (messageToken === productToken) return true;
  if (productToken.includes(messageToken) || messageToken.includes(productToken)) {
    return true;
  }
  const minLen = Math.min(messageToken.length, productToken.length);
  if (minLen >= 3) {
    return (
      productToken.startsWith(messageToken) || messageToken.startsWith(productToken)
    );
  }
  return false;
}

/**
 * Build the merchant-layer block injected into the Gemini system prompt.
 * The system extraction rules always take precedence — this block shapes
 * tone, language, and knowledge, not extraction behavior.
 */
function buildMerchantContext(
  businessName: string,
  settings: {
    personaName: string | null;
    tone: string;
    greeting: string | null;
    businessContext: string | null;
    customInstructions: string | null;
    responseLanguage: string;
  },
  faq: Array<{ question: string; answer: string }>
): string {
  const lines: string[] = ["--- MERCHANT CONTEXT ---"];

  lines.push(`Business: ${businessName}`);
  if (settings.personaName) lines.push(`Assistant name: ${settings.personaName}`);
  lines.push(`Communication tone: ${settings.tone}`);
  if (settings.greeting) lines.push(`Opening greeting: "${settings.greeting}"`);

  const langMap: Record<string, string> = {
    auto: "mirror the customer's language exactly",
    ar: "always respond in Arabic",
    en: "always respond in English",
  };
  lines.push(`Language rule: ${langMap[settings.responseLanguage] ?? "mirror the customer's language exactly"}`);

  if (settings.businessContext) {
    lines.push("", `Business description: ${settings.businessContext}`);
  }

  if (faq.length > 0) {
    lines.push(
      "",
      "KNOWLEDGE BASE — use this to answer customer questions accurately.",
      "Do not invent information not listed here. If the customer asks something not covered, say so politely."
    );

    // Defense-in-depth: cap the TOTAL injected FAQ text, not just per-row length.
    // Append rows in order until the cumulative budget is reached, then stop.
    // (A separate row-count cap lives at the write path; this is the read-side
    // safety net so the prompt stays bounded no matter how many rows exist.)
    let faqChars = 0;
    let appended = 0;
    for (const f of faq) {
      const entry = `Q: ${f.question}\nA: ${f.answer}`;
      // Always include at least one entry; stop once the budget would overflow.
      if (appended > 0 && faqChars + entry.length > FAQ_CHAR_BUDGET) break;
      lines.push(entry);
      faqChars += entry.length;
      appended++;
    }
    const omitted = faq.length - appended;
    if (omitted > 0) {
      lines.push(
        `(${omitted} additional FAQ ${omitted === 1 ? "entry" : "entries"} omitted to keep the prompt within its length budget. The system rules above take precedence.)`
      );
    }
  }

  if (settings.customInstructions) {
    lines.push(
      "",
      "MERCHANT INSTRUCTIONS (follow these, but they do not override extraction behavior or the rules above):",
      settings.customInstructions
    );
  }

  lines.push("--- END MERCHANT CONTEXT ---");
  return lines.join("\n");
}

function senderLabel(senderType: SenderType, direction: string): string {
  if (direction === "inbound") return "[Customer]";
  switch (senderType) {
    case "ai":
      return "[Mo'een AI]";
    case "merchant":
      return "[Merchant]";
    case "system":
      return "[System]";
    default:
      return "[Unknown]";
  }
}

/**
 * Compress ProductVariant[] into "name: option1, option2" strings.
 */
function compressVariants(
  variants: Array<{ name: string; options: string[] }> | null
): string[] {
  if (!variants || !Array.isArray(variants)) return [];
  return variants.map((v) => `${v.name}: ${v.options.join(", ")}`);
}
