import type { FlagPriority } from "@/types/flag";

/** Severity ranking — higher wins when choosing the badge color. */
export const FLAG_PRIORITY_RANK: Record<FlagPriority, number> = {
  critical: 3,
  medium: 2,
  low: 1,
};

/** Return the most severe priority in a list, or null if empty. */
export function highestPriority(
  priorities: FlagPriority[]
): FlagPriority | null {
  let best: FlagPriority | null = null;
  for (const p of priorities) {
    if (best === null || FLAG_PRIORITY_RANK[p] > FLAG_PRIORITY_RANK[best]) {
      best = p;
    }
  }
  return best;
}

/**
 * Tailwind classes for a flag badge, keyed to priority. The badge always
 * pulses, in a ring color that matches its priority (see the
 * `flag-pulse-*` keyframes in globals.css).
 */
export function flagBadgeColorClass(priority: FlagPriority | null): string {
  switch (priority) {
    case "critical":
      return "bg-priority-critical text-white animate-flag-pulse-critical";
    case "medium":
      return "bg-priority-medium text-white animate-flag-pulse-medium";
    case "low":
      return "bg-priority-low text-white animate-flag-pulse-low";
    default:
      return "bg-priority-low text-white animate-flag-pulse-low";
  }
}
