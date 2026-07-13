"use client";

import { useState } from "react";
import { Bell, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type WorkflowKey =
  | "new_order_alerts"
  | "customer_wait_alerts"
  | "inventory_alerts"
  | "stale_order_alerts"
  | "daily_summary";

export interface AutomationSettingsValue {
  timezone: string;
  notification_email: string | null;
  email_verified_at: string | null;
  email_enabled: boolean;
  email_critical_only: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  wait_medium_minutes: number;
  wait_critical_minutes: number;
  inventory_low_threshold: number;
  stale_incoming_warning_minutes: number;
  stale_incoming_critical_minutes: number;
  stale_pending_hours: number;
  stale_confirmed_hours: number;
  daily_summary_time: string;
  enabled_workflows: Record<WorkflowKey, boolean>;
}

const workflowLabels: Array<[WorkflowKey, string, string]> = [
  ["new_order_alerts", "New orders", "Alert when an AI draft becomes an incoming order."],
  ["customer_wait_alerts", "Customer waiting", "Escalate unanswered customer conversations."],
  ["inventory_alerts", "Inventory", "Alert only when stock crosses a threshold."],
  ["stale_order_alerts", "Stale orders", "Flag orders that remain in one status too long."],
  ["daily_summary", "Daily summary", "Deterministic daily metrics, without an AI call."],
];

export function AutomationSettings({ initial }: { initial: AutomationSettingsValue }) {
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof AutomationSettingsValue>(
    key: K,
    next: AutomationSettingsValue[K]
  ) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  async function save() {
    setLoading(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/settings/automation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Could not save automation settings");
    else {
      setValue(data.settings);
      setNotice("Automation settings saved.");
    }
    setLoading(false);
  }

  async function verifyEmail() {
    setVerifying(true);
    setError(null);
    setNotice(null);
    const response = await fetch("/api/settings/automation/verify-email", {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Test email failed");
    else {
      setValue((current) => ({
        ...current,
        email_enabled: true,
        email_verified_at: data.verified_at,
      }));
      setNotice("Test email accepted. Email alerts are enabled.");
    }
    setVerifying(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" /> Merchant Automations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone">
            <Input value={value.timezone} onChange={(event) => update("timezone", event.target.value)} />
          </Field>
          <Field label="Daily summary time">
            <Input type="time" value={value.daily_summary_time.slice(0, 5)} onChange={(event) => update("daily_summary_time", event.target.value)} />
          </Field>
          <Field label="Notification email">
            <Input type="email" value={value.notification_email ?? ""} onChange={(event) => update("notification_email", event.target.value.trim() || null)} />
          </Field>
          <div className="flex items-end">
            <Button variant="outline" onClick={verifyEmail} disabled={verifying || !value.notification_email}>
              {verifying ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <MailCheck className="me-2 h-4 w-4" />}
              {value.email_verified_at ? "Send another test" : "Test and enable email"}
            </Button>
          </div>
          <Field label="Quiet hours start">
            <Input type="time" value={value.quiet_hours_start?.slice(0, 5) ?? ""} onChange={(event) => update("quiet_hours_start", event.target.value || null)} />
          </Field>
          <Field label="Quiet hours end">
            <Input type="time" value={value.quiet_hours_end?.slice(0, 5) ?? ""} onChange={(event) => update("quiet_hours_end", event.target.value || null)} />
          </Field>
        </div>

        <Toggle label="Email only critical alerts" checked={value.email_critical_only} onChange={(checked) => update("email_critical_only", checked)} />

        <div className="space-y-3">
          <Label>Enabled workflows</Label>
          {workflowLabels.map(([key, label, description]) => (
            <Toggle
              key={key}
              label={label}
              description={description}
              checked={value.enabled_workflows[key]}
              onChange={(checked) =>
                update("enabled_workflows", { ...value.enabled_workflows, [key]: checked })
              }
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Wait warning (min)" value={value.wait_medium_minutes} onChange={(next) => update("wait_medium_minutes", next)} />
          <NumberField label="Wait critical (min)" value={value.wait_critical_minutes} onChange={(next) => update("wait_critical_minutes", next)} />
          <NumberField label="Low-stock threshold" value={value.inventory_low_threshold} onChange={(next) => update("inventory_low_threshold", next)} />
          <NumberField label="Incoming warning (min)" value={value.stale_incoming_warning_minutes} onChange={(next) => update("stale_incoming_warning_minutes", next)} />
          <NumberField label="Incoming critical (min)" value={value.stale_incoming_critical_minutes} onChange={(next) => update("stale_incoming_critical_minutes", next)} />
          <NumberField label="Pending stale (hours)" value={value.stale_pending_hours} onChange={(next) => update("stale_pending_hours", next)} />
          <NumberField label="Confirmed stale (hours)" value={value.stale_confirmed_hours} onChange={(next) => update("stale_confirmed_hours", next)} />
        </div>

        <p className="text-xs text-muted-foreground">
          Dashboard notifications always remain available. Email stays off until a test delivery succeeds.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        <Button onClick={save} disabled={loading}>
          {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Save Automation Settings
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><Input type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} /></Field>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div><p className="text-sm font-medium">{label}</p>{description && <p className="text-xs text-muted-foreground">{description}</p>}</div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
