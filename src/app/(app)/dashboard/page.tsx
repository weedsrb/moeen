import { Suspense } from "react";
import Link from "next/link";
import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InventoryAlertsAsync } from "@/components/dashboard/inventory-alerts-async";
import { InventoryAlertsSkeleton } from "@/components/dashboard/inventory-alerts-skeleton";
import { InstagramPrompt } from "@/components/dashboard/instagram-prompt";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/auth/require-merchant";
import type { DashboardMetrics } from "@/types/dashboard";
import {
  ClipboardList,
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
      .select("low_stock_threshold, instagram_connected")
      .eq("merchant_id", merchant.id)
      .single(),
    supabase.rpc("dashboard_metrics", { p_merchant_id: merchant.id }),
  ]);

  const threshold = settingsResult.data?.low_stock_threshold ?? 5;
  const instagramConnected = settingsResult.data?.instagram_connected ?? false;
  const metrics = (metricsResult.data ?? null) as DashboardMetrics | null;

  const kpiCards = [
    {
      title: "New Orders",
      value: metrics?.incoming_orders ?? 0,
      icon: ClipboardList,
      color: "text-status-incoming",
      href: "/orders?status=incoming",
      trend: {
        current: metrics?.today_orders ?? 0,
        previous: metrics?.yesterday_orders ?? 0,
      },
    },
    {
      title: "Confirmed",
      value: metrics?.confirmed_orders ?? 0,
      icon: CheckCircle2,
      color: "text-status-confirmed",
      href: "/orders?status=confirmed",
      trend: null,
    },
    {
      title: "Out for Delivery",
      value: metrics?.delivery_orders ?? 0,
      icon: Truck,
      color: "text-status-delivery",
      href: "/orders?status=out_for_delivery",
      trend: null,
    },
    {
      title: "Flagged",
      value: metrics?.open_flags ?? 0,
      icon: AlertTriangle,
      color: "text-priority-critical",
      href: "/flags",
      trend: null,
    },
  ];

  function trendText(current: number, previous: number): string {
    const delta = current - previous;
    const arrow = delta >= 0 ? "↑" : "↓";
    return `${arrow} ${Math.abs(delta)} vs yesterday`;
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        {/* Instagram setup prompt */}
        {!instagramConnected && <InstagramPrompt />}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Link key={kpi.title} href={kpi.href} className="block">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {kpi.title}
                    </CardTitle>
                    <Icon className={`h-4 w-4 ${kpi.color}`} />
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold font-mono">{kpi.value}</p>
                    {kpi.trend && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {trendText(kpi.trend.current, kpi.trend.previous)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
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
                  <MessageSquare className="h-4 w-4 text-info" />
                  <p className="text-2xl font-bold font-mono">
                    {metrics?.today_messages ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Messages</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {trendText(
                    metrics?.today_messages ?? 0,
                    metrics?.yesterday_messages ?? 0
                  )}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <Package className="h-4 w-4 text-status-pending" />
                  <p className="text-2xl font-bold font-mono">
                    {metrics?.today_orders ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Orders</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {trendText(
                    metrics?.today_orders ?? 0,
                    metrics?.yesterday_orders ?? 0
                  )}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-4 w-4 text-status-delivered" />
                  <p className="text-2xl font-bold font-mono">
                    {metrics?.today_delivered ?? 0}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Delivered</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {trendText(
                    metrics?.today_delivered ?? 0,
                    metrics?.yesterday_delivered ?? 0
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
