"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  Unplug,
  Bot,
  ExternalLink,
} from "lucide-react";

interface TelegramConnectionProps {
  initialConnected: boolean;
  initialBotUsername: string | null;
}

export function TelegramConnection({
  initialConnected,
  initialBotUsername,
}: TelegramConnectionProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [botUsername, setBotUsername] = useState(initialBotUsername);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleConnect() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to connect");
        return;
      }

      setConnected(true);
      setBotUsername(data.botUsername);
      setToken("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);

    try {
      const res = await fetch("/api/telegram/connect", { method: "DELETE" });

      if (res.ok) {
        setConnected(false);
        setBotUsername(null);
        setShowDisconnect(false);
      }
    } catch {
      // Ignore
    } finally {
      setDisconnecting(false);
    }
  }

  if (connected) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Telegram Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Connected</p>
                <p className="text-sm text-muted-foreground truncate">
                  @{botUsername}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisconnect(true)}
              >
                <Unplug className="h-4 w-4 me-2" />
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showDisconnect} onOpenChange={setShowDisconnect}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect Telegram Bot?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              You will stop receiving messages from @{botUsername}. You can
              reconnect at any time.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDisconnect(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting && (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                )}
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Telegram Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Instructions */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Setup Instructions</p>
          </div>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              Open Telegram and search for{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                @BotFather
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              Send <code className="font-mono bg-muted px-1 rounded">/newbot</code>{" "}
              and follow the prompts
            </li>
            <li>Copy the API token BotFather gives you</li>
            <li>Paste it below and click Connect</li>
          </ol>
        </div>

        {/* Token input */}
        <div className="space-y-2">
          <Label htmlFor="bot-token">Bot Token</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="bot-token"
                type={showToken ? "text" : "password"}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="pe-10 font-mono text-sm"
              />
              <button
                type="button"
                className="absolute inset-ie-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Connect button */}
        <Button onClick={handleConnect} disabled={!token.trim() || loading}>
          {loading && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
          Connect Bot
        </Button>
      </CardContent>
    </Card>
  );
}
