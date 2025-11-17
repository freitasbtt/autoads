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
};

export type GraphActionEntry = {
  action_type?: string;
  value?: string;
  [key: string]: string | undefined;
};

export type GraphInsightRow = {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
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
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
};

export type GraphAdLevelInsightRow = {
  ad_id?: string;
  ad_name?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: GraphActionEntry[];
  cost_per_action_type?: GraphActionEntry[];
  ctr?: string;
};

export type GraphAdCreative = {
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

export type GraphAd = {
  id?: string;
  creative?: {
    id?: string;
  };
};

export type MetricTotals = {
  spend: number;
  resultSpend: number;
  impressions: number;
  clicks: number;
  leads: number;
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
  fetchAdsetInsights(accountId: string, timeRange: TimeRange): Promise<GraphAdsetInsightRow[]>;
}

export type DashboardBuilderOptions = {
  accounts: Resource[];
  client: MetaGraphApiClient;

  campaignFilterSet?: Set<string>;
  objectiveFilterSet?: Set<string>;
  optimizationGoalFilterSet?: Set<string>;
  statusFilterSet?: Set<string>;

  startDate?: string;
  endDate?: string;

  previousStartDate?: string;
  previousEndDate?: string;
};
