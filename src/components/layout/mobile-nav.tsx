"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/components/layout/unread-count-provider";
import { useOrdersCount } from "@/components/layout/orders-count-provider";
import {
  useFlagsCount,
  useHighestFlagPriority,
} from "@/components/layout/flags-count-provider";
import { flagBadgeColorClass } from "@/lib/utils/flags";
import {
  LayoutDashboard,
  MessageSquare,
  ClipboardList,
  Package,
  AlertTriangle,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversations", label: "Messages", icon: MessageSquare },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/flags", label: "Flags", icon: AlertTriangle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const ordersCount = useOrdersCount();
  const flagsCount = useFlagsCount();
  const flagsPriority = useHighestFlagPriority();

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const isMessages = item.href === "/conversations";
          const isOrders = item.href === "/orders";
          const isFlags = item.href === "/flags";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {isMessages && unreadCount > 0 && (
                  <span className="absolute -top-1 -end-1 h-4 min-w-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {isOrders && ordersCount > 0 && (
                  <span className="absolute -top-1 -end-1 h-4 min-w-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] px-1">
                    {ordersCount > 99 ? "99+" : ordersCount}
                  </span>
                )}
                {isFlags && flagsCount > 0 && (
                  <span
                    className={cn(
                      "absolute -top-1 -end-1 h-4 min-w-4 flex items-center justify-center rounded-full text-[9px] px-1",
                      flagBadgeColorClass(flagsPriority)
                    )}
                  >
                    {flagsCount > 99 ? "99+" : flagsCount}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
