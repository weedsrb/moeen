"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface AIPersonaSettingsProps {
  initialPersonaName: string | null;
  initialTone: string;
  initialGreeting: string | null;
  initialResponseLanguage: string;
  initialBusinessContext: string | null;
  initialCustomInstructions: string | null;
}

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly", description: "Warm, approachable, uses light expressions" },
  { value: "formal", label: "Formal", description: "Professional and respectful, no colloquialisms" },
  { value: "casual", label: "Casual", description: "Relaxed, conversational, feels human" },
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto (mirror customer)" },
  { value: "ar", label: "Always Arabic" },
  { value: "en", label: "Always English" },
];

export function AIPersonaSettings({
  initialPersonaName,
  initialTone,
  initialGreeting,
  initialResponseLanguage,
  initialBusinessContext,
  initialCustomInstructions,
}: AIPersonaSettingsProps) {
  const [personaName, setPersonaName] = useState(initialPersonaName ?? "");
  const [tone, setTone] = useState(initialTone || "friendly");
  const [greeting, setGreeting] = useState(initialGreeting ?? "");
  const [responseLanguage, setResponseLanguage] = useState(initialResponseLanguage || "auto");
  const [businessContext, setBusinessContext] = useState(initialBusinessContext ?? "");
  const [customInstructions, setCustomInstructions] = useState(initialCustomInstructions ?? "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setLoading(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_persona_name: personaName.trim() || null,
          ai_tone: tone,
          ai_greeting: greeting.trim() || null,
          ai_response_language: responseLanguage,
          ai_business_context: businessContext.trim() || null,
          ai_custom_instructions: customInstructions.trim() || null,
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

  const selectedTone = TONE_OPTIONS.find((t) => t.value === tone);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Persona</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Assistant Name */}
        <div className="space-y-1.5">
          <Label htmlFor="personaName">Assistant Name</Label>
          <Input
            id="personaName"
            value={personaName}
            onChange={(e) => setPersonaName(e.target.value)}
            placeholder="Leave blank to use your business name"
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">
            The name the AI uses when addressing customers. e.g. &ldquo;Lina from [Shop]&rdquo;
          </p>
        </div>

        {/* Tone */}
        <div className="space-y-1.5">
          <Label>Communication Tone</Label>
          <Select value={tone} onValueChange={(v) => v && setTone(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTone && (
            <p className="text-xs text-muted-foreground">{selectedTone.description}</p>
          )}
        </div>

        {/* Opening Greeting */}
        <div className="space-y-1.5">
          <Label htmlFor="greeting">Opening Greeting</Label>
          <Input
            id="greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="e.g. أهلاً وسهلاً! 👋"
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            The first line of every AI reply. Leave blank to let the AI decide.
          </p>
        </div>

        {/* Response Language */}
        <div className="space-y-1.5">
          <Label>Response Language</Label>
          <Select value={responseLanguage} onValueChange={(v) => v && setResponseLanguage(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Business Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="businessContext">Business Description</Label>
            <span className="text-[10px] text-muted-foreground font-mono">
              {businessContext.length}/1000
            </span>
          </div>
          <Textarea
            id="businessContext"
            value={businessContext}
            onChange={(e) => setBusinessContext(e.target.value)}
            placeholder="Tell the AI about your business, products, and customers. e.g. &quot;We sell handmade Palestinian embroidery. Customers often ask about custom sizes and bulk orders.&quot;"
            rows={3}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            Improves extraction accuracy by giving the AI context about your business.
          </p>
        </div>

        {/* Custom Instructions */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="customInstructions">Custom Instructions</Label>
            <span className="text-[10px] text-muted-foreground font-mono">
              {customInstructions.length}/1000
            </span>
          </div>
          <Textarea
            id="customInstructions"
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g. &quot;Never offer discounts unless the customer mentions a promo code. Always recommend the large size when size isn't specified.&quot;"
            rows={3}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            Additional rules for the AI. These shape behavior but don&apos;t override extraction logic.
          </p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            "Saved!"
          ) : (
            "Save Persona Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
