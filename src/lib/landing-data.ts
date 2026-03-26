import {
  MessageSquareX,
  AlertTriangle,
  PackageX,
  Copy,
  MessageCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Message cards for hero chaos animation ──────────────────────────
export interface ChatMessage {
  text: string;
  sender: string;
  time: string;
}

export const chaosMessages: ChatMessage[] = [
  { text: "بدي 3 كنافة كبيرة وتوصلولي", sender: "أم محمد", time: "7:02 AM" },
  { text: "وين صار الطلب تبعي؟؟", sender: "أحمد", time: "7:05 AM" },
  { text: "في عندكم من الحجم الوسط؟", sender: "سارة", time: "7:08 AM" },
  { text: "ارسلي 2 على نابلس بأسرع وقت", sender: "خالد", time: "7:12 AM" },
  {
    text: "هاي أم أحمد بدي أطلب زي المرة اللي فاتت",
    sender: "أم أحمد",
    time: "7:15 AM",
  },
  { text: "كم سعر التوصيل على رام الله؟", sender: "ليلى", time: "7:18 AM" },
  { text: "بدي 5 قطع بقلاوة و2 كنافة صغيرة", sender: "أبو يوسف", time: "7:21 AM" },
  { text: "الطلب اللي حكيتك عنه أمس جاهز؟", sender: "منى", time: "7:24 AM" },
  { text: "ممكن تحجزولي 10 قطع للعصر؟", sender: "طارق", time: "7:27 AM" },
  { text: "بدي نفس طلبية الأسبوع الماضي", sender: "أم عمر", time: "7:30 AM" },
  { text: "شو عندكم اليوم؟ في مسخن؟", sender: "رامي", time: "7:33 AM" },
  { text: "وصلولي 3 صحون على طولكرم", sender: "هبة", time: "7:35 AM" },
  { text: "السعر مع التوصيل كم بيطلع؟", sender: "ياسمين", time: "7:38 AM" },
  { text: "بدي ألغي الطلب اللي قبل شوي", sender: "فادي", time: "7:40 AM" },
  { text: "عندكم عرض على الكميات الكبيرة؟", sender: "أم خالد", time: "7:42 AM" },
];

// ── Order cards for hero "organized" state ──────────────────────────
export interface OrderPreview {
  id: string;
  customer: string;
  items: string;
  total: string;
  status: "incoming" | "confirmed" | "pending";
  confidence: number;
}

export const organizedOrders: OrderPreview[] = [
  {
    id: "MO-1042",
    customer: "أم محمد",
    items: "3× Knafeh (Large)",
    total: "₪135.00",
    status: "incoming",
    confidence: 94,
  },
  {
    id: "MO-1043",
    customer: "خالد",
    items: "2× Mixed Platter",
    total: "₪80.00",
    status: "confirmed",
    confidence: 91,
  },
  {
    id: "MO-1041",
    customer: "أم أحمد",
    items: "1× Knafeh (Medium), 2× Baklava",
    total: "₪95.00",
    status: "pending",
    confidence: 78,
  },
];

// ── Problem section ─────────────────────────────────────────────────
export interface ProblemCard {
  icon: LucideIcon;
  title: string;
  description: string;
  arabicExample: string;
}

export const problems: ProblemCard[] = [
  {
    icon: MessageSquareX,
    title: "The Lost Order",
    description:
      "A customer ordered yesterday. You forgot. Now they're messaging again — angry.",
    arabicExample: "وين الطلب تبعي من أمس؟!",
  },
  {
    icon: AlertTriangle,
    title: "The Angry Follow-up",
    description:
      '"Where is my order??" at 7am. You haven\'t even opened Telegram yet.',
    arabicExample: "يا جماعة حدا يرد علي!!",
  },
  {
    icon: PackageX,
    title: "The Out-of-Stock Surprise",
    description:
      "You confirmed an order for something you ran out of 2 days ago.",
    arabicExample: "آسف خلصت الكنافة من يومين…",
  },
  {
    icon: Copy,
    title: "The Duplicate Order",
    description:
      "Same customer sent the same order in different words. You processed both.",
    arabicExample: "بدي زي اللي طلبته قبل — يعني الكبيرة",
  },
];

// ── Solution section ────────────────────────────────────────────────
export interface SolutionPair {
  problem: string;
  solution: string;
  detail: string;
}

export const solutions: SolutionPair[] = [
  {
    problem: "Lost orders",
    solution: "Every order auto-extracted",
    detail:
      "Mo'een catches every order from every message — nothing slips through the cracks.",
  },
  {
    problem: "Angry follow-ups",
    solution: "Real-time priority dashboard",
    detail:
      "See what needs attention first. Customers waiting too long get flagged automatically.",
  },
  {
    problem: "Out-of-stock surprises",
    solution: "Live inventory tracking",
    detail:
      "Mo'een knows your stock levels. It flags conflicts before you confirm an impossible order.",
  },
  {
    problem: "Duplicate orders",
    solution: "AI duplicate detection",
    detail:
      "The AI recognizes when the same customer reorders — and flags it for your review.",
  },
];

// ── How it works ────────────────────────────────────────────────────
export interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
  useAiColor?: boolean;
}

export const steps: Step[] = [
  {
    icon: MessageCircle,
    title: "Connect",
    description:
      "Link your Telegram bot in 2 minutes. Mo'een starts listening to your messages.",
  },
  {
    icon: Sparkles,
    title: "AI Sorts",
    description:
      "Mo'een reads every message, extracts orders, and flags what matters.",
    useAiColor: true,
  },
  {
    icon: CheckCircle2,
    title: "You Act",
    description:
      "Open your dashboard. Everything is organized. Confirm, dispatch, done.",
  },
];
