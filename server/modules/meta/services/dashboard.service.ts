import type {
  AdsetBundle,
  DashboardAccountMetrics,
  DashboardBuilderOptions,
  DashboardCampaignMetrics,
  GraphCampaign,
  MetaDashboardResult,
  MetricTotals,
  TimeRange,
} from "../types";
import {
  aggregateInsightRowsByAdset,
  buildAdsetBundle,
  buildCampaignBundle,
} from "../utils/aggregation";
import { addTotals, createEmptyTotals } from "../utils/metrics";
import { normalizeOptimizationGoal } from "../utils/parsing";

export async function fetchMetaDashboardMetrics(
  options: DashboardBuilderOptions,
): Promise<MetaDashboardResult & { previousTotals: MetricTotals }> {
  const {
    accounts,
    client,
    campaignFilterSet,
    objectiveFilterSet,
    optimizationGoalFilterSet,
    statusFilterSet,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
  } = options;

  const timeRange: TimeRange =
    startDate && endDate ? { since: startDate, until: endDate } : null;

  const previousRange: TimeRange =
    previousStartDate && previousEndDate
      ? { since: previousStartDate, until: previousEndDate }
      : null;

  const accountsResults: DashboardAccountMetrics[] = [];
  const totals = createEmptyTotals();

  const campaignCache = new Map<number, GraphCampaign[]>();

  for (const account of accounts) {
    const campaigns = await client.fetchCampaigns(account.value);
    campaignCache.set(account.id, campaigns);

    const adsetRows = await client.fetchAdsetInsights(account.value, timeRange);

    const groupedAdsets = aggregateInsightRowsByAdset(adsetRows);
    const adsetsByCampaign = new Map<string, AdsetBundle[]>();
    for (const data of Array.from(groupedAdsets.values())) {
      const bundle = buildAdsetBundle(data);
      if (!adsetsByCampaign.has(bundle.campaignId)) {
        adsetsByCampaign.set(bundle.campaignId, []);
      }
      adsetsByCampaign.get(bundle.campaignId)!.push(bundle);
    }

    const accountTotals = createEmptyTotals();
    const campaignEntries: DashboardCampaignMetrics[] = [];

    for (const campaign of campaigns) {
      const campaignId = campaign.id;
      if (!campaignId) continue;

      if (campaignFilterSet && !campaignFilterSet.has(campaignId)) {
        continue;
      }

      const objectiveUpper = campaign.objective
        ? campaign.objective.toUpperCase()
        : null;
      if (
        objectiveFilterSet &&
        (!objectiveUpper || !objectiveFilterSet.has(objectiveUpper))
      ) {
        continue;
      }

      const statusUpper = campaign.status
        ? campaign.status.toUpperCase()
        : null;
      if (
        statusFilterSet &&
        (!statusUpper || !statusFilterSet.has(statusUpper))
      ) {
        continue;
      }

      const adsetBundles = adsetsByCampaign.get(campaignId) ?? [];
      const campaignBundle = buildCampaignBundle(campaign, adsetBundles);
      const metrics = campaignBundle.metrics;

      const dominantGoal =
        campaignBundle.resultado?.optimization_goal ?? null;
      const normalizedGoal = dominantGoal
        ? normalizeOptimizationGoal(dominantGoal)
        : null;
      if (
        optimizationGoalFilterSet &&
        (!normalizedGoal || !optimizationGoalFilterSet.has(normalizedGoal))
      ) {
        continue;
      }

      addTotals(accountTotals, metrics);

      campaignEntries.push({
        id: campaignId,
        name: campaign.name ?? null,
        objective: campaign.objective ?? null,
        status: campaign.status ?? null,
        metrics,
        resultado: campaignBundle.resultado ?? undefined,
      });
    }

    const hasFilters =
      (campaignFilterSet && campaignFilterSet.size > 0) ||
      (objectiveFilterSet && objectiveFilterSet.size > 0);
    const hasStatusFilter = statusFilterSet && statusFilterSet.size > 0;
    const hasGoalFilter =
      optimizationGoalFilterSet && optimizationGoalFilterSet.size > 0;

    if (
      !hasFilters &&
      !hasStatusFilter &&
      !hasGoalFilter &&
      campaignEntries.length === 0
    ) {
      for (const campaign of campaigns) {
        const campaignId = campaign.id;
        if (!campaignId) continue;
        campaignEntries.push({
          id: campaignId,
          name: campaign.name ?? null,
          objective: campaign.objective ?? null,
          status: campaign.status ?? null,
          metrics: createEmptyTotals(),
        });
      }
    }

    campaignEntries.sort((a, b) => b.metrics.spend - a.metrics.spend);

    addTotals(totals, accountTotals);

    accountsResults.push({
      id: account.id,
      name: account.name,
      value: account.value,
      metrics: accountTotals,
      campaigns: campaignEntries,
    });
  }

  accountsResults.sort((a, b) => b.metrics.spend - a.metrics.spend);

  let previousTotals = createEmptyTotals();

  if (previousRange) {
    for (const account of accounts) {
      const campaigns = campaignCache.get(account.id);
      if (!campaigns) continue;

      const previousRows = await client.fetchAdsetInsights(
        account.value,
        previousRange,
      );

      const prevGrouped = aggregateInsightRowsByAdset(previousRows);
      const prevAdsetsByCampaign = new Map<string, AdsetBundle[]>();
      for (const data of Array.from(prevGrouped.values())) {
        const bundle = buildAdsetBundle(data);
        if (!prevAdsetsByCampaign.has(bundle.campaignId)) {
          prevAdsetsByCampaign.set(bundle.campaignId, []);
        }
        prevAdsetsByCampaign.get(bundle.campaignId)!.push(bundle);
      }

      for (const campaign of campaigns) {
        const campaignId = campaign.id;
        if (!campaignId) continue;

        if (campaignFilterSet && !campaignFilterSet.has(campaignId)) {
          continue;
        }

        const objectiveUpper = campaign.objective
          ? campaign.objective.toUpperCase()
          : null;
        if (
          objectiveFilterSet &&
          (!objectiveUpper || !objectiveFilterSet.has(objectiveUpper))
        ) {
          continue;
        }

        const previousBundles = prevAdsetsByCampaign.get(campaignId) ?? [];
        const previousCampaignBundle = buildCampaignBundle(
          campaign,
          previousBundles,
        );

        const prevGoal =
          previousCampaignBundle.resultado?.optimization_goal ?? null;
        const normalizedPrevGoal = prevGoal
          ? normalizeOptimizationGoal(prevGoal)
          : null;
        if (
          optimizationGoalFilterSet &&
          (!normalizedPrevGoal ||
            !optimizationGoalFilterSet.has(normalizedPrevGoal))
        ) {
          continue;
        }

        const statusUpper = campaign.status
          ? campaign.status.toUpperCase()
          : null;
        if (
          statusFilterSet &&
          (!statusUpper || !statusFilterSet.has(statusUpper))
        ) {
          continue;
        }

        addTotals(previousTotals, previousCampaignBundle.metrics);
      }
    }
  }

  return {
    totals,
    previousTotals,
    accounts: accountsResults,
  };
}
