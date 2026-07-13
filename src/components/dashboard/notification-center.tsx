import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NotificationItem {
  id: string;
  category: string;
  severity: "info" | "low" | "medium" | "critical";
  title: string;
  body: string;
  order_id: string | null;
  flag_id: string | null;
}

export function NotificationCenter({ items }: { items: NotificationItem[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" /> Notifications
        </CardTitle>
        <Link href="/flags" className="text-xs text-muted-foreground hover:text-foreground">
          View actionable flags
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unread operational notifications.</p>
        ) : (
          <div className="divide-y">
            {items.map((item) => {
              const href = item.flag_id
                ? "/flags"
                : item.order_id
                  ? `/orders/${item.order_id}`
                  : "/dashboard";
              return (
                <Link key={item.id} href={href} className="flex items-center gap-3 py-3 hover:bg-muted/40">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      item.severity === "critical"
                        ? "bg-red-500"
                        : item.severity === "medium"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.body}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
