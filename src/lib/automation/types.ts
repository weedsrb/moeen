export const automationWorkflowTypes = [
  "new-order-alerts",
  "customer-wait-alerts",
  "inventory-alerts",
  "stale-order-alerts",
  "daily-summary",
] as const;

export type AutomationWorkflowType =
  (typeof automationWorkflowTypes)[number];

export function isAutomationWorkflowType(
  value: string
): value is AutomationWorkflowType {
  return automationWorkflowTypes.includes(value as AutomationWorkflowType);
}
