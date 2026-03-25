# Mo'een — AI Pipeline Specification

> AI handles language. Rules handle logic. Humans handle judgment.

---

## Pipeline Overview

```
Customer Message
    │
    ▼
RegEx Pre-Filter (cheap, fast, no API call)
    │
    ├── No signal → Message saved, no AI processing
    │
    └── Signal detected → Continue
        │
        ▼
    Context Assembly
    (last 5-6 messages + compressed catalog + merchant settings)
        │
        ▼
    Gemini 2.5 Flash API Call
        │
        ▼
    Response Processing
    (create order, flag, clarify, or ignore)
```

---

## Stage 1: RegEx Pre-Filter

**Purpose:** Cheap scan to avoid unnecessary AI API calls. Only messages with potential order signals are sent to Gemini.

**Philosophy:** The filter is intentionally generous (high recall, acceptable precision). It's better to waste an occasional API call on a non-order than to miss a real order.

### Arabic Order Signal Patterns

```regex
# "I want" patterns
بدي|اريد|عايز|ابي|نبي|ابغى

# "Order" patterns
اطلب|طلب|طلبية|اوردر

# "Send me" / "Give me" patterns
ابعتلي|ابعثلي|اعطيني|حطلي|جيبلي

# Quantity + noun (number followed by Arabic word)
\d+\s+[\u0600-\u06FF]+

# Price inquiry
كم سعر|كم حق|بكم|شو السعر|كم الحبة

# Delivery keywords
توصيل|وصلولي|عنواني|العنوان|ارسلولي

# Confirmation
اي تمام|ماشي|اوكي|موافق|بدي اياه
```

### English Order Signal Patterns

```regex
# Direct order intent
\b(order|want|need|buy|purchase|get me)\b

# Quantity patterns
\b\d+\s*(pieces?|items?|kg|kilo|dozen)\b

# Price inquiry
\b(how much|price|cost)\b

# Delivery
\b(deliver|shipping|address|send to)\b
```

### Arabizi Patterns (Arabic written in Latin characters)

```regex
# Common Arabizi order words
\b(bidi|biddi|abgha|atlobi|talabiye)\b

# "Send me" in Arabizi
\b(ib3atli|jibli|hatli)\b
```

### Messages That Skip AI

These patterns explicitly bypass the AI pipeline:

```regex
# Greetings only
^(مرحبا|هلا|السلام عليكم|hi|hello|hey|صباح الخير|مساء الخير)$

# Thanks only
^(شكرا|شكراً|thank|thanks|مشكور)$

# Single emoji or very short non-order
^[\p{Emoji}]{1,3}$

# Acknowledgments
^(اوكي|ok|okay|تمام|ماشي|👍)$
```

**Note:** These bypass patterns are strict — they only match messages that are ENTIRELY greetings/thanks with nothing else. "شكراً وبدي كمان 2" (thanks and I want 2 more) would NOT be bypassed because the combined message contains order signals.

---

## Stage 2: Context Assembly

When a message passes the pre-filter, we assemble the context for Gemini.

### Conversation History

Fetch the last 5-6 messages from this conversation (both inbound and outbound). This gives Gemini context about what's being discussed.

**Format sent to Gemini:**

```
[Customer]: بدي كنافة
[Mo'een AI]: كم حبة بدك؟ وشو الحجم - كبيرة ولا صغيرة؟
[Customer]: 3 كبيرة وحدة صغيرة
[Customer]: وتوصلولي على نابلس شارع الحسين  ← CURRENT MESSAGE
```

### Compressed Catalog

Send the merchant's product catalog in a compressed format to minimize tokens:

```json
{
  "products": [
    {
      "id": "prod_001",
      "name": "كنافة نابلسية",
      "alt": ["knafeh", "كنافة", "kanafeh", "الكنافة"],
      "price": 40,
      "variants": ["كبيرة/large:40", "صغيرة/small:25"],
      "stock": 15
    },
    {
      "id": "prod_002",
      "name": "بقلاوة",
      "alt": ["baklava", "baklawa", "بقلاوا"],
      "price": 30,
      "stock": 8
    }
  ]
}
```

**Token optimization:**
- Only include active products (is_active = true)
- Only include name, alt names, price, variants, and stock
- Exclude descriptions and images
- If catalog > 50 products, only include products whose names fuzzy-match words in the message

### Merchant Settings

Pass relevant settings:

```json
{
  "confidence_threshold": 0.70,
  "auto_clarify": true,
  "handoff_message": "A team member will assist you shortly.",
  "currency": "ILS"
}
```

---

## Stage 3: Gemini API Call

### System Prompt

```
You are Mo'een's order processing AI. Your job is to understand customer messages and extract structured order data.

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

CATALOG:
{compressed_catalog}

CONVERSATION:
{conversation_history}

CURRENT MESSAGE:
{current_message}

Respond ONLY with valid JSON. No explanation, no markdown, no preamble.
```

### Expected Response Format

```json
{
  "intent": "order",
  "confidence": 0.87,
  "items": [
    {
      "product_id": "prod_001",
      "product_name": "كنافة نابلسية",
      "variant": "كبيرة",
      "quantity": 3,
      "unit_price": 40,
      "subtotal": 120,
      "match_confidence": 0.95
    },
    {
      "product_id": "prod_001",
      "product_name": "كنافة نابلسية",
      "variant": "صغيرة",
      "quantity": 1,
      "unit_price": 25,
      "subtotal": 25,
      "match_confidence": 0.92
    }
  ],
  "customer_info": {
    "name": null,
    "delivery_address": "نابلس شارع الحسين",
    "phone": null
  },
  "order_total": 145,
  "missing_fields": [],
  "needs_human_review": false,
  "clarifying_question": null,
  "reasoning": "Customer ordered 3 large and 1 small knafeh with delivery to Nablus. All products matched with high confidence."
}
```

### Response When Clarification Needed

```json
{
  "intent": "order",
  "confidence": 0.55,
  "items": [
    {
      "product_id": null,
      "product_name": "الكبيرة",
      "variant": null,
      "quantity": 2,
      "unit_price": null,
      "subtotal": null,
      "match_confidence": 0.30
    }
  ],
  "customer_info": {
    "name": null,
    "delivery_address": null,
    "phone": null
  },
  "order_total": null,
  "missing_fields": ["product_id", "delivery_address"],
  "needs_human_review": false,
  "clarifying_question": "أهلاً! بدك 2 من الكبيرة - بس أي منتج بالزبط؟ عنا كنافة كبيرة وبقلاوة كبيرة. وكمان وين بدك التوصيل؟",
  "reasoning": "Customer said 'I want 2 of the large one' but didn't specify which product. Multiple products have a 'large' variant. Need clarification on product and delivery address."
}
```

### Response for Non-Order Messages

```json
{
  "intent": "question",
  "confidence": 0.92,
  "items": [],
  "customer_info": {},
  "order_total": null,
  "missing_fields": [],
  "needs_human_review": false,
  "clarifying_question": null,
  "reasoning": "Customer is asking about delivery times, not placing an order."
}
```

```json
{
  "intent": "other",
  "confidence": 0.98,
  "items": [],
  "customer_info": {},
  "order_total": null,
  "missing_fields": [],
  "needs_human_review": false,
  "clarifying_question": null,
  "reasoning": "Customer is saying thank you. No order intent detected."
}
```

---

## Stage 4: Response Processing

See Workflow 1 in `06_N8N_WORKFLOWS.md` for the complete decision tree based on Gemini's response.

**Key processing rules:**

1. **Confidence >= threshold + no missing fields** → Create order (status: incoming)
2. **Confidence >= threshold + missing fields + auto_clarify on** → Send clarifying question
3. **Confidence >= threshold + missing fields + auto_clarify off** → Create order + flag
4. **Confidence < threshold** → Create order draft + flag (ai_low_confidence) + send handoff message
5. **Intent = "question"** → Flag for merchant (priority: low)
6. **Intent = "other"** → No action
7. **Gemini failure** → Flag (ai_unavailable) + retry logic

---

## Confidence Score Interpretation

| Score | Meaning | System Behavior |
|-------|---------|-----------------|
| 0.90 - 1.00 | Very confident | Create order automatically |
| 0.70 - 0.89 | Confident | Create order, minor details might need review |
| 0.50 - 0.69 | Uncertain | Flag for human review, show AI attempt |
| 0.30 - 0.49 | Low | Flag + handoff message to customer |
| 0.00 - 0.29 | Very low | Flag + handoff, AI attempt may not be useful |

The default threshold is 0.70. Merchants can adjust in Settings.

---

## Gemini API Configuration

```typescript
const geminiConfig = {
  model: "gemini-2.5-flash",
  temperature: 0.1,        // Low temperature for consistent extraction
  maxOutputTokens: 1024,   // Orders don't need long responses
  topP: 0.95,
  topK: 40,
  responseMimeType: "application/json"  // Force JSON output
}
```

**Why low temperature:** Order extraction needs precision, not creativity. The same message should produce the same output every time.

---

## Cost Estimation

**Free tier:** 250 requests/day

**Assumptions for 5 pilot merchants:**
- Each merchant receives ~50 messages/day
- RegEx pre-filter passes ~60% to AI (30 messages)
- 5 merchants × 30 messages = 150 AI calls/day
- Well within free tier

**When paid tier is needed:**
- At ~10 merchants with high volume
- Gemini Flash pricing: ~$0.10 per 1M input tokens, ~$0.40 per 1M output tokens
- Average call: ~500 input tokens, ~300 output tokens
- Cost per call: ~$0.00017
- 1000 calls/day: ~$0.17/day = ~$5/month

---

## Training Data Strategy

Every successful AI extraction (merchant confirms without corrections) is valuable training data.

**What to store:**
- Input: raw customer message + conversation context
- Output: Gemini's structured extraction
- Validation: merchant confirmed = correct, merchant edited = partially correct (store corrections)

**Future use:**
- Fine-tune a custom model on Levantine Arabic order patterns
- Improve RegEx pre-filter accuracy
- Build product name matching dictionaries
- This becomes Mo'een's long-term competitive moat

**Storage:** Separate `ai_training_data` table in Supabase (Phase 2)
