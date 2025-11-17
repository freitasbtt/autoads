import {
  CAMPAIGN_OBJECTIVE_ALIASES,
  FALLBACK_RESULT_ACTION_TYPES,
  LEAD_ACTION_TYPES,
  OBJECTIVE_RESULT_RULES,
  OPTIMIZATION_GOAL_TO_ACTION_TYPES,
} from "../constants";
import type {
  AdsetBundle,
  AggregatedActionRecord,
  AggregatedAdsetMetrics,
  CampaignActionAggregation,
  CampaignMetricBundle,
  CampaignResultSummary,
  GoalGroup,
  GraphAdsetInsightRow,
  GraphCampaign,
  ObjectiveResultRule,
  ResultDetail,
} from "../types";
import {
  extractEntryTotal,
  formatResultLabel,
  normalizeActionType,
  normalizeOptimizationGoal,
  parseNumber,
} from "./parsing";
import { createEmptyTotals } from "./metrics";

export function aggregateInsightRowsByAdset(
  rows: GraphAdsetInsightRow[],
): Map<string, AggregatedAdsetMetrics> {
  const agg = new Map<string, AggregatedAdsetMetrics>();

  for (const row of rows) {
    const adsetId = row.adset_id;
    const campaignId = row.campaign_id;
    if (!adsetId || !campaignId) continue;

    if (!agg.has(adsetId)) {
      agg.set(adsetId, {
        adsetId,
        adsetName: row.adset_name ?? null,
        campaignId,
        campaignName: row.campaign_name ?? null,
        optimizationGoal: row.optimization_goal ?? null,
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        actions: {},
      });
    }

    const bucket = agg.get(adsetId)!;
    bucket.spend += parseNumber(row.spend);
    bucket.impressions += parseNumber(row.impressions);
    bucket.clicks += parseNumber(row.clicks);
    bucket.reach += parseNumber(row.reach);

    if (row.optimization_goal && !bucket.optimizationGoal) {
      bucket.optimizationGoal = row.optimization_goal;
    }
    if (row.adset_name && !bucket.adsetName) bucket.adsetName = row.adset_name;
    if (row.campaign_name && !bucket.campaignName) {
      bucket.campaignName = row.campaign_name;
    }

    if (Array.isArray(row.actions)) {
      for (const action of row.actions) {
        const type = normalizeActionType(action.action_type);
        if (!type) continue;

        const qty = extractEntryTotal(action);
        if (qty <= 0) continue;

        if (!bucket.actions[type]) {
          bucket.actions[type] = { quantity: 0, cost: null };
        }
        bucket.actions[type].quantity += qty;
      }
    }

    if (Array.isArray(row.cost_per_action_type)) {
      for (const entry of row.cost_per_action_type) {
        const type = normalizeActionType(entry.action_type);
        if (!type) continue;

        const costVal = extractEntryTotal(entry);
        if (costVal <= 0) continue;

        if (!bucket.actions[type]) {
          bucket.actions[type] = { quantity: 0, cost: costVal };
        } else {
          const prevCost = bucket.actions[type].cost;
          if (prevCost === null || prevCost > costVal) {
            bucket.actions[type].cost = costVal;
          }
        }
      }
    }
  }

  return agg;
}

function getGoalActionCandidatesForAdsetGoal(goal: string | null): string[] {
  const normalized = normalizeOptimizationGoal(goal);
  const mapped = normalized
    ? OPTIMIZATION_GOAL_TO_ACTION_TYPES[normalized] ?? []
    : [];
  return [...mapped, ...FALLBACK_RESULT_ACTION_TYPES];
}

export function pickOfficialResultForAdset(
  goal: string | null,
  actions: AggregatedActionRecord,
): ResultDetail | null {
  const candidates = getGoalActionCandidatesForAdsetGoal(goal);
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const entry = actions[normalized];
    if (entry && entry.quantity > 0) {
      return {
        type: normalized,
        label: formatResultLabel(normalized),
        quantity: entry.quantity,
        cost: entry.cost ?? null,
      };
    }
  }

  let fallback:
    | {
        type: string;
        info: { quantity: number; cost: number | null };
      }
    | null = null;

  for (const [type, info] of Object.entries(actions)) {
    if (info.quantity <= 0) continue;
    if (!fallback || info.quantity > fallback.info.quantity) {
      fallback = { type, info };
    }
  }

  if (fallback) {
    return {
      type: fallback.type,
      label: formatResultLabel(fallback.type),
      quantity: fallback.info.quantity,
      cost: fallback.info.cost ?? null,
    };
  }

  const defaultType = candidates.find((c) => c.length > 0);
  if (!defaultType) return null;

  const normalizedDefault = defaultType.toLowerCase();
  const defaultEntry = actions[normalizedDefault];
  return {
    type: normalizedDefault,
    label: formatResultLabel(normalizedDefault),
    quantity: defaultEntry?.quantity ?? 0,
    cost: defaultEntry?.cost ?? null,
  };
}

export function aggregateActionsForAdsets(
  adsets: AdsetBundle[],
): CampaignActionAggregation {
  const aggregate: CampaignActionAggregation = {};

  for (const adset of adsets) {
    for (const action of adset.actions) {
      const type = action.type.toLowerCase();
      if (!aggregate[type]) {
        aggregate[type] = { quantity: 0, weightedSpend: 0 };
      }
      aggregate[type].quantity += action.quantity;
      if (action.cost !== null && action.quantity > 0) {
        aggregate[type].weightedSpend += action.cost * action.quantity;
      }
    }
  }

  return aggregate;
}

export function getObjectiveResultRule(
  objective: unknown,
): ObjectiveResultRule | null {
  if (typeof objective !== "string" || objective.trim() === "") {
    return null;
  }

  const upper = objective.toUpperCase();
  const normalized = CAMPAIGN_OBJECTIVE_ALIASES[upper] ?? upper;
  return OBJECTIVE_RESULT_RULES[normalized] ?? null;
}

export function buildAdsetBundle(agg: AggregatedAdsetMetrics): AdsetBundle {
  const actionsArray: ResultDetail[] = Object.entries(agg.actions)
    .filter(([, info]) => info.quantity > 0)
    .map(([type, info]) => ({
      type,
      label: formatResultLabel(type),
      quantity: info.quantity,
      cost: info.cost ?? null,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  let leads = 0;
  LEAD_ACTION_TYPES.forEach((leadType) => {
    const info = agg.actions[leadType];
    if (info) {
      leads += info.quantity;
    }
  });

  let official = pickOfficialResultForAdset(agg.optimizationGoal, agg.actions);

  const officialQty = official?.quantity ?? 0;
  const officialCost =
    official && officialQty > 0
      ? official.cost ?? (agg.spend > 0 ? agg.spend / officialQty : null)
      : null;

  if (official && officialCost !== official.cost) {
    official = { ...official, cost: officialCost };
  }

  return {
    adsetId: agg.adsetId,
    adsetName: agg.adsetName,
    campaignId: agg.campaignId,
    campaignName: agg.campaignName,
    optimizationGoal: agg.optimizationGoal,
    spend: agg.spend,
    impressions: agg.impressions,
    clicks: agg.clicks,
    reach: agg.reach,
    leads,
    actions: actionsArray,
    officialResult: official ?? null,
    resultQuantity: officialQty,
    resultCost: officialCost,
  };
}

export function buildCampaignBundle(
  campaign: GraphCampaign,
  adsets: AdsetBundle[],
): CampaignMetricBundle {
  const metrics = createEmptyTotals();

  if (adsets.length === 0) {
    return { metrics, resultado: null };
  }

  const goalGroups = new Map<string, GoalGroup>();

  for (const adset of adsets) {
    metrics.spend += adset.spend;
    metrics.impressions += adset.impressions;
    metrics.clicks += adset.clicks;
    metrics.leads += adset.leads;

    const canonical = normalizeOptimizationGoal(adset.optimizationGoal);
    const key = canonical ?? "__UNKNOWN__";

    let group = goalGroups.get(key);
    if (!group) {
      group = {
        canonicalGoal: canonical,
        originalGoals: new Set<string>(),
        spend: 0,
        adsets: [],
      };
      goalGroups.set(key, group);
    }

    if (adset.optimizationGoal) {
      group.originalGoals.add(adset.optimizationGoal);
    }

    group.spend += adset.spend;
    group.adsets.push(adset);
  }

  let dominantGroup: GoalGroup | null = null;

  for (const group of Array.from(goalGroups.values())) {
    if (!dominantGroup) {
      dominantGroup = group;
      continue;
    }

    if (group.spend > dominantGroup.spend + 1e-6) {
      dominantGroup = group;
      continue;
    }

    let groupResultSum = 0;
    for (const adset of group.adsets) {
      groupResultSum += adset.resultQuantity;
    }

    let dominantResultSum = 0;
    for (const adset of dominantGroup.adsets) {
      dominantResultSum += adset.resultQuantity;
    }

    if (
      Math.abs(group.spend - dominantGroup.spend) <= 1e-6 &&
      groupResultSum > dominantResultSum
    ) {
      dominantGroup = group;
    }
  }

  if (!dominantGroup) {
    return { metrics, resultado: null };
  }

  const resultAdsets = dominantGroup.adsets;
  const resultSpend = resultAdsets.reduce((sum, a) => sum + a.spend, 0);

  const aggregatedActions = aggregateActionsForAdsets(resultAdsets);
  const objectiveRule = getObjectiveResultRule(campaign.objective ?? null);

  const tipos = new Set<string>();
  let detalhes: CampaignResultSummary["detalhes"] = undefined;
  let adsetSummaries: NonNullable<CampaignResultSummary["adsets"]>;
  let resultQuantity = 0;
  let costPerResult: number | null = null;
  let summaryLabel = "Resultado";

  if (objectiveRule) {
    summaryLabel = objectiveRule.label;
    const mode = objectiveRule.mode ?? "sum";

    const normalizedTypes = objectiveRule.actionTypes.map((raw) =>
      raw.toLowerCase(),
    );

    const breakdownEntries: Array<{
      type: string;
      label: string;
      quantity: number;
      cost: number | null;
    }> = [];
    const selectedTypes: string[] = [];

    if (mode === "first") {
      for (const type of normalizedTypes) {
        const info = aggregatedActions[type];
        const quantity = info?.quantity ?? 0;
        if (quantity <= 0) continue;

        const weightedSpend = info?.weightedSpend ?? 0;
        let cost =
          quantity > 0 && weightedSpend > 0
            ? weightedSpend / quantity
            : null;
        if (cost === null && quantity > 0) {
          cost = resultSpend > 0 ? resultSpend / quantity : null;
        }

        breakdownEntries.push({
          type,
          label: objectiveRule.label,
          quantity,
          cost,
        });
        selectedTypes.push(type);
        break;
      }

      if (breakdownEntries.length === 0 && normalizedTypes.length > 0) {
        selectedTypes.push(normalizedTypes[0]);
      }
    } else {
      for (const type of normalizedTypes) {
        const info = aggregatedActions[type];
        const quantity = info?.quantity ?? 0;
        if (quantity <= 0) continue;

        const weightedSpend = info?.weightedSpend ?? 0;
        const cost =
          quantity > 0 && weightedSpend > 0
            ? weightedSpend / quantity
            : null;

        breakdownEntries.push({
          type,
          label: formatResultLabel(type),
          quantity,
          cost,
        });
        selectedTypes.push(type);
      }
    }

    resultQuantity = breakdownEntries.reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    );
    costPerResult =
      resultQuantity > 0 ? resultSpend / resultQuantity : null;

    breakdownEntries.forEach((entry) => tipos.add(entry.type));

    if (breakdownEntries.length > 0) {
      detalhes = breakdownEntries.map((entry) => ({
        tipo: entry.type,
        label: entry.label,
        quantidade: entry.quantity,
        custo_por_resultado: entry.cost,
      }));
    }

    adsetSummaries = resultAdsets.map((adset) => {
      const actionMap = new Map(adset.actions.map((a) => [a.type, a]));

      let quantity = 0;
      let weightedCostTotal = 0;

      for (const type of selectedTypes) {
        const action = actionMap.get(type);
        if (!action) continue;
        quantity += action.quantity;
        if (action.cost !== null && action.quantity > 0) {
          weightedCostTotal += action.cost * action.quantity;
        }
      }

      let adsetCost: number | null = null;
      if (quantity > 0) {
        if (weightedCostTotal > 0) {
          adsetCost = weightedCostTotal / quantity;
        } else {
          adsetCost = adset.spend / quantity;
        }
      }

      return {
        adset_id: adset.adsetId,
        adset_name: adset.adsetName,
        optimization_goal:
          adset.optimizationGoal ?? dominantGroup.canonicalGoal ?? null,
        action_type: selectedTypes.length === 1 ? selectedTypes[0] : null,
        label: objectiveRule.label,
        quantidade: quantity,
        custo_por_resultado: adsetCost,
        spend: adset.spend,
        impressions: adset.impressions,
        clicks: adset.clicks,
      };
    });

    metrics.results = resultQuantity;
    metrics.resultSpend = resultSpend;
    metrics.costPerResult = costPerResult;
  } else {
    summaryLabel = "Resultado";
    costPerResult = null;

    adsetSummaries = resultAdsets.map((adset) => {
      const cost =
        adset.officialResult?.cost ??
        (adset.resultQuantity > 0
          ? adset.spend / adset.resultQuantity
          : null);

      return {
        adset_id: adset.adsetId,
        adset_name: adset.adsetName,
        optimization_goal:
          adset.optimizationGoal ?? dominantGroup.canonicalGoal ?? null,
        action_type: adset.officialResult?.type ?? null,
        label: adset.officialResult
          ? adset.officialResult.label
          : formatResultLabel(null),
        quantidade: adset.resultQuantity,
        custo_por_resultado: cost,
        spend: adset.spend,
        impressions: adset.impressions,
        clicks: adset.clicks,
      };
    });

    metrics.results = 0;
    metrics.resultSpend = 0;
    metrics.costPerResult = null;
  }

  const resultado = {
    label: summaryLabel,
    quantidade: getObjectiveResultRule(campaign.objective ?? null)
      ? resultQuantity
      : null,
    custo_por_resultado: costPerResult,
    optimization_goal: dominantGroup.canonicalGoal ?? null,
    tipos: Array.from(tipos),
    detalhes,
    adsets: adsetSummaries,
  };

  return { metrics, resultado };
}
