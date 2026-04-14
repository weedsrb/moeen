import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiResponseSchema, type GeminiResponse, type CompressedProduct } from "./types";

/**
 * Attempt to repair truncated JSON from Gemini.
 * Common issues: string cut mid-value, missing closing braces/brackets.
 */
function repairTruncatedJson(text: string): string {
  let fixed = text.trim();

  // If truncated inside a string literal, close it
  // Count unescaped quotes — if odd, we're inside a string
  const unescapedQuotes = fixed.match(/(?<!\\)"/g);
  if (unescapedQuotes && unescapedQuotes.length % 2 !== 0) {
    fixed += '"';
  }

  // Close any open brackets/braces
  const opens = { "{": 0, "[": 0 };
  let inString = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (ch === '"' && (i === 0 || fixed[i - 1] !== "\\")) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") opens["{"]++;
    if (ch === "}") opens["{"]--;
    if (ch === "[") opens["["]++;
    if (ch === "]") opens["["]--;
  }

  // Remove any trailing comma before we close
  fixed = fixed.replace(/,\s*$/, "");

  // Close unclosed arrays then objects
  for (let i = 0; i < opens["["]; i++) fixed += "]";
  for (let i = 0; i < opens["{"]; i++) fixed += "}";

  return fixed;
}

const SYSTEM_PROMPT = `You are Mo'een's order processing AI. Your job is to understand customer messages and extract structured order data.

RULES:
1. Detect whether the message contains order intent, a question, or is general conversation.
2. If order intent: extract product, quantity, variant, and delivery address from the conversation.
3. Match product mentions to the catalog using name and alternative names. Customers use informal names, dialect, and abbreviations.
4. If any required field is missing (product, quantity), generate a natural clarifying question in the same language the customer is using.
5. Return a confidence score (0-1) for the overall extraction. Be honest — if you're guessing, say so with a low score.
6. If confidence is below {confidence_threshold}, set needs_human_review to true.
7. Never fabricate information. If the customer didn't mention an address, don't invent one.
8. Handle mixed Arabic/English/Arabizi naturally.
9. Currency is {currency}.
10. If intent is "question": generate a helpful, friendly answer in the "answer" field using information from the catalog and the knowledge base below. Reply in the same language the customer is using. Keep answers concise (1-3 sentences). If the question is about something not in the catalog or knowledge base, say so politely.

{merchant_context}

CATALOG:
{compressed_catalog}

CONVERSATION:
{conversation_history}

CURRENT MESSAGE:
{current_message}

Respond ONLY with valid JSON matching this exact schema:
{
  "intent": "order" | "question" | "other",
  "confidence": number (0-1),
  "items": [{ "product_id": string|null, "product_name": string, "variant": string|null, "quantity": number, "unit_price": number|null, "subtotal": number|null, "match_confidence": number (0-1) }],
  "customer_info": { "name": string|null, "delivery_address": string|null, "phone": string|null },
  "order_total": number|null,
  "missing_fields": string[],
  "needs_human_review": boolean,
  "clarifying_question": string|null,
  "answer": string|null,
  "reasoning": string
}

Keep the "reasoning" field under 100 characters. No explanation, no markdown, no preamble. JSON only.`;

/**
 * Call Gemini 2.5 Flash to process a customer message.
 * Returns a validated GeminiResponse or throws an error.
 */
export async function callGemini(
  conversationHistory: string,
  catalog: CompressedProduct[],
  settings: { confidenceThreshold: number; currency: string },
  currentMessage: string,
  merchantContext: string
): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      topP: 0.95,
      topK: 40,
      responseMimeType: "application/json",
      // @ts-expect-error -- thinkingConfig is supported by Gemini 2.5 but not yet in SDK types
      thinkingConfig: { thinkingBudget: 1024 },
    },
  });

  const prompt = SYSTEM_PROMPT
    .replace("{confidence_threshold}", settings.confidenceThreshold.toString())
    .replace("{currency}", settings.currency)
    .replace("{merchant_context}", merchantContext)
    .replace("{compressed_catalog}", JSON.stringify(catalog, null, 2))
    .replace("{conversation_history}", conversationHistory || "(no prior messages)")
    .replace("{current_message}", currentMessage);

  const result = await model.generateContent(prompt);
  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason ?? "unknown";
  const text = result.response.text();

  console.log(`[AI Pipeline] gemini raw response length: ${text.length}, finishReason: ${finishReason}`);

  // Gemini sometimes returns truncated JSON despite responseMimeType.
  // Attempt to parse, and if it fails, try to repair common truncation issues.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn("[AI Pipeline] gemini returned invalid JSON, attempting repair...");
    console.warn("[AI Pipeline] raw tail:", text.slice(-100));
    parsed = JSON.parse(repairTruncatedJson(text));
  }

  const validated = geminiResponseSchema.parse(parsed);
  return validated;
}
