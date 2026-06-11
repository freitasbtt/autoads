import type { DateRange } from "react-day-picker";
import type { LucideIcon } from "lucide-react";

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

export type DashboardCampaignMetrics = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  metrics: MetricTotals;
  resultado?: {
    label: string;
    quantidade: number | null;
    custo_por_resultado: number | null;
    optimization_goal?: string | null;
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
};

export type CampaignHeaderSnapshot = {
  spend: number;
  resultLabel: string;
  resultQuantity: number | null;
  costPerResult: number | null;
  ctr: number | null;
};

export type DashboardRawTimelinePoint = {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  leads: number;
  messagingConversationsStarted: number;
  costPerLead: number | null;
};

export type DashboardGoalMetrics = {
  targetSpend: number;
  targetLeads: number;
  targetCostPerLead: number | null;
  spendProgress: number | null;
  leadsProgress: number | null;
  remainingSpend: number | null;
  remainingLeads: number | null;
  costPerLeadDelta: number | null;
  dailyLeadTarget: number | null;
};

export type DashboardGoalRecord = {
  id: number;
  tenantId: number;
  accountId: number;
  accountName: string;
  startDate: string;
  endDate: string;
  targetSpend: number;
  targetLeads: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardAccountMetrics = {
  id: number;
  name: string;
  value: string;
  metrics: MetricTotals;
  previousMetrics?: MetricTotals;
  goal?: DashboardGoalMetrics | null;
  campaigns: DashboardCampaignMetrics[];
  timeline?: DashboardRawTimelinePoint[];
};

export type DashboardMetricsResponse = {
  dateRange: {
    start: string | null;
    end: string | null;
    previousStart: string | null;
    previousEnd: string | null;
  };
  totals: MetricTotals;
  previousTotals: MetricTotals;
  goalTotals: DashboardGoalMetrics | null;
  accounts: DashboardAccountMetrics[];
  timeline: DashboardRawTimelinePoint[];
};

export type DashboardGoalsResponse = {
  startDate: string;
  endDate: string;
  accounts: Array<{
    accountId: number;
    accountName: string;
    accountValue: string;
    goal: DashboardGoalRecord | null;
  }>;
  summary: {
    totalAccounts: number;
    goalsCount: number;
    missingCount: number;
    status: "empty" | "partial" | "complete";
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

export type DashboardTopCreativesResponse = {
  accounts: DashboardTopCreativesAccountGroup[];
};

export type DashboardShareMetadataResponse = {
  expiresAt: string;
  dateRange: {
    start: string;
    end: string;
  };
  filters: {
    campaignId: string | null;
    objective: string | null;
    status: string | null;
  };
  accounts: Array<{
    id: number;
    name: string;
    value: string;
  }>;
};

export type CurrentUser = {
  id: number;
  name: string;
  email?: string;
  role?: string;
  roles?: string[];
};

export type DashboardProps = {
  shareToken?: string | null;
  readOnly?: boolean;
  autoPrint?: boolean;
  reportMode?: boolean;
};

export type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

export type DashboardKpi = {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive: boolean;
  };
};

export type DashboardTimelinePoint = DashboardMetricsResponse["timeline"][number] & {
  label: string;
};

export type DashboardLeadsByAccountDatum = {
  name: string;
  shortName: string;
  leads: number;
  previousLeads: number;
  spend: number;
  previousSpend: number;
  costPerLead: number | null;
  previousCostPerLead: number | null;
  percentage: number;
};

export type DashboardSpendByAccountDatum = {
  name: string;
  value: number;
  percentage: number;
  fill: string;
};

export type DashboardFunnelStep = {
  order: number;
  label: string;
  value: number;
  fill: string;
  width: string;
};

export type ActiveFilterChip = {
  label: string;
  value: string;
  onRemove: () => void;
};

export type DashboardCampaignIndexEntry = {
  campaign: DashboardCampaignMetrics;
  accountValue: string;
};

export type DashboardQuickRange = {
  label: string;
  range: DateRange;
};
