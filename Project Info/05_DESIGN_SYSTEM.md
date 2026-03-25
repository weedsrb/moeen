# Mo'een — Design System

> Color is information, not decoration. Animation is communication, not decoration. Every visual choice earns its place by meaning something.

---

## Design Philosophy

Mo'een's visual system is built on **restraint with purpose**. The base is black and white — stark, clean, zero distraction. Color appears ONLY to communicate state, priority, or AI-generated content. When color appears, the merchant's eye goes there immediately — because color is rare, it is loud.

The same philosophy applies to animation: motion is used to guide attention, communicate state changes, and create spatial relationships. If an element doesn't need to move, it doesn't.

**Design principles:**
1. **Functional first** — every visual element serves a purpose
2. **Scannable** — a merchant glances at the dashboard for 3 seconds and knows what needs attention
3. **Calm confidence** — the interface feels in control, even when the business is chaotic
4. **Intentional delight** — small moments of polish that build trust without distracting

---

## Color System

### Base Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#0A0A0A` | Primary background (dark mode base) |
| `--color-bg-elevated` | `#141414` | Cards, panels, elevated surfaces |
| `--color-bg-subtle` | `#1A1A1A` | Hover states, subtle backgrounds |
| `--color-surface` | `#FFFFFF` | Primary background (light mode base) |
| `--color-text-primary` | `#FAFAFA` | Primary text (dark mode) |
| `--color-text-secondary` | `#A1A1AA` | Secondary text, labels |
| `--color-text-muted` | `#71717A` | Tertiary text, timestamps |
| `--color-border` | `#27272A` | Default borders |
| `--color-border-subtle` | `#1E1E21` | Subtle separators |

### Order Lifecycle Colors

Each status has a scientifically chosen color based on psychological association. These are SACRED — never reused for anything else.

| Status | Token | Value | Psychology |
|--------|-------|-------|------------|
| **Incoming** | `--color-status-incoming` | `#3B82F6` (Electric Blue) | Arrival, newness — a notification you want to open |
| **Pending** | `--color-status-pending` | `#F59E0B` (Warm Amber) | Traffic light caution — don't ignore, don't panic |
| **Confirmed** | `--color-status-confirmed` | `#10B981` (Clean Emerald) | Universal success — a small win the merchant feels |
| **Out for Delivery** | `--color-status-delivery` | `#8B5CF6` (Vivid Violet) | Energetic movement — the order is in motion |
| **Delivered** | `--color-status-delivered` | `#14B8A6` (Soft Teal) | Calm completion — a closed loop, revenue earned |
| **Cancelled** | `--color-status-cancelled` | `#6B7280` (Neutral Gray) | Closed, inactive — no attention needed |

### Flag Priority Colors

| Priority | Token | Value | Usage |
|----------|-------|-------|-------|
| **Critical** | `--color-priority-critical` | `#EF4444` (Alert Red) | Pulsing ring animation, demands immediate action |
| **Medium** | `--color-priority-medium` | `#F59E0B` (Amber) | Steady indicator, act soon |
| **Low** | `--color-priority-low` | `#6B7280` (Gray) | Subtle, handle when free |

### AI Color

| Token | Value | Usage |
|-------|-------|-------|
| `--color-ai` | `#7C3AED` (Violet) | EXCLUSIVELY for AI-generated content |

The AI color is sacred. It appears ONLY on:
- AI-extracted order data badges
- AI confidence indicators
- AI-generated suggestions and summaries
- The "AI processed" tag on messages

This means the merchant always knows at a glance: "this data came from AI, I should verify it."

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-success` | `#10B981` | Success states, positive feedback |
| `--color-warning` | `#F59E0B` | Warnings, attention needed |
| `--color-error` | `#EF4444` | Errors, destructive actions |
| `--color-info` | `#3B82F6` | Informational messages |

---

## Typography

### Font Stack

| Context | Font | Weight | Why |
|---------|------|--------|-----|
| **Latin text** | DM Sans | 400, 500, 600, 700 | Geometric, clean, modern, warm enough to feel human |
| **Arabic text** | Noto Naskh Arabic | 400, 500, 600, 700 | Editorial quality, optimized for screen readability |
| **Monospace** | JetBrains Mono | 400, 500 | Order IDs, SKUs, phone numbers, timestamps |

### Type Scale

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `--text-xs` | 12px | 16px | Timestamps, metadata |
| `--text-sm` | 14px | 20px | Secondary text, labels |
| `--text-base` | 16px | 24px | Body text, form inputs |
| `--text-lg` | 18px | 28px | Card titles, list headers |
| `--text-xl` | 20px | 28px | Page section headers |
| `--text-2xl` | 24px | 32px | Page titles |
| `--text-3xl` | 30px | 36px | Dashboard KPI numbers |
| `--text-4xl` | 36px | 40px | Landing page headings |
| `--text-hero` | 48-64px | 1.1 | Landing page hero text |

### Typography Rules

- All numerical data (order counts, prices, quantities, timestamps) uses JetBrains Mono — prevents layout shift and enables scanning
- Arabic text uses Noto Naskh Arabic — never fall back to system Arabic fonts
- Full RTL/LTR support using CSS logical properties (`margin-inline-start` not `margin-left`)
- Minimum body text size: 14px — merchants may be reading on small phone screens

---

## Spacing System

Uses a 4px base grid. All spacing is a multiple of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gaps (icon-text) |
| `--space-2` | 8px | Compact spacing |
| `--space-3` | 12px | Default inner padding |
| `--space-4` | 16px | Standard padding, gaps |
| `--space-5` | 20px | Card padding |
| `--space-6` | 24px | Section gaps |
| `--space-8` | 32px | Large section spacing |
| `--space-10` | 40px | Page section separation |
| `--space-12` | 48px | Major layout gaps |
| `--space-16` | 64px | Landing page section gaps |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements (badges, tags) |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 12px | Cards, panels |
| `--radius-xl` | 16px | Modal dialogs |
| `--radius-full` | 9999px | Avatars, circular buttons |

---

## Shadow System

Minimal shadows — the interface uses border and background contrast for depth, not heavy shadows.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.3)` | Cards, dropdowns |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.3)` | Modals, popovers |
| `--shadow-glow` | `0 0 20px rgba(var(--color-ai-rgb), 0.15)` | AI content subtle glow |

---

## Animation Patterns

### Framer Motion (React State Animations)

**Page Transitions**
```
Entrance: opacity 0→1, y: 8→0, duration: 0.3s, ease: easeOut
Exit: opacity 1→0, duration: 0.15s
```

**Card Entrance (staggered)**
```
Each card: opacity 0→1, y: 12→0
Stagger: 0.05s between cards
Duration: 0.3s per card
Ease: easeOut
```

**Status Change (order card)**
```
Layout animation: duration 0.4s, ease: spring(stiffness: 300, damping: 30)
Color transition: background-color 0.3s
Scale: 1.02 on status change, then back to 1 (0.3s)
```

**List Reordering (drag-and-drop)**
```
Layout animation: type: spring, stiffness: 300, damping: 30
Dragged item: scale 1.03, shadow elevation increase
```

**Detail Panel (slide-in)**
```
Entrance: x: 300→0, opacity: 0→1, duration: 0.3s, ease: easeOut
Exit: x: 0→300, opacity: 1→0, duration: 0.2s
```

**KPI Number Transition**
```
Count up/down animation when value changes
Duration: 0.6s
Ease: easeOut
```

**Hover States**
```
Cards: background-color transition 0.15s, subtle y: -1px translate
Buttons: scale 1.02, background-color transition 0.15s
```

### GSAP (Timeline & Scroll Animations)

**Landing Page Hero**
```
Timeline sequence:
1. Message cards cascade in from right (stagger 0.1s)
2. Cards pile up and overlap (simulating chaos)
3. Mo'een dashboard slides in from bottom
4. Cards reorganize into clean order cards
Duration: 2-3s total
Trigger: on page load
```

**Landing Page Scroll Sections**
```
Each section: ScrollTrigger
Entrance: opacity 0→1, y: 40→0
Duration: 0.6s
Start: "top 80%" (element enters viewport)
```

**Dashboard First Load (choreographed)**
```
GSAP timeline:
1. Sidebar slides in (x: -60→0, 0.3s)
2. KPI cards stagger in (y: 20→0, stagger 0.08s)
3. Quick actions panel fades in (opacity, 0.3s)
4. Activity snapshot fades in (opacity, 0.2s)
Total: ~1s
Only on first visit — subsequent visits skip choreography
```

**Critical Flag Pulse**
```
Infinite keyframe:
- Box shadow: 0 0 0 0 rgba(239,68,68,0.4) → 0 0 0 8px rgba(239,68,68,0) 
- Duration: 1.5s
- Repeat: infinite
CSS animation (no JS needed for this one)
```

### Animation Rules

1. **Never animate layout on scroll in the app dashboard** — only on the landing page
2. **Status changes get motion, static content doesn't** — a new order appearing is animated, the sidebar is not
3. **Duration ceiling: 0.4s for app interactions** — anything longer feels sluggish when you're working
4. **Landing page can be slower and more cinematic** — up to 2-3s for hero sequences
5. **Respect `prefers-reduced-motion`** — disable all non-essential animation for users who request it
6. **First load gets choreography, return visits don't** — store a flag in localStorage

---

## Component Patterns

### Order Card

```
┌─────────────────────────────────┐
│ ▌ Status Color   Customer Name  │  ← Left border = lifecycle color
│ ▌                   2m ago      │  ← Timestamp in monospace
│ ▌ Product × Qty               │
│ ▌ Product × Qty               │
│ ▌               ₪120.00       │  ← Total in monospace
│ ▌         [AI 87%]            │  ← AI badge in violet (if AI-created)
└─────────────────────────────────┘
```

### KPI Card

```
┌─────────────────────┐
│  📦 New Orders      │  ← Icon + label
│       12            │  ← Big number, monospace, lifecycle color
│     ↑ +3 today      │  ← Trend indicator
└─────────────────────┘
```

### Flag Card

```
┌─────────────────────────────────────┐
│ 🔴 CRITICAL          3m ago        │  ← Priority badge + time
│                                     │
│ Customer waiting too long           │  ← Title
│ Ahmad has been waiting 2+ hours     │  ← AI-generated description
│ for a response about his order.     │
│                                     │
│ Recommended: Reply to customer      │  ← Recommended action
│                                     │
│ [View Order]  [Resolve]             │  ← Actions
└─────────────────────────────────────┘
```

### Chat Message Bubble

```
Customer (inbound):
┌──────────────────────────┐
│ بدي 3 كنافة كبيرة       │  ← Left-aligned, neutral bg
│ وتوصلولي على نابلس      │
│                 10:23 AM │  ← Monospace timestamp
└──────────────────────────┘

Mo'een (outbound, AI):
        ┌──────────────────────────────┐
        │ ✨ I've noted your order:     │  ← Right-aligned
        │ 3× Knafeh (Large)            │     Violet tint if AI-sent
        │ Delivery to Nablus           │
        │ A team member will confirm.  │
        │ 10:23 AM                     │
        └──────────────────────────────┘

Merchant (outbound):
        ┌──────────────────────────────┐
        │ تم تأكيد الطلب! شكراً 😊     │  ← Right-aligned, brand tint
        │ 10:25 AM                     │
        └──────────────────────────────┘
```

---

## Responsive Breakpoints

| Token | Value | Layout |
|-------|-------|--------|
| `--bp-mobile` | < 640px | Single column, bottom nav |
| `--bp-tablet` | 640-1024px | Collapsed sidebar (icons only), adapted grid |
| `--bp-desktop` | 1024-1440px | Full sidebar, split views |
| `--bp-wide` | > 1440px | Max-width container, comfortable spacing |

---

## Dark Mode / Light Mode

MVP launches in **dark mode** as the default — matches the black/white design philosophy and is easier on the eyes for merchants checking their dashboard at all hours.

Light mode will be added as a toggle in Settings (Phase 2). The color token system is designed to support both — all colors reference tokens, never hard-coded values.

---

## Tailwind Configuration Notes

- Extend Tailwind's color palette with all lifecycle, priority, and AI colors as custom values
- Configure DM Sans, Noto Naskh Arabic, and JetBrains Mono in the font family config
- Add custom animation keyframes for the critical flag pulse
- Set up RTL variant for future Arabic support: `dir="rtl"` toggles all logical properties
- shadcn/ui components will be themed to match this design system via CSS variables
