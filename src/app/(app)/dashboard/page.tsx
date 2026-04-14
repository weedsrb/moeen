import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InventoryAlerts } from "@/components/dashboard/inventory-alerts";
import { WhatsAppPrompt } from "@/components/dashboard/whatsapp-prompt";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Truck,
  AlertTriangle,
  MessageSquare,
  Package,
  PackageCheck,
} from "lucide-react";
import type { Product } from "@/types/product";
import { getStockStatus } from "@/lib/utils/inventory";

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

  if (!merchant) redirect("/onboarding");

  // Parallel fetch: products, settings, order counts, today's stats, flags
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [
    productsResult,
    settingsResult,
    incomingResult,
    pendingResult,
    confirmedResult,
    deliveryResult,
    flagsResult,
    todayMessagesResult,
    todayOrdersResult,
    todayDeliveredResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("merchant_id", merchant.id)
      .eq("is_active", true),
    supabase
      .from("merchant_settings")
      .select("low_stock_threshold, whatsapp_connected")
      .eq("merchant_id", merchant.id)
      .single(),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("status", "incoming"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("status", "confirmed"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("status", "out_for_delivery"),
    supabase
      .from("flags")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("is_resolved", false),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("direction", "inbound")
      .gte("created_at", todayISO),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .gte("created_at", todayISO),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("status", "delivered")
      .gte("delivered_at", todayISO),
  ]);

  const threshold = settingsResult.data?.low_stock_threshold ?? 5;
  const whatsappConnected = settingsResult.data?.whatsapp_connected ?? false;
  const products = productsResult.data ?? [];

  const outOfStock = products.filter(
    (p: Product) => getStockStatus(p, threshold) === "out_of_stock"
  );
  const lowStock = products.filter(
    (p: Product) => getStockStatus(p, threshold) === "low_stock"
  );

  const kpiCards = [
    {
      title: "New Orders",
      value: incomingResult.count ?? 0,
      icon: ClipboardList,
      color: "text-blue-500",
    },
    {
      title: "Pending",
      value: pendingResult.count ?? 0,
      icon: Clock,
      color: "text-amber-500",
    },
    {
      title: "Confirmed",
      value: confirmedResult.count ?? 0,
      icon: CheckCircle2,
      color: "text-green-500",
    },
    {
      title: "Out for Delivery",
      value: deliveryResult.count ?? 0,
      icon: Truck,
      color: "text-violet-500",
    },
    {
      title: "Flagged",
      value: flagsResult.count ?? 0,
      icon: AlertTriangle,
      color: "text-red-500",
    },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {/* WhatsApp setup prompt */}
        {!whatsappConnected && <WhatsAppPrompt />}

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
                <div className="flex items-center justify-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                  <p className="text-2xl font-bold font-mono">
                    {todayMessagesResult.count ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <Package className="h-4 w-4 text-amber-500" />
                  <p className="text-2xl font-bold font-mono">
                    {todayOrdersResult.count ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Orders</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-4 w-4 text-green-500" />
                  <p className="text-2xl font-bold font-mono">
                    {todayDeliveredResult.count ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
