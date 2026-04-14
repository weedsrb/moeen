import type { SupabaseClient } from "@supabase/supabase-js";
import type { SenderType } from "@/types/message";
import type { AssembledContext, CompressedProduct } from "./types";

/**
 * Assemble the full context needed for a Gemini API call:
 * - Conversation history (last 6 messages)
 * - Compressed product catalog
 * - Merchant AI settings (system + merchant layer)
 * - Merchant context string (injected into Gemini prompt)
 * - Last outbound message sender type (for reply-to-AI detection)
 */
export async function assembleContext(
  supabase: SupabaseClient,
  merchantId: string,
  conversationId: string,
  messageContent: string
): Promise<AssembledContext> {
  // Fetch in parallel: messages, products, settings, business name, FAQ
  const [messagesResult, productsResult, settingsResult, merchantResult, faqResult] =
    await Promise.all([
      supabase
        .from("messages")
        .select("content, direction, sender_type")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(6),

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
    ]);

  // --- Conversation history ---
  const messages = (messagesResult.data ?? []).reverse(); // oldest first
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

  // If catalog is large, filter to products matching message words
  if (products.length > 50) {
    const words = messageContent.toLowerCase().split(/\s+/);
    products = products.filter((p) => {
      const searchable = [
        p.name.toLowerCase(),
        ...(p.alternative_names ?? []).map((n: string) => n.toLowerCase()),
      ].join(" ");
      return words.some((w) => w.length > 1 && searchable.includes(w));
    });
    // Fallback: if filtering removed everything, send first 50
    if (products.length === 0) {
      products = rawProducts.slice(0, 50);
    }
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
    responseLanguage: s?.ai_response_language ?? "auto",
    autoAcknowledge: s?.ai_auto_acknowledge ?? false,
    acknowledgeTemplate: s?.ai_acknowledge_template ?? null,
  };

  // --- Merchant context string (merchant layer for Gemini prompt) ---
  const businessName = merchantResult.data?.business_name ?? "This business";
  const faq = faqResult.data ?? [];
  const merchantContext = buildMerchantContext(businessName, settings, faq);

  return { conversationHistory, catalog, settings, merchantContext, lastOutboundSenderType };
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
    businessContext?: string | null;
    customInstructions?: string | null;
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
    faq.forEach((f) => lines.push(`Q: ${f.question}\nA: ${f.answer}`));
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
