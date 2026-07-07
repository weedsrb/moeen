"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock,
  Copy,
  House,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  MessageSquare,
  MessageSquareX,
  Palette,
  Package,
  PackageCheck,
  PackageX,
  Pill,
  Plus,
  Scissors,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

type Status = "incoming" | "pending" | "confirmed" | "delivery" | "delivered";

interface DashboardOrder {
  id: string;
  who: string;
  items: string;
  total: string;
  status: Status;
  conf: number;
}

const statusTint: Record<Status, { color: string; label: string }> = {
  incoming: { color: "var(--color-status-incoming)", label: "Incoming" },
  pending: { color: "var(--color-status-pending)", label: "Pending" },
  confirmed: { color: "var(--color-status-confirmed)", label: "Confirmed" },
  delivery: { color: "var(--color-status-delivery)", label: "Out" },
  delivered: { color: "var(--color-status-delivered)", label: "Delivered" },
};

const heroMessages = [
  { text: "بدي 3 كنافة كبيرة وتوصلولي", who: "أم محمد", time: "7:02" },
  { text: "وين صار الطلب تبعي؟؟", who: "أحمد", time: "7:05" },
  { text: "في عندكم من الحجم الوسط؟", who: "سارة", time: "7:08" },
  { text: "ارسلي 2 على نابلس بأسرع وقت", who: "خالد", time: "7:12" },
  { text: "هاي بدي أطلب زي المرة اللي فاتت", who: "أم أحمد", time: "7:15" },
  { text: "كم سعر التوصيل على رام الله؟", who: "ليلى", time: "7:18" },
  { text: "بدي 5 قطع بقلاوة و2 كنافة صغيرة", who: "أبو يوسف", time: "7:21" },
  { text: "الطلب اللي حكيتك عنه أمس جاهز؟", who: "منى", time: "7:24" },
];

const heroOrders: DashboardOrder[] = [
  {
    id: "MO-1042",
    who: "أم محمد",
    items: "3× Knafeh (Large)",
    total: "₪135.00",
    status: "incoming" as const,
    conf: 94,
  },
  {
    id: "MO-1043",
    who: "خالد",
    items: "2× Mixed Platter, Nablus",
    total: "₪80.00",
    status: "confirmed" as const,
    conf: 91,
  },
  {
    id: "MO-1041",
    who: "أم أحمد",
    items: "1× Knafeh M, 2× Baklava",
    total: "₪95.00",
    status: "pending" as const,
    conf: 78,
  },
  {
    id: "MO-1040",
    who: "طارق",
    items: "10× Knafeh small (hold)",
    total: "₪240.00",
    status: "pending" as const,
    conf: 82,
  },
];

const heroDashboardMetrics = {
  incoming_orders: 12,
  confirmed_orders: 18,
  delivery_orders: 6,
  open_flags: 3,
  today_messages: 54,
  today_orders: 12,
  today_delivered: 9,
  yesterday_orders: 8,
  yesterday_delivered: 7,
  yesterday_messages: 41,
};

const problems = [
  {
    num: "01",
    Icon: MessageSquareX,
    title: "The lost order",
    desc: "A customer ordered yesterday. You forgot. Now they're messaging again — angry.",
    ar: "وين الطلب تبعي من أمس؟!",
  },
  {
    num: "02",
    Icon: AlertTriangle,
    title: "The angry follow-up",
    desc: "“Where is my order??” at 7am. You haven't even opened Telegram yet.",
    ar: "يا جماعة حدا يرد علي!!",
  },
  {
    num: "03",
    Icon: PackageX,
    title: "The out-of-stock surprise",
    desc: "You confirmed an order for something you ran out of two days ago.",
    ar: "آسف خلصت الكنافة من يومين…",
  },
  {
    num: "04",
    Icon: Copy,
    title: "The duplicate order",
    desc: "Same customer sent the same order in different words. You processed both.",
    ar: "بدي زي اللي طلبته قبل — يعني الكبيرة",
  },
];

const demoTurns = [
  { who: "أم محمد", ar: "مرحبا، بدي 3 كنافة كبيرة وتوصيل على البيرة", time: "7:02 AM" },
  { who: "merchant", text: "أهلا! بدك توصيل اليوم؟", time: "7:03 AM" },
  { who: "أم محمد", ar: "إيه، الساعة 5 المساء لو سمحت", time: "7:03 AM" },
];

const demoFields = [
  { k: "Customer", v: "أم محمد", delay: 200 },
  { k: "Items", v: "3× Knafeh (Large)", delay: 600 },
  { k: "Delivery", v: "Al-Bireh — 5:00 PM", delay: 1000 },
  { k: "Total", v: "₪135.00", delay: 1400 },
  { k: "Confidence", v: "94%", ai: true, delay: 1800 },
];

const steps = [
  {
    num: "01",
    tag: "Connect",
    title: "Plug Mo'een into your Telegram.",
    desc: "Two minutes. One bot token. Mo'een starts listening to incoming messages without changing how you already work.",
    detail: ["No new app for customers", "No phone-number change", "Disconnect any time"],
  },
  {
    num: "02",
    tag: "AI sorts",
    ai: true,
    title: "Mo'een reads. It extracts. It labels.",
    desc: "Gemini 2.5 Flash detects intent, pulls out items and quantities, and writes a confidence score next to every order. When it's unsure, it says so.",
    detail: ["Levantine Arabic, English, Arabizi", "Items, quantities, totals, addresses", "Always says: AI 87%"],
  },
  {
    num: "03",
    tag: "You act",
    title: "Open the dashboard. Everything is organized.",
    desc: "Color-banded order cards by lifecycle stage. Critical flags pulse. Confirm, dispatch, deliver — all without leaving Mo'een.",
    detail: ["Lifecycle dashboard", "Priority flags", "One-tap status updates"],
  },
];

const tourViews = [
  {
    id: "dashboard",
    label: "Dashboard",
    title: "See the day at a glance.",
    desc: "A single board that shows every order, by lifecycle stage. The 3-pixel left edge is the color of the stage — incoming blue, pending amber, confirmed green.",
  },
  {
    id: "conversations",
    label: "Conversations",
    title: "Customer chat, with structure underneath.",
    desc: "Messages on the left, the order Mo'een extracted on the right. Edit fields directly. The chat history stays intact — Mo'een just gives it a spine.",
  },
  {
    id: "inventory",
    label: "Inventory",
    title: "Stock that updates itself.",
    desc: "Reserved, available, deducted — automatic. Mo'een blocks impossible orders before you confirm them.",
  },
  {
    id: "flags",
    label: "Flags",
    title: "Three colors. Three priorities. Done.",
    desc: "Critical pulses red. Medium is amber. Low is gray. Customers waiting too long get auto-flagged — you don't have to remember.",
  },
] as const;

type TourView = (typeof tourViews)[number]["id"];

const faqs = [
  {
    q: "Do my customers need to install anything?",
    a: "No. Mo'een sits behind your existing Telegram bot. Customers keep messaging the same way they always have — the only thing that changes is what you see on your end.",
  },
  {
    q: "How accurate is the AI?",
    a: "On Levantine Arabic order extraction we currently see ~92% field-level accuracy. Every extracted order shows its confidence score, and anything below 70% goes to a review queue.",
  },
  {
    q: "Does it work with WhatsApp?",
    a: "WhatsApp is on the Phase 2 roadmap via an official BSP. The MVP is Telegram-only because we wanted to validate the core product first.",
  },
  {
    q: "What happens when the AI is unsure?",
    a: "Mo'een tells the customer plainly: “A team member will confirm shortly.” No fake-human pretending. The order is flagged in your dashboard with a review tag.",
  },
  {
    q: "How much does it cost?",
    a: "Free during the pilot. Long-term pricing will be tied to orders processed per month — the only metric small merchants actually feel.",
  },
  {
    q: "Can I see my old chat history?",
    a: "Yes. Mo'een doesn't replace your Telegram inbox — it sits alongside it. Every conversation Mo'een touches is preserved verbatim.",
  },
];

const merchantSegments = [
  {
    num: "01",
    Icon: House,
    title: "Home-based sellers",
    desc: "For merchants taking repeat orders through chats, story replies, and forwarded messages.",
    fit: "Cakes, gifts, resellers, everyday household items",
  },
  {
    num: "02",
    Icon: ShoppingBag,
    title: "Fashion & accessories",
    desc: "When customers order by screenshot, color, size, and fast follow-up questions, Mo'een keeps the thread organized.",
    fit: "Abayas, bags, jewelry, watches, small fashion catalogs",
  },
  {
    num: "03",
    Icon: Pill,
    title: "Pharmacies",
    desc: "Useful for high-volume message intake where customers ask for availability, substitutions, and delivery timing.",
    fit: "OTC requests, refill coordination, home delivery inquiries",
  },
  {
    num: "04",
    Icon: Scissors,
    title: "Handmade products",
    desc: "Ideal for merchants selling custom or small-batch items where every order comes with a little extra context.",
    fit: "Candles, soaps, crochet, stationery, customized gifts",
  },
  {
    num: "05",
    Icon: Palette,
    title: "Artists",
    desc: "Great for creators who sell commissions, prints, and one-off pieces through direct conversations.",
    fit: "Commissions, framed work, portraits, limited drops",
  },
  {
    num: "06",
    Icon: ChefHat,
    title: "Home kitchens",
    desc: "Perfect for kitchens handling daily order waves, delivery notes, and schedule changes through DMs.",
    fit: "Meal prep, trays, desserts, seasonal menus, catering requests",
  },
  {
    num: "07",
    Icon: Store,
    title: "Almost any catalog business",
    desc: "If orders arrive in messages and someone has to manually turn those chats into next steps, Mo'een fits.",
    fit: "Flowers, gifts, cosmetics, baby products, local retail",
  },
] satisfies ReadonlyArray<{
  num: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
  fit: string;
}>;

function cssVars(vars: Record<string, string | number>) {
  return vars as CSSProperties;
}

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(`.${styles.reveal}`));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add(styles.visible));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
          } else {
            entry.target.classList.remove(styles.visible);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const winH = window.innerHeight;
      const total = r.height + winH;
      const seen = winH - r.top;
      setProgress(Math.min(1, Math.max(0, seen / total)));
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);

  return progress;
}

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.4,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return visible;
}

export function Wordmark({ size = 18, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 8,
        color: muted ? "var(--color-fg-muted)" : "var(--color-fg)",
      }}
    >
      <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.01em" }}>
        Mo<span style={{ color: "var(--color-ai)" }}>&apos;</span>een
      </span>
      <span
        className={styles.arabic}
        style={{
          color: "var(--color-fg-muted)",
          fontSize: size - 2,
          fontWeight: 500,
        }}
      >
        معين
      </span>
    </span>
  );
}

function LandingButton({
  href,
  children,
  variant = "primary",
  size = "md",
  type,
  disabled,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "lg";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const buttonClassName = cn(
    styles.btn,
    variant === "primary" && styles.btnPrimary,
    variant === "outline" && styles.btnOutline,
    variant === "ghost" && styles.btnGhost,
    size === "md" ? styles.btnMd : styles.btnLg,
    className
  );

  if (href) {
    return (
      <a className={buttonClassName} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={buttonClassName} disabled={disabled} type={type ?? "button"}>
      {children}
    </button>
  );
}

function Reveal({
  children,
  delay,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: 1 | 2 | 3 | 4;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        styles.reveal,
        delay === 1 && styles.delay1,
        delay === 2 && styles.delay2,
        delay === 3 && styles.delay3,
        delay === 4 && styles.delay4,
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

function FloatingMessage({
  message,
  style,
  progress,
  depth,
}: {
  message: (typeof heroMessages)[number];
  style: CSSProperties & { tx: number; ty: number };
  progress: number;
  depth: number;
}) {
  const drift = Math.min(1, progress * 1.1);

  return (
    <div
      className={cn(
        styles.floatMsg,
        depth === 1 && styles.floatOne,
        depth === 2 && styles.floatTwo,
        depth === 3 && styles.floatThree
      )}
      style={{
        ...style,
        opacity: Math.max(0, 1 - drift * 1.6),
        translate: `${style.tx * drift}px ${style.ty * drift}px`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <span className={styles.arabic} style={{ fontSize: 13, fontWeight: 600 }}>
          {message.who}
        </span>
        <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 10 }}>
          {message.time}
        </span>
      </div>
      <p
        className={styles.arabic}
        dir="rtl"
        style={{
          margin: 0,
          color: "var(--color-fg-secondary)",
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {message.text}
      </p>
    </div>
  );
}

function HeroDashboardMock() {
  return (
    <div className={styles.dashboardShell}>
      <div className={styles.dashboardGlow} />
      <div className={cn(styles.glass, styles.dashboardWindow)}>
        <div className={styles.browserBar}>
          <div className={styles.browserDots}>
            <span className={styles.browserDot} style={{ background: "#ff5f57" }} />
            <span className={styles.browserDot} style={{ background: "#febc2e" }} />
            <span className={styles.browserDot} style={{ background: "#28c840" }} />
          </div>
          <div className={styles.mono} style={{ marginInline: "auto", color: "var(--color-fg-muted)", fontSize: 12 }}>
            moeen.app/dashboard
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-fg-muted)", fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
            Live
          </div>
        </div>
        <div className={styles.dashboardBody}>
          <aside className={styles.dashboardSidebar}>
            <div style={{ padding: "4px 8px 12px" }}>
              <Wordmark size={14} />
            </div>
            {[
              { Icon: LayoutDashboard, label: "Dashboard", active: true },
              { Icon: MessageCircle, label: "Messages", count: 12 },
              { Icon: Clock, label: "Orders", count: 8 },
              { Icon: Package, label: "Inventory" },
              { Icon: AlertTriangle, label: "Flags", count: 3, danger: true },
              { Icon: Settings, label: "Settings" },
            ].map(({ Icon, label, active, count, danger }) => (
              <div key={label} className={cn(styles.sidebarItem, active && styles.sidebarItemActive)}>
                <Icon size={15} />
                <span style={{ flex: 1 }}>{label}</span>
                {count != null && (
                  <span
                    className={styles.mono}
                    style={{
                      padding: "1px 6px",
                      borderRadius: 99,
                      background: danger ? "rgb(239 68 68 / 0.12)" : "var(--color-bg-subtle)",
                      color: danger ? "#ef4444" : "var(--color-fg-muted)",
                      fontSize: 10,
                    }}
                  >
                    {count}
                  </span>
                )}
              </div>
            ))}
          </aside>
          <div className={styles.dashboardContent}>
            <HeroDashboardContent />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroDashboardContent() {
  const metrics = heroDashboardMetrics;
  const kpiCards = [
    {
      title: "New Orders",
      value: metrics.incoming_orders,
      icon: ClipboardList,
      color: "text-status-incoming",
      trend: {
        current: metrics.today_orders,
        previous: metrics.yesterday_orders,
      },
    },
    {
      title: "Confirmed",
      value: metrics.confirmed_orders,
      icon: CheckCircle2,
      color: "text-status-confirmed",
      trend: null,
    },
    {
      title: "Out for Delivery",
      value: metrics.delivery_orders,
      icon: Truck,
      color: "text-status-delivery",
      trend: null,
    },
    {
      title: "Flagged",
      value: metrics.open_flags,
      icon: AlertTriangle,
      color: "text-priority-critical",
      trend: null,
    },
  ];

  function trendText(current: number, previous: number): string {
    const delta = current - previous;
    const arrow = delta >= 0 ? "↑" : "↓";
    return `${arrow} ${Math.abs(delta)} vs yesterday`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Reveal key={kpi.title} delay={(Math.min(index + 1, 4) as 1 | 2 | 3 | 4)}>
              <Card className={cn(styles.dashboardMetricCard, "h-full transition-colors hover:bg-muted/50")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-2xl font-bold">{kpi.value}</p>
                  {kpi.trend && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {trendText(kpi.trend.current, kpi.trend.previous)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={2}>
        <Card className={styles.dashboardInventoryCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5" />
              Inventory Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  Out of Stock (1)
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm">
                    <span className={styles.inventoryItemName}>Knafeh (Small)</span>
                    <span className="font-mono text-red-500">0 available</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  Low Stock (2)
                </p>
                <div className="space-y-1">
                  {[
                    ["Knafeh (Medium)", "3 available"],
                    ["Mixed Platter", "4 available"],
                  ].map(([name, available]) => (
                    <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm" key={name}>
                      <span className={styles.inventoryItemName}>{name}</span>
                      <span className="font-mono text-amber-500">{available}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={3}>
        <Card className={styles.dashboardActivityCard}>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(styles.activityStatsGrid, "grid grid-cols-3 gap-4 text-center")}>
              <div className={styles.activityStatItem}>
                <div className="flex items-center justify-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-info" />
                  <p className="font-mono text-2xl font-bold">
                    {metrics.today_messages}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Messages</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {trendText(metrics.today_messages, metrics.yesterday_messages)}
                </p>
              </div>
              <div className={styles.activityStatItem}>
                <div className="flex items-center justify-center gap-1.5">
                  <Package className="h-4 w-4 text-status-pending" />
                  <p className="font-mono text-2xl font-bold">
                    {metrics.today_orders}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Orders</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {trendText(metrics.today_orders, metrics.yesterday_orders)}
                </p>
              </div>
              <div className={styles.activityStatItem}>
                <div className="flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-4 w-4 text-status-delivered" />
                  <p className="font-mono text-2xl font-bold">
                    {metrics.today_delivered}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Delivered</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {trendText(metrics.today_delivered, metrics.yesterday_delivered)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

function OrderList({ orders }: { orders: DashboardOrder[] }) {
  return (
    <div className={styles.orderRows}>
      {orders.map((order, i) => {
        const tint = statusTint[order.status];
        return (
          <div
            key={order.id}
            className={cn(styles.orderRow, i % 2 === 0 ? styles.floatOne : styles.floatTwo)}
            style={cssVars({ "--row-color": tint.color })}
          >
            <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
              {order.id}
            </span>
            <div>
              <span className={styles.arabic} style={{ fontSize: 13, fontWeight: 600 }}>
                {order.who}
              </span>
              <div style={{ marginTop: 1, color: "var(--color-fg-secondary)", fontSize: 11.5 }}>
                {order.items}
              </div>
            </div>
            <span className={styles.mono} style={{ fontSize: 12, fontWeight: 500 }}>
              {order.total}
            </span>
            <span className={styles.statusBadge}>{tint.label}</span>
            <span className={styles.aiBadge}>AI {order.conf}%</span>
          </div>
        );
      })}
    </div>
  );
}

function HeroSection() {
  const heroRef = useRef<HTMLElement>(null);
  const progress = useScrollProgress(heroRef);
  const positions: Array<CSSProperties & { tx: number; ty: number }> = [
    { top: "18%", left: "4%", rotate: "-7deg", tx: -120, ty: -40 },
    { top: "10%", right: "6%", rotate: "6deg", tx: 130, ty: -50 },
    { top: "42%", left: "2%", rotate: "2deg", tx: -160, ty: 30 },
    { top: "52%", right: "2%", rotate: "-4deg", tx: 160, ty: 20 },
    { top: "72%", left: "8%", rotate: "5deg", tx: -90, ty: 80 },
    { top: "78%", right: "10%", rotate: "-6deg", tx: 100, ty: 90 },
    { top: "30%", right: "24%", rotate: "3deg", tx: 60, ty: -90 },
    { top: "62%", left: "22%", rotate: "-3deg", tx: -60, ty: 60 },
  ];

  return (
    <section ref={heroRef} id="top" className={styles.hero}>
      <div className={styles.gridBg} />
      <div aria-hidden className={styles.floatLayer}>
        {heroMessages.map((message, i) => (
          <FloatingMessage key={message.time} message={message} style={positions[i]} depth={(i % 3) + 1} progress={progress} />
        ))}
      </div>

      <div className={styles.heroCopy}>
        <Reveal>
          <div className={styles.eyebrowPill}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-ai)", boxShadow: "0 0 10px var(--color-ai)" }} />
            <span className={styles.mono} style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Now in private beta · Palestine
            </span>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <h1 className={cn(styles.editorialH, styles.heroTitle)}>
            You wake up to <span className={styles.heroHighlight}>50 messages</span>.
            <br />
            <span className={styles.muted}>Half are orders.</span>{" "}
            <span>Which half?</span>
          </h1>
        </Reveal>

        <Reveal delay={2}>
          <p className={styles.heroSubcopy}>
            Mo&apos;een reads your Telegram messages, extracts orders from natural Arabic, and organizes everything into a dashboard that tells you what to do next — so you start your morning in control.
          </p>
        </Reveal>

        <Reveal delay={3} className={styles.heroActions}>
          <LandingButton href="#cta" size="lg">
            Request early access <ArrowRight size={16} />
          </LandingButton>
          <LandingButton href="#demo" size="lg" variant="outline" className={styles.heroDemoButton}>
            Watch the live demo
          </LandingButton>
        </Reveal>

        <Reveal delay={4}>
          <div className={styles.heroProof}>
            <Check size={14} /> 2-minute setup · <Check size={14} /> Works with your existing Telegram · <Check size={14} /> Free during pilot
          </div>
        </Reveal>
      </div>

      <HeroDashboardMock />

      <div aria-hidden className={styles.scrollCue} style={{ opacity: 1 - Math.min(1, progress * 4) }}>
        <span>Scroll</span>
        <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, var(--color-fg-muted), transparent)" }} />
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section id="problem" className={styles.section}>
      <div className={styles.container}>
        <header className={styles.problemHeader}>
          <Reveal>
            <div className={styles.sectionNum} style={{ marginBottom: 16 }}>
              0.1 The problem
            </div>
            <h2 className={styles.editorialH} style={{ maxWidth: 720, fontSize: "clamp(32px, 4.4vw, 56px)" }}>
              Sound familiar?
              <br />
              <span className={styles.muted}>Every merchant with a Telegram business knows these moments.</span>
            </h2>
          </Reveal>
          <Reveal delay={1} style={{ maxWidth: 280 }}>
            <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 14, lineHeight: 1.55 }}>
              Messaging apps were never built for commerce. The chaos isn&apos;t a tooling problem — it&apos;s an organization problem.
            </p>
          </Reveal>
        </header>

        <div className={styles.problemGrid}>
          {problems.map((problem, i) => {
            const Icon = problem.Icon;
            return (
              <Reveal key={problem.num} className={cn(styles.problemCard, styles.lift)} style={{ transitionDelay: `${i * 60}ms` }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                    <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
                      {problem.num}
                    </span>
                    <span className={styles.iconBox}>
                      <Icon size={16} />
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {problem.title}
                  </h3>
                  <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 13.5, lineHeight: 1.55 }}>
                    {problem.desc}
                  </p>
                </div>
                <div className={cn(styles.quoteBox, styles.arabic)} dir="rtl">
                  &ldquo;{problem.ar}&rdquo;
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LiveDemo() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const [tick, setTick] = useState(0);
  const [reset, setReset] = useState(0);
  const showFields = tick >= 2;

  useEffect(() => {
    if (!inView) return;
    const timers = [
      setTimeout(() => setTick(0), 0),
      setTimeout(() => setTick(1), 800),
      setTimeout(() => setTick(2), 1700),
      setTimeout(() => setTick(3), 4000),
      setTimeout(() => setReset((r) => r + 1), 7500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [inView, reset]);

  return (
    <section ref={ref} id="demo" className={cn(styles.section, styles.sectionAlt)}>
      <div className={styles.container}>
        <SectionHeader num="0.2 Live extraction" title="From a sentence to a structured order." centered>
          Mo&apos;een reads natural Arabic, English, and Arabizi. It pulls items, quantities, totals, delivery details — and labels its own confidence.
        </SectionHeader>

        <div className={styles.demoGrid}>
          <Reveal className={cn(styles.glass, styles.demoCard)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 14, borderBottom: "1px solid var(--color-border-subtle)" }}>
              <div className={styles.arabic} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", color: "white", fontSize: 14, fontWeight: 600 }}>
                أم
              </div>
              <div style={{ flex: 1 }}>
                <div className={styles.arabic} style={{ fontSize: 14, fontWeight: 600 }}>
                  أم محمد
                </div>
                <div style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
                  Telegram · <span style={{ color: "#10b981" }}>● online</span>
                </div>
              </div>
              <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 10 }}>
                +970 5..
              </span>
            </div>

            <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 10, padding: "18px 0" }}>
              {demoTurns.map((turn) => {
                const merchant = turn.who === "merchant";
                return (
                  <div
                    key={`${turn.who}-${turn.time}`}
                    style={{
                      alignSelf: merchant ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      padding: "10px 14px",
                      border: `1px solid ${merchant ? "var(--color-border)" : "rgb(59 130 246 / 0.2)"}`,
                      borderRadius: 12,
                      background: merchant ? "var(--color-bg-subtle)" : "rgb(59 130 246 / 0.1)",
                    }}
                  >
                    <p className={turn.ar ? styles.arabic : undefined} dir={turn.ar ? "rtl" : "ltr"} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                      {turn.ar ?? turn.text}
                    </p>
                    <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 10 }}>
                      {turn.time}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid", borderColor: tick >= 1 ? "rgb(124 58 237 / 0.25)" : "var(--color-border)", borderRadius: 999, background: tick >= 1 ? "rgb(124 58 237 / 0.1)" : "var(--color-bg-subtle)" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18 }}>
                {tick >= 1 && <span className={styles.ringPulse} style={{ position: "absolute", width: 18, height: 18, borderRadius: "50%", background: "rgb(124 58 237 / 0.4)" }} />}
                <Sparkles size={14} style={{ position: "relative", color: "var(--color-ai)" }} />
              </div>
              <span style={{ color: tick >= 1 ? "var(--color-ai)" : "var(--color-fg-muted)", fontSize: 13, fontWeight: 500 }}>
                {tick === 0 && "Mo'een is listening"}
                {tick === 1 && "Reading message…"}
                {tick === 2 && "Order extracted"}
                {tick >= 3 && "Customer notified ✓"}
              </span>
              <span className={styles.mono} style={{ marginLeft: "auto", color: "var(--color-fg-muted)", fontSize: 10 }}>
                Gemini 2.5
              </span>
            </div>
          </Reveal>

          <div className={styles.demoConnector}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, border: "1px solid var(--color-border)", borderRadius: "50%", background: "var(--color-bg-elevated)", color: "var(--color-ai)", boxShadow: tick >= 1 ? "0 0 30px rgb(124 58 237 / 0.3)" : "none" }}>
              <Sparkles size={20} />
            </div>
            <div className={styles.connectorLine} />
          </div>

          <Reveal className={styles.demoCard} style={{ border: "1px solid var(--color-border)", background: "var(--color-bg)", boxShadow: showFields ? "0 0 0 1px rgb(124 58 237 / 0.25), 0 0 50px rgb(124 58 237 / 0.15)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottom: "1px solid var(--color-border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--color-status-incoming)" }} />
                <span className={styles.mono} style={{ fontSize: 12, fontWeight: 500 }}>
                  MO-1042
                </span>
                <span className={styles.statusBadge} style={cssVars({ "--row-color": "var(--color-status-incoming)" })}>
                  Incoming
                </span>
              </div>
              <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 10 }}>
                auto-created
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "18px 0" }}>
              {demoFields.map((field) => (
                <div
                  className={styles.fieldRow}
                  key={field.k}
                  style={{
                    opacity: showFields ? 1 : 0,
                    transform: showFields ? "translateY(0)" : "translateY(8px)",
                    transition: `opacity 500ms cubic-bezier(0.16, 1, 0.3, 1) ${field.delay}ms, transform 500ms cubic-bezier(0.16, 1, 0.3, 1) ${field.delay}ms`,
                  }}
                >
                  <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {field.k}
                  </span>
                  <span
                    className={field.v.match(/[\u0600-\u06ff]/) ? styles.arabic : field.k === "Total" || field.k === "Confidence" ? styles.mono : undefined}
                    style={{ color: field.ai ? "var(--color-ai)" : "var(--color-fg)", fontSize: field.k === "Total" ? 18 : 14, fontWeight: field.k === "Total" ? 600 : 500 }}
                  >
                    {field.v}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: 14, borderTop: "1px solid var(--color-border-subtle)", opacity: tick >= 3 ? 1 : 0.4 }}>
              <LandingButton size="md">
                <Check size={14} /> Confirm
              </LandingButton>
              <LandingButton size="md" variant="outline">
                <Sparkles size={14} style={{ color: "var(--color-ai)" }} /> AI reply
              </LandingButton>
            </div>

            {tick >= 3 && (
              <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid rgb(124 58 237 / 0.2)", borderRadius: 8, background: "rgb(124 58 237 / 0.08)" }}>
                <div className={styles.mono} style={{ marginBottom: 4, color: "var(--color-ai)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Sent to customer
                </div>
                <p className={styles.arabic} dir="rtl" style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                  تم استلام طلبك أم محمد. سنوصلك 3 كنافة كبيرة الساعة 5:00 المساء على البيرة. شكراً لك!
                </p>
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  num,
  title,
  children,
  centered,
}: {
  num: string;
  title: string;
  children?: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <header className={centered ? styles.centerHeader : undefined}>
      <Reveal>
        <div className={styles.sectionNum} style={{ justifyContent: centered ? "center" : undefined, marginBottom: 16 }}>
          {num}
        </div>
        <h2 className={styles.editorialH} style={{ fontSize: "clamp(32px, 4.4vw, 56px)" }}>
          {title}
        </h2>
        {children && (
          <p style={{ margin: "18px auto 0", maxWidth: 720, color: "var(--color-fg-secondary)", fontSize: 17, lineHeight: 1.5 }}>
            {children}
          </p>
        )}
      </Reveal>
    </header>
  );
}

function HowItWorks() {
  return (
    <section id="how" className={styles.section}>
      <div className={styles.container}>
        <header className={styles.splitHeader}>
          <Reveal>
            <div className={styles.sectionNum} style={{ marginBottom: 16 }}>
              0.3 How it works
            </div>
            <h2 className={styles.editorialH} style={{ maxWidth: 760, fontSize: "clamp(32px, 4.4vw, 56px)" }}>
              Three steps.
              <br />
              <span className={styles.muted}>Two minutes to set up. Zero lost orders.</span>
            </h2>
          </Reveal>
          <Reveal delay={1} style={{ maxWidth: 280 }}>
            <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 14, lineHeight: 1.55 }}>
              Mo&apos;een suggests, you decide. AI handles language. Rules handle logic. You handle judgment.
            </p>
          </Reveal>
        </header>

        <div className={styles.stepsList}>
          {steps.map((step) => (
            <Reveal key={step.num} className={styles.stepRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className={styles.mono} style={{ color: step.ai ? "var(--color-ai)" : "var(--color-fg-muted)", fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em" }}>
                  {step.num}
                </span>
                {step.ai && <Sparkles size={16} style={{ color: "var(--color-ai)" }} />}
              </div>
              <div>
                <div className={styles.mono} style={{ marginBottom: 10, color: step.ai ? "var(--color-ai)" : "var(--color-fg-muted)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {step.tag}
                </div>
                <h3 className={styles.editorialH} style={{ maxWidth: 520, marginBottom: 14, fontSize: "clamp(22px, 2.4vw, 30px)" }}>
                  {step.title}
                </h3>
                <p style={{ maxWidth: 520, margin: 0, color: "var(--color-fg-secondary)", fontSize: 15, lineHeight: 1.55 }}>
                  {step.desc}
                </p>
              </div>
              <ul className={styles.checkList}>
                {step.detail.map((detail) => (
                  <li className={styles.checkItem} key={detail}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 99, background: step.ai ? "rgb(124 58 237 / 0.1)" : "var(--color-bg-subtle)", color: step.ai ? "var(--color-ai)" : "var(--color-fg-secondary)", flexShrink: 0 }}>
                      <Check size={11} strokeWidth={2.5} />
                    </span>
                    {detail}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardTour() {
  const [active, setActive] = useState<TourView>("dashboard");
  const view = tourViews.find((item) => item.id === active) ?? tourViews[0];

  return (
    <section id="tour" className={styles.section}>
      <div className={styles.container}>
        <SectionHeader num="0.4 The merchant view" title="Built for the way you actually work." centered>
          Four screens. One shape of work. Every detail designed for a merchant on a phone, in a hurry, with sticky fingers from kanafeh syrup.
        </SectionHeader>

        <Reveal className={styles.tourTabs}>
          {tourViews.map((item) => (
            <button
              key={item.id}
              className={cn(styles.btn, styles.btnMd)}
              onClick={() => setActive(item.id)}
              style={{
                borderColor: active === item.id ? "var(--color-fg)" : "var(--color-border)",
                borderRadius: 99,
                background: active === item.id ? "var(--color-fg)" : "transparent",
                color: active === item.id ? "var(--color-bg)" : "var(--color-fg-secondary)",
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </Reveal>

        <Reveal className={styles.tourGrid}>
          <div>
            <h3 className={styles.editorialH} style={{ marginBottom: 18, fontSize: "clamp(24px, 3vw, 36px)" }}>
              {view.title}
            </h3>
            <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 16, lineHeight: 1.55 }}>
              {view.desc}
            </p>
          </div>
          <div className={cn(styles.glass, styles.tourPanel)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
              <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
                moeen.app/{active}
              </span>
            </div>
            <MiniDashboard view={active} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MiniDashboard({ view }: { view: TourView }) {
  if (view === "conversations") return <MiniConversationsView />;
  if (view === "inventory") return <MiniInventoryView compact />;
  if (view === "flags") return <MiniFlagsView />;
  return <MiniDashboardView />;
}

function MiniDashboardView() {
  return (
    <div>
      <div className={styles.kpiGrid}>
        {[
          { l: "New", v: "12" },
          { l: "Pending", v: "4" },
          { l: "Confirmed", v: "18" },
          { l: "Delivered", v: "9" },
        ].map((k) => (
          <div className={styles.miniKpi} key={k.l}>
            <div className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {k.l}
            </div>
            <div className={styles.mono} style={{ marginTop: 2, fontSize: 18, fontWeight: 600 }}>
              {k.v}
            </div>
          </div>
        ))}
      </div>
      <OrderList
        orders={[
          ...heroOrders,
          { id: "MO-1039", who: "سارة", items: "4× Cake slice", total: "₪64.00", status: "delivery" as const, conf: 88 },
          { id: "MO-1038", who: "ليلى", items: "2× Knafeh L, 1× Tea", total: "₪96.00", status: "delivered" as const, conf: 93 },
        ]}
      />
    </div>
  );
}

function MiniConversationsView() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minHeight: 380 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: "1px solid var(--color-border-subtle)", borderRadius: 8, background: "var(--color-bg-elevated)" }}>
        <div className={styles.arabic} style={{ fontSize: 12, fontWeight: 600 }}>
          أم محمد
        </div>
        {[
          { ar: "بدي 3 كنافة كبيرة", side: "in" },
          { en: "Sure! Delivery today?", side: "out" },
          { ar: "إيه الساعة 5 المساء", side: "in" },
        ].map((m, i) => (
          <div
            key={i}
            className={m.ar ? styles.arabic : undefined}
            dir={m.ar ? "rtl" : "ltr"}
            style={{
              alignSelf: m.side === "out" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 10px",
              borderRadius: 8,
              background: m.side === "out" ? "var(--color-bg-subtle)" : "rgb(59 130 246 / 0.1)",
              fontSize: 12,
            }}
          >
            {m.ar ?? m.en}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, border: "1px solid rgb(124 58 237 / 0.25)", borderRadius: 8, background: "var(--color-bg-elevated)", boxShadow: "0 0 30px rgb(124 58 237 / 0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span className={styles.mono} style={{ fontSize: 11, fontWeight: 500 }}>
            MO-1042
          </span>
          <span className={styles.aiBadge}>AI 94%</span>
        </div>
        {[
          { k: "Customer", v: "أم محمد" },
          { k: "Items", v: "3× Knafeh L" },
          { k: "Delivery", v: "Al-Bireh, 5pm" },
          { k: "Total", v: "₪135.00" },
        ].map((f) => (
          <div key={f.k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--color-border-subtle)", fontSize: 12 }}>
            <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {f.k}
            </span>
            <span className={f.v.match(/[\u0600-\u06ff]/) ? styles.arabic : f.k === "Total" ? styles.mono : undefined} style={{ fontWeight: 500 }}>
              {f.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniInventoryView({ compact = false }: { compact?: boolean }) {
  const items = [
    { name: "Knafeh (Large)", stock: 12, reserved: 3, capacity: 20 },
    { name: "Knafeh (Medium)", stock: 4, reserved: 1, capacity: 20 },
    { name: "Baklava", stock: 24, reserved: 6, capacity: 30 },
    { name: "Mixed Platter", stock: 8, reserved: 2, capacity: 15 },
    { name: "Knafeh (Small)", stock: 0, reserved: 0, capacity: 20 },
    { name: "Cake slice", stock: 18, reserved: 4, capacity: 25 },
  ];

  return (
    <div className={styles.miniRows}>
      {!compact && (
        <div className={styles.inventoryRow} style={{ background: "transparent", border: 0, padding: "8px 12px" }}>
          <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Item
          </span>
          <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Stock level
          </span>
          <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Available
          </span>
        </div>
      )}
      {items.map((item) => {
        const available = item.stock - item.reserved;
        const state = available <= 0 ? "out" : available <= 4 ? "low" : "ok";
        const color = state === "out" ? "#ef4444" : state === "low" ? "#f59e0b" : "#10b981";
        return (
          <div
            className={styles.inventoryRow}
            key={item.name}
            style={cssVars({
              "--stock-color": color,
              "--available-pct": `${Math.max(0, (available / item.capacity) * 100)}%`,
              "--reserved-pct": `${(item.reserved / item.capacity) * 100}%`,
            })}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
              {item.name}
              {state !== "ok" && (
                <span className={styles.mono} style={{ padding: "2px 6px", borderRadius: 99, background: `${color}22`, color, fontSize: 9 }}>
                  {state === "out" ? "OUT" : "LOW"}
                </span>
              )}
            </span>
            <div>
              <div className={styles.stockTrack}>
                {state !== "out" && (
                  <>
                    <div className={styles.stockFill} />
                    <div className={styles.stockReserve} />
                  </>
                )}
              </div>
              <div className={styles.mono} style={{ display: "flex", justifyContent: "space-between", marginTop: 5, color: "var(--color-fg-muted)", fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <span>
                  <span style={{ color, fontWeight: 600 }}>{available}</span> avail.
                </span>
                <span>{item.reserved} reserved</span>
                <span>{item.capacity} cap</span>
              </div>
            </div>
            <span className={styles.mono} style={{ minWidth: 28, color, fontSize: 14, fontWeight: 600, textAlign: "end" }}>
              {available}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MiniFlagsView() {
  const flags = [
    { p: "critical", who: "أحمد", what: "Waiting 4h on order MO-1037", when: "now", pulse: true },
    { p: "critical", who: "منى", what: "Inventory conflict — 2× Knafeh M", when: "5m ago", pulse: true },
    { p: "medium", who: "ليلى", what: "Duplicate order detected (MO-1031, MO-1033)", when: "1h ago" },
    { p: "medium", who: "طارق", what: "AI confidence below 60% — please review", when: "2h ago" },
    { p: "low", who: "سارة", what: "Customer asked about delivery time", when: "today" },
  ];
  const colors: Record<string, string> = { critical: "#ef4444", medium: "#f59e0b", low: "#6b7280" };

  return (
    <div className={styles.miniRows}>
      {flags.map((flag, i) => (
        <div className={styles.flagRow} key={i} style={cssVars({ "--flag-color": colors[flag.p] })}>
          <span className={cn(styles.flagDot, flag.pulse && styles.flagPulse)} />
          <div>
            <span className={styles.arabic} style={{ marginInlineEnd: 6, fontSize: 12, fontWeight: 600 }}>
              {flag.who}
            </span>
            <span style={{ color: "var(--color-fg-secondary)", fontSize: 11.5 }}>
              {flag.what}
            </span>
          </div>
          <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 10 }}>
            {flag.when}
          </span>
        </div>
      ))}
    </div>
  );
}

function FeatureDeepDive() {
  const viewportRef = useRef<HTMLDivElement>(null);

  const scrollMerchantCarousel = (direction: "prev" | "next") => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const amount = Math.max(280, Math.round(viewport.clientWidth * 0.72));
    viewport.scrollBy({
      left: direction === "next" ? amount : -amount,
      behavior: "smooth",
    });
  };

  return (
    <section id="features" className={cn(styles.section, styles.sectionAlt, styles.merchantSection)}>
      <div className={styles.container}>
        <header className={cn(styles.splitHeader, styles.merchantHeader)}>
          <Reveal>
            <div className={styles.sectionNum} style={{ marginBottom: 16 }}>
              0.5 Who it&apos;s for
            </div>
            <h2 className={styles.editorialH} style={{ maxWidth: 720, fontSize: "clamp(32px, 4.4vw, 56px)" }}>
              Built for merchants
              <br />
              <span className={styles.muted}>who already sell in chats.</span>
            </h2>
          </Reveal>
          <Reveal delay={1} style={{ maxWidth: 360 }}>
            <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 14, lineHeight: 1.55 }}>
              Best for merchants whose orders begin in chats, replies, screenshots, and back-and-forth. If the sale starts in a conversation, Mo&apos;een fits.
            </p>
          </Reveal>
        </header>

        <div className={styles.merchantCarouselFrame}>
          <div className={styles.merchantCarouselRail}>
            <button
              type="button"
              className={styles.merchantCarouselButton}
              aria-label="Scroll merchant carousel left"
              onClick={() => scrollMerchantCarousel("prev")}
            >
              ←
            </button>
            <button
              type="button"
              className={styles.merchantCarouselButton}
              aria-label="Scroll merchant carousel right"
              onClick={() => scrollMerchantCarousel("next")}
            >
              →
            </button>
          </div>

          <div ref={viewportRef} className={styles.merchantViewport}>
            <div className={styles.merchantTrack}>
              {merchantSegments.map((segment) => {
                const Icon = segment.Icon;

                return (
                  <article key={segment.num} className={cn(styles.problemCard, styles.merchantCard, styles.lift)}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                        <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
                          {segment.num}
                        </span>
                        <span className={styles.merchantIconBox}>
                          <Icon size={16} />
                        </span>
                      </div>
                      <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
                        {segment.title}
                      </h3>
                      <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 13.5, lineHeight: 1.55 }}>
                        {segment.desc}
                      </p>
                    </div>
                    <div className={styles.merchantExamples}>{segment.fit}</div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MENASection() {
  return (
    <section id="mena" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.menaGrid}>
          <Reveal>
            <div className={styles.sectionNum} style={{ marginBottom: 16 }}>
              0.6 Local by design
            </div>
            <h2 className={styles.editorialH} style={{ marginBottom: 24, fontSize: "clamp(32px, 4.4vw, 56px)" }}>
              Built in Palestine.
              <br />
              <span className={styles.muted}>For Palestine first.</span>
            </h2>
            <p style={{ margin: "0 0 18px", color: "var(--color-fg-secondary)", fontSize: 16.5, lineHeight: 1.6 }}>
              Mo&apos;een understands Levantine Arabic the way your customers actually write it — half-Arabic, half-English, abbreviated, full of context.
            </p>
            <p style={{ margin: "0 0 32px", color: "var(--color-fg-secondary)", fontSize: 16.5, lineHeight: 1.6 }}>
              We start hyper-local because that&apos;s where the chaos lives — and because the data we learn from here makes every merchant who comes after better.
            </p>
            <div className={styles.localGrid}>
              {[
                { k: "Levantine", v: "دارجة فلسطينية", sub: "Native dialect, not translation" },
                { k: "Arabizi", v: "7abibi → حبيبي", sub: "Latin-Arabic, normalized" },
                { k: "RTL", v: "Right-to-left", sub: "Logical CSS throughout" },
                { k: "Currency", v: "₪ ILS", sub: "Native shekel formatting" },
              ].map((card) => (
                <div className={styles.localCard} key={card.k}>
                  <div className={styles.mono} style={{ marginBottom: 6, color: "var(--color-fg-muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {card.k}
                  </div>
                  <div className={card.v.match(/[\u0600-\u06ff]/) ? styles.arabic : undefined} style={{ marginBottom: 2, fontSize: 16, fontWeight: 600 }}>
                    {card.v}
                  </div>
                  <div style={{ color: "var(--color-fg-muted)", fontSize: 12 }}>{card.sub}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className={cn(styles.glass, styles.floatThree)} style={{ minHeight: 520, padding: 36, borderRadius: 16 }}>
              <div className={styles.arabic} dir="rtl" style={{ color: "var(--color-fg)", fontSize: "clamp(36px, 4.5vw, 64px)", fontWeight: 600, lineHeight: 1.3 }}>
                مش بس تطبيق،
                <br />
                <span style={{ color: "var(--color-ai)" }}>معك.</span>
              </div>
              <div style={{ marginTop: 18, color: "var(--color-fg-muted)", fontSize: 14, fontStyle: "italic" }}>
                &ldquo;Not just an app — it&apos;s with you.&rdquo;
              </div>
              <hr style={{ margin: "40px 0", border: 0, borderTop: "1px solid var(--color-border-subtle)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { ar: "بدي 3 كنافة كبيرة", parsed: "items: 3× Knafeh (Large)" },
                  { ar: "7abibi delivery 3al beireh?", parsed: "delivery: Al-Bireh" },
                  { ar: "cancel آخر طلب", parsed: "action: Cancel last order" },
                ].map((item) => (
                  <div key={item.parsed} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14 }}>
                    <div className={item.ar.match(/^[a-zA-Z0-9 ?]+$/) ? undefined : styles.arabic} dir={item.ar.match(/^[a-zA-Z0-9 ?]+$/) ? "ltr" : "rtl"} style={{ padding: "10px 12px", border: "1px solid var(--color-border-subtle)", borderRadius: 8, background: "var(--color-bg-subtle)", fontSize: 13.5 }}>
                      {item.ar}
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--color-ai)" }} />
                    <div className={styles.mono} style={{ padding: "10px 12px", border: "1px solid rgb(124 58 237 / 0.2)", borderRadius: 8, background: "rgb(124 58 237 / 0.08)", color: "var(--color-ai)", fontSize: 13 }}>
                      {item.parsed}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section id="faq" className={styles.section}>
      <div className={styles.containerNarrow}>
        <SectionHeader num="0.7 Frequently asked" title="Things merchants ask first." centered />
        <Reveal className={styles.faqList}>
          {faqs.map((faq, i) => (
            <details className={styles.faqItem} key={faq.q}>
              <summary className={styles.faqQuestion}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
                  <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>{faq.q}</span>
                </span>
                <Plus className={styles.faqIcon} size={18} />
              </summary>
              <div style={{ maxWidth: 680, padding: "0 0 28px 50px" }}>
                <p style={{ margin: 0, color: "var(--color-fg-secondary)", fontSize: 15.5, lineHeight: 1.65 }}>
                  {faq.a}
                </p>
              </div>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function FooterCTA() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Failed to join waitlist");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="cta" className={cn(styles.section, styles.ctaSection)}>
      <div className={cn(styles.containerNarrow, styles.ctaWrap)}>
        <div className={styles.ctaGlow} />
        <Reveal>
          <div className={styles.sectionNum} style={{ justifyContent: "center", marginBottom: 20 }}>
            0.8 Get in touch
          </div>
        </Reveal>
        <Reveal delay={1}>
          <h2 className={styles.editorialH} style={{ marginBottom: 24, fontSize: "clamp(40px, 6vw, 80px)" }}>
            Ready to take back
            <br />
            your mornings?
          </h2>
        </Reveal>
        <Reveal delay={2}>
          <p style={{ maxWidth: 560, margin: "0 auto 40px", color: "var(--color-fg-secondary)", fontSize: 18, lineHeight: 1.55 }}>
            Join the early access list. We&apos;re onboarding 3–5 Palestinian merchants per week. We&apos;ll reach out personally.
          </p>
        </Reveal>

        {submitted ? (
          <Reveal delay={3}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 22px", border: "1px solid rgb(16 185 129 / 0.3)", borderRadius: 999, background: "rgb(16 185 129 / 0.1)", color: "#10b981", fontSize: 15, fontWeight: 500 }}>
              <CheckCircle2 size={18} /> You&apos;re on the list. We&apos;ll be in touch within a week.
            </div>
          </Reveal>
        ) : (
          <Reveal delay={3}>
            <form className={styles.ctaForm} onSubmit={handleSubmit}>
              <input
                className={styles.ctaInput}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                type="email"
                value={email}
              />
              <LandingButton disabled={loading} type="submit">
                {loading ? <Loader2 size={14} className="animate-spin" /> : "Request access"}
                {!loading && <ArrowRight size={14} />}
              </LandingButton>
            </form>
            {error && <p style={{ marginTop: 10, color: "#ef4444", fontSize: 13 }}>{error}</p>}
          </Reveal>
        )}

        <Reveal delay={4}>
          <div style={{ marginTop: 28, color: "var(--color-fg-muted)", fontSize: 13 }}>
            أو <span className={styles.arabic} style={{ color: "var(--color-fg-secondary)", fontWeight: 600 }}>راسلنا مباشرة</span> ·{" "}
            <a href="mailto:hello@moeen.app" style={{ color: "var(--color-fg-secondary)", textDecoration: "underline", textUnderlineOffset: 3 }}>
              hello@moeen.app
            </a>
          </div>
        </Reveal>
      </div>

      <footer className={styles.footerRail}>
        <div className={styles.footerGrid}>
          <div>
            <Wordmark size={20} />
            <p style={{ maxWidth: 280, marginTop: 14, color: "var(--color-fg-muted)", fontSize: 13, lineHeight: 1.6 }}>
              Mo&apos;een — &ldquo;the one who helps&rdquo;. An order management platform for the merchants who already live on Telegram and WhatsApp.
            </p>
          </div>
          {[
            { h: "Product", l: [["Live demo", "#demo"], ["Dashboard", "#tour"], ["Who it's for", "#features"], ["FAQ", "#faq"]] },
            { h: "Company", l: [["About", "#mena"], ["Pilot program", "#cta"], ["Contact", "mailto:hello@moeen.app"]] },
            { h: "Resources", l: [["Privacy", "#"], ["Terms", "#"], ["Status", "#"]] },
          ].map((col) => (
            <div key={col.h}>
              <div className={styles.mono} style={{ marginBottom: 14, color: "var(--color-fg-muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {col.h}
              </div>
              <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
                {col.l.map(([text, href]) => (
                  <li key={text}>
                    <Link href={href} style={{ color: "var(--color-fg-secondary)", fontSize: 13.5, textDecoration: "none" }}>
                      {text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.footerBottom}>
          <span className={styles.mono} style={{ color: "var(--color-fg-muted)", fontSize: 11 }}>
            © 2026 Mo&apos;een · Made in Palestine
          </span>
          <span className={styles.arabic} style={{ color: "var(--color-fg-muted)", fontSize: 13 }}>
            صُنع بحُب في فلسطين
          </span>
        </div>
      </footer>
    </section>
  );
}

export function LandingPage() {
  useReveal();

  return (
    <div className={styles.landing}>
      <Navbar />
      <main>
        <HeroSection />
        <ProblemSection />
        <LiveDemo />
        <HowItWorks />
        <DashboardTour />
        <FeatureDeepDive />
        <MENASection />
        <FAQSection />
        <FooterCTA />
      </main>
    </div>
  );
}
