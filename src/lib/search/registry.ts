import {
  LayoutDashboard,
  MessageSquare,
  ClipboardList,
  Package,
  AlertTriangle,
  Settings,
  Store,
  Sparkles,
  BookOpen,
  User,
  Building2,
  Moon,
  Volume2,
  LogOut,
  type LucideIcon,
} from "lucide-react";

export type SearchItem = {
  id: string;
  label: string;
  category: "Pages" | "Settings" | "Actions";
  keywords?: string[];
  href?: string;
  action?: "toggle-theme" | "toggle-sound" | "sign-out";
  icon?: LucideIcon;
};

export const searchRegistry: SearchItem[] = [
  // Pages
  { id: "nav.dashboard", label: "Dashboard", category: "Pages", href: "/dashboard", icon: LayoutDashboard },
  { id: "nav.messages", label: "Messages", category: "Pages", href: "/conversations", keywords: ["chat", "instagram", "conversations"], icon: MessageSquare },
  { id: "nav.orders", label: "Orders", category: "Pages", href: "/orders", keywords: ["orders", "active", "history", "delivered", "cancelled"], icon: ClipboardList },
  { id: "nav.inventory", label: "Inventory", category: "Pages", href: "/inventory", keywords: ["products", "stock", "catalog"], icon: Package },
  { id: "nav.flags", label: "Flags & Escalations", category: "Pages", href: "/flags", keywords: ["escalations", "alerts"], icon: AlertTriangle },
  { id: "nav.settings", label: "Settings", category: "Pages", href: "/settings", icon: Settings },

  // Settings sections
  { id: "settings.business-profile", label: "Business Profile", category: "Settings", href: "/settings#business-profile", icon: Store },
  { id: "settings.instagram", label: "Instagram Connection", category: "Settings", href: "/settings#instagram", icon: MessageSquare },
  { id: "settings.ai-behavior", label: "AI Behavior", category: "Settings", href: "/settings#ai-behavior", keywords: ["confidence", "auto-reply", "handoff"], icon: Sparkles },
  { id: "settings.ai-persona", label: "AI Persona", category: "Settings", href: "/settings#ai-persona", keywords: ["tone", "greeting", "language"], icon: Sparkles },
  { id: "settings.faq", label: "Knowledge Base / FAQ", category: "Settings", href: "/settings#faq", icon: BookOpen },
  { id: "settings.account", label: "Account", category: "Settings", href: "/settings/account", keywords: ["email", "profile"], icon: User },
  { id: "settings.businesses", label: "Manage Businesses", category: "Settings", href: "/settings/businesses", keywords: ["switch business", "add business"], icon: Building2 },

  // Actions
  { id: "action.toggle-theme", label: "Toggle theme", category: "Actions", action: "toggle-theme", keywords: ["dark mode", "light mode"], icon: Moon },
  { id: "action.toggle-sound", label: "Toggle notification sound", category: "Actions", action: "toggle-sound", keywords: ["mute", "unmute"], icon: Volume2 },
  { id: "action.sign-out", label: "Sign out", category: "Actions", action: "sign-out", keywords: ["log out"], icon: LogOut },
];
