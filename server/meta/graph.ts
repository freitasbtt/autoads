// server/meta/graph.ts
import crypto from "crypto";
import type { Resource } from "@shared/schema";

/* --------------------------------------------------
 * Config Graph
 * -------------------------------------------------- */

const GRAPH_BASE_URL = "https://graph.facebook.com/v18.0";

/* --------------------------------------------------
 * Tipos crus vindos da Graph API
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

/**
 * Insights nível anúncio (ad)
 * usado pro MODAL
 */
type GraphAdLevelInsightRow = {
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
  ctr?: string;
};

// /{creative_id}?fields=...
type GraphAdCreative = {
  id: string;
  name?: string;
  thumbnail_url?: string;
  object_story_spec?: {
    link_data?: {
      picture?: string;
      image_hash?: string;
      link?: string;
    };
    video_data?: {
      image_url?: string;
      video_id?: string;
    };
  };
  asset_feed_spec?: {
    images?: Array<{
      hash?: string;
      url?: string;
    }>;
    videos?: Array<{
      video_id?: string;
      thumbnail_url?: string;
    }>;
  };
};

// /{campaign_id}/ads?fields=id,creative{id}
type GraphAd = {
  id?: string;
  creative?: {
    id?: string;
  };
};

/* --------------------------------------------------
 * Tipos internos usados no dashboard e modal
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

export type CampaignHeaderSnapshot = {
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  spend: number;
  ctr: number | null;
};

/**
 * Cada item = 1 ANÚNCIO individual
 * usado no modal
 */
export type CampaignAdReport = {
  ad_id: string;
  ad_name: string | null;
  creative_id: string | null;
  thumbnailUrl: string | null;
  metrics: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number | null;
    resultQty: number;
    costPerResult: number | null;
  };
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
 * Constantes e mapeamentos de ações
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

/**
 * ACTION_TYPE_LABELS: traduz action_type cru -> rótulo amigável
 */
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
  "onsite_conversion.messaging_conversation_started_7d":
    "Conversas iniciadas",
  "onsite_conversion.total_messaging_connection": "Conexões por mensagem",
  messaging_conversation_started_7d: "Conversas iniciadas",
  messaging_connection: "Conexões por mensagem",
  "onsite_conversion.messaging_total_conversation_starters":
    "Conversas por mensagem",
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

/**
 * Normalização de optimization_goal / objective
 */
const OPTIMIZATION_GOAL_ALIASES: Record<string, string> = {
  OFFSITE_CONVERSIONS: "PURCHASE",
  CONVERSIONS: "PURCHASE",
  PURCHASE_CONVERSIONS: "PURCHASE",
  VALUE: "PURCHASE",

  OUTCOME_LEADS: "LEAD_GENERATION",
  OUTCOME_LEAD_GENERATION: "LEAD_GENERATION",
  LEADS: "LEAD_GENERATION",
  LEAD: "LEAD_GENERATION",
  LEAD_GENERATION: "LEAD_GENERATION",

  OUTCOME_MESSAGES: "MESSAGES",
  MESSAGING_APPOINTMENT_CONVERSION: "MESSAGES",
  MESSAGING_PURCHASE_CONVERSION: "MESSAGES",
  CONVERSATIONS: "MESSAGES",
  WHATSAPP_MESSAGE: "MESSAGES",
  REPLIES: "MESSAGES",
  MESSAGES: "MESSAGES",

  OUTCOME_SALES: "OUTCOME_SALES",
  SALES: "OUTCOME_SALES",

  OUTCOME_PURCHASE: "PURCHASE",
  PURCHASES: "PURCHASE",
  PURCHASE: "PURCHASE",

  OUTCOME_TRAFFIC: "LANDING_PAGE_VIEWS",
  TRAFFIC: "LANDING_PAGE_VIEWS",
  LANDING_PAGE_VIEWS: "LANDING_PAGE_VIEWS",

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

// fallback quando não sabemos o goal
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

// tipos oficiais pra resumo por objective
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

// campanha.objective -> regra pra computar "resultado oficial"
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

// normaliza campaign.objective pra um bucket estável
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

function parsePercentToNumber(value?: string | null): number | null {
  if (!value) return null;
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return null;
  return num;
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
  const direct = parseNumber(entry.value);
  if (direct > 0) return direct;

  let total = 0;
  for (const windowKey of DEFAULT_ATTRIBUTION_WINDOWS) {
    total += parseNumber(entry[windowKey]);
  }
  if (total > 0) return total;

  for (const [key, raw] of Object.entries(entry)) {
    if (key === "action_type" || key === "value") continue;
    total += parseNumber(raw);
  }
  return total;
}

function sumActionsTotal(actions?: GraphActionEntry[] | null): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    total += extractEntryTotal(action);
  }
  return total;
}

function formatResultLabel(actionType: string | null): string {
  if (!actionType) return "Resultado";
  const normalized = actionType.toLowerCase();
  const mapped = ACTION_TYPE_LABELS[normalized];
  if (mapped) return mapped;
  if (LEAD_ACTION_TYPES.has(normalized)) return "Leads";
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
 * Agrupadores por adset (para o dashboard principal)
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

    if (row.optimization_goal && !bucket.optimizationGoal)
      bucket.optimizationGoal = row.optimization_goal;
    if (row.adset_name && !bucket.adsetName) bucket.adsetName = row.adset_name;
    if (row.campaign_name && !bucket.campaignName)
      bucket.campaignName = row.campaign_name;

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

function pickOfficialResultForAdset(
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

  // fallback: maior volume
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

  // se nada teve qty > 0, escolhe o primeiro candidato e zera
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

function aggregateActionsForAdsets(
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

function getObjectiveResultRule(
  objective: unknown,
): ObjectiveResultRule | null {
  if (typeof objective !== "string" || objective.trim() === "") {
    return null;
  }

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

  const goalGroups = new Map<
    string,
    {
      canonicalGoal: string | null;
      originalGoals: Set<string>;
      spend: number;
      adsets: AdsetBundle[];
    }
  >();

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

  let dominantGroup:
    | {
        canonicalGoal: string | null;
        originalGoals: Set<string>;
        spend: number;
        adsets: AdsetBundle[];
      }
    | null = null;

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

  const resultado: CampaignResultSummary = {
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

/* --------------------------------------------------
 * Totalizadores globais (dashboard principal)
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
  target.costPerResult =
    target.results > 0 ? target.resultSpend / target.results : null;
}

/* --------------------------------------------------
 * Cliente Graph
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

    if (!url.searchParams.has("appsecret_proof")) {
      url.searchParams.set("appsecret_proof", this.appsecretProof);
    }
    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", this.accessToken);
    }

    return url;
  }

  /**
   * Busca qualquer edge paginado (/act_xxx/campaigns, /act_xxx/insights, etc)
   */
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

  /**
   * Campanhas da conta
   */
  async fetchCampaigns(accountId: string): Promise<GraphCampaign[]> {
    return this.fetchEdge<GraphCampaign>(`/${accountId}/campaigns`, {
      fields: "id,name,status,objective",
      limit: "200",
    });
  }

  /**
   * Insights nível campanha
   */
  async fetchCampaignInsights(
    accountId: string,
    timeRange: TimeRange,
  ): Promise<GraphInsightRow[]> {
    const params: Record<string, string> = {
      level: "campaign",
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,actions,cost_per_action_type",
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

    return this.fetchEdge<GraphInsightRow>(`/${accountId}/insights`, params);
  }

  /**
   * Insights nível adset -> dashboard
   */
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

  /**
   * Insights nível anúncio -> modal
   */
  private async fetchAdLevelInsightsForCampaign(
    campaignId: string,
    timeRange: TimeRange,
  ): Promise<GraphAdLevelInsightRow[]> {
    const params: Record<string, string> = {
      level: "ad",
      fields:
        "ad_id,ad_name,impressions,clicks,spend,actions,cost_per_action_type,ctr",
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

    return this.fetchEdge<GraphAdLevelInsightRow>(
      `/${campaignId}/insights`,
      params,
    );
  }

  /**
   * /{campaign_id}/ads?fields=id,creative{id}
   * mapeia anúncio -> creative.id
   */
  private async fetchCampaignAdCreativeMap(
    campaignId: string,
  ): Promise<Map<string, string>> {
    const ads = await this.fetchEdge<GraphAd>(`/${campaignId}/ads`, {
      fields: "id,creative{id}",
      limit: "200",
    });

    const map = new Map<string, string>();
    for (const ad of ads) {
      const adId = ad.id;
      const creativeId = ad.creative?.id;
      if (adId && creativeId) {
        map.set(adId, creativeId);
      }
    }

    return map;
  }

  /**
   * Busca metadata dos criativos em lote (?ids=...&fields=...)
   * só pra thumb/preview
   */
  private async fetchCreativesMetadata(
    creativeIds: string[],
  ): Promise<Map<string, GraphAdCreative>> {
    const out = new Map<string, GraphAdCreative>();
    if (creativeIds.length === 0) return out;

    const uniqueIds = Array.from(new Set(creativeIds.filter(Boolean)));
    const fields =
      "id,name,thumbnail_url,object_story_spec,asset_feed_spec";
    const chunkSize = 50;

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;

      const url = this.buildUrl("/", {
        ids: chunk.join(","),
        fields,
      });

      const result = await this.request<
        Record<string, GraphAdCreative | null>
      >(url);

      for (const creative of Object.values(result)) {
        if (creative?.id) {
          out.set(creative.id, creative);
        }
      }
    }

    return out;
  }

  /**
   * escolhe qual thumb usar
   */
  private pickCreativeThumbnail(meta: GraphAdCreative | undefined): string | null {
    if (!meta) return null;
    if (meta.thumbnail_url) return meta.thumbnail_url ?? null;

    const linkPic = meta.object_story_spec?.link_data?.picture;
    if (linkPic) return linkPic ?? null;

    const img0 = meta.asset_feed_spec?.images?.[0];
    if (img0?.url) return img0.url ?? null;

    const vid0 = meta.asset_feed_spec?.videos?.[0];
    if (vid0?.thumbnail_url) return vid0.thumbnail_url ?? null;

    return null;
  }

  /**
   * Monta relatório por ANÚNCIO individual
   * - cada card do modal vira um anúncio do BM
   * - calcula CTR, custo por resultado e resultado principal
   *   (lead, mensagem, compra, etc) com base no objective
   */
  async fetchCampaignAdReports(
    accountId: string,
    campaignId: string,
    campaignObjective: string | null | undefined,
    timeRange: TimeRange,
  ): Promise<CampaignAdReport[]> {
    // 1. métricas nível anúncio
    const rows = await this.fetchAdLevelInsightsForCampaign(
      campaignId,
      timeRange,
    );
    if (rows.length === 0) {
      return [];
    }

    // 2. map ad_id -> creative_id
    const adCreativeMap = await this.fetchCampaignAdCreativeMap(campaignId);

    // 3. carrega criativos em lote
    const creativeIds = Array.from(
      new Set(
        rows
          .map((r) => (r.ad_id ? adCreativeMap.get(r.ad_id) : undefined))
          .filter(Boolean) as string[],
      ),
    );
    const creativeMetadataMap = await this.fetchCreativesMetadata(
      creativeIds,
    );

    // 4. regra de "resultado principal" guiada pelo objective
    const objectiveRule = getObjectiveResultRule(
      campaignObjective ?? null,
    );

    const reports: CampaignAdReport[] = [];

    for (const row of rows) {
      if (!row.ad_id) continue;

      const adId = row.ad_id;
      const adName = row.ad_name ?? null;

      const impressions = parseNumber(row.impressions);
      const clicks = parseNumber(row.clicks);
      const spend = parseNumber(row.spend);
      const ctr = parsePercentToNumber(row.ctr);

      // map actions -> quantidade por tipo
      const actionTotals: Record<string, number> = {};
      if (Array.isArray(row.actions)) {
        for (const act of row.actions) {
          const tNorm = normalizeActionType(act.action_type);
          if (!tNorm) continue;
          const qty = extractEntryTotal(act);
          if (qty <= 0) continue;
          actionTotals[tNorm] = (actionTotals[tNorm] ?? 0) + qty;
        }
      }

      // resultado principal do anúncio
      let resultQty = 0;

      if (objectiveRule) {
        const normalizedTypes = objectiveRule.actionTypes.map((t) =>
          t.toLowerCase(),
        );

        if (objectiveRule.mode === "first") {
          for (const t of normalizedTypes) {
            const qty = actionTotals[t] ?? 0;
            if (qty > 0) {
              resultQty = qty;
              break;
            }
          }
        } else {
          for (const t of normalizedTypes) {
            resultQty += actionTotals[t] ?? 0;
          }
        }
      }

      // fallback se não achou nada pelos tipos esperados
      if (resultQty === 0) {
        let bestQty = 0;
        for (const qty of Object.values(actionTotals)) {
          if (qty > bestQty) {
            bestQty = qty;
          }
        }
        resultQty = bestQty;
      }

      const costPerResult = resultQty > 0 ? spend / resultQty : null;

      const creativeId = adCreativeMap.get(adId) ?? null;
      const creativeMeta = creativeId
        ? creativeMetadataMap.get(creativeId)
        : undefined;
      const thumbnailUrl = this.pickCreativeThumbnail(creativeMeta);

      reports.push({
        ad_id: adId,
        ad_name: adName,
        creative_id: creativeId,
        thumbnailUrl: thumbnailUrl ?? null,
        metrics: {
          impressions,
          clicks,
          spend,
          ctr,
          resultQty,
          costPerResult,
        },
      });
    }

    return reports;
  }

  /**
   * Versão antiga, agregada por creative.
   * Mantida só pra compatibilidade. Hoje retornamos [].
   */
  async fetchCampaignCreativeReports(
    _accountId: string,
    _campaignId: string,
    _timeRange: TimeRange,
  ): Promise<
    Array<{
      id: string;
      name: string | null;
      thumbnailUrl: string | null;
      assets: Array<{
        id: string;
        label: string;
        thumbnailUrl: string | null;
        url: string | null;
      }>;
      performance: {
        impressions: number;
        clicks: number;
        spend: number;
        results: number;
        costPerResult: number | null;
      };
    }>
  > {
    return [];
  }
}

/* --------------------------------------------------
 * Builder principal do DASHBOARD
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
