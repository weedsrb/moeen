# Mo'een — Features Specification

> Every feature exists to answer one question: does this help the merchant act faster and feel more in control?

---

## Page Map

Mo'een has 6 pages plus an onboarding flow:

1. **Landing Page** — public, converts visitors to sign-ups
2. **Onboarding Flow** — sign up → business setup → catalog → connect Telegram → dashboard
3. **Dashboard (Overview)** — the merchant's morning command center
4. **Orders** — full order lifecycle management
5. **Inventory** — product catalog and stock management
6. **Flags & Escalations** — prioritized problems that need attention
7. **Settings** — business profile, connection management, AI behavior

---

## 1. Landing Page

**Purpose:** Convert a visiting merchant into a sign-up. The merchant should feel seen — "this was built for someone exactly like me."

**Sections (top to bottom):**

**Hero Section**
- Headline that names the pain: the 50-messages morning moment
- Subheadline: Mo'een organizes your orders so you don't have to
- Primary CTA: "Request Early Access" / "ابدأ هلق"
- Visual: animated representation of message chaos → organized dashboard (GSAP scroll-triggered)

**Problem Section**
- Scrolling wheel of message cards — each card is a different chaos scenario (lost order, angry customer, out-of-stock surprise, duplicate order)
- GSAP-driven scroll animation — cards appear, stack, overwhelm — then resolve into Mo'een's organized view

**Solution Section**
- Each problem from above maps directly to a Mo'een feature
- Clean side-by-side: chaos message → organized order card
- Micro-animations on scroll reveal (GSAP)

**How It Works**
- 3 steps: Connect Telegram → AI sorts everything → Act on what matters
- Each step has an icon and short description
- Animated step progression on scroll

**Trust Section**
- Demo video showing a merchant's morning transformed
- Testimonials (once available from pilot merchants)
- "Built in Palestine, for Palestine" messaging

**Footer CTA**
- Repeat primary CTA
- "Request Early Access" with email capture

**Technical notes:**
- Server-side rendered for SEO (Next.js SSR)
- GSAP ScrollTrigger for all scroll-driven animations
- Framer Motion for hover states and micro-interactions on CTA buttons
- Mobile-first responsive design
- Page should load fast — optimize images, lazy-load below-fold content

---

## 2. Onboarding Flow

**Purpose:** Get the merchant from sign-up to seeing their first organized message on the dashboard as fast as possible. Every extra step is friction that loses merchants.

**Step 1: Sign Up**
- Auth options: Google sign-in, email + password, phone number OTP
- Powered by Supabase Auth
- Minimal fields: name, email or phone — that's it

**Step 2: Business Basics**
- Business name
- Business type (dropdown: food, clothing, handmade goods, home products, other)
- City / location
- Business phone number (for Telegram connection)
- All fields on one screen — no multi-page form

**Step 3: Catalog Setup**
- Merchant chooses: "Import from Instagram" or "Add products manually"
- **Instagram Import flow:**
  - Merchant authorizes Instagram Business account
  - Mo'een fetches recent posts (images + captions)
  - Gemini parses captions into structured product data (name, price, description)
  - Merchant reviews draft products — confirms, edits, or discards each
  - Confirmed products are added to catalog
- **Manual entry flow:**
  - Simple form per product: image (upload), name, price, quantity
  - Optional fields (can be added later): alternative names, description, variants
  - "Add another" button to chain entries quickly
- **Skip option:** Merchant can skip catalog setup entirely and add products later
  - Dashboard will show a gentle prompt: "Add your first product to get started"

**Step 4: Connect Telegram**
- Guided wizard: step-by-step with screenshots
- Merchant creates a Telegram Bot via @BotFather (Mo'een provides exact instructions)
- Merchant pastes the Bot Token into Mo'een
- Mo'een verifies the connection and sends a test message
- Success state: "You're connected! Messages will start appearing on your dashboard."

**Step 5: Dashboard**
- Merchant lands on the dashboard
- If no messages yet: welcoming empty state with clear next steps
- If Telegram is connected and messages exist: immediate "aha moment" — organized messages

**Technical notes:**
- Progress indicator showing which step the merchant is on
- Each step saves independently — merchant can leave and come back
- Framer Motion page transitions between steps
- Form validation with clear, friendly error messages

---

## 3. Dashboard (Overview)

**Purpose:** The merchant's morning command center. Open Mo'een, glance at this page, and know exactly what needs attention.

**Layout:**

**KPI Cards (top row)**
- New orders (since last visit)
- Pending orders (awaiting merchant action)
- Confirmed orders (in progress)
- Out for delivery
- Flagged items (with priority breakdown)
- Each card shows count + trend arrow (up/down vs yesterday)
- Cards use lifecycle colors (see DESIGN_SYSTEM.md)
- Framer Motion: cards animate in on page load with stagger

**Quick Actions Panel**
- "What needs you right now" — prioritized list of 3-5 most urgent items
- Each item shows: type (order, flag, low stock), brief context, time elapsed
- Click any item → navigates to relevant page with that item highlighted
- Items ordered by consequence of inaction, not by category

**Inventory Alerts**
- Items running low (below configured threshold)
- Items out of stock
- Visual indicator bars showing stock health
- Click any item → navigates to Inventory page

**Today's Activity Snapshot**
- Messages received today
- Orders created today
- Orders completed today
- Revenue estimate (sum of confirmed + delivered order values)

**Technical notes:**
- Supabase Realtime subscription: new orders and messages update the dashboard live
- Framer Motion for number transitions (count animates up/down smoothly)
- All data filtered by `merchant_id` via RLS
- Mobile layout: KPI cards stack vertically, quick actions panel moves to top

---

## 4. Orders

**Purpose:** Full order lifecycle management. The merchant sees every order, its status, and can act on it.

**Main View: Order Board**
- Kanban-style columns OR list view (merchant can toggle)
- Columns: Incoming → Pending → Confirmed → Out for Delivery → Delivered
- Each column header shows count
- Each order card shows:
  - Lifecycle color indicator (left border or badge)
  - Customer name
  - Product(s) and quantity summary
  - Time elapsed since last status change
  - AI confidence indicator (if AI-created)
- Drag-and-drop to move orders between statuses (Framer Motion layout animation)
- Filter by status, date range, customer name

**Order Detail View (split panel)**
- Opens when clicking an order card
- **Left side:** Telegram conversation thread
  - Full message history with this customer
  - Merchant can read the context
  - Reply input — merchant can type a response directly from Mo'een
  - Messages sent from Mo'een are delivered via Telegram
- **Right side:** Structured order data
  - Order ID, creation date, current status
  - Customer info: name, phone, delivery address
  - Line items: product name, variant, quantity, unit price, subtotal
  - Order total
  - AI extraction confidence score (with tooltip explaining what it means)
  - Status change buttons: Confirm, Mark as Dispatched, Mark as Delivered, Flag
  - Edit button: merchant can correct any field the AI got wrong
  - Order timeline: history of all status changes with timestamps

**Creating Orders Manually**
- Button: "Create Order" → form with customer search, product selection, quantities
- For when AI misses an order or merchant takes an order by phone

**Order Lifecycle:**

| Status | Trigger | Inventory Effect | Customer Notification |
|--------|---------|-----------------|----------------------|
| **Incoming** | AI detects order intent | None | None |
| **Pending** | Customer confirms details OR merchant reviews | Inventory reserved | None |
| **Confirmed** | Merchant clicks Confirm | Inventory deducted | "Your order is confirmed!" |
| **Out for Delivery** | Merchant clicks Dispatch | None | "Your order is on its way!" |
| **Delivered** | Merchant clicks Delivered | None | "Your order has been delivered!" (optional feedback prompt) |
| **Flagged** | AI low confidence, timeout, stock issue, or manual | Depends on stage | "A team member will assist you shortly" |

**Technical notes:**
- Supabase Realtime: new orders appear live
- Framer Motion: card transitions between columns, detail panel slide-in
- Status change triggers n8n workflow for customer notifications
- Split view is responsive — on mobile, chat and order details become tabbed instead of side-by-side

---

## 5. Inventory

**Purpose:** Know what you have, what's running low, and what's out of stock — at a glance.

**Product List View**
- Table/grid of all products
- Each product shows: image thumbnail, name, current quantity, reserved quantity, available quantity, price
- Stock level indicator bar — visual health of each item (green → yellow → red)
- Out-of-stock rows highlighted with red background
- Low stock rows highlighted with amber background
- Search and filter by name, status (in stock, low, out of stock)
- Sort by name, quantity, price

**Product Detail View**
- Full product card:
  - Image (large)
  - Name
  - Alternative names (used for AI matching — e.g., "الكبيرة", "the large one")
  - Description
  - Price
  - Variants (if any — size, color)
  - Quantity: total, reserved (in pending orders), available
  - Low stock threshold (configurable per product)
- Edit all fields inline
- Stock adjustment: manual +/- with reason logging

**Adding Products**
- "Add Product" button → form
- Required: name, price, quantity
- Optional: image, alternative names, description, variants
- Instagram import available from this page too

**Technical notes:**
- Available quantity = total - reserved
- Reserved count updates automatically when orders move to Pending
- Deducted from total when orders move to Confirmed
- Returned to available if orders are cancelled
- Low stock alerts triggered by n8n workflow when quantity crosses threshold

---

## 6. Flags & Escalations

**Purpose:** When something needs human attention, it appears here with clear priority and recommended action.

**Three Priority Tiers:**

| Priority | Visual | Meaning | Examples |
|----------|--------|---------|----------|
| **Critical** | Red pulsing ring animation | Act now — real damage if delayed | Out of stock mid-order, customer waiting 2+ hours, order stuck in Incoming for too long |
| **Medium** | Amber steady indicator | Act soon — no immediate damage | AI low confidence extraction, unusual order volume, customer asked a question AI can't answer |
| **Low** | Gray subtle indicator | Act when free | Minor data inconsistency, optional product info missing, feedback request |

**Flag Card Content:**
- Conversation summary (AI-generated one-liner)
- Reason for escalation
- Time elapsed since flag was created
- Recommended action (e.g., "Review AI extraction and confirm order" or "Reply to customer question")
- Link to the relevant order or conversation
- Dismiss / Resolve button

**Flag Categories:**
- Out of stock mid-order — customer ordered something unavailable
- Customer waiting too long — response time exceeded threshold
- AI low confidence — extraction below confidence threshold, needs human review
- Human requested — customer asked to speak with a person
- Unusual order volume — sudden spike that might need attention
- AI unavailable — Gemini is down, message needs manual processing
- Stale order — order stuck in a status too long

**Technical notes:**
- Critical flags: Framer Motion pulsing red ring animation
- Flags auto-resolve when the underlying issue is addressed (e.g., merchant confirms the order)
- n8n workflows create flags based on timer rules and threshold checks
- Flags page shows counts by priority in the sidebar/nav for persistent visibility

---

## 7. Settings

**Purpose:** Business profile, connection management, and AI behavior configuration.

**Sections:**

**Business Profile**
- Business name, type, location, phone
- Business logo upload

**Telegram Connection**
- Connection status indicator (green = connected, red = disconnected)
- Bot token management (update, disconnect)
- Test connection button
- Future: WhatsApp connection will appear here

**Notification Preferences**
- Which events trigger Telegram notifications to the merchant
- Quiet hours (don't notify between X and Y)

**AI Behavior**
- Confidence threshold slider — below this percentage, AI escalates to human
- Auto-reply behavior: on/off for clarifying questions
- Handoff message customization — what AI says when it escalates to human

**Account**
- Email / phone management
- Password change
- Sign out
- Delete account

**Technical notes:**
- Settings saved to Supabase `merchants` table and `merchant_settings` table
- AI behavior settings passed to Gemini prompts dynamically
- Changes take effect immediately (no restart needed)

---

## Navigation Structure

**Sidebar (desktop) / Bottom bar (mobile):**

1. Dashboard (home icon)
2. Orders (list icon) — with badge showing Incoming + Pending count
3. Inventory (box icon) — with badge if any items out of stock
4. Flags (alert icon) — with badge showing Critical count, pulsing if > 0
5. Settings (gear icon)

**Top bar:**
- Mo'een logo (left)
- Business name (center or left)
- Notification bell (right) — with count
- Profile avatar (right) — click for account dropdown

**Technical notes:**
- Active page highlighted in sidebar
- Badge counts update via Supabase Realtime
- Sidebar collapses to icons on tablet
- Bottom bar on mobile with 5 tabs
- Framer Motion: page transitions (subtle slide or fade)
