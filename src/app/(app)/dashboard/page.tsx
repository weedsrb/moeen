import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InventoryAlertsAsync } from "@/components/dashboard/inventory-alerts-async";
import { InventoryAlertsSkeleton } from "@/components/dashboard/inventory-alerts-skeleton";
import { WhatsAppPrompt } from "@/components/dashboard/whatsapp-prompt";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/auth/require-merchant";
import type { DashboardMetrics } from "@/types/dashboard";
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

export default async function DashboardPage() {
  const { merchant } = await requireMerchant();
  const supabase = await createClient();

  // One settings fetch + one RPC call: dashboard_metrics collapses
  // the 8 KPI counts (migration 009) into a single round trip.
  const [settingsResult, metricsResult] = await Promise.all([
    supabase
      .from("merchant_settings")
      .select("low_stock_threshold, whatsapp_connected")
      .eq("merchant_id", merchant.id)
      .single(),
    supabase.rpc("dashboard_metrics", { p_merchant_id: merchant.id }),
  ]);

  const threshold = settingsResult.data?.low_stock_threshold ?? 5;
  const whatsappConnected = settingsResult.data?.whatsapp_connected ?? false;
  const metrics = (metricsResult.data ?? null) as DashboardMetrics | null;

  const kpiCards = [
    {
      title: "New Orders",
      value: metrics?.incoming_orders ?? 0,
      icon: ClipboardList,
      color: "text-blue-500",
    },
    {
      title: "Pending",
      value: metrics?.pending_orders ?? 0,
      icon: Clock,
      color: "text-amber-500",
    },
    {
      title: "Confirmed",
      value: metrics?.confirmed_orders ?? 0,
      icon: CheckCircle2,
      color: "text-green-500",
    },
    {
      title: "Out for Delivery",
      value: metrics?.delivery_orders ?? 0,
      icon: Truck,
      color: "text-violet-500",
    },
    {
      title: "Flagged",
      value: metrics?.open_flags ?? 0,
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

        {/* Inventory Alerts — streams in after KPIs paint */}
        <Suspense fallback={<InventoryAlertsSkeleton />}>
          <InventoryAlertsAsync merchantId={merchant.id} threshold={threshold} />
        </Suspense>

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
                    {metrics?.today_messages ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <Package className="h-4 w-4 text-amber-500" />
                  <p className="text-2xl font-bold font-mono">
                    {metrics?.today_orders ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Orders</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-4 w-4 text-green-500" />
                  <p className="text-2xl font-bold font-mono">
                    {metrics?.today_delivered ?? 0}
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
