import crypto from "crypto";
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import {
  DEFAULT_ATTRIBUTION_WINDOWS,
  GRAPH_BASE_URL,
} from "./constants";
import type {
  CampaignAdReport,
  GraphAd,
  GraphAdCreative,
  GraphAdImageAsset,
  GraphAdLevelInsightRow,
  GraphAdset,
  GraphAdsetInsightRow,
  GraphCampaign,
  GraphInsightRow,
  GraphPagingResponse,
  MetaGraphApiClient,
  TimeRange,
} from "./types";
import {
  LEAD_RESULT_ACTION_TYPES,
  MESSAGE_RESULT_ACTION_TYPES,
  MESSAGING_CONVERSATION_STARTED_ACTION_TYPES,
} from "./constants";
import {
  extractEntryTotal,
  normalizeActionType,
  parseNumber,
  parsePercentToNumber,
} from "./utils/parsing";
import { getObjectiveResultRule } from "./utils/aggregation";

export class MetaApiError extends Error {
  status: number;
  graphCode?: number;
  graphSubcode?: number;

  constructor(
    message: string,
    status = 500,
    options?: {
      graphCode?: number;
      graphSubcode?: number;
    },
  ) {
    super(message);
    this.status = status;
    this.graphCode = options?.graphCode;
    this.graphSubcode = options?.graphSubcode;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_ATTEMPTS = 4;
const DAILY_INSIGHTS_CHUNK_DAYS = 30;
const DEFAULT_INSIGHTS_CHUNK_DAYS = 90;
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_GRAPH_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

function pickPreferredActionQuantity(
  actionTotals: Record<string, number>,
  actionTypes: string[],
): number {
  for (const actionType of actionTypes) {
    const quantity = actionTotals[actionType.toLowerCase()] ?? 0;
    if (quantity > 0) {
      return quantity;
    }
  }

  return 0;
}

export class MetaGraphClient implements MetaGraphApiClient {
  private readonly appsecretProof: string;

  constructor(private readonly accessToken: string, appSecret: string) {
    this.appsecretProof = crypto
      .createHmac("sha256", appSecret)
      .update(accessToken)
      .digest("hex");
  }

  private normalizeHttpStatus(status: number): number {
    if (status >= 400 && status < 600) {
      return status;
    }

    return 500;
  }

  private shouldRetry(status: number, graphCode?: number): boolean {
    return RETRYABLE_HTTP_STATUS.has(status) || (graphCode !== undefined && RETRYABLE_GRAPH_CODES.has(graphCode));
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildRetryDelayMs(attempt: number): number {
    const baseDelay = 500 * 2 ** attempt;
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(baseDelay + jitter, 5_000);
  }

  private buildTimeRanges(timeRange: TimeRange, maxDaysPerRequest: number): TimeRange[] {
    if (!timeRange?.since || !timeRange.until) {
      return [null];
    }

    const start = parseISO(timeRange.since);
    const end = parseISO(timeRange.until);
    if (!isValid(start) || !isValid(end) || start > end) {
      return [timeRange];
    }

    const totalDays = differenceInCalendarDays(end, start) + 1;
    if (totalDays <= maxDaysPerRequest) {
      return [timeRange];
    }

    const ranges: NonNullable<TimeRange>[] = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, maxDaysPerRequest)) {
      const chunkEnd = addDays(cursor, maxDaysPerRequest - 1);
      ranges.push({
        since: format(cursor, "yyyy-MM-dd"),
        until: format(chunkEnd < end ? chunkEnd : end, "yyyy-MM-dd"),
      });
    }

    return ranges;
  }

  private async fetchInsightsEdge<T>(
    path: string,
    baseParams: Record<string, string>,
    timeRange: TimeRange,
    maxDaysPerRequest: number,
  ): Promise<T[]> {
    const rows: T[] = [];
    const ranges = this.buildTimeRanges(timeRange, maxDaysPerRequest);

    for (const range of ranges) {
      const params: Record<string, string> = { ...baseParams };

      if (range?.since && range.until) {
        params.time_range = JSON.stringify({
          since: range.since,
          until: range.until,
        });
      } else {
        params.date_preset = "maximum";
      }

      const batch = await this.fetchEdge<T>(path, params);
      rows.push(...batch);
    }

    return rows;
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
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const text = await response.text();
        const json = (text.length > 0 ? JSON.parse(text) : {}) as GraphPagingResponse<T>;
        const graphError = json.error;

        if (!response.ok || graphError) {
          const status = this.normalizeHttpStatus(response.status);
          const message = graphError?.message ?? `Meta API request failed with status ${response.status}`;

          if (attempt < MAX_RETRY_ATTEMPTS - 1 && this.shouldRetry(status, graphError?.code)) {
            await this.sleep(this.buildRetryDelayMs(attempt));
            continue;
          }

          throw new MetaApiError(message, status, {
            graphCode: graphError?.code,
            graphSubcode: graphError?.error_subcode,
          });
        }

        return json as unknown as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof MetaApiError) {
          throw error;
        }

        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          await this.sleep(this.buildRetryDelayMs(attempt));
          continue;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error while calling Meta API";
        throw new MetaApiError(message, 502);
      }
    }

    throw new MetaApiError("Meta API request failed after retries.", 502);
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
      fields:
        "id,name,status,objective,buying_type,configured_status,effective_status,daily_budget,lifetime_budget,updated_time,special_ad_categories",
      limit: "200",
    });
  }

  async fetchAdsets(accountId: string): Promise<GraphAdset[]> {
    return this.fetchEdge<GraphAdset>(`/${accountId}/adsets`, {
      fields:
        "id,name,campaign_id,end_time,status,configured_status,effective_status,optimization_goal,billing_event,bid_strategy,updated_time,promoted_object",
      limit: "200",
    });
  }

  async fetchCampaignAdsWithDestination(campaignId: string): Promise<GraphAd[]> {
    return this.fetchEdge<GraphAd>(`/${campaignId}/ads`, {
      fields:
        "id,adset_id,status,effective_status,adset{id,name,promoted_object},creative{id,object_story_spec{page_id,instagram_actor_id,link_data{picture,image_hash,link,call_to_action{type,value}},video_data{image_url,video_id,call_to_action{type,value}}}}",
      limit: "200",
    });
  }

  async fetchAds(accountId: string): Promise<GraphAd[]> {
    return this.fetchEdge<GraphAd>(`/${accountId}/ads`, {
      fields:
        "id,name,campaign_id,adset_id,status,effective_status,creative{id,name,thumbnail_url,image_url,object_story_spec{link_data{picture},video_data{image_url}},asset_feed_spec{images{url},videos{thumbnail_url}}}",
      limit: "200",
    });
  }

  async fetchCampaignInsights(
    accountId: string,
    timeRange: TimeRange,
    options?: {
      timeIncrement?: number;
    },
  ): Promise<GraphInsightRow[]> {
    const params: Record<string, string> = {
      level: "campaign",
      fields:
        "campaign_id,campaign_name,date_start,date_stop,spend,impressions,reach,clicks,actions,cost_per_action_type",
      limit: "200",
      action_attribution_windows: JSON.stringify(DEFAULT_ATTRIBUTION_WINDOWS),
    };

    if (typeof options?.timeIncrement === "number" && options.timeIncrement > 0) {
      params.time_increment = String(options.timeIncrement);
    }

    return this.fetchInsightsEdge<GraphInsightRow>(
      `/${accountId}/insights`,
      params,
      timeRange,
      options?.timeIncrement === 1 ? DAILY_INSIGHTS_CHUNK_DAYS : DEFAULT_INSIGHTS_CHUNK_DAYS,
    );
  }

  async fetchAdsetInsights(
    accountId: string,
    timeRange: TimeRange,
    options?: {
      timeIncrement?: number;
    },
  ): Promise<GraphAdsetInsightRow[]> {
    const params: Record<string, string> = {
      level: "adset",
      fields:
        "campaign_id,campaign_name,adset_id,adset_name,optimization_goal,date_start,date_stop,spend,impressions,reach,clicks,actions,cost_per_action_type",
      limit: "200",
      action_attribution_windows: JSON.stringify(DEFAULT_ATTRIBUTION_WINDOWS),
    };

    if (typeof options?.timeIncrement === "number" && options.timeIncrement > 0) {
      params.time_increment = String(options.timeIncrement);
    }

    return this.fetchInsightsEdge<GraphAdsetInsightRow>(
      `/${accountId}/insights`,
      params,
      timeRange,
      options?.timeIncrement === 1 ? DAILY_INSIGHTS_CHUNK_DAYS : DEFAULT_INSIGHTS_CHUNK_DAYS,
    );
  }

  async fetchAdInsights(
    accountId: string,
    timeRange: TimeRange,
    options?: {
      timeIncrement?: number;
    },
  ): Promise<GraphAdLevelInsightRow[]> {
    const params: Record<string, string> = {
      level: "ad",
      fields:
        "account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,cost_per_action_type,ctr,cpc,cpm,cpp,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions",
      limit: "200",
      action_attribution_windows: JSON.stringify(DEFAULT_ATTRIBUTION_WINDOWS),
    };

    if (typeof options?.timeIncrement === "number" && options.timeIncrement > 0) {
      params.time_increment = String(options.timeIncrement);
    }

    return this.fetchInsightsEdge<GraphAdLevelInsightRow>(
      `/${accountId}/insights`,
      params,
      timeRange,
      options?.timeIncrement === 1 ? DAILY_INSIGHTS_CHUNK_DAYS : DEFAULT_INSIGHTS_CHUNK_DAYS,
    );
  }

  private async fetchAdLevelInsightsForCampaign(
    campaignId: string,
    timeRange: TimeRange,
  ): Promise<GraphAdLevelInsightRow[]> {
    const params: Record<string, string> = {
      level: "ad",
      fields:
        "ad_id,ad_name,impressions,clicks,spend,frequency,actions,cost_per_action_type,ctr",
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
  ): Promise<Map<string, { creativeId: string; status: string | null }>> {
    const ads = await this.fetchEdge<GraphAd>(`/${campaignId}/ads`, {
      fields: "id,status,effective_status,creative{id}",
      limit: "200",
    });

    const map = new Map<string, { creativeId: string; status: string | null }>();
    for (const ad of ads) {
      if (ad.id && ad.creative?.id) {
        map.set(ad.id, {
          creativeId: ad.creative.id,
          status: ad.effective_status ?? ad.status ?? null,
        });
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
          "id,name,image_url,thumbnail_url,object_story_spec{link_data{picture,image_hash,link},video_data{image_url,video_id}},asset_feed_spec{images{hash,url},videos{video_id,thumbnail_url}}",
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

  private getCreativeImageHashes(meta: GraphAdCreative | undefined): string[] {
    if (!meta) return [];

    const hashes = new Set<string>();
    const linkHash = meta.object_story_spec?.link_data?.image_hash;
    if (typeof linkHash === "string" && linkHash.length > 0) {
      hashes.add(linkHash);
    }

    if (meta.asset_feed_spec?.images) {
      meta.asset_feed_spec.images.forEach((image) => {
        if (typeof image.hash === "string" && image.hash.length > 0) {
          hashes.add(image.hash);
        }
      });
    }

    return Array.from(hashes);
  }

  private async fetchAdImagesByHashes(
    accountId: string,
    hashes: string[],
  ): Promise<Map<string, GraphAdImageAsset>> {
    if (hashes.length === 0) {
      return new Map();
    }

    const chunks: string[][] = [];
    for (let i = 0; i < hashes.length; i += 50) {
      chunks.push(hashes.slice(i, i + 50));
    }

    const imageMap = new Map<string, GraphAdImageAsset>();

    for (const chunk of chunks) {
      let result:
        | {
            images?: Record<string, GraphAdImageAsset | null>;
            data?: GraphAdImageAsset[];
          }
        | Record<string, unknown>;

      try {
        const url = this.buildUrl(`/${accountId}/adimages`, {
          hashes: JSON.stringify(chunk),
          fields: "hash,url,original_url,permalink_url",
        });
        result = await this.request<
          | {
              images?: Record<string, GraphAdImageAsset | null>;
              data?: GraphAdImageAsset[];
            }
          | Record<string, unknown>
        >(url);
      } catch {
        continue;
      }

      if ("images" in result && result.images && typeof result.images === "object") {
        for (const [hash, asset] of Object.entries(result.images)) {
          if (!asset) continue;
          imageMap.set(hash, asset);
        }
      }

      if ("data" in result && Array.isArray(result.data)) {
        for (const asset of result.data) {
          if (!asset?.hash) continue;
          imageMap.set(asset.hash, asset);
        }
      }
    }

    return imageMap;
  }

  private pickCreativeThumbnail(
    meta: GraphAdCreative | undefined,
    adImageAssets?: Map<string, GraphAdImageAsset>,
  ): string | null {
    if (!meta) return null;

    const imageHashes = this.getCreativeImageHashes(meta);
    for (const hash of imageHashes) {
      const asset = adImageAssets?.get(hash);
      if (!asset) continue;
      if (asset.original_url) return asset.original_url;
      if (asset.url) return asset.url;
      if (asset.permalink_url) return asset.permalink_url;
    }

    if (meta.asset_feed_spec?.images && meta.asset_feed_spec.images.length > 0) {
      const image = meta.asset_feed_spec.images[0];
      if (image.url) {
        return image.url;
      }
    }

    if (meta.object_story_spec?.link_data?.picture) {
      return meta.object_story_spec.link_data.picture;
    }

    if (meta.image_url) {
      return meta.image_url;
    }

    if (meta.object_story_spec?.video_data?.image_url) {
      return meta.object_story_spec.video_data.image_url;
    }

    if (meta.asset_feed_spec?.videos && meta.asset_feed_spec.videos.length > 0) {
      const video = meta.asset_feed_spec.videos[0];
      if (video.thumbnail_url) {
        return video.thumbnail_url;
      }
    }

    if (meta.thumbnail_url) return meta.thumbnail_url;

    return null;
  }

  async fetchCreativePreviewSources(
    accountId: string,
    creativeIds: string[],
  ): Promise<Map<string, {
    name: string | null;
    previewUrl: string | null;
    thumbnailUrl: string | null;
    rawJson: GraphAdCreative;
  }>> {
    const uniqueCreativeIds = Array.from(new Set(creativeIds.filter(Boolean)));
    if (uniqueCreativeIds.length === 0) {
      return new Map();
    }

    const creativeMetadataMap = await this.fetchCreativesMetadata(uniqueCreativeIds);
    const creativeImageHashes = Array.from(
      new Set(
        uniqueCreativeIds.flatMap((creativeId) =>
          this.getCreativeImageHashes(creativeMetadataMap.get(creativeId)),
        ),
      ),
    );
    const adImageAssets = await this.fetchAdImagesByHashes(accountId, creativeImageHashes);
    const result = new Map<string, {
      name: string | null;
      previewUrl: string | null;
      thumbnailUrl: string | null;
      rawJson: GraphAdCreative;
    }>();

    for (const creativeId of uniqueCreativeIds) {
      const metadata = creativeMetadataMap.get(creativeId);
      if (!metadata) continue;
      result.set(creativeId, {
        name: metadata.name ?? metadata.id ?? null,
        previewUrl: this.pickCreativeThumbnail(metadata, adImageAssets),
        thumbnailUrl: metadata.thumbnail_url ?? null,
        rawJson: metadata,
      });
    }

    return result;
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
          .map((r) => (r.ad_id ? adCreativeMap.get(r.ad_id)?.creativeId : undefined))
          .filter(Boolean) as string[],
      ),
    );
    const creativeMetadataMap = await this.fetchCreativesMetadata(creativeIds);
    const creativeImageHashes = Array.from(
      new Set(
        creativeIds.flatMap((creativeId) =>
          this.getCreativeImageHashes(creativeMetadataMap.get(creativeId)),
        ),
      ),
    );
    const adImageAssets = await this.fetchAdImagesByHashes(
      accountId,
      creativeImageHashes,
    );

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
      const frequency = row.frequency ? Number(row.frequency) : null;

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

      const leadQty = pickPreferredActionQuantity(
        actionTotals,
        LEAD_RESULT_ACTION_TYPES,
      );

      let messagingQty = pickPreferredActionQuantity(
        actionTotals,
        MESSAGE_RESULT_ACTION_TYPES,
      );
      if (messagingQty === 0) {
        for (const actionType of MESSAGING_CONVERSATION_STARTED_ACTION_TYPES) {
          const quantity = actionTotals[actionType] ?? 0;
          if (quantity > 0) {
            messagingQty = quantity;
            break;
          }
        }
      }

      let resultQty = 0;

      if (objectiveRule?.label === "Leads") {
        resultQty = leadQty;
      } else if (objectiveRule?.label === "Conversas iniciadas") {
        resultQty = messagingQty;
      } else if (leadQty > 0) {
        resultQty = leadQty;
      } else if (messagingQty > 0) {
        resultQty = messagingQty;
      }

      const costPerResult = resultQty > 0 ? spend / resultQty : null;

      const adInfo = adCreativeMap.get(adId);
      const creativeId = adInfo?.creativeId ?? null;
      const creativeMeta = creativeId
        ? creativeMetadataMap.get(creativeId)
        : undefined;
      const thumbnailUrl = this.pickCreativeThumbnail(
        creativeMeta,
        adImageAssets,
      );

      reports.push({
        ad_id: adId,
        ad_name: adName,
        ad_status: adInfo?.status ?? null,
        creative_id: creativeId,
        thumbnailUrl: thumbnailUrl ?? null,
        metrics: {
          impressions,
          clicks,
          spend,
          ctr,
          frequency: Number.isFinite(frequency) ? frequency : null,
          leadQty,
          messagingQty,
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
