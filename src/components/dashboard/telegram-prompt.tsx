"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, X } from "lucide-react";

export function TelegramPrompt() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="flex items-center gap-4 py-4">
        <MessageSquare className="h-5 w-5 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Connect your Telegram bot</p>
          <p className="text-xs text-muted-foreground">
            Start receiving customer messages on your dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/settings">
            <Button size="sm">Set Up</Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
