import { z } from "zod/v4";

const workflowSchema = z.object({
  new_order_alerts: z.boolean(),
  customer_wait_alerts: z.boolean(),
  inventory_alerts: z.boolean(),
  stale_order_alerts: z.boolean(),
  daily_summary: z.boolean(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const updateAutomationSettingsSchema = z
  .object({
    timezone: z.string().min(1).max(100).refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone"),
    notification_email: z.email().nullable(),
    email_enabled: z.boolean(),
    email_critical_only: z.boolean(),
    quiet_hours_start: timeSchema.nullable(),
    quiet_hours_end: timeSchema.nullable(),
    wait_medium_minutes: z.number().int().min(5).max(1440),
    wait_critical_minutes: z.number().int().min(10).max(2880),
    inventory_low_threshold: z.number().int().min(0).max(100000),
    stale_incoming_warning_minutes: z.number().int().min(5).max(1440),
    stale_incoming_critical_minutes: z.number().int().min(10).max(2880),
    stale_pending_hours: z.number().int().min(1).max(720),
    stale_confirmed_hours: z.number().int().min(1).max(720),
    daily_summary_time: timeSchema,
    enabled_workflows: workflowSchema,
  })
  .refine((value) => value.wait_critical_minutes > value.wait_medium_minutes, {
    message: "Critical wait threshold must be later than medium",
    path: ["wait_critical_minutes"],
  })
  .refine(
    (value) =>
      value.stale_incoming_critical_minutes >
      value.stale_incoming_warning_minutes,
    {
      message: "Critical incoming threshold must be later than warning",
      path: ["stale_incoming_critical_minutes"],
    }
  );

export type AutomationSettingsInput = z.infer<
  typeof updateAutomationSettingsSchema
>;
