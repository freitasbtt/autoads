import crypto from "crypto";
import {
  DEFAULT_ATTRIBUTION_WINDOWS,
  GRAPH_BASE_URL,
} from "./constants";
import type {
  CampaignAdReport,
  GraphAd,
  GraphAdCreative,
  GraphAdLevelInsightRow,
  GraphAdsetInsightRow,
  GraphCampaign,
  GraphInsightRow,
  GraphPagingResponse,
  MetaGraphApiClient,
  TimeRange,
} from "./types";
import {
  extractEntryTotal,
  formatResultLabel,
  normalizeActionType,
  parseNumber,
  parsePercentToNumber,
} from "./utils/parsing";
import { getObjectiveResultRule } from "./utils/aggregation";

export class MetaApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export class MetaGraphClient implements MetaGraphApiClient {
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

    if (!response.ok || (json as GraphPagingResponse<T>).error) {
      const errorPayload = json as GraphPagingResponse<T>;
      const message =
        errorPayload.error?.message ??
        `Meta API request failed with status ${response.status}`;

      let status = errorPayload.error?.code ?? response.status ?? 500;

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

  async fetchEdge<T>(path: string, params?: Record<string, string>): Promise<T[]> {
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
    return this.fetchEdge<GraphCampaign>(`/${accountId}/campaigns`, {
      fields: "id,name,status,objective",
      limit: "200",
    });
  }

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

    return this.fetchEdge<GraphAdLevelInsightRow>(`/${campaignId}/insights`, params);
  }

  private async fetchCampaignAdCreativeMap(
    campaignId: string,
  ): Promise<Map<string, string>> {
    const ads = await this.fetchEdge<GraphAd>(`/${campaignId}/ads`, {
      fields: "id,creative{id}",
      limit: "200",
    });

    const map = new Map<string, string>();
    for (const ad of ads) {
      if (ad.id && ad.creative?.id) {
        map.set(ad.id, ad.creative.id);
      }
    }
    return map;
  }

  private async fetchCreativesMetadata(
    creativeIds: string[],
  ): Promise<Map<string, GraphAdCreative>> {
    if (creativeIds.length === 0) {
      return new Map();
    }

    const chunks: string[][] = [];
    for (let i = 0; i < creativeIds.length; i += 50) {
      chunks.push(creativeIds.slice(i, i + 50));
    }

    const creativeMap = new Map<string, GraphAdCreative>();

    for (const chunk of chunks) {
      const params = new URLSearchParams({
        ids: chunk.join(","),
        fields:
          "id,name,thumbnail_url,object_story_spec{link_data{picture,image_hash,link},video_data{image_url,video_id}},asset_feed_spec{images{hash,url},videos{video_id,thumbnail_url}}",
      });

      const url = this.buildUrl("/", Object.fromEntries(params.entries()));
      const result = await this.request<Record<string, GraphAdCreative | null>>(url);

      for (const [id, creative] of Object.entries(result)) {
        if (creative) {
          creativeMap.set(id, creative);
        }
      }
    }

    return creativeMap;
  }

  private pickCreativeThumbnail(meta: GraphAdCreative | undefined): string | null {
    if (!meta) return null;
    if (meta.thumbnail_url) return meta.thumbnail_url;

    if (meta.object_story_spec?.link_data?.picture) {
      return meta.object_story_spec.link_data.picture;
    }

    if (meta.object_story_spec?.video_data?.image_url) {
      return meta.object_story_spec.video_data.image_url;
    }

    if (meta.asset_feed_spec?.images && meta.asset_feed_spec.images.length > 0) {
      const image = meta.asset_feed_spec.images[0];
      if (image.url) {
        return image.url;
      }
    }

    if (meta.asset_feed_spec?.videos && meta.asset_feed_spec.videos.length > 0) {
      const video = meta.asset_feed_spec.videos[0];
      if (video.thumbnail_url) {
        return video.thumbnail_url;
      }
    }

    return null;
  }

  async fetchCampaignAdReports(
    accountId: string,
    campaignId: string,
    campaignObjective: string | null | undefined,
    timeRange: TimeRange,
  ): Promise<CampaignAdReport[]> {
    const rows = await this.fetchAdLevelInsightsForCampaign(
      campaignId,
      timeRange,
    );
    if (rows.length === 0) {
      return [];
    }

    const adCreativeMap = await this.fetchCampaignAdCreativeMap(campaignId);

    const creativeIds = Array.from(
      new Set(
        rows
          .map((r) => (r.ad_id ? adCreativeMap.get(r.ad_id) : undefined))
          .filter(Boolean) as string[],
      ),
    );
    const creativeMetadataMap = await this.fetchCreativesMetadata(creativeIds);

    const objectiveRule = getObjectiveResultRule(campaignObjective ?? null);

    const reports: CampaignAdReport[] = [];

    for (const row of rows) {
      if (!row.ad_id) continue;

      const adId = row.ad_id;
      const adName = row.ad_name ?? null;

      const impressions = parseNumber(row.impressions);
      const clicks = parseNumber(row.clicks);
      const spend = parseNumber(row.spend);
      const ctr = parsePercentToNumber(row.ctr);

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
