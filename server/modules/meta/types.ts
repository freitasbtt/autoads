import type { Resource } from "@shared/schema";

export interface GraphPagingResponse<T> {
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

export type GraphCampaign = {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
  buying_type?: string;
  configured_status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  updated_time?: string;
  special_ad_categories?: string[];
};

export type GraphActionEntry = {
  action_type?: string;
  value?: string;
  [key: string]: string | undefined;
};

export type GraphInsightRow = {
  campaign_id: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
};

export type GraphAdsetInsightRow = {
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  optimization_goal?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
};

export type GraphAdset = {
  id: string;
  name?: string;
  campaign_id?: string;
  end_time?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  updated_time?: string;
  promoted_object?: GraphPromotedObject;
};

export type GraphPromotedObject = {
  page_id?: string;
  instagram_actor_id?: string;
  instagram_user_id?: string;
  lead_ads_form_id?: string;
  leadgen_form_id?: string;
  lead_gen_form_id?: string;
  whatsapp_number?: string;
  whatsapp_phone_number?: string;
  phone_number?: string;
  [key: string]: unknown;
};

export type GraphAdLevelInsightRow = {
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  frequency?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
  ctr?: string;
};

export type GraphAdCreative = {
  id: string;
  name?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_story_spec?: {
    page_id?: string;
    instagram_actor_id?: string;
    instagram_user_id?: string;
    link_data?: {
      picture?: string;
      image_hash?: string;
      link?: string;
      call_to_action?: {
        type?: string;
        value?: Record<string, unknown>;
      };
    };
    video_data?: {
      image_url?: string;
      video_id?: string;
      call_to_action?: {
        type?: string;
        value?: Record<string, unknown>;
      };
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

export type GraphAd = {
  id?: string;
  adset_id?: string;
  status?: string;
  effective_status?: string;
  adset?: {
    id?: string;
    name?: string;
    promoted_object?: GraphPromotedObject;
  };
  creative?: {
    id?: string;
    object_story_spec?: GraphAdCreative["object_story_spec"];
  };
};

export type GraphAdImageAsset = {
  hash?: string;
  url?: string;
  original_url?: string;
  permalink_url?: string;
};

export type MetricTotals = {
  spend: number;
  resultSpend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  messagingConversationsStarted: number;
  results: number;
  costPerResult: number | null;
};

export type CampaignResultSummary = {
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

export type CampaignMetricBundle = {
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
  previousMetrics?: MetricTotals;
  campaigns: DashboardCampaignMetrics[];
  timeline?: DailyTimelinePoint[];
};

export type DailyTimelinePoint = {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  leads: number;
  messagingConversationsStarted: number;
  costPerLead: number | null;
};

export type MetaDashboardResult = {
  totals: MetricTotals;
  accounts: DashboardAccountMetrics[];
  timeline: DailyTimelinePoint[];
};

export type CampaignHeaderSnapshot = {
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  spend: number;
  ctr: number | null;
};

export type CampaignAdReport = {
  ad_id: string;
  ad_name: string | null;
  ad_status: string | null;
  creative_id: string | null;
  thumbnailUrl: string | null;
  metrics: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number | null;
    frequency: number | null;
    leadQty: number;
    messagingQty: number;
    resultQty: number;
    costPerResult: number | null;
  };
};

export type DashboardTopCreative = {
  accountId: number;
  accountName: string;
  accountValue: string;
  campaignId: string;
  campaignName: string | null;
  campaignObjective: string | null;
  campaignStatus: string | null;
  resultLabel: string;
  ad_id: string;
  ad_name: string | null;
  ad_status: string | null;
  creative_id: string | null;
  thumbnailUrl: string | null;
  metrics: {
    impressions: number;
    clicks: number;
    spend: number;
    ctr: number | null;
    frequency: number | null;
    leadQty: number;
    messagingQty: number;
    resultQty: number;
    costPerResult: number | null;
  };
};

export type DashboardTopCreativesAccountGroup = {
  accountId: number;
  accountName: string;
  accountValue: string;
  creatives: DashboardTopCreative[];
};

export type TimeRange =
  | {
      since: string;
      until: string;
    }
  | null;

export type ObjectiveResultRule = {
  label: string;
  actionTypes: string[];
  mode?: "sum" | "first";
};

export type ResultDetail = {
  type: string;
  label: string;
  quantity: number;
  cost: number | null;
};

export type AggregatedAdsetMetrics = {
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

export type AdsetBundle = {
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
  messagingConversationsStarted: number;
  actions: ResultDetail[];
  officialResult: ResultDetail | null;
  resultQuantity: number;
  resultCost: number | null;
};

export type GoalGroup = {
  canonicalGoal: string | null;
  originalGoals: Set<string>;
  spend: number;
  adsets: AdsetBundle[];
};

export type AggregatedActionRecord = AggregatedAdsetMetrics["actions"];

export type CampaignActionAggregation = Record<
  string,
  {
    quantity: number;
    weightedSpend: number;
  }
>;

export interface MetaGraphApiClient {
  fetchCampaigns(accountId: string): Promise<GraphCampaign[]>;
  fetchCampaignInsights(
    accountId: string,
    timeRange: TimeRange,
    options?: {
      timeIncrement?: number;
    },
  ): Promise<GraphInsightRow[]>;
  fetchAdsetInsights(
    accountId: string,
    timeRange: TimeRange,
    options?: {
      timeIncrement?: number;
    },
  ): Promise<GraphAdsetInsightRow[]>;
  fetchCampaignAdReports(
    accountId: string,
    campaignId: string,
    campaignObjective: string | null | undefined,
    timeRange: TimeRange,
  ): Promise<CampaignAdReport[]>;
}

export type DashboardBuilderOptions = {
  accounts: Resource[];
  client: MetaGraphApiClient;

  campaignFilterSet?: Set<string>;
  campaignNameSearch?: string;
  objectiveFilterSet?: Set<string>;
  optimizationGoalFilterSet?: Set<string>;
  statusFilterSet?: Set<string>;

  startDate?: string;
  endDate?: string;

  previousStartDate?: string;
  previousEndDate?: string;
};
