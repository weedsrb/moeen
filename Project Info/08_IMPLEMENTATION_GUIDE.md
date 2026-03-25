# Mo'een — Implementation Guide

> Build in phases. Ship each phase. Learn before building the next.

---

## Phase Overview

| Phase | Name | Duration | Goal |
|-------|------|----------|------|
| 0 | Project Setup | 1-2 days | Dev environment, project scaffold, tools configured |
| 1 | Foundation | 1 week | Auth, database, basic layout, navigation |
| 2 | Catalog & Inventory | 1 week | Product management, stock tracking |
| 3 | Telegram Integration | 1 week | Bot setup, message receiving, conversation UI |
| 4 | AI Pipeline | 1 week | RegEx filter, Gemini integration, order extraction |
| 5 | Order Management | 1 week | Order lifecycle, status board, split view |
| 6 | Automation (n8n) | 1 week | All workflows, flags system, notifications |
| 7 | Landing Page | 1 week | Public site, animations, SEO |
| 8 | Polish & Testing | 1 week | Bug fixes, edge cases, mobile optimization |
| 9 | Pilot Launch | Ongoing | 3-5 real merchants, feedback loops |

**Total estimated build time: 8-9 weeks**

---

## Phase 0: Project Setup

**Goal:** Everything configured, ready to write features.

### Tasks

- [ ] Initialize Next.js project with TypeScript
  ```bash
  npx create-next-app@latest moeen --typescript --tailwind --eslint --app --src-dir
  ```
- [ ] Install core dependencies
  ```bash
  npm install @supabase/supabase-js @supabase/ssr
  npm install framer-motion gsap
  npm install lucide-react
  npm install -D @types/node
  ```
- [ ] Initialize shadcn/ui
  ```bash
  npx shadcn@latest init
  ```
  Configure with: New York style, Zinc base color, CSS variables: yes
- [ ] Set up Tailwind config with Mo'een design tokens
  - Custom colors (lifecycle, priority, AI)
  - Custom fonts (DM Sans, Noto Naskh Arabic, JetBrains Mono)
  - Custom spacing scale
- [ ] Create Supabase project
  - Set up project at supabase.com
  - Get API URL and keys (anon key + service role key)
  - Add to `.env.local`
- [ ] Set up environment variables
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  GEMINI_API_KEY=
  TELEGRAM_BOT_TOKEN= (added in Phase 3)
  ```
- [ ] Create Supabase client utilities (`lib/supabase/client.ts`, `lib/supabase/server.ts`)
- [ ] Set up project folder structure (as defined in ARCHITECTURE.md)
- [ ] Copy all documentation files into `docs/` directory in the project
- [ ] Create a `CLAUDE.md` file in the project root (see below)

### CLAUDE.md (for Claude Code)

```markdown
# Mo'een — Claude Code Context

Read these docs in order before making changes:
1. docs/01_PROJECT_VISION.md — what Mo'een is and why
2. docs/02_FEATURES.md — every page and feature spec
3. docs/03_ARCHITECTURE.md — system design and file structure
4. docs/04_DATABASE_SCHEMA.md — all tables and relationships
5. docs/05_DESIGN_SYSTEM.md — colors, typography, animations
6. docs/06_N8N_WORKFLOWS.md — automation workflows
7. docs/07_AI_PIPELINE.md — Gemini integration spec

## Key principles:
- Dark mode default, black/white base, color = meaning
- Framer Motion for React state animations, GSAP for timelines/scroll
- TypeScript strict mode — no `any` types
- All data queries filter by merchant_id (RLS)
- AI color (#7C3AED) is sacred — only for AI-generated content
- Mobile-first responsive design
- DM Sans for Latin, Noto Naskh Arabic for Arabic, JetBrains Mono for data
```

### Milestone: Project runs locally with empty pages and working auth redirect

---

## Phase 1: Foundation

**Goal:** Auth working, database created, app shell with navigation.

### Tasks

- [ ] Run Supabase migrations — create all tables from DATABASE_SCHEMA.md
  - merchants, merchant_settings, customers, conversations, messages
  - products, orders, order_items, order_timeline, flags
  - All RLS policies
  - All indexes
  - Database functions (generate_order_number, inventory triggers)
- [ ] Set up Supabase Auth
  - Enable Google provider
  - Enable email/password provider
  - Enable phone OTP provider
  - Configure redirect URLs
- [ ] Build auth pages
  - `/login` — sign in with Google, email, or phone
  - `/signup` — create account
  - Clean, minimal design matching design system
- [ ] Build auth middleware
  - Next.js middleware that redirects unauthenticated users to `/login`
  - Redirects authenticated users without merchant profile to `/onboarding`
  - Passes through authenticated users with profile to app
- [ ] Build app shell layout
  - Sidebar component (desktop) with navigation links
  - Bottom navigation bar (mobile)
  - Top bar with logo, business name, notification bell
  - Active page highlighting
  - Framer Motion page transitions
- [ ] Build onboarding flow (basic)
  - Step 1: Business basics form (name, type, city, phone)
  - Creates merchant row in Supabase
  - Sets `onboarding_completed = true` (catalog and Telegram added in later phases)
  - Redirects to dashboard
- [ ] Build empty page shells
  - Dashboard, Orders, Inventory, Flags, Settings — all with correct layout but placeholder content
  - "Coming soon" or skeleton states

### Milestone: Merchant can sign up, see their name in the app, and navigate between pages

---

## Phase 2: Catalog & Inventory

**Goal:** Merchant can add products and see inventory.

### Tasks

- [ ] Build product form component
  - Fields: image upload, name, price, quantity
  - Optional fields: alternative names, description, variants
  - Image upload to Supabase Storage
  - Form validation with clear error messages
- [ ] Build inventory page
  - Product list/grid view
  - Stock level indicator bars (green → yellow → red)
  - Out of stock highlighting
  - Search and filter
  - Sort by name, quantity, price
- [ ] Build product detail view
  - Full product card with all fields
  - Inline editing
  - Stock adjustment (manual +/-)
- [ ] Add "Add Product" flow
  - Button in inventory page header
  - Opens product form
  - Saves to Supabase
- [ ] Build Instagram import (smart catalog method)
  - Instagram OAuth flow
  - Fetch recent posts (images + captions)
  - Send captions to Gemini for parsing (product name, price, description)
  - Show merchant draft products to review/confirm/edit
  - Save confirmed products to catalog
- [ ] Hook up inventory calculations
  - Available = total - reserved
  - Display all three numbers (total, reserved, available)

### Milestone: Merchant has a product catalog with real products and can manage inventory

---

## Phase 3: Telegram Integration

**Goal:** Messages from Telegram appear in Mo'een.

### Tasks

- [ ] Build Telegram connection wizard (in onboarding and settings)
  - Step-by-step guide to creating a bot via @BotFather
  - Input field for bot token
  - Verification: Mo'een sends test message via bot
  - Save bot token to merchant_settings (encrypted)
- [ ] Set up Telegram webhook
  - API route: `app/api/webhooks/telegram/route.ts`
  - Receives Telegram updates
  - Identifies which merchant this bot belongs to
  - Processes message (find/create customer, find/create conversation, save message)
- [ ] Build messaging abstraction layer
  - `MessagingProvider` interface
  - `TelegramProvider` implementation
  - sendMessage, receiveWebhook, getConversationHistory
- [ ] Build conversation list component
  - List of all conversations for this merchant
  - Shows customer name, last message preview, timestamp, unread count
  - Sorted by most recent
- [ ] Build chat thread component
  - Message bubbles (inbound left, outbound right)
  - Timestamps in monospace
  - Auto-scroll to latest message
  - Different styling for customer, merchant, AI, and system messages
- [ ] Build reply input
  - Text input at bottom of chat thread
  - Send button
  - Sends message via Telegram bot
  - Saves outbound message in database
- [ ] Set up Supabase Realtime
  - Subscribe to new messages for this merchant
  - New messages appear in real-time in the chat thread
  - Conversation list updates with new message previews

### Milestone: Merchant connects Telegram bot, receives real messages, can reply from Mo'een

---

## Phase 4: AI Pipeline

**Goal:** Incoming messages with order intent are automatically extracted into structured orders.

### Tasks

- [ ] Implement RegEx pre-filter
  - `lib/ai/regex-filter.ts`
  - All patterns from AI_PIPELINE.md
  - Arabic, English, and Arabizi patterns
  - Bypass patterns (greetings, thanks)
  - Returns: { hasOrderSignal: boolean, matchedPatterns: string[] }
- [ ] Implement Gemini client
  - `lib/ai/gemini.ts`
  - API call with system prompt, conversation context, compressed catalog
  - JSON response parsing with validation
  - Error handling and retry logic
  - Token counting for cost monitoring
- [ ] Build context assembly
  - Fetch last 5-6 messages
  - Compress catalog to token-efficient format
  - Merge with merchant AI settings
- [ ] Implement response processing
  - Parse Gemini JSON response
  - Create order draft based on extracted data
  - Create flags based on confidence level
  - Handle clarifying questions (auto-send or flag)
  - Handle Gemini failures (flag + retry)
- [ ] Integrate with message handler
  - When new message arrives → pre-filter → if signal → Gemini → process response
  - Update message record with ai_processed flag and ai_result
- [ ] Build AI confidence UI
  - Confidence badge on order cards (in AI violet)
  - Tooltip explaining what the score means
  - "AI extracted" tag on orders created by AI
- [ ] Test with real Levantine Arabic messages
  - Collect sample messages (from Phase 1 validation or simulated)
  - Test extraction accuracy
  - Tune RegEx patterns and prompts based on results

### Milestone: Send a Telegram message with order intent, see it appear as a structured order on the dashboard

---

## Phase 5: Order Management

**Goal:** Full order lifecycle working — from incoming to delivered.

### Tasks

- [ ] Build order board view
  - Kanban columns: Incoming → Pending → Confirmed → Out for Delivery → Delivered
  - Column headers with counts
  - Order cards with lifecycle colors, customer name, product summary, time elapsed
  - Toggle between board view and list view
- [ ] Build drag-and-drop
  - Drag order cards between columns to change status
  - Framer Motion layout animation for smooth transitions
  - Status change triggers database update
- [ ] Build order detail split view
  - Left panel: chat thread with this customer
  - Right panel: structured order data
  - Status change buttons (Confirm, Dispatch, Deliver, Flag)
  - Edit mode for correcting AI extractions
  - Order timeline showing all status changes
- [ ] Implement order lifecycle logic
  - Status transition validation (can't skip from Incoming to Delivered)
  - Inventory effects on status change (reserve, deduct, release)
  - Timestamp recording (confirmed_at, dispatched_at, delivered_at)
  - Order timeline entries
- [ ] Build manual order creation
  - "Create Order" button
  - Form: select customer (or create new), select products, set quantities
  - Creates order with ai_extracted = false
- [ ] Build order filters and search
  - Filter by status, date range, customer
  - Search by order number, customer name, product
- [ ] Dashboard KPI cards
  - Wire up real data: new orders, pending, confirmed, delivery, flagged
  - Animated number transitions (Framer Motion)
  - Trend indicators (vs yesterday)

### Milestone: Complete order lifecycle working — merchant manages all orders inside Mo'een

---

## Phase 6: Automation (n8n)

**Goal:** All automated workflows running — notifications, flags, alerts.

### Tasks

- [ ] Set up n8n Cloud instance
- [ ] Build Workflow 1: Incoming Message Handler
  - Migrate the Telegram webhook processing from API route to n8n
  - Or: keep API route as the receiver, n8n as the orchestrator via HTTP trigger
  - Decision: n8n receives webhook directly is simpler
- [ ] Build Workflow 2: Order Status Notifications
  - Supabase webhook → n8n → send Telegram message to customer
  - Template messages for each status
  - Language detection (Arabic vs English)
- [ ] Build Workflow 3: Customer Wait Time Monitor
  - Cron trigger every 5 minutes
  - Query unresponded conversations
  - Create flags with appropriate priority
- [ ] Build Workflow 4: Low Stock Alert
  - Supabase webhook on inventory change
  - Check thresholds, create flags
  - Auto-resolve flags when restocked
- [ ] Build Workflow 5: Stale Order Escalation
  - Cron trigger every 30 minutes
  - Find stuck orders, create/upgrade flags
- [ ] Build Flags page
  - Three priority sections (critical, medium, low)
  - Flag cards with context, recommended action, time elapsed
  - Critical flag pulse animation (CSS keyframe)
  - Resolve/dismiss actions
  - Auto-resolve when underlying issue is fixed
- [ ] Configure Supabase Database Webhooks
  - Orders table → status change → n8n
  - Products table → inventory change → n8n
- [ ] Wire up notification badges
  - Sidebar badges showing counts (orders, flags)
  - Real-time updates via Supabase Realtime

### Milestone: System runs autonomously — flags appear, notifications send, merchant is always informed

---

## Phase 7: Landing Page

**Goal:** Beautiful, animated public page that converts visitors to sign-ups.

### Tasks

- [ ] Build hero section
  - Headline, subheadline, CTA button
  - GSAP animation: message chaos → organized dashboard
  - Mobile-responsive hero
- [ ] Build problem section
  - Scrolling message cards showing chaos scenarios
  - GSAP ScrollTrigger animations
- [ ] Build solution section
  - Problem → Mo'een feature mapping
  - Side-by-side comparisons with animations
- [ ] Build "How it works" section
  - 3-step visual flow
  - Animated step progression
- [ ] Build trust section
  - Demo video embed (record from working product)
  - Testimonials (from pilot merchants when available)
- [ ] Build footer with CTA
  - Email capture for early access
  - Store email in Supabase `waitlist` table
- [ ] SEO optimization
  - Meta tags, Open Graph, structured data
  - Server-side rendering for all landing page content
  - Performance optimization (image lazy loading, code splitting)
- [ ] Mobile optimization
  - All sections work beautifully on mobile
  - Touch-friendly interactions
  - Reduced animation on mobile for performance

### Milestone: Landing page live, beautiful, and converting

---

## Phase 8: Polish & Testing

**Goal:** Everything works reliably, edge cases handled, mobile-perfect.

### Tasks

- [ ] Mobile responsive audit — every page, every component
- [ ] Error states — what does the user see when things fail?
- [ ] Empty states — what do new merchants see before they have data?
- [ ] Loading states — skeleton screens, not spinners
- [ ] Edge case testing:
  - Multi-product orders
  - Very long messages
  - Messages with only images (no text)
  - Customer sends 10 messages in rapid succession
  - Merchant has 200+ products
  - Order with product not in catalog
- [ ] Performance optimization
  - Lighthouse audit (aim for 90+ on all metrics)
  - Bundle size analysis
  - Image optimization
  - Database query optimization (check for N+1 queries)
- [ ] Security audit
  - RLS policies tested — try to access other merchant's data
  - API routes all verify auth
  - No sensitive keys in client-side code
  - Input sanitization
- [ ] Accessibility
  - Keyboard navigation
  - Screen reader labels
  - Color contrast ratios
  - Focus states on all interactive elements

### Milestone: Product is reliable, polished, and ready for real users

---

## Phase 9: Pilot Launch

**Goal:** 3-5 real merchants using Mo'een daily.

### Tasks

- [ ] Recruit pilot merchants (from Phase 1 validation conversations)
- [ ] Onboard each merchant personally — sit with them, help set up
- [ ] Monitor first 48 hours closely
  - Watch for AI extraction errors
  - Watch for messages that slip through RegEx filter
  - Watch for UX confusion points
- [ ] Collect feedback weekly
  - What's working?
  - What's confusing?
  - What's missing?
  - What broke?
- [ ] Iterate based on feedback — highest friction first
- [ ] Track success metrics:
  - Message categorization accuracy (target: 95%+)
  - Merchant using Mo'een for ALL orders (not going back to raw Telegram)
  - Time-to-first-action (target: < 30 seconds)
- [ ] Collect Levantine Arabic training data from successful extractions
- [ ] Document learnings for future development

### Milestone: Mo'een is proven with real merchants — ready for growth

---

## Post-MVP Roadmap (Future Phases)

- **WhatsApp Integration** — connect via third-party provider, plug into abstraction layer
- **Arabic/RTL Support** — full RTL layout, Arabic UI strings
- **Team Members** — invite staff, role-based access
- **Daily AI Summary** — end-of-day business report via Telegram
- **Build-as-you-go Catalog** — products created from real orders
- **AI-assisted Catalog** — upload photo, AI suggests product details
- **Analytics Dashboard** — revenue trends, popular products, peak hours
- **Pricing Tiers** — free/starter/pro based on orders per month
- **Instagram DM Integration** — extend messaging abstraction
- **Custom Domains** — white-label for agencies
