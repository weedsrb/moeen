import { describe, expect, it } from "vitest";
import { updateAutomationSettingsSchema } from "../../validations/automation-settings";

const validSettings = {
  timezone: "Asia/Hebron",
  notification_email: "merchant@example.com",
  email_enabled: false,
  email_critical_only: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  wait_medium_minutes: 60,
  wait_critical_minutes: 120,
  inventory_low_threshold: 5,
  stale_incoming_warning_minutes: 30,
  stale_incoming_critical_minutes: 120,
  stale_pending_hours: 24,
  stale_confirmed_hours: 48,
  daily_summary_time: "21:00",
  enabled_workflows: {
    new_order_alerts: false,
    customer_wait_alerts: true,
    inventory_alerts: true,
    stale_order_alerts: false,
    daily_summary: true,
  },
};

describe("merchant automation policy", () => {
  it("accepts the production defaults", () => {
    expect(updateAutomationSettingsSchema.safeParse(validSettings).success).toBe(
      true
    );
  });

  it("rejects invalid timezones and inverted escalation thresholds", () => {
    expect(
      updateAutomationSettingsSchema.safeParse({
        ...validSettings,
        timezone: "Not/AZone",
      }).success
    ).toBe(false);
    expect(
      updateAutomationSettingsSchema.safeParse({
        ...validSettings,
        wait_medium_minutes: 120,
        wait_critical_minutes: 60,
      }).success
    ).toBe(false);
  });
});
