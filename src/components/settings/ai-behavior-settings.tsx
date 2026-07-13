"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

interface AIBehaviorSettingsProps {
  initialHandoffMessage: string;
  initialRequireCustomerName: boolean;
  initialRequireCustomerPhone: boolean;
  initialAcknowledgementMode: "off" | "delayed";
  initialAcknowledgementDelaySeconds: number;
  initialAcknowledgeTemplate: string | null;
}

export function AIBehaviorSettings({
  initialHandoffMessage,
  initialRequireCustomerName,
  initialRequireCustomerPhone,
  initialAcknowledgementMode,
  initialAcknowledgementDelaySeconds,
  initialAcknowledgeTemplate,
}: AIBehaviorSettingsProps) {
  const [handoffMessage, setHandoffMessage] = useState(initialHandoffMessage);
  const [requireName, setRequireName] = useState(initialRequireCustomerName);
  const [requirePhone, setRequirePhone] = useState(initialRequireCustomerPhone);
  const [acknowledgementMode, setAcknowledgementMode] = useState<
    "off" | "delayed"
  >(initialAcknowledgementMode);
  const [acknowledgementDelay, setAcknowledgementDelay] = useState(
    initialAcknowledgementDelaySeconds
  );
  const [acknowledgeTemplate, setAcknowledgeTemplate] = useState(
    initialAcknowledgeTemplate ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setLoading(true);
    setSaved(false);

    try {
      const response = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_handoff_message: handoffMessage,
          ai_require_customer_name: requireName,
          ai_require_customer_phone: requirePhone,
          ai_acknowledgement_mode: acknowledgementMode,
          ai_ack_delay_seconds: acknowledgementDelay,
          ai_acknowledge_template: acknowledgeTemplate.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const delayedAcknowledgement = acknowledgementMode === "delayed";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Behavior</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <Label>Required customer details</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Products, quantities, applicable variants, and delivery address are
              always required. Choose whether the AI must also collect these fields.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Customer name</p>
              <p className="text-xs text-muted-foreground">
                Require a name before the confirmation readback.
              </p>
            </div>
            <Switch checked={requireName} onCheckedChange={setRequireName} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Phone number</p>
              <p className="text-xs text-muted-foreground">
                Require a phone number before the confirmation readback.
              </p>
            </div>
            <Switch checked={requirePhone} onCheckedChange={setRequirePhone} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="handoffMessage">Human Handoff Message</Label>
          <Textarea
            id="handoffMessage"
            value={handoffMessage}
            onChange={(event) => setHandoffMessage(event.target.value)}
            placeholder="A team member will assist you shortly."
            rows={2}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Sent when the customer requests a person or the request is genuinely
            outside the assistant&apos;s scope.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Delayed acknowledgement</Label>
              <p className="text-xs text-muted-foreground">
                Send a fallback only if no AI or merchant response arrives first.
              </p>
            </div>
            <Switch
              checked={delayedAcknowledgement}
              onCheckedChange={(checked) =>
                setAcknowledgementMode(checked ? "delayed" : "off")
              }
            />
          </div>

          {delayedAcknowledgement && (
            <div className="space-y-3 border-s-2 border-border ps-4">
              <div className="space-y-1.5">
                <Label htmlFor="ackDelay">Wait before sending</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ackDelay"
                    type="number"
                    min={5}
                    max={60}
                    value={acknowledgementDelay}
                    onChange={(event) =>
                      setAcknowledgementDelay(Number(event.target.value))
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acknowledgeTemplate">Acknowledgement message</Label>
                <Textarea
                  id="acknowledgeTemplate"
                  value={acknowledgeTemplate}
                  onChange={(event) =>
                    setAcknowledgeTemplate(event.target.value)
                  }
                  placeholder="شكراً، وصلت رسالتك! سنرد عليك قريباً"
                  rows={2}
                  maxLength={500}
                />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          onClick={handleSave}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          {loading ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            "Saved!"
          ) : (
            "Save Behavior Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
