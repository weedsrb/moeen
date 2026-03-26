"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

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
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
