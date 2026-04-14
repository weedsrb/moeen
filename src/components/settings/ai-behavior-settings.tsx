"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

interface AIBehaviorSettingsProps {
  initialConfidenceThreshold: number;
  initialAutoClarity: boolean;
  initialHandoffMessage: string;
  initialAutoAcknowledge: boolean;
  initialAcknowledgeTemplate: string | null;
}

const THRESHOLD_ZONES = [
  { min: 0.3, max: 0.59, label: "Always review", color: "text-red-500" },
  { min: 0.6, max: 0.79, label: "Auto-create zone", color: "text-amber-500" },
  { min: 0.8, max: 0.95, label: "Always auto-create", color: "text-green-500" },
];

function getZone(value: number) {
  return THRESHOLD_ZONES.find((z) => value >= z.min && value <= z.max) ?? THRESHOLD_ZONES[1];
}

export function AIBehaviorSettings({
  initialConfidenceThreshold,
  initialAutoClarity,
  initialHandoffMessage,
  initialAutoAcknowledge,
  initialAcknowledgeTemplate,
}: AIBehaviorSettingsProps) {
  const [threshold, setThreshold] = useState(initialConfidenceThreshold);
  const [autoClarity, setAutoClarity] = useState(initialAutoClarity);
  const [handoffMessage, setHandoffMessage] = useState(initialHandoffMessage);
  const [autoAcknowledge, setAutoAcknowledge] = useState(initialAutoAcknowledge);
  const [acknowledgeTemplate, setAcknowledgeTemplate] = useState(
    initialAcknowledgeTemplate ?? ""
  );
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = getZone(threshold);

  async function handleSave() {
    setError(null);
    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_confidence_threshold: threshold,
          ai_auto_clarify: autoClarity,
          ai_handoff_message: handoffMessage,
          ai_auto_acknowledge: autoAcknowledge,
          ai_acknowledge_template: acknowledgeTemplate || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Behavior</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Confidence Threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Confidence Threshold</Label>
            <span className={`text-sm font-mono font-medium ${zone.color}`}>
              {Math.round(threshold * 100)}% — {zone.label}
            </span>
          </div>
          <input
            type="range"
            min={30}
            max={95}
            step={5}
            value={Math.round(threshold * 100)}
            onChange={(e) => setThreshold(Number(e.target.value) / 100)}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary bg-muted"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>30%</span>
            <span>60%</span>
            <span>80%</span>
            <span>95%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Orders above this confidence level are created automatically. Below it, they&apos;re flagged for your review.
          </p>
        </div>

        {/* Auto-Clarify */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>Auto-Clarify</Label>
            <p className="text-xs text-muted-foreground">
              When on, the AI asks customers for missing details (quantity, product) before creating an order.
            </p>
          </div>
          <Switch checked={autoClarity} onCheckedChange={setAutoClarity} />
        </div>

        {/* Handoff Message */}
        <div className="space-y-1.5">
          <Label htmlFor="handoffMessage">Low-Confidence Handoff Message</Label>
          <Textarea
            id="handoffMessage"
            value={handoffMessage}
            onChange={(e) => setHandoffMessage(e.target.value)}
            placeholder="A team member will assist you shortly."
            rows={2}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Sent to the customer when their order falls below the confidence threshold.
          </p>
        </div>

        {/* Auto-Acknowledge */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Auto-Acknowledge</Label>
              <p className="text-xs text-muted-foreground">
                Send an instant reply when a message arrives, before AI processes it.
              </p>
            </div>
            <Switch checked={autoAcknowledge} onCheckedChange={setAutoAcknowledge} />
          </div>

          {autoAcknowledge && (
            <div className="space-y-1.5 ps-4 border-s-2 border-border">
              <Label htmlFor="acknowledgeTemplate">Acknowledgment Message</Label>
              <Textarea
                id="acknowledgeTemplate"
                value={acknowledgeTemplate}
                onChange={(e) => setAcknowledgeTemplate(e.target.value)}
                placeholder="شكراً، وصلت رسالتك! سنرد عليك قريباً"
                rows={2}
                maxLength={500}
              />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
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
