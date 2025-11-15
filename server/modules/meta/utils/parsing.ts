import {
  ACTION_TYPE_LABELS,
  FALLBACK_RESULT_ACTION_TYPES,
  LEAD_ACTION_TYPES,
  OPTIMIZATION_GOAL_ALIASES,
  OPTIMIZATION_GOAL_TO_ACTION_TYPES,
} from "../constants";
import type { GraphActionEntry } from "../types";

export function parseNumber(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parsePercentToNumber(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed / 100;
}

export function normalizeActionType(actionType?: string | null): string | null {
  if (!actionType) {
    return null;
  }
  return actionType.toLowerCase();
}

export function normalizeOptimizationGoal(goal?: string | null): string | null {
  if (!goal || typeof goal !== "string") return null;
  const upper = goal.trim().toUpperCase();
  if (!upper) return null;
  return OPTIMIZATION_GOAL_ALIASES[upper] ?? upper;
}

export function extractEntryTotal(entry: GraphActionEntry): number {
  if (!entry) return 0;
  const value = entry.value ?? entry["28d_value"];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatResultLabel(actionType: string | null): string {
  if (!actionType) {
    return "Resultados";
  }

  const normalized = actionType.toLowerCase();

  if (LEAD_ACTION_TYPES.has(normalized)) {
    return "Leads";
  }

  return (
    ACTION_TYPE_LABELS[normalized] ??
    normalized
      .split("_")
      .filter((segment) => segment.length > 0)
      .map(
        (segment) =>
          segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
      )
      .join(" ")
  );
}
