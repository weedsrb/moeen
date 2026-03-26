import { PageTransition } from "@/components/layout/page-transition";
import { ClipboardList } from "lucide-react";

export default function OrdersPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">No orders yet</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Orders will appear here when customers start messaging your
            Telegram bot.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
