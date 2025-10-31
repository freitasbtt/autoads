import crypto from "crypto";
import type { Resource } from "@shared/schema";

const GRAPH_BASE_URL = "https://graph.facebook.com/v18.0";

/* --------------------------------------------------
 * Tipos da Graph API
 * -------------------------------------------------- */

interface GraphPagingResponse<T> {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

type GraphCampaign = {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
};

type GraphActionEntry = {
  action_type?: string;
  value?: string;
  [key: string]: string | undefined;
};

type GraphInsightRow = {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
};

type GraphAdsetInsightRow = {
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  optimization_goal?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
};

/* --------------------------------------------------
 * Tipos internos usados pelo dashboard
 * -------------------------------------------------- */

export type MetricTotals = {
  spend: number;
  resultSpend: number;
  impressions: number;
  clicks: number;
  leads: number;
  results: number;
  costPerResult: number | null;
};

type CampaignResultSummary = {
  label: string;
  quantidade: number | null;
  custo_por_resultado: number | null;
  optimization_goal?: string | null;
  tipos?: string[];
  detalhes?: Array<{
    tipo: string;
    label: string;
    quantidade: number;
    custo_por_resultado: number | null;
  }>;
  adsets?: Array<{
    adset_id: string;
    adset_name: string | null;
    optimization_goal: string | null;
    action_type: string | null;
    label: string;
    quantidade: number;
    custo_por_resultado: number | null;
    spend: number;
    impressions: number;
    clicks: number;
  }>;
};

type CampaignMetricBundle = {
  metrics: MetricTotals;
  resultado: CampaignResultSummary | null;
};

export type DashboardCampaignMetrics = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  metrics: MetricTotals;
  resultado?: CampaignResultSummary;
};

export type DashboardAccountMetrics = {
  id: number;
  name: string;
  value: string;
  metrics: MetricTotals;
  campaigns: DashboardCampaignMetrics[];
};

export type MetaDashboardResult = {
  totals: MetricTotals;
  accounts: DashboardAccountMetrics[];
};

/* --------------------------------------------------
 * Datas
 * -------------------------------------------------- */

type TimeRange =
  | {
      since: string;
      until: string;
    }
  | null;

/* --------------------------------------------------
 * Constantes de classificação
 * -------------------------------------------------- */

const LEAD_ACTION_TYPES = new Set([
  "lead",
  "leadgen",
  "leadgen.other",
  "leadgen_qualified_lead",
  "leadgen.qualified_lead",
  "omni_lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.lead",
  "onsite_conversion.post_save",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
  "offsite_content_view_add_meta_leads",
  "submit_application",
  "submitted_application",
  "contact",
]);

const DEFAULT_ATTRIBUTION_WINDOWS = [
  "7d_click",
  "1d_click",
  "7d_view",
  "1d_view",
] as const;

const ACTION_TYPE_LABELS: Record<string, string> = {
  lead: "Leads",
  leadgen: "Leads",
  "leadgen.other": "Leads",
  "leadgen_qualified_lead": "Leads qualificados",
  "leadgen.qualified_lead": "Leads qualificados",
  omni_lead: "Leads Omni",
  "onsite_conversion.lead_grouped": "Leads",
  "onsite_conversion.lead": "Leads",
  "onsite_conversion.post_save": "Salvos",
  "offsite_conversion.fb_pixel_lead": "Leads (pixel)",
  onsite_web_lead: "Leads (site)",
  offsite_content_view_add_meta_leads: "Meta Leads",
  submit_application: "Envios de cadastro",
  submitted_application: "Cadastros enviados",
  contact: "Contatos",
  "onsite_conversion.whatsapp_message": "Conversas no WhatsApp",
  "onsite_conversion.whatsapp_first_reply": "Respostas no WhatsApp",
  "onsite_conversion.whatsapp_inbox_reply": "Respostas no WhatsApp",
  whatsapp_link_click: "Cliques para WhatsApp",
  whatsapp_conversion: "Conversas no WhatsApp",
  "onsite_conversion.messaging_first_reply": "Conversas por mensagem",
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
  "onsite_conversion.total_messaging_connection": "Conexões por mensagem",
  messaging_conversation_started_7d: "Conversas iniciadas",
  messaging_connection: "Conexões por mensagem",
  "onsite_conversion.messaging_total_conversation_starters": "Conversas por mensagem",
  messages_sent: "Mensagens enviadas",
  messaging_new_conversation: "Conversas iniciadas",
  omni_opt_in: "Opt-ins",
  omni_primary_message: "Mensagens principais",
  purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras (pixel)",
  initiate_checkout: "Inícios de checkout",
  checkout_initiated: "Inícios de checkout",
  add_to_cart: "Adições ao carrinho",
  add_payment_info: "Informações de pagamento",
  add_to_wishlist: "Adições à lista de desejos",
  conversion: "Conversões",
  website_conversion: "Conversões no site",
  complete_registration: "Cadastros concluídos",
  registration: "Cadastros",
  start_trial: "Inícios de teste",
  subscribe: "Assinaturas",
  schedule: "Agendamentos",
  link_click: "Cliques no link",
  outbound_click: "Cliques de saída",
  landing_page_view: "Visualizações da página de destino",
  view_content: "Visualizações de conteúdo",
};

const OPTIMIZATION_GOAL_ALIASES: Record<string, string> = {
  OFFSITE_CONVERSIONS: "PURCHASE",
  CONVERSIONS: "PURCHASE",
  PURCHASE_CONVERSIONS: "PURCHASE",
  VALUE: "PURCHASE",
  OUTCOME_LEADS: "LEAD_GENERATION",
  OUTCOME_LEAD_GENERATION: "LEAD_GENERATION",
  LEADS: "LEAD_GENERATION",
  LEAD: "LEAD_GENERATION",
  OUTCOME_MESSAGES: "MESSAGES",
  MESSAGING_APPOINTMENT_CONVERSION: "MESSAGES",
  MESSAGING_PURCHASE_CONVERSION: "MESSAGES",
  CONVERSATIONS: "MESSAGES",
  WHATSAPP_MESSAGE: "MESSAGES",
  REPLIES: "MESSAGES",
  OUTCOME_SALES: "OUTCOME_SALES",
  SALES: "OUTCOME_SALES",
  OUTCOME_PURCHASE: "PURCHASE",
  PURCHASES: "PURCHASE",
  OUTCOME_TRAFFIC: "LANDING_PAGE_VIEWS",
  TRAFFIC: "LANDING_PAGE_VIEWS",
  LINK_CLICKS: "LINK_CLICKS",
  OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  POST_ENGAGEMENT: "POST_ENGAGEMENT",
  IMPRESSIONS: "OUTCOME_REACH",
  REACH: "OUTCOME_REACH",
  OUTCOME_VALUE: "PURCHASE",
  WEBSITE_CONVERSIONS: "PURCHASE",
};

const OPTIMIZATION_GOAL_TO_ACTION_TYPES: Record<string, string[]> = {
  LEAD_GENERATION: [
    "lead",
    "leadgen",
    "leadgen.other",
    "leadgen_qualified_lead",
    "leadgen.qualified_lead",
    "omni_lead",
    "onsite_conversion.lead_grouped",
    "onsite_conversion.lead",
    "onsite_conversion.post_save",
    "onsite_web_lead",
    "offsite_conversion.fb_pixel_lead",
    "offsite_content_view_add_meta_leads",
  ],
  MESSAGES: [
    "onsite_conversion.messaging_first_reply",
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_total_conversation_starters",
    "onsite_conversion.total_messaging_connection",
    "onsite_conversion.messaging_first_reply_conversation",
    "onsite_conversion.whatsapp_first_reply",
    "whatsapp_conversion",
    "onsite_conversion.whatsapp_message",
  ],
  PURCHASE: [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "conversion",
  ],
  LANDING_PAGE_VIEWS: [
    "landing_page_view",
    "omni_landing_page_view",
    "view_content",
  ],
  LINK_CLICKS: ["link_click", "outbound_click"],
  POST_ENGAGEMENT: [
    "post_engagement",
    "page_engagement",
    "post_interaction_gross",
  ],
  OUTCOME_ENGAGEMENT: [
    "post_engagement",
    "page_engagement",
    "post_interaction_gross",
  ],
  OUTCOME_REACH: ["impressions", "reach"],
  OUTCOME_SALES: [
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "offsite_content_view_add_meta_leads",
    "view_content",
    "initiate_checkout",
    "checkout_initiated",
    "add_to_cart",
  ],
  OUTCOME_TRAFFIC: [
    "landing_page_view",
    "omni_landing_page_view",
    "link_click",
    "outbound_click",
  ],
};

const FALLBACK_RESULT_ACTION_TYPES: string[] = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "value",
  "lead",
  "leadgen",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
  "messaging_conversation_started_7d",
  "messaging_connection",
  "landing_page_view",
  "omni_landing_page_view",
  "link_click",
  "outbound_click",
  "post_engagement",
  "page_engagement",
  "view_content",
  "onsite_web_lead",
  "offsite_content_view_add_meta_leads",
];

const LEAD_RESULT_ACTION_TYPES = [
  "lead",
  "leadgen",
  "leadgen.other",
  "onsite_conversion.lead",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
];

const MESSAGE_RESULT_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
];

const SALES_RESULT_ACTION_TYPES = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

type ObjectiveResultRule = {
  label: string;
  actionTypes: string[];
  mode?: "sum" | "first";
};

const OBJECTIVE_RESULT_RULES: Record<string, ObjectiveResultRule> = {
  OUTCOME_LEADS: {
    label: "Leads",
    actionTypes: LEAD_RESULT_ACTION_TYPES,
    mode: "first",
  },
  LEAD_GENERATION: {
    label: "Leads",
    actionTypes: LEAD_RESULT_ACTION_TYPES,
    mode: "first",
  },
  OUTCOME_ENGAGEMENT: {
    label: "Conversas iniciadas",
    actionTypes: MESSAGE_RESULT_ACTION_TYPES,
    mode: "first",
  },
  ENGAGEMENT: {
    label: "Conversas iniciadas",
    actionTypes: MESSAGE_RESULT_ACTION_TYPES,
    mode: "first",
  },
  MESSAGES: {
    label: "Conversas iniciadas",
    actionTypes: MESSAGE_RESULT_ACTION_TYPES,
    mode: "first",
  },
  OUTCOME_SALES: {
    label: "Vendas",
    actionTypes: SALES_RESULT_ACTION_TYPES,
    mode: "first",
  },
  PURCHASE: {
    label: "Vendas",
    actionTypes: SALES_RESULT_ACTION_TYPES,
    mode: "first",
  },
};

const CAMPAIGN_OBJECTIVE_ALIASES: Record<string, string> = {
  OUTCOME_LEAD_GENERATION: "OUTCOME_LEADS",
  OUTCOME_LEADS: "OUTCOME_LEADS",
  LEADS: "OUTCOME_LEADS",
  LEAD: "OUTCOME_LEADS",
  LEAD_GENERATION: "LEAD_GENERATION",
  OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  ENGAGEMENT: "ENGAGEMENT",
  OUTCOME_MESSAGES: "MESSAGES",
  MESSENGER: "MESSAGES",
  MESSAGING: "MESSAGES",
  MESSAGES: "MESSAGES",
  OUTCOME_SALES: "OUTCOME_SALES",
  SALES: "OUTCOME_SALES",
  OUTCOME_PURCHASE: "OUTCOME_SALES",
  PURCHASE: "PURCHASE",
};

/* --------------------------------------------------
 * Helpers numéricos / strings
 * -------------------------------------------------- */

function parseNumber(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeActionType(actionType?: string | null): string | null {
  if (!actionType) return null;
  return actionType.toLowerCase();
}

function normalizeOptimizationGoal(goal?: string | null): string | null {
  if (!goal) return null;
  const upper = goal.toUpperCase();
  return OPTIMIZATION_GOAL_ALIASES[upper] ?? upper;
}

function getGoalActionCandidates(goal: string | null): string[] {
  const normalized = normalizeOptimizationGoal(goal);
  const mapped = normalized
    ? OPTIMIZATION_GOAL_TO_ACTION_TYPES[normalized] ?? []
    : [];
  return [...mapped, ...FALLBACK_RESULT_ACTION_TYPES];
}

function extractEntryTotal(entry: GraphActionEntry): number {
  // tenta `value` direto
  const direct = parseNumber(entry.value);
  if (direct > 0) {
    return direct;
  }

  // senão soma as janelas de atribuição
  let total = 0;
  for (const windowKey of DEFAULT_ATTRIBUTION_WINDOWS) {
    total += parseNumber(entry[windowKey]);
  }
  if (total > 0) {
    return total;
  }

  // último fallback: soma qualquer outro campo numérico
  for (const [key, raw] of Object.entries(entry)) {
    if (key === "action_type" || key === "value") continue;
    total += parseNumber(raw);
  }

  return total;
}

function sumActionValues(
  actionValues: Map<string, number>,
  actionTypes: Set<string>,
): number {
  let total = 0;
  actionTypes.forEach((actionType) => {
    total += actionValues.get(actionType) ?? 0;
  });
  return total;
}

function formatResultLabel(actionType: string | null): string {
  if (!actionType) {
    return "Resultado";
  }

  const normalized = actionType.toLowerCase();
  const mapped = ACTION_TYPE_LABELS[normalized];
  if (mapped) {
    return mapped;
  }

  if (LEAD_ACTION_TYPES.has(normalized)) {
    return "Leads";
  }

  // fallback human readable
  return normalized
    .replace(/[_\.]/g, " ")
    .split(" ")
    .filter((segment) => segment.length > 0)
    .map(
      (segment) =>
        segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join(" ");
}

type ResultDetail = {
  type: string;
  label: string;
  quantity: number;
  cost: number | null;
};

/* --------------------------------------------------
 * Agrupadores por conjunto de anúncios (ad sets)
 * -------------------------------------------------- */

type AggregatedAdsetMetrics = {
  adsetId: string;
  adsetName: string | null;
  campaignId: string;
  campaignName: string | null;
  optimizationGoal: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  actions: Record<
    string,
    {
      quantity: number;
      cost: number | null;
    }
  >;
};

type AdsetBundle = {
  adsetId: string;
  adsetName: string | null;
  campaignId: string;
  campaignName: string | null;
  optimizationGoal: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  actions: ResultDetail[];
  officialResult: ResultDetail | null;
  resultQuantity: number;
  resultCost: number | null;
};

type GoalGroup = {
  canonicalGoal: string | null;
  originalGoals: Set<string>;
  spend: number;
  adsets: AdsetBundle[];
};

type AggregatedActionRecord = AggregatedAdsetMetrics["actions"];
type CampaignActionAggregation = Record<
  string,
  {
    quantity: number;
    weightedSpend: number;
  }
>;

function aggregateInsightRowsByAdset(
  rows: GraphAdsetInsightRow[],
): Map<string, AggregatedAdsetMetrics> {
  const agg = new Map<string, AggregatedAdsetMetrics>();

  for (const row of rows) {
    const adsetId = row.adset_id;
    const campaignId = row.campaign_id;
    if (!adsetId || !campaignId) {
      continue;
    }

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
    if (row.adset_name && !bucket.adsetName) {
      bucket.adsetName = row.adset_name;
    }
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

function pickOfficialResultForAdset(
  goal: string | null,
  actions: AggregatedActionRecord,
): ResultDetail | null {
  const candidates = getGoalActionCandidates(goal);
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

  let fallback: { type: string; info: { quantity: number; cost: number | null } } | null =
    null;
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

  const defaultType = candidates.find((candidate) => candidate.length > 0);
  if (!defaultType) {
    return null;
  }

  const normalizedDefault = defaultType.toLowerCase();
  const defaultEntry = actions[normalizedDefault];
  return {
    type: normalizedDefault,
    label: formatResultLabel(normalizedDefault),
    quantity: defaultEntry?.quantity ?? 0,
    cost: defaultEntry?.cost ?? null,
  };
}

function aggregateActionsForAdsets(adsets: AdsetBundle[]): CampaignActionAggregation {
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

function getObjectiveResultRule(
  objective: string | null | undefined,
): ObjectiveResultRule | null {
  if (!objective) return null;
  const upper = objective.toUpperCase();
  const normalized = CAMPAIGN_OBJECTIVE_ALIASES[upper] ?? upper;
  return OBJECTIVE_RESULT_RULES[normalized] ?? null;
}

function buildAdsetBundle(agg: AggregatedAdsetMetrics): AdsetBundle {
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

function buildCampaignBundle(
  campaign: GraphCampaign,
  adsets: AdsetBundle[],
): CampaignMetricBundle {
  const metrics: MetricTotals = {
    spend: 0,
    resultSpend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    results: 0,
    costPerResult: null,
  };

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
  const resultSpend = resultAdsets.reduce((sum, adset) => sum + adset.spend, 0);

  const aggregatedActions = aggregateActionsForAdsets(resultAdsets);
  const objectiveRule = getObjectiveResultRule(campaign.objective ?? null);

  let resultQuantity = 0;
  let costPerResult: number | null = null;
  let summaryLabel = "Resultado";
  const tipos = new Set<string>();
  let detalhes: CampaignResultSummary["detalhes"] = undefined;
  let adsetSummaries: NonNullable<CampaignResultSummary["adsets"]>;

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
        if (quantity <= 0) {
          continue;
        }
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
        if (quantity <= 0) {
          continue;
        }
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
      const actionMap = new Map(
        adset.actions.map((action) => [action.type, action]),
      );
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
    summaryLabel = "N/A";
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

  const resultado: CampaignResultSummary = {
    label: summaryLabel,
    quantidade: objectiveRule ? resultQuantity : null,
    custo_por_resultado: costPerResult,
    optimization_goal: dominantGroup.canonicalGoal ?? null,
    tipos: Array.from(tipos),
    detalhes,
    adsets: adsetSummaries,
  };

  return { metrics, resultado };
}

/* --------------------------------------------------
 * Helpers de totalização
 * -------------------------------------------------- */

function createEmptyTotals(): MetricTotals {
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

function addTotals(target: MetricTotals, source: MetricTotals): void {
  target.spend += source.spend;
  target.resultSpend += source.resultSpend;
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.leads += source.leads;
  target.results += source.results;

  // recalcula custo médio global
  target.costPerResult =
    target.results > 0 ? target.resultSpend / target.results : null;
}

/* --------------------------------------------------
 * Cliente que fala com o Graph
 * -------------------------------------------------- */

export class MetaApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export class MetaGraphClient {
  private readonly appsecretProof: string;

  constructor(private readonly accessToken: string, appSecret: string) {
    this.appsecretProof = crypto
      .createHmac("sha256", appSecret)
      .update(accessToken)
      .digest("hex");
  }

  private buildUrl(path: string, params?: Record<string, string>): URL {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${GRAPH_BASE_URL}${cleanPath}`);
    url.searchParams.set("access_token", this.accessToken);
    url.searchParams.set("appsecret_proof", this.appsecretProof);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    return url;
  }

  private async request<T>(url: URL): Promise<T> {
    const response = await fetch(url.toString());
    const json = (await response.json()) as GraphPagingResponse<T>;

    if (!response.ok || json.error) {
      const message =
        json.error?.message ??
        `Meta API request failed with status ${response.status}`;

      let status = json.error?.code ?? response.status ?? 500;

      // às vezes a Meta devolve code 200 com erro => força 403
      if (status === 200) status = 403;

      if (status < 400 || status >= 600) {
        status = 500;
      }

      throw new MetaApiError(message, status);
    }

    return json as unknown as T;
  }

  private ensureNextUrl(next?: string): URL | null {
    if (!next) return null;
    const url = new URL(next);

    // algumas respostas da Meta não repetem os params sensíveis no "next"
    if (!url.searchParams.has("appsecret_proof")) {
      url.searchParams.set("appsecret_proof", this.appsecretProof);
    }
    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", this.accessToken);
    }

    return url;
  }

  async fetchEdge<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    let nextUrl: URL | null = this.buildUrl(path, params);
    const items: T[] = [];

    while (nextUrl) {
      const result = await this.request<GraphPagingResponse<T>>(nextUrl);

      if (Array.isArray(result.data)) {
        items.push(...result.data);
      }

      nextUrl = this.ensureNextUrl(result.paging?.next);
    }

    return items;
  }

  async fetchCampaigns(accountId: string): Promise<GraphCampaign[]> {
    // pega as campanhas da conta
    return this.fetchEdge<GraphCampaign>(`/${accountId}/campaigns`, {
      fields: "id,name,status,objective",
      limit: "200",
    });
  }

  async fetchCampaignInsights(
    accountId: string,
    timeRange: TimeRange,
  ): Promise<GraphInsightRow[]> {
    // pega insights por campanha
    const params: Record<string, string> = {
      level: "campaign",
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type",
      limit: "200",
      action_attribution_windows: JSON.stringify(DEFAULT_ATTRIBUTION_WINDOWS),
    };

    // range customizado ou preset "maximum"
    if (timeRange && timeRange.since && timeRange.until) {
      params.time_range = JSON.stringify({
        since: timeRange.since,
        until: timeRange.until,
      });
    } else {
      params.date_preset = "maximum";
    }

    return this.fetchEdge<GraphInsightRow>(`/${accountId}/insights`, params);
  }

  async fetchAdsetInsights(
    accountId: string,
    timeRange: TimeRange,
  ): Promise<GraphAdsetInsightRow[]> {
    const params: Record<string, string> = {
      level: "adset",
      fields:
        "campaign_id,campaign_name,adset_id,adset_name,optimization_goal,spend,impressions,reach,clicks,actions,cost_per_action_type",
      limit: "200",
      action_attribution_windows: JSON.stringify(DEFAULT_ATTRIBUTION_WINDOWS),
    };

    if (timeRange && timeRange.since && timeRange.until) {
      params.time_range = JSON.stringify({
        since: timeRange.since,
        until: timeRange.until,
      });
    } else {
      params.date_preset = "maximum";
    }

    return this.fetchEdge<GraphAdsetInsightRow>(`/${accountId}/insights`, params);
  }
}

/* --------------------------------------------------
 * Função principal usada pelo dashboard
 * -------------------------------------------------- */

type DashboardBuilderOptions = {
  accounts: Resource[];
  client: MetaGraphClient;
  campaignFilterSet?: Set<string>;
  objectiveFilterSet?: Set<string>;
  optimizationGoalFilterSet?: Set<string>;
  statusFilterSet?: Set<string>;
  startDate?: string;
  endDate?: string;
  previousStartDate?: string;
  previousEndDate?: string;
};

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

  // intervalo atual
  const timeRange: TimeRange =
    startDate && endDate ? { since: startDate, until: endDate } : null;

  // intervalo anterior (para comparação)
  const previousRange: TimeRange =
    previousStartDate && previousEndDate
      ? { since: previousStartDate, until: previousEndDate }
      : null;

  // saída
  const accountsResults: DashboardAccountMetrics[] = [];
  const totals = createEmptyTotals();

  // cache de campanhas por conta (vamos reaproveitar pro previousTotals)
  const campaignCache = new Map<number, GraphCampaign[]>();

  /* -------------------------
   * LOOP DAS CONTAS
   * ------------------------- */
  for (const account of accounts) {
    // campanhas declaradas na conta
    const campaigns = await client.fetchCampaigns(account.value);
    campaignCache.set(account.id, campaigns);

    // insights por conjunto de anúncios
    const adsetRows = await client.fetchAdsetInsights(
      account.value,
      timeRange,
    );

    const groupedAdsets = aggregateInsightRowsByAdset(adsetRows);
    const adsetsByCampaign = new Map<string, AdsetBundle[]>();
    for (const data of Array.from(groupedAdsets.values())) {
      const bundle = buildAdsetBundle(data);
      if (!adsetsByCampaign.has(bundle.campaignId)) {
        adsetsByCampaign.set(bundle.campaignId, []);
      }
      adsetsByCampaign.get(bundle.campaignId)!.push(bundle);
    }

    // totais da conta (que vão aparecer no card da conta)
    const accountTotals = createEmptyTotals();

    // lista de campanhas que vão pra tabela dessa conta
    const campaignEntries: DashboardCampaignMetrics[] = [];

    // percorre todas as campanhas declaradas pela conta
    for (const campaign of campaigns) {
      const campaignId = campaign.id;
      if (!campaignId) continue;

      // filtro por campanha específica, se definido
      if (campaignFilterSet && !campaignFilterSet.has(campaignId)) {
        continue;
      }

      // filtro por objetivo (usa OBJECTIVE UPPER do campaign)
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

      const dominantGoal = campaignBundle.resultado?.optimization_goal ?? null;
      const normalizedGoal = dominantGoal
        ? normalizeOptimizationGoal(dominantGoal)
        : null;
      if (
        optimizationGoalFilterSet &&
        (!normalizedGoal || !optimizationGoalFilterSet.has(normalizedGoal))
      ) {
        continue;
      }

      // soma nos totais da conta
      addTotals(accountTotals, metrics);

      // adiciona linha da campanha
      campaignEntries.push({
        id: campaignId,
        name: campaign.name ?? null,
        objective: campaign.objective ?? null,
        status: campaign.status ?? null,
        metrics,
        resultado: campaignBundle.resultado ?? undefined,
      });
    }

    // Se NÃO tem filtros ativos e não veio nenhuma campanha com métrica,
    // ainda assim queremos listar as campanhas zeradas pra UI não sumir.
    const hasFilters =
      (campaignFilterSet && campaignFilterSet.size > 0) ||
      (objectiveFilterSet && objectiveFilterSet.size > 0);
    const hasStatusFilter = statusFilterSet && statusFilterSet.size > 0;
    const hasGoalFilter =
      optimizationGoalFilterSet && optimizationGoalFilterSet.size > 0;

    if (!hasFilters && !hasStatusFilter && !hasGoalFilter && campaignEntries.length === 0) {
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

    // ordena campanhas por gasto desc
    campaignEntries.sort((a, b) => b.metrics.spend - a.metrics.spend);

    // adiciona esse total nas métricas globais
    addTotals(totals, accountTotals);

    // empurra conta pro array final
    accountsResults.push({
      id: account.id,
      name: account.name,
      value: account.value,
      metrics: accountTotals,
      campaigns: campaignEntries,
    });
  }

  // ordena contas por gasto desc
  accountsResults.sort((a, b) => b.metrics.spend - a.metrics.spend);

  /* -------------------------
   * PREVIOUS TOTALS
 * ------------------------- */
  let previousTotals = createEmptyTotals();

  if (previousRange) {
    // vamos somar o período anterior de forma parecida,
    // mas só guardamos o agregado total (não precisamos recriar toda a árvore).
    for (const account of accounts) {
      const campaigns = campaignCache.get(account.id);
      if (!campaigns) {
        continue;
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

      for (const campaign of campaigns) {
        const campaignId = campaign.id;
        if (!campaignId) continue;

        // respeita filtros também no previousTotals
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

        const prevGoal = previousCampaignBundle.resultado?.optimization_goal ?? null;
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

  // retorno final pro dashboard
  return {
    totals,
    previousTotals,
    accounts: accountsResults,
  };
}
