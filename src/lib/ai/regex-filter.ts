import type { SenderType } from "@/types/message";

// --- Arabic order signal patterns ---
const ARABIC_ORDER_INTENT =
  /بدي|اريد|عايز|ابي|نبي|ابغى/;

const ARABIC_ORDER_WORDS =
  /اطلب|طلب|طلبية|اوردر/;

const ARABIC_SEND_ME =
  /ابعتلي|ابعثلي|اعطيني|حطلي|جيبلي/;

const ARABIC_QUANTITY_NOUN =
  /\d+\s+[\u0600-\u06FF]+/;

const ARABIC_PRICE_INQUIRY =
  /كم سعر|كم حق|بكم|شو السعر|كم الحبة/;

const ARABIC_DELIVERY =
  /توصيل|وصلولي|عنواني|العنوان|ارسلولي/;

const ARABIC_CONFIRMATION =
  /اي تمام|ماشي|اوكي|موافق|بدي اياه/;

// --- English order signal patterns ---
const ENGLISH_ORDER_INTENT =
  /\b(order|want|need|buy|purchase|get me)\b/i;

const ENGLISH_QUANTITY =
  /\b\d+\s*(pieces?|items?|kg|kilo|dozen)\b/i;

const ENGLISH_PRICE_INQUIRY =
  /\b(how much|price|cost)\b/i;

const ENGLISH_DELIVERY =
  /\b(deliver|shipping|address|send to)\b/i;

// --- Arabizi patterns ---
const ARABIZI_ORDER =
  /\b(bidi|biddi|abgha|atlobi|talabiye)\b/i;

const ARABIZI_SEND_ME =
  /\b(ib3atli|jibli|hatli)\b/i;

// All signal patterns combined
const ORDER_SIGNAL_PATTERNS = [
  ARABIC_ORDER_INTENT,
  ARABIC_ORDER_WORDS,
  ARABIC_SEND_ME,
  ARABIC_QUANTITY_NOUN,
  ARABIC_PRICE_INQUIRY,
  ARABIC_DELIVERY,
  ARABIC_CONFIRMATION,
  ENGLISH_ORDER_INTENT,
  ENGLISH_QUANTITY,
  ENGLISH_PRICE_INQUIRY,
  ENGLISH_DELIVERY,
  ARABIZI_ORDER,
  ARABIZI_SEND_ME,
];

// --- Bypass patterns (strict: entire message must match) ---
const BYPASS_GREETINGS =
  /^(مرحبا|هلا|السلام عليكم|hi|hello|hey|صباح الخير|مساء الخير)$/i;

const BYPASS_THANKS =
  /^(شكرا|شكراً|thank|thanks|مشكور)$/i;

const BYPASS_EMOJI =
  /^[\p{Emoji}\uFE0F]{1,3}$/u;

const BYPASS_ACKNOWLEDGMENT =
  /^(اوكي|ok|okay|تمام|ماشي|👍)$/i;

const BYPASS_PATTERNS = [
  BYPASS_GREETINGS,
  BYPASS_THANKS,
  BYPASS_EMOJI,
  BYPASS_ACKNOWLEDGMENT,
];

// --- Bare number (enhancement #2) ---
const BARE_NUMBER = /^\d+$/;

/**
 * Check if a message contains order signal patterns.
 */
function hasOrderSignal(text: string): boolean {
  return ORDER_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check if a message is purely a greeting/thanks/emoji (no order content).
 */
function shouldBypass(text: string): boolean {
  const trimmed = text.trim();
  return BYPASS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Determine whether an inbound message should be sent to the AI pipeline.
 *
 * Returns true if:
 * 1. The message is a reply to an AI clarifying question (always process)
 * 2. The message is a bare number like "3" (likely a quantity answer)
 * 3. The message passes the bypass filter AND contains order signals
 */
export function shouldProcess(
  text: string,
  lastOutboundSenderType: SenderType | null
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Enhancement 1: Always process replies to AI clarifying questions
  if (lastOutboundSenderType === "ai") return true;

  // Enhancement 2: Always process bare numbers (quantity answers)
  if (BARE_NUMBER.test(trimmed)) return true;

  // Bypass patterns — greetings-only, thanks-only, emoji-only
  if (shouldBypass(trimmed)) return false;

  // Order signal detection
  return hasOrderSignal(trimmed);
}
