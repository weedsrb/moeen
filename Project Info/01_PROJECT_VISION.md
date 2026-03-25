# Mo'een (معين) — Project Vision

> **مش بس تطبيق، معك.**
> Not just an app — it's with you.

---

## What Is Mo'een?

Mo'een is a SaaS order management platform built for Palestinian and MENA small businesses that rely on messaging apps as their primary sales channel. It connects to a merchant's messaging account, uses AI to detect and extract orders from natural conversation, and organizes everything into a clean dashboard the merchant actually understands.

Mo'een is not a chatbot. It is not a generic CRM. It is a trusted operational assistant that reads the chaos and creates clarity.

---

## The Problem

Thousands of Palestinian small businesses run entirely through WhatsApp and Telegram. They post products on Instagram, receive orders as raw chat messages, and manage everything manually — with no operational layer underneath.

**The merchant's reality every morning:**

- 50+ unread messages — orders, questions, complaints, all mixed together
- No way to know which message is urgent and which can wait
- Orders get lost, forgotten, or mishandled in the chaos
- No overview of inventory — stock runs out mid-conversation
- Customers wait hours for replies, damaging trust and losing sales

This is not a technology problem. It is an organization problem. And no existing tool solves it for this merchant, in this language, at this price point.

---

## The Solution

Mo'een connects directly to the merchant's messaging account and uses AI to read incoming messages, detect order intent in Arabic, English, or mixed language (Arabizi), extract order details from natural conversation, and organize everything into a structured dashboard. The merchant sees exactly what to act on first, and why.

**What Mo'een does:**

- Connects to the merchant's Telegram (MVP) and WhatsApp (Phase 2)
- Uses Gemini 2.5 Flash to detect order intent and extract structured data
- Organizes orders into a visual lifecycle: Incoming → Pending → Confirmed → Out for Delivery → Delivered
- Flags problems with priority levels so the merchant handles critical issues first
- Tracks inventory automatically — reserved, available, deducted
- Sends status updates to customers automatically via template messages

**What Mo'een does NOT do:**

- Replace the merchant — AI suggests, the merchant decides
- Pretend to be human — when AI is uncertain, it tells the customer a human will take over
- Use AI where simple rules work — inventory math, status updates, and timer-based alerts use logic, not AI

---

## Target Market

**Primary:** Palestinian small businesses selling physical products through messaging apps — food, clothing, handmade goods, home products.

**Ideal first merchant profile:**

- Receives 20–100+ messaging orders per day
- Posts products on Instagram, takes orders via DM, WhatsApp, or Telegram
- Has no formal inventory or order management system
- Operates primarily from a mobile phone
- Comfortable with messaging apps but overwhelmed by their limitations as a business tool

**Why Palestine first:** High messaging app penetration, dense informal commerce, tech-savvy young population, and underserved tooling. Starting hyperlocal generates real Levantine Arabic training data that becomes a long-term competitive moat.

---

## Core Product Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Name** | Mo'een (معين) — "the one who helps" | Local, modern, meaningful |
| **MVP Channel** | Telegram Bot API | Free, instant setup, no approval process — validate product logic fast |
| **Phase 2 Channel** | WhatsApp via third-party official provider | Solve the problem where it actually lives |
| **Channel Architecture** | Messaging abstraction layer | Both channels plug into the same interface — core app never changes |
| **AI Model** | Gemini 2.5 Flash | Best Arabic quality-to-cost ratio |
| **AI Philosophy** | Surgical, not pervasive | AI handles language, rules handle logic, humans handle judgment |
| **AI Transparency** | Explicit handoff | When uncertain, AI says "a human will help you shortly" |
| **Database** | Supabase (PostgreSQL) | Realtime, auth, storage, RLS — all in one |
| **Multi-tenancy** | Shared DB + Row Level Security | Simple, secure, scales to hundreds of merchants |
| **Automation** | n8n Cloud | Rules engine for status updates, alerts, timer-based flags |
| **Frontend** | Next.js + TypeScript + Tailwind + shadcn/ui | Fast dev, professional quality, great Claude Code compatibility |
| **Animations** | Framer Motion + GSAP | Framer for React state animations, GSAP for timeline/scroll sequences |
| **Auth** | Supabase Auth (Google + email + phone OTP) | Multiple sign-in options for the Palestinian market |
| **Team** | Solo merchant login (MVP) | Keep it simple — team features in future |
| **Pricing** | Free MVP, monetize later | Prove value first, earn trust, then convert |
| **Future pricing metric** | Orders per month | The metric merchants understand and feel |
| **Catalog setup** | Manual entry + Instagram import | Manual as baseline, Instagram import as the smart onboarding method |
| **Language** | English-first, Arabic/RTL planned | Ship fast, add Arabic in Phase 2 |
| **Design** | Black/white base + functional color | Color is information, not decoration |

---

## Success Metrics (MVP Pilot)

- 3–5 real merchants in Palestine using Mo'een daily
- 95%+ messages stored and categorized correctly
- Merchant handles all orders inside Mo'een (not going back to raw Telegram)
- Average time-to-first-action reduced (merchant knows what to do within 30 seconds of opening the dashboard)
- Collect weekly feedback — improve highest-friction points first

---

## What This Document Is For

This is the north star. Every feature, every design decision, every line of code should trace back to this document. If something doesn't serve the merchant described above, it doesn't belong in Mo'een.

When in doubt, ask: **Does this help the merchant act faster and feel more in control?**
