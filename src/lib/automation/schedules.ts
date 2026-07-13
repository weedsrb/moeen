import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationWorkflowType } from "./types";

export interface ScheduleResult {
  workflowType: AutomationWorkflowType;
  scanned: number;
  notificationsUpserted: number;
  jobsUpserted: number;
  dryRun: boolean;
}

export async function runAutomationSchedule(
  _supabase: SupabaseClient,
  workflowType: AutomationWorkflowType,
  dryRun: boolean
): Promise<ScheduleResult> {
  if (workflowType === "new-order-alerts") {
    // New-order alerts are transaction-triggered when the order timeline records
    // collecting → incoming. The schedule endpoint remains a cheap health/poll
    // boundary before n8n claims the resulting email outbox jobs.
    return {
      workflowType,
      scanned: 0,
      notificationsUpserted: 0,
      jobsUpserted: 0,
      dryRun,
    };
  }
  if (workflowType === "customer-wait-alerts") {
    const { data, error } = await _supabase.rpc("run_customer_wait_scan", {
      p_dry_run: dryRun,
    });
    if (error) throw new Error(error.message);
    return data as ScheduleResult;
  }
  if (workflowType === "inventory-alerts") {
    // Inventory notifications/jobs are created synchronously only when the
    // available-stock state crosses healthy/low/out boundaries.
    return {
      workflowType,
      scanned: 0,
      notificationsUpserted: 0,
      jobsUpserted: 0,
      dryRun,
    };
  }
  if (workflowType === "stale-order-alerts") {
    const { data, error } = await _supabase.rpc("run_stale_order_scan", {
      p_dry_run: dryRun,
    });
    if (error) throw new Error(error.message);
    return data as ScheduleResult;
  }
  throw new Error(`Schedule not implemented yet: ${workflowType}`);
}
