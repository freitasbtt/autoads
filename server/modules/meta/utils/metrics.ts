import type { MetricTotals } from "../types";

export function createEmptyTotals(): MetricTotals {
  return {
    spend: 0,
    resultSpend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    results: 0,
    costPerResult: null,
  };
}

export function addTotals(target: MetricTotals, source: MetricTotals): void {
  target.spend += source.spend;
  target.resultSpend += source.resultSpend;
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.leads += source.leads;
  target.results += source.results;
  target.costPerResult =
    target.results > 0 ? target.resultSpend / target.results : null;
}
