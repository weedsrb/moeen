"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMerchant } from "@/components/layout/merchant-provider";
import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TelegramConnection } from "@/components/settings/telegram-connection";
import { LogOut } from "lucide-react";

export default function SettingsPage() {
  const merchant = useMerchant();
  const router = useRouter();
  const supabase = createClient();

  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(
    null
  );

  useEffect(() => {
    async function fetchTelegramStatus() {
      const { data } = await supabase
        .from("merchant_settings")
        .select("telegram_connected, telegram_bot_username")
        .eq("merchant_id", merchant.id)
        .single();

      if (data) {
        setTelegramConnected(data.telegram_connected ?? false);
        setTelegramBotUsername(data.telegram_bot_username ?? null);
      }
      setTelegramLoading(false);
    }

    fetchTelegramStatus();
  }, [merchant.id, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <PageTransition>
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-semibold">Settings</h1>

        {/* Business Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Business Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">
                {merchant.businessName}
              </span>
            </div>
            {merchant.businessType && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <span className="text-sm font-medium capitalize">
                  {merchant.businessType}
                </span>
              </div>
            )}
            {merchant.city && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">City</span>
                <span className="text-sm font-medium">{merchant.city}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram */}
        {telegramLoading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Telegram Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ) : (
          <TelegramConnection
            initialConnected={telegramConnected}
            initialBotUsername={telegramBotUsername}
          />
        )}

        {/* AI */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Behavior</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Coming in Phase 4 — configure AI confidence thresholds and
              auto-clarification settings.
            </p>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="me-2 h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
