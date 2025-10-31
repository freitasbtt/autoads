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
 * IMPORTANTE:
 * /insights com level=ad NÃO aceita pedir creative_id direto nos fields.
 * Então pegamos só métricas de performance do anúncio aqui
 * e depois fazemos outro passo /{campaign_id}/ads pra mapear ad -> creative.
 * Esse fluxo segue o padrão documentado pela própria Marketing API:
 * primeiro coleta métricas por anúncio (ad), depois cruza com /ads pra achar o creative. :contentReference[oaicite:4]{index=4}
 */
type GraphAdLevelInsightRow = {
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
  ctr?: string; // CTR pode ser solicitado junto das métricas de anúncio hoje. :contentReference[oaicite:5]{index=5}
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
 * Tipos internos usados no dashboard
 * -------------------------------------------------- */

export type MetricTotals = {
  spend: number;          // gasto total
  resultSpend: number;    // gasto somado apenas dos adsets que geraram "resultado oficial"
  impressions: number;
  clicks: number;
  leads: number;
  results: number;        // quantidade de "resultado oficial"
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
  resultLabel: string;         // exemplo: "Conversas iniciadas", "Leads", "Vendas"
  resultQuantity: number | null;
  costPerResult: number | null;
  spend: number;
  ctr: number | null;
};

export type CampaignCreativeReport = {
  id: string; // creative_id
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
 * ACTION_TYPE_LABELS é usado pra traduzir action_type cru da Meta
 * pra algo amigável de UI ("Conversas iniciadas", "Leads", etc).
 * A lista abaixo está alinhada com nomes que a Meta expõe em relatórios
 * como "actions" e variações de conversas, leads, compras e cliques. :contentReference[oaicite:6]{index=6}
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
  "onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
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
 * Alguns objetivos da Meta têm nomes diferentes dependendo do lugar
 * (GOAL vs OBJECTIVE de campanha vs optimization_goal do ad set).
 * Esses mapas aproximam tudo em buckets mais estáveis pro nosso dashboard.
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
  PURCHASE: ["purchase", "offsite_conversion.fb_pixel_purchase", "conversion"],
  LANDING_PAGE_VIEWS: [
    "landing_page_view",
    "omni_landing_page_view",
    "view_content",
  ],
  LINK_CLICKS: ["link_click", "outbound_click"],
  POST_ENGAGEMENT: ["post_engagement", "page_engagement", "post_interaction_gross"],
  OUTCOME_ENGAGEMENT: ["post_engagement", "page_engagement", "post_interaction_gross"],
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

// backup genérico caso não role casar objetivo -> ação
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

// usados pra rotular o "resultado oficial" por tipo de objetivo
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

// mapping campanha.objective -> como calcular "resultado oficial"
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

// campanha.objective -> bucket normalizado
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
  // tenta pegar direto 'value'
  const direct = parseNumber(entry.value);
  if (direct > 0) return direct;

  // senão, soma as janelas padrão de atribuição
  let total = 0;
  for (const windowKey of DEFAULT_ATTRIBUTION_WINDOWS) {
    total += parseNumber(entry[windowKey]);
  }
  if (total > 0) return total;

  // fallback final: soma qualquer campo numérico
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

  // fallback: humaniza snake_case / dotted
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
 * Agrupadores por adset
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

    // junta quantities de actions
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

    // junta custos por ação
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
  // tenta seguir o objetivo declarado do adset
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

  // fallback: pega a ação de maior volume
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
  // transforma actions em lista ordenada
  const actionsArray: ResultDetail[] = Object.entries(agg.actions)
    .filter(([, info]) => info.quantity > 0)
    .map(([type, info]) => ({
      type,
      label: formatResultLabel(type),
      quantity: info.quantity,
      cost: info.cost ?? null,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  // soma leads explícitos
  let leads = 0;
  LEAD_ACTION_TYPES.forEach((leadType) => {
    const info = agg.actions[leadType];
    if (info) {
      leads += info.quantity;
    }
  });

  // "resultado oficial" com base no optimization_goal declarado
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

  // agrega métricas globais e separa adsets por optimization_goal
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

  // escolhe grupo dominante
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

    // prioriza maior spend
    if (group.spend > dominantGroup.spend + 1e-6) {
      dominantGroup = group;
      continue;
    }

    // se empate em spend, escolhe maior volume de resultado
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

  // agrega todas as actions desses adsets dominantes
  const aggregatedActions = aggregateActionsForAdsets(resultAdsets);

  // regra pra "resultado oficial" com base no objective da campanha
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
      // pega o primeiro tipo que tiver resultado > 0
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

      // se nada teve qty > 0, ainda guardamos qual tipo seria o alvo
      if (breakdownEntries.length === 0 && normalizedTypes.length > 0) {
        selectedTypes.push(normalizedTypes[0]);
      }
    } else {
      // soma todos os tipos declarados
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

    // resumo por adset (pra tabela detalhada da UI)
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
    // não conseguimos identificar um "resultado oficial" baseado no objective
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

    // nesses casos não consolidamos resultados em nível de campanha
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
 * Totalizadores globais
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

      // às vezes a Meta devolve code=200 mesmo em erro -> tratamos como 403
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

    // às vezes o "next" não traz appsecret_proof / access_token
    if (!url.searchParams.has("appsecret_proof")) {
      url.searchParams.set("appsecret_proof", this.appsecretProof);
    }
    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", this.accessToken);
    }

    return url;
  }

  /**
   * Busca qualquer edge paginado (ex: /act_xxx/campaigns, /act_xxx/insights).
   * Este método sempre retorna um array completo já "flattened"
   * navegando por todas as páginas de paginação da Meta. :contentReference[oaicite:7]{index=7}
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
   * Campanhas de uma conta de anúncios
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
   * Insights nível adset
   * (essa granularidade alimenta os cálculos de resultado oficial,
   * custo por resultado e etc. na UI)
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
   * Insights nível anúncio (ad)
   * IMPORTANTE: aqui NÃO pedimos creative_id/ad_creative_id porque a API
   * rejeita esses campos. Em vez disso, vamos depois a /{campaign_id}/ads
   * pra montar ad_id -> creative.id. :contentReference[oaicite:8]{index=8}
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
   * Mapeia cada anúncio da campanha para seu creative.id
   * via /{campaign_id}/ads?fields=id,creative{id}
   * (isso é suportado na Marketing API atual; cada ad retorna um objeto creative com id). :contentReference[oaicite:9]{index=9}
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
   * Busca metadados dos criativos (nome, miniatura, imagens etc.)
   * em lote via ?ids=... (batch em uma única requisição /?ids=1,2,3&fields=...).
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
   * Monta o relatório de criativos de uma campanha:
   * - agrega performance por creative_id
   * - coleta metadados visuais do criativo
   * - calcula "resultado principal" e custo por resultado
   *   usando a mesma regra de objetivo da campanha (OBJECTIVE_RESULT_RULES).
   *
   * Isso permite montar o modal/aba "Criativos" da sua UI:
   * cada card = 1 creative, com thumb, variações de imagem e KPIs
   * (impressões, cliques, gasto, resultados, CPA). :contentReference[oaicite:10]{index=10}
   */
  async fetchCampaignCreativeReports(
    accountId: string,
    campaignId: string,
    campaignObjective: string | null | undefined,
    timeRange: TimeRange,
  ): Promise<CampaignCreativeReport[]> {
    // 1. métricas nível anúncio
    const rows = await this.fetchAdLevelInsightsForCampaign(
      campaignId,
      timeRange,
    );
    if (rows.length === 0) {
      return [];
    }

    // 2. Mapear ad -> creative.id
    const adCreativeMap = await this.fetchCampaignAdCreativeMap(campaignId);

    // 3. Agregar por creative_id
    const aggregates = new Map<
      string,
      {
        impressions: number;
        clicks: number;
        spend: number;
        actions: Record<string, number>;
      }
    >();

    for (const row of rows) {
      const adId = row.ad_id;
      if (!adId) continue;

      const creativeId = adCreativeMap.get(adId);
      if (!creativeId) continue;

      let bucket = aggregates.get(creativeId);
      if (!bucket) {
        bucket = {
          impressions: 0,
          clicks: 0,
          spend: 0,
          actions: {},
        };
        aggregates.set(creativeId, bucket);
      }

      bucket.impressions += parseNumber(row.impressions);
      bucket.clicks += parseNumber(row.clicks);
      bucket.spend += parseNumber(row.spend);

      if (Array.isArray(row.actions)) {
        for (const act of row.actions) {
          const tNorm = normalizeActionType(act.action_type);
          if (!tNorm) continue;

          const qty = extractEntryTotal(act);
          if (qty <= 0) continue;

          bucket.actions[tNorm] = (bucket.actions[tNorm] ?? 0) + qty;
        }
      }
    }

    if (aggregates.size === 0) {
      return [];
    }

    // 4. metadados visuais dos criativos
    const creativeIds = Array.from(aggregates.keys());
    const metadataMap = await this.fetchCreativesMetadata(creativeIds);

    // 5. decidir QUAL métrica é o "resultado" desse criativo,
    // usando a mesma lógica de objetivo da campanha
    const objectiveRule = getObjectiveResultRule(campaignObjective ?? null);

    const reports: CampaignCreativeReport[] = [];

    for (const creativeId of creativeIds) {
      const agg = aggregates.get(creativeId)!;
      const meta = metadataMap.get(creativeId);

      // descobrir qual ação conta como "resultado principal"
      let resultsQty = 0;
      let costPerResult: number | null = null;

      if (objectiveRule) {
        const normalizedTypes = objectiveRule.actionTypes.map((t) =>
          t.toLowerCase(),
        );

        if (objectiveRule.mode === "first") {
          // pega o primeiro tipo que tiver volume > 0
          for (const t of normalizedTypes) {
            const qty = agg.actions[t] ?? 0;
            if (qty > 0) {
              resultsQty = qty;
              break;
            }
          }
        } else {
          // soma todos os tipos relevantes
          for (const t of normalizedTypes) {
            resultsQty += agg.actions[t] ?? 0;
          }
        }
      }

      // fallback se não achou nada pelas regras do objective
      if (resultsQty === 0) {
        let bestType: string | null = null;
        let bestQty = 0;
        for (const [t, qty] of Object.entries(agg.actions)) {
          if (qty > bestQty) {
            bestQty = qty;
            bestType = t;
          }
        }
        resultsQty = bestQty;
        // não precisamos guardar bestType aqui pro card
      }

      if (resultsQty > 0) {
        costPerResult = agg.spend / resultsQty;
      } else {
        costPerResult = null;
      }

      // montar lista de assets visuais
      const assets: CampaignCreativeReport["assets"] = [];
      const usedThumbs = new Set<string>();

      const pushAsset = (
        id: string,
        label: string,
        thumbnailUrl: string | null,
        url: string | null,
      ) => {
        const dedupeKey = thumbnailUrl ?? url ?? `${id}-${label}`;
        if (usedThumbs.has(dedupeKey)) return;
        usedThumbs.add(dedupeKey);

        assets.push({
          id,
          label,
          thumbnailUrl,
          url,
        });
      };

      // Thumb padrão
      if (meta?.thumbnail_url) {
        pushAsset(
          `${creativeId}-thumb`,
          "Preview",
          meta.thumbnail_url ?? null,
          meta.thumbnail_url ?? null,
        );
      }

      // Imagens do asset_feed_spec
      const imgs = meta?.asset_feed_spec?.images ?? [];
      imgs.forEach((image, index) => {
        const url = image.url ?? null;
        const label = image.hash
          ? `Imagem ${image.hash}`
          : `Imagem ${index + 1}`;
        pushAsset(`${creativeId}-img-${index}`, label, url, url);
      });

      // Imagem do object_story_spec.link_data (ads de link)
      const linkPic = meta?.object_story_spec?.link_data?.picture ?? null;
      if (linkPic) {
        pushAsset(
          `${creativeId}-link-picture`,
          "Link preview",
          linkPic,
          linkPic,
        );
      }

      // Se não achou nenhuma imagem, coloca placeholder
      if (assets.length === 0) {
        pushAsset(`${creativeId}-fallback`, "Criativo", null, null);
      }

      reports.push({
        id: creativeId,
        name: meta?.name ?? null,
        thumbnailUrl: meta?.thumbnail_url ?? null,
        assets,
        performance: {
          impressions: agg.impressions,
          clicks: agg.clicks,
          spend: agg.spend,
          results: resultsQty,
          costPerResult,
        },
      });
    }

    return reports;
  }
}

/* --------------------------------------------------
 * Builder principal do dashboard (contas, campanhas, totais)
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

  // intervalo anterior pra comparação
  const previousRange: TimeRange =
    previousStartDate && previousEndDate
      ? { since: previousStartDate, until: previousEndDate }
      : null;

  const accountsResults: DashboardAccountMetrics[] = [];
  const totals = createEmptyTotals();

  // cache de campanhas por conta pra reutilizar no previousTotals
  const campaignCache = new Map<number, GraphCampaign[]>();

  /* -------------------------
   * LOOP DAS CONTAS
   * ------------------------- */
  for (const account of accounts) {
    // campanhas dessa conta
    const campaigns = await client.fetchCampaigns(account.value);
    campaignCache.set(account.id, campaigns);

    // insights nível adset (mais confiável pra resultado/objetivo)
    const adsetRows = await client.fetchAdsetInsights(account.value, timeRange);

    // agrupa adsets por id e transforma em bundles
    const groupedAdsets = aggregateInsightRowsByAdset(adsetRows);
    const adsetsByCampaign = new Map<string, AdsetBundle[]>();
    for (const data of Array.from(groupedAdsets.values())) {
      const bundle = buildAdsetBundle(data);
      if (!adsetsByCampaign.has(bundle.campaignId)) {
        adsetsByCampaign.set(bundle.campaignId, []);
      }
      adsetsByCampaign.get(bundle.campaignId)!.push(bundle);
    }

    // totais dessa conta
    const accountTotals = createEmptyTotals();

    // campanhas que vão aparecer na tabela da conta
    const campaignEntries: DashboardCampaignMetrics[] = [];

    for (const campaign of campaigns) {
      const campaignId = campaign.id;
      if (!campaignId) continue;

      // filtro por campanha específica
      if (campaignFilterSet && !campaignFilterSet.has(campaignId)) {
        continue;
      }

      // filtro por objetivo da campanha
      const objectiveUpper = campaign.objective
        ? campaign.objective.toUpperCase()
        : null;
      if (
        objectiveFilterSet &&
        (!objectiveUpper || !objectiveFilterSet.has(objectiveUpper))
      ) {
        continue;
      }

      // filtro por status (ACTIVE, PAUSED etc.)
      const statusUpper = campaign.status
        ? campaign.status.toUpperCase()
        : null;
      if (
        statusFilterSet &&
        (!statusUpper || !statusFilterSet.has(statusUpper))
      ) {
        continue;
      }

      // bundles de adset só dessa campanha
      const adsetBundles = adsetsByCampaign.get(campaignId) ?? [];

      // gera pacote consolidado
      const campaignBundle = buildCampaignBundle(campaign, adsetBundles);
      const metrics = campaignBundle.metrics;

      // filtro por optimization_goal dominante (LEADS, MESSAGES, etc.)
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

      // acumula nos totais da conta
      addTotals(accountTotals, metrics);

      // adiciona essa campanha ao resultado final
      campaignEntries.push({
        id: campaignId,
        name: campaign.name ?? null,
        objective: campaign.objective ?? null,
        status: campaign.status ?? null,
        metrics,
        resultado: campaignBundle.resultado ?? undefined,
      });
    }

    // Se NÃO tem filtro nenhum e deu vazio (por ex. range sem gasto),
    // a gente ainda lista as campanhas zeradas, pra UI não sumir tudo.
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

    // ordena campanhas dessa conta por gasto desc
    campaignEntries.sort((a, b) => b.metrics.spend - a.metrics.spend);

    // adiciona conta nos totais globais
    addTotals(totals, accountTotals);

    // empurra conta na resposta
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
   * previousTotals (período anterior)
   * ------------------------- */
  let previousTotals = createEmptyTotals();

  if (previousRange) {
    // mesmo esquema, mas só pra somar o agregado total anterior
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

        // filtros também valem pro previousTotals
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
