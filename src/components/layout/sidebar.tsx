"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUnreadCount } from "@/components/layout/unread-count-provider";
import {
  LayoutDashboard,
  MessageSquare,
  ClipboardList,
  Package,
  AlertTriangle,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversations", label: "Messages", icon: MessageSquare },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/flags", label: "Flags", icon: AlertTriangle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const unreadCount = useUnreadCount();

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden sm:flex flex-col border-ie border-border bg-card h-full w-16 lg:w-60 shrink-0">
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border">
        <span className="text-lg font-bold hidden lg:block">Mo&apos;een</span>
        <span className="text-lg font-bold lg:hidden">M</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
              {item.href === "/conversations" && unreadCount > 0 && (
                <Badge
                  variant="default"
                  className="h-5 min-w-5 flex items-center justify-center px-1.5 text-[10px] ms-auto"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={handleSignOut}
          title="Sign Out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="hidden lg:block">Sign Out</span>
        </Button>
      </div>
    </aside>
  );
}
