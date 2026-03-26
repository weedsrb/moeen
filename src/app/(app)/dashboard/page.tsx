import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InventoryAlerts } from "@/components/dashboard/inventory-alerts";
import { TelegramPrompt } from "@/components/dashboard/telegram-prompt";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Truck,
  AlertTriangle,
} from "lucide-react";
import type { Product } from "@/types/product";
import { getStockStatus } from "@/lib/utils/inventory";

const kpiCards = [
  {
    title: "New Orders",
    value: 0,
    icon: ClipboardList,
    color: "text-blue-500",
  },
  {
    title: "Pending",
    value: 0,
    icon: Clock,
    color: "text-amber-500",
  },
  {
    title: "Confirmed",
    value: 0,
    icon: CheckCircle2,
    color: "text-green-500",
  },
  {
    title: "Out for Delivery",
    value: 0,
    icon: Truck,
    color: "text-violet-500",
  },
  {
    title: "Flagged",
    value: 0,
    icon: AlertTriangle,
    color: "text-red-500",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  // Fetch products for inventory alerts
  let outOfStock: Product[] = [];
  let lowStock: Product[] = [];
  let telegramConnected = false;

  if (merchant) {
    const { data: products } = await supabase
      .from("products")
      .select("*")
      .eq("merchant_id", merchant.id)
      .eq("is_active", true);

    const { data: settings } = await supabase
      .from("merchant_settings")
      .select("low_stock_threshold, telegram_connected")
      .eq("merchant_id", merchant.id)
      .single();

    const threshold = settings?.low_stock_threshold ?? 5;
    telegramConnected = settings?.telegram_connected ?? false;

    if (products) {
      outOfStock = products.filter(
        (p: Product) => getStockStatus(p, threshold) === "out_of_stock"
      );
      lowStock = products.filter(
        (p: Product) => getStockStatus(p, threshold) === "low_stock"
      );
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {/* Telegram setup prompt */}
        {!telegramConnected && <TelegramPrompt />}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-mono">{kpi.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No items need attention right now.
            </p>
          </CardContent>
        </Card>

        {/* Inventory Alerts */}
        <InventoryAlerts outOfStock={outOfStock} lowStock={lowStock} />

        {/* Today's Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold font-mono">0</p>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">0</p>
                <p className="text-xs text-muted-foreground">Orders</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">0</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
