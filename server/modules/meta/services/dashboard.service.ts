import type {
  AdsetBundle,
  DailyTimelinePoint,
  DashboardAccountMetrics,
  DashboardBuilderOptions,
  DashboardCampaignMetrics,
  DashboardTopCreative,
  DashboardTopCreativesAccountGroup,
  GraphCampaign,
  GraphAdsetInsightRow,
  MetaDashboardResult,
  MetricTotals,
  TimeRange,
} from "../types";
import { addDays, format, parseISO } from "date-fns";
import {
  aggregateInsightRowsByAdset,
  buildAdsetBundle,
  buildCampaignBundle,
} from "../utils/aggregation";
import { addTotals, createEmptyTotals } from "../utils/metrics";
import {
  extractEntryTotal,
  normalizeActionType,
  normalizeOptimizationGoal,
  parseNumber,
} from "../utils/parsing";
import {
  LEAD_RESULT_ACTION_TYPES,
  MESSAGING_CONVERSATION_STARTED_ACTION_TYPES,
} from "../constants";
import { getObjectiveResultRule } from "../utils/aggregation";
import { mapWithConcurrency } from "../utils/concurrency";

const ACCOUNT_CONCURRENCY_LIMIT = 2;
const CREATIVE_CAMPAIGN_CONCURRENCY_LIMIT = 3;

function campaignMatchesFilters(
  campaign: GraphCampaign,
  options: Pick<
    DashboardBuilderOptions,
    "campaignFilterSet" | "campaignNameSearch" | "objectiveFilterSet" | "statusFilterSet"
  >,
): boolean {
  const campaignId = campaign.id;
  if (!campaignId) {
    return false;
  }

  if (options.campaignFilterSet && !options.campaignFilterSet.has(campaignId)) {
    return false;
  }

  const campaignNameSearch = options.campaignNameSearch?.trim().toLocaleLowerCase("pt-BR");
  if (campaignNameSearch) {
    const campaignName = campaign.name?.trim().toLocaleLowerCase("pt-BR") ?? "";
    if (!campaignName.includes(campaignNameSearch)) {
      return false;
    }
  }

  const objectiveUpper = campaign.objective
    ? campaign.objective.toUpperCase()
    : null;
  if (
    options.objectiveFilterSet &&
    (!objectiveUpper || !options.objectiveFilterSet.has(objectiveUpper))
  ) {
    return false;
  }

  const statusUpper = campaign.status
    ? campaign.status.toUpperCase()
    : null;
  if (
    options.statusFilterSet &&
    (!statusUpper || !options.statusFilterSet.has(statusUpper))
  ) {
    return false;
  }

  return true;
}

function summarizeLeadMetricsFromRow(row: GraphAdsetInsightRow): {
  leads: number;
  messagingConversationsStarted: number;
} {
  let leads = 0;
  let messagingConversationsStarted = 0;
  const leadQuantities = new Map<string, number>();

  if (!Array.isArray(row.actions)) {
    return { leads, messagingConversationsStarted };
  }

  for (const action of row.actions) {
    const type = normalizeActionType(action.action_type);
    if (!type) continue;

    const value = extractEntryTotal(action);
    if (value <= 0) continue;

    if (MESSAGING_CONVERSATION_STARTED_ACTION_TYPES.has(type)) {
      messagingConversationsStarted += value;
    }

    if (LEAD_RESULT_ACTION_TYPES.includes(type)) {
      leadQuantities.set(type, value);
    }
  }

  for (const type of LEAD_RESULT_ACTION_TYPES) {
    const quantity = leadQuantities.get(type) ?? 0;
    if (quantity > 0) {
      leads = quantity;
      break;
    }
  }

  return { leads, messagingConversationsStarted };
}

function buildTimelineSeries(options: {
  startDate?: string;
  endDate?: string;
  pointsByDate: Map<string, Omit<DailyTimelinePoint, "date" | "costPerLead">>;
}): DailyTimelinePoint[] {
  const { startDate, endDate, pointsByDate } = options;
  if (!startDate || !endDate) {
    return Array.from(pointsByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, point]) => ({
        date,
        ...point,
        costPerLead: point.leads > 0 ? point.spend / point.leads : null,
      }));
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const series: DailyTimelinePoint[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const date = format(cursor, "yyyy-MM-dd");
    const point = pointsByDate.get(date) ?? {
      spend: 0,
      impressions: 0,
      reach: 0,
      leads: 0,
      messagingConversationsStarted: 0,
    };

    series.push({
      date,
      ...point,
      costPerLead: point.leads > 0 ? point.spend / point.leads : null,
    });
  }

  return series;
}

function mergeTimelinePoints(
  target: Map<string, Omit<DailyTimelinePoint, "date" | "costPerLead">>,
  source: Map<string, Omit<DailyTimelinePoint, "date" | "costPerLead">>,
): void {
  for (const [dateKey, point] of source.entries()) {
    const bucket = target.get(dateKey) ?? {
      spend: 0,
      impressions: 0,
      reach: 0,
      leads: 0,
      messagingConversationsStarted: 0,
    };

    bucket.spend += point.spend;
    bucket.impressions += point.impressions;
    bucket.reach += point.reach;
    bucket.leads += point.leads;
    bucket.messagingConversationsStarted += point.messagingConversationsStarted;

    target.set(dateKey, bucket);
  }
}

export async function fetchMetaDashboardMetrics(
  options: DashboardBuilderOptions,
): Promise<MetaDashboardResult & { previousTotals: MetricTotals }> {
  const {
    accounts,
    client,
    campaignFilterSet,
    campaignNameSearch,
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
  const timelinePoints = new Map<
    string,
    Omit<DailyTimelinePoint, "date" | "costPerLead">
  >();
  const campaignCache = new Map<number, GraphCampaign[]>();
  const accountSnapshots = await mapWithConcurrency(
    accounts,
    ACCOUNT_CONCURRENCY_LIMIT,
    async (account) => {
      const [campaigns, adsetRows, dailyRows] = await Promise.all([
        client.fetchCampaigns(account.value),
        client.fetchAdsetInsights(account.value, timeRange),
        timeRange
          ? client.fetchAdsetInsights(account.value, timeRange, {
              timeIncrement: 1,
            })
          : Promise.resolve<GraphAdsetInsightRow[]>([]),
      ]);

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
        if (
          !campaignMatchesFilters(campaign, {
            campaignFilterSet,
            campaignNameSearch,
            objectiveFilterSet,
            statusFilterSet,
          })
        ) {
          continue;
        }

        const campaignId = campaign.id;
        if (!campaignId) continue;

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

      const accountTimelinePoints = new Map<
        string,
        Omit<DailyTimelinePoint, "date" | "costPerLead">
      >();

      if (dailyRows.length > 0) {
        const campaignById = new Map(
          campaigns.map((campaign) => [campaign.id, campaign] as const),
        );

        for (const row of dailyRows) {
          const campaignId = row.campaign_id;
          const dateKey = row.date_start;
          if (!campaignId || !dateKey) continue;

          const campaign = campaignById.get(campaignId);
          if (
            !campaign ||
            !campaignMatchesFilters(campaign, {
              campaignFilterSet,
              campaignNameSearch,
              objectiveFilterSet,
              statusFilterSet,
            })
          ) {
            continue;
          }

          const bucket = accountTimelinePoints.get(dateKey) ?? {
            spend: 0,
            impressions: 0,
            reach: 0,
            leads: 0,
            messagingConversationsStarted: 0,
          };
          const summary = summarizeLeadMetricsFromRow(row);

          bucket.spend += parseNumber(row.spend);
          bucket.impressions += parseNumber(row.impressions);
          bucket.reach += parseNumber(row.reach);
          bucket.leads += summary.leads;
          bucket.messagingConversationsStarted += summary.messagingConversationsStarted;

          accountTimelinePoints.set(dateKey, bucket);
        }
      }

      return {
        accountResult: {
          id: account.id,
          name: account.name,
          value: account.value,
          metrics: accountTotals,
          previousMetrics: createEmptyTotals(),
          campaigns: campaignEntries,
          timeline: buildTimelineSeries({
            startDate,
            endDate,
            pointsByDate: accountTimelinePoints,
          }),
        },
        campaigns,
        accountTimelinePoints,
      };
    },
  );

  for (const snapshot of accountSnapshots) {
    campaignCache.set(snapshot.accountResult.id, snapshot.campaigns);
    addTotals(totals, snapshot.accountResult.metrics);
    accountsResults.push(snapshot.accountResult);
    mergeTimelinePoints(timelinePoints, snapshot.accountTimelinePoints);
  }

  accountsResults.sort((a, b) => b.metrics.spend - a.metrics.spend);

  let previousTotals = createEmptyTotals();

  if (previousRange) {
    const previousSnapshots = await mapWithConcurrency(
      accounts,
      ACCOUNT_CONCURRENCY_LIMIT,
      async (account) => {
        const campaigns = campaignCache.get(account.id) ?? [];
        if (campaigns.length === 0) {
          return {
            accountId: account.id,
            previousTotals: createEmptyTotals(),
          };
        }

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

        const accountPreviousTotals = createEmptyTotals();

        for (const campaign of campaigns) {
          if (
            !campaignMatchesFilters(campaign, {
              campaignFilterSet,
              campaignNameSearch,
              objectiveFilterSet,
              statusFilterSet,
            })
          ) {
            continue;
          }

          const campaignId = campaign.id;
          if (!campaignId) continue;

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

          addTotals(accountPreviousTotals, previousCampaignBundle.metrics);
        }

        return {
          accountId: account.id,
          previousTotals: accountPreviousTotals,
        };
      },
    );

    const accountResultsById = new Map(
      accountsResults.map((account) => [account.id, account] as const),
    );

    for (const snapshot of previousSnapshots) {
      addTotals(previousTotals, snapshot.previousTotals);
      const accountResult = accountResultsById.get(snapshot.accountId);
      if (accountResult) {
        accountResult.previousMetrics = snapshot.previousTotals;
      }
    }
  }

  return {
    totals,
    previousTotals,
    accounts: accountsResults,
    timeline: buildTimelineSeries({
      startDate,
      endDate,
      pointsByDate: timelinePoints,
    }),
  };
}

export async function fetchMetaDashboardTopCreatives(
  options: DashboardBuilderOptions,
): Promise<DashboardTopCreativesAccountGroup[]> {
  const {
    accounts,
    client,
    campaignFilterSet,
    campaignNameSearch,
    objectiveFilterSet,
    statusFilterSet,
    startDate,
    endDate,
  } = options;

  const timeRange: TimeRange =
    startDate && endDate ? { since: startDate, until: endDate } : null;

  const groups: DashboardTopCreativesAccountGroup[] = [];
  const accountGroups = await mapWithConcurrency(
    accounts,
    ACCOUNT_CONCURRENCY_LIMIT,
    async (account) => {
      const campaigns = await client.fetchCampaigns(account.value);
      const filteredCampaigns = campaigns.filter((campaign) =>
        campaignMatchesFilters(campaign, {
          campaignFilterSet,
          campaignNameSearch,
          objectiveFilterSet,
          statusFilterSet,
        }),
      );

      if (filteredCampaigns.length === 0) {
        return {
          accountId: account.id,
          accountName: account.name,
          accountValue: account.value,
          creatives: [],
        };
      }

      const creativeGroups = await mapWithConcurrency(
        filteredCampaigns,
        CREATIVE_CAMPAIGN_CONCURRENCY_LIMIT,
        async (campaign) => {
          const campaignId = campaign.id;
          if (!campaignId) {
            return [] as DashboardTopCreative[];
          }

          try {
            const reports = await client.fetchCampaignAdReports(
              account.value,
              campaignId,
              campaign.objective ?? null,
              timeRange,
            );

            return reports.map(
              (report): DashboardTopCreative => {
                const resultLabel =
                  report.metrics.leadQty > 0
                    ? "Leads"
                    : report.metrics.messagingQty > 0
                      ? "Conversas iniciadas"
                      : getObjectiveResultRule(campaign.objective)?.label ?? "Resultado";

                return {
                  accountId: account.id,
                  accountName: account.name,
                  accountValue: account.value,
                  campaignId,
                  campaignName: campaign.name ?? null,
                  campaignObjective: campaign.objective ?? null,
                  campaignStatus: campaign.status ?? null,
                  resultLabel,
                  ad_id: report.ad_id,
                  ad_name: report.ad_name,
                  ad_status: report.ad_status,
                  creative_id: report.creative_id,
                  thumbnailUrl: report.thumbnailUrl,
                  metrics: report.metrics,
                };
              },
            );
          } catch (error) {
            console.error("Falha ao carregar criativos do dashboard.", {
              accountId: account.id,
              accountValue: account.value,
              campaignId,
              error,
            });
            return [] as DashboardTopCreative[];
          }
        },
      );

      const creatives = creativeGroups
        .flat()
        .filter((creative) => creative.metrics.resultQty > 0);

      creatives.sort((a, b) => {
        const resultDiff = b.metrics.resultQty - a.metrics.resultQty;
        if (resultDiff !== 0) {
          return resultDiff;
        }

        const aCost =
          a.metrics.costPerResult === null
            ? Number.POSITIVE_INFINITY
            : a.metrics.costPerResult;
        const bCost =
          b.metrics.costPerResult === null
            ? Number.POSITIVE_INFINITY
            : b.metrics.costPerResult;
        if (aCost !== bCost) {
          return aCost - bCost;
        }

        return b.metrics.spend - a.metrics.spend;
      });

      return {
        accountId: account.id,
        accountName: account.name,
        accountValue: account.value,
        creatives: creatives.slice(0, 5),
      };
    },
  );

  groups.push(...accountGroups);

  groups.sort((a, b) => a.accountName.localeCompare(b.accountName, "pt-BR"));

  return groups;
}
