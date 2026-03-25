# Mo'een — System Architecture

> This document describes how every component of Mo'een connects. It is the technical map that all implementation should follow.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MERCHANT (Browser)                       │
│                   Next.js Frontend (TypeScript)                 │
│            Tailwind + shadcn/ui + Framer Motion + GSAP          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ HTTPS (API Routes + Supabase Client)
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      NEXT.JS API LAYER                          │
│               Server-side routes + middleware                    │
│                  Auth verification (Supabase)                   │
└────┬─────────────────┬──────────────────┬───────────────────────┘
     │                 │                  │
     ▼                 ▼                  ▼
┌─────────┐    ┌──────────────┐    ┌─────────────┐
│ SUPABASE │    │   n8n CLOUD  │    │ GEMINI 2.5  │
│          │    │              │    │   FLASH     │
│ Database │◄──►│  Workflows   │───►│             │
│ Auth     │    │  Webhooks    │    │ Intent      │
│ Realtime │    │  Cron jobs   │    │ Extraction  │
│ Storage  │    │              │    │ Reports     │
└─────────┘    └──────┬───────┘    └─────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │  MESSAGING ABSTRACTION│
          │       LAYER           │
          ├───────────┬───────────┤
          │ Telegram   │ WhatsApp  │
          │ Bot API    │ (Phase 2) │
          │ (MVP)      │           │
          └───────────┴───────────┘
                      │
                      ▼
              ┌───────────────┐
              │   CUSTOMERS   │
              │ (Telegram/WA) │
              └───────────────┘
```

---

## Component Responsibilities

### 1. Next.js Frontend
**What it does:** Renders the merchant-facing UI — dashboard, orders, inventory, flags, settings, landing page.
**Talks to:** Supabase (directly via client library for reads + realtime), Next.js API routes (for writes and business logic).
**Key decisions:**
- App Router (Next.js 14+) for file-based routing
- Server Components for initial page loads (fast)
- Client Components for interactive elements (realtime, animations)
- Supabase Realtime subscriptions for live dashboard updates

### 2. Next.js API Layer
**What it does:** Handles business logic that shouldn't run in the browser — order creation, status changes, webhook processing, Gemini calls.
**Talks to:** Supabase (server-side with service role key for admin operations), n8n (triggering workflows), Gemini (AI processing).
**Key decisions:**
- API routes live in `app/api/` directory
- All routes verify auth via Supabase session
- Sensitive operations (inventory math, status transitions) happen server-side to prevent race conditions

### 3. Supabase
**What it does:** Everything data.
- **PostgreSQL Database:** All tables — merchants, orders, products, customers, conversations, messages, flags, inventory
- **Auth:** Merchant sign-up and login (Google, email, phone OTP)
- **Row Level Security (RLS):** Every table filtered by `merchant_id` — data isolation enforced at database level
- **Realtime:** WebSocket subscriptions for live dashboard updates when orders/messages change
- **Storage:** Product images, merchant logos, uploaded files
**Talks to:** Frontend (via Supabase client), API routes (via service role), n8n (via REST API or direct DB connection)

### 4. n8n Cloud
**What it does:** Rules engine and automation layer. Handles everything that's NOT AI — timer-based logic, threshold checks, status notifications, webhook processing.
**Talks to:** Supabase (read/write data), Telegram API (via abstraction layer for sending messages), Gemini API (forwarding messages for AI processing).
**Key decisions:**
- Self-contained workflows — each workflow has a single trigger and clear purpose
- n8n handles the message processing pipeline orchestration
- Cron jobs for time-based checks (stale orders, customer wait time)

### 5. Gemini 2.5 Flash
**What it does:** Language understanding only.
- Detects order intent from Arabic, English, or Arabizi messages
- Extracts product name, quantity, variant, delivery address from unstructured text
- Matches customer descriptions to catalog products
- Generates clarifying questions when data is missing
- Generates structured JSON order drafts
- Powers analytics reports and daily summaries
**Talks to:** n8n (receives messages, returns structured data), Next.js API (for on-demand analytics)
**Key decisions:**
- Called ONLY when RegEx pre-filter detects a possible order signal
- Returns structured JSON with confidence scores
- Token optimization: compressed catalog, trimmed conversation history (last 5-6 messages)
- Human always approves — Gemini suggests, merchant decides

### 6. Messaging Abstraction Layer
**What it does:** Provides a unified interface for all messaging operations regardless of the underlying platform.
**Interface:**
```typescript
interface MessagingProvider {
  sendMessage(chatId: string, text: string): Promise<MessageResult>
  sendTemplateMessage(chatId: string, template: string, params: Record<string, string>): Promise<MessageResult>
  receiveWebhook(payload: unknown): ParsedMessage
  getConversationHistory(chatId: string, limit: number): Promise<Message[]>
}
```
**Implementations:**
- `TelegramProvider` — MVP, uses Telegram Bot API
- `WhatsAppProvider` — Phase 2, uses third-party official API provider
**Key decisions:**
- The core application NEVER calls Telegram or WhatsApp APIs directly
- All messaging goes through this interface
- Switching providers = implementing a new class, no core app changes
- Provider configuration stored in merchant settings (which platform, API keys)

---

## Data Flow: Message to Order

This is the critical path — a customer message becoming a structured order on the dashboard.

```
1. Customer sends Telegram message
   │
2. Telegram delivers webhook to n8n
   │
3. n8n: Webhook Receiver workflow
   ├── Saves raw message to Supabase (messages table)
   ├── Runs RegEx pre-filter
   │   ├── No order signal → STOP (message stored, no AI call)
   │   └── Order signal detected → Continue
   │
4. n8n: Sends message + last 5 messages + compressed catalog to Gemini
   │
5. Gemini returns structured JSON:
   {
     "intent": "order",
     "confidence": 0.87,
     "items": [
       { "product_match": "product_id_123", "quantity": 3, "variant": "large" }
     ],
     "customer_info": { "name": "أحمد", "address": "نابلس، شارع..." },
     "missing_fields": [],
     "clarifying_question": null
   }
   │
6. n8n: Processes Gemini response
   ├── Confidence >= threshold → Create order draft in Supabase (status: Incoming)
   ├── Confidence < threshold → Create order draft + create Flag (AI low confidence)
   ├── Missing fields → Send clarifying question via Telegram (AI drafts, auto-sends)
   │   └── But if confidence is very low → Flag for human instead of auto-asking
   └── Gemini unreachable → Save message, create Flag (AI unavailable, manual review)
   │
7. Supabase Realtime notifies frontend
   │
8. Merchant sees new order on dashboard
   ├── Reviews AI extraction
   ├── Corrects if needed
   └── Confirms → triggers status change → n8n sends confirmation to customer
```

---

## Data Flow: Gemini Failure Handling

```
Gemini API call fails (timeout, error, rate limit)
   │
   ├── n8n retries once after 5 seconds
   │   ├── Success → continue normal flow
   │   └── Failure → continue below
   │
   ├── Message remains stored in Supabase (never lost)
   ├── Flag created: category "ai_unavailable", priority "medium"
   ├── If multiple failures in 5 minutes → Dashboard banner: "AI processing paused"
   └── When Gemini recovers → n8n can optionally reprocess queued messages
       (configurable — merchant may have already handled them manually)
```

---

## Authentication Flow

```
Merchant visits Mo'een
   │
   ├── Not authenticated → Redirect to /login
   │   ├── Google sign-in → Supabase Auth → Session created
   │   ├── Email + password → Supabase Auth → Session created
   │   └── Phone OTP → Supabase Auth → Session created
   │
   ├── Authenticated, no business profile → Redirect to /onboarding
   │
   └── Authenticated + business profile → Dashboard
```

**Session management:**
- Supabase handles JWT tokens and refresh
- Next.js middleware checks auth on every protected route
- API routes verify session before processing

---

## Deployment Architecture (MVP)

| Component | Hosting | Cost (MVP) |
|-----------|---------|------------|
| Next.js Frontend + API | Vercel (free tier) | $0 |
| Supabase | Supabase Cloud (free tier) | $0 |
| n8n | n8n Cloud (starter) | ~$20/month |
| Gemini 2.5 Flash | Google AI (free tier: 250 req/day) | $0 |
| Telegram Bot API | Free | $0 |
| Domain | Custom domain | ~$12/year |
| **Total MVP cost** | | **~$21/month** |

**Scaling notes:**
- Vercel free tier: 100GB bandwidth, sufficient for MVP
- Supabase free tier: 500MB database, 50MB storage, 50K auth users
- Gemini free tier: 250 requests/day — sufficient for 3-5 pilot merchants
- When scaling beyond free tiers, costs are predictable and gradual

---

## Security Considerations

- **RLS enforced at database level** — even if application code has bugs, merchants can't see each other's data
- **API keys stored as environment variables** — never in client-side code
- **Telegram Bot Token stored in Supabase** — encrypted at rest, accessed only server-side
- **Gemini API calls made server-side only** — never from the browser
- **Input validation** — all user inputs sanitized before database writes
- **HTTPS everywhere** — Vercel provides SSL by default

---

## File Structure (Next.js Project)

```
moeen/
├── app/
│   ├── (public)/              # Public routes (no auth required)
│   │   ├── page.tsx           # Landing page
│   │   ├── login/page.tsx     # Login
│   │   └── signup/page.tsx    # Sign up
│   ├── (app)/                 # Protected routes (auth required)
│   │   ├── layout.tsx         # App shell with sidebar/nav
│   │   ├── dashboard/page.tsx
│   │   ├── orders/
│   │   │   ├── page.tsx       # Order board/list
│   │   │   └── [id]/page.tsx  # Order detail (split view)
│   │   ├── inventory/
│   │   │   ├── page.tsx       # Product list
│   │   │   └── [id]/page.tsx  # Product detail
│   │   ├── flags/page.tsx     # Flags & escalations
│   │   ├── settings/page.tsx  # Settings
│   │   └── onboarding/        # Onboarding wizard
│   │       └── page.tsx
│   └── api/                   # API routes
│       ├── webhooks/
│       │   └── telegram/route.ts  # Telegram webhook receiver
│       ├── orders/route.ts
│       ├── products/route.ts
│       ├── ai/
│       │   └── process/route.ts   # Gemini processing endpoint
│       └── instagram/
│           └── import/route.ts    # Instagram catalog import
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── layout/                # Sidebar, TopBar, MobileNav
│   ├── orders/                # OrderCard, OrderBoard, OrderDetail
│   ├── inventory/             # ProductCard, StockBar, ProductForm
│   ├── flags/                 # FlagCard, PriorityBadge
│   ├── dashboard/             # KPICard, QuickActions, ActivitySnapshot
│   ├── onboarding/            # Step components
│   └── chat/                  # ChatThread, MessageBubble, ReplyInput
├── lib/
│   ├── supabase/
│   │   ├── client.ts          # Browser Supabase client
│   │   ├── server.ts          # Server Supabase client
│   │   └── types.ts           # Generated database types
│   ├── messaging/
│   │   ├── interface.ts       # MessagingProvider interface
│   │   ├── telegram.ts        # TelegramProvider implementation
│   │   └── whatsapp.ts        # WhatsAppProvider (Phase 2)
│   ├── ai/
│   │   ├── gemini.ts          # Gemini API client
│   │   ├── prompts.ts         # AI prompt templates
│   │   └── regex-filter.ts    # Pre-filter for order signals
│   └── utils/
│       ├── inventory.ts       # Inventory math helpers
│       └── order-lifecycle.ts # Status transition logic
├── hooks/                     # Custom React hooks
│   ├── useRealtimeOrders.ts
│   ├── useRealtimeFlags.ts
│   └── useRealtimeInventory.ts
├── types/                     # TypeScript type definitions
│   ├── order.ts
│   ├── product.ts
│   ├── merchant.ts
│   ├── message.ts
│   └── flag.ts
├── public/                    # Static assets
├── styles/                    # Global styles, Tailwind config
└── docs/                      # These documentation files
```
