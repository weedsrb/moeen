"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, X } from "lucide-react";

export function WhatsAppPrompt() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="h-10 w-10 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Connect your WhatsApp Business number
          </p>
          <p className="text-xs text-muted-foreground">
            Start receiving customer messages on your dashboard.
          </p>
        </div>
        <Link href="/settings">
          <Button size="sm" variant="outline">
            Set up
          </Button>
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
