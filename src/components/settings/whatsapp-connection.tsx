"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";

interface WhatsAppConnectionProps {
  initialConnected: boolean;
  initialPhoneNumberId: string | null;
}

export function WhatsAppConnection({
  initialConnected,
  initialPhoneNumberId,
}: WhatsAppConnectionProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [phoneDisplay, setPhoneDisplay] = useState(initialPhoneNumberId);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  async function handleConnect() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          accessToken,
          verifyToken,
          businessAccountId: businessAccountId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to connect");
        return;
      }

      setConnected(true);
      setPhoneDisplay(data.displayPhoneNumber ?? phoneNumberId);
      setPhoneNumberId("");
      setAccessToken("");
      setVerifyToken("");
      setBusinessAccountId("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);

    try {
      const res = await fetch("/api/whatsapp/connect", { method: "DELETE" });
      if (res.ok) {
        setConnected(false);
        setPhoneDisplay(null);
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
            <CardTitle className="text-lg">WhatsApp Connection</CardTitle>
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
            Phone:{" "}
            <span className="font-mono font-medium text-foreground">
              {phoneDisplay}
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
                <DialogTitle>Disconnect WhatsApp?</DialogTitle>
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
                  {loading && (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  )}
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
        <CardTitle className="text-lg">WhatsApp Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Setup instructions:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>
              Go to{" "}
              <a
                href="https://developers.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
              >
                Meta for Developers
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              and create a Business app
            </li>
            <li>Add the WhatsApp product to your app</li>
            <li>
              Copy your Phone Number ID and Access Token from the app dashboard
            </li>
            <li>
              Choose a Verify Token (any secret string) and enter it below
            </li>
            <li>
              Configure your webhook URL in Meta&apos;s console and subscribe to
              the &quot;messages&quot; field
            </li>
          </ol>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumberId">Phone Number ID</Label>
            <Input
              id="phoneNumberId"
              placeholder="e.g. 123456789012345"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accessToken">Access Token</Label>
            <div className="relative">
              <Input
                id="accessToken"
                type={showToken ? "text" : "password"}
                placeholder="Permanent system user token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="verifyToken">Verify Token</Label>
            <Input
              id="verifyToken"
              placeholder="Your chosen webhook verify token"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Must match the verify token you set in Meta&apos;s webhook
              configuration
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="businessAccountId">
              Business Account ID{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="businessAccountId"
              placeholder="e.g. 123456789012345"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          onClick={handleConnect}
          disabled={
            loading ||
            !phoneNumberId.trim() ||
            !accessToken.trim() ||
            !verifyToken.trim()
          }
          className="w-full"
        >
          {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Connect WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}
