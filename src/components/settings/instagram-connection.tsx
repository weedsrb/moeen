"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, MessageCircle, ExternalLink } from "lucide-react";

interface InstagramConnectionProps {
  initialConnected: boolean;
  initialUsername: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Instagram is not configured on the server yet.",
  state_mismatch: "Security check failed. Please try connecting again.",
  no_code: "Instagram did not return an authorization code.",
  no_user_id: "Could not read your Instagram account ID.",
  save_failed: "Failed to save the connection. Please try again.",
  exchange_failed: "Could not complete the Instagram connection.",
  access_denied: "You declined the Instagram authorization.",
};

export function InstagramConnection({
  initialConnected,
  initialUsername,
}: InstagramConnectionProps) {
  const searchParams = useSearchParams();
  const igError = searchParams.get("ig_error");

  const [connected, setConnected] = useState(initialConnected);
  const [username, setUsername] = useState(initialUsername);
  const [loading, setLoading] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  function handleConnect() {
    setLoading(true);
    window.location.href = "/api/instagram/connect";
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/connect", { method: "DELETE" });
      if (res.ok) {
        setConnected(false);
        setUsername(null);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setDisconnectOpen(false);
    }
  }

  if (connected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Instagram Connection</CardTitle>
            <Badge
              variant="outline"
              className="border-green-500/50 text-green-500"
            >
              <CheckCircle2 className="me-1 h-3 w-3" />
              Connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Account:{" "}
            <span className="font-mono font-medium text-foreground">
              {username ? `@${username}` : "connected"}
            </span>
          </p>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisconnectOpen(true)}
          >
            Disconnect
          </Button>
          <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disconnect Instagram?</DialogTitle>
                <DialogDescription>
                  You will stop receiving customer messages until you reconnect.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDisconnectOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  Disconnect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Instagram Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect your Instagram professional account to receive and reply to
          customer DMs, and let AI extract orders automatically. Requires an
          Instagram Business or Creator account.
        </p>

        {igError && (
          <p className="text-sm text-red-500">
            {ERROR_MESSAGES[igError] ?? "Could not connect Instagram."}
          </p>
        )}

        <Button
          onClick={handleConnect}
          disabled={loading}
          className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white hover:opacity-90"
        >
          {loading ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="me-2 h-4 w-4" />
          )}
          Connect with Instagram
        </Button>

        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          You&apos;ll be redirected to Instagram to authorize Mo&apos;een
          <ExternalLink className="h-3 w-3" />
        </p>
      </CardContent>
    </Card>
  );
}
