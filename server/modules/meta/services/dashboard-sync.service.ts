import { addDays, differenceInCalendarDays, format, isValid, parseISO, subDays } from "date-fns";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Resource } from "@shared/schema";
import {
  dashboardSyncAccounts,
  metaAdInsightsDaily,
  metaAds,
  metaAdsets,
  metaCampaigns,
  metaCreatives,
  metaSyncJobs,
} from "@shared/schema";
import { db } from "../../../db";
import { storage } from "../../storage";
import { MetaGraphClient } from "../client";
import { LEAD_RESULT_ACTION_TYPES, MESSAGE_RESULT_ACTION_TYPES } from "../constants";
import type {
  DashboardAccountMetrics,
  DashboardCampaignMetrics,
  DashboardTopCreative,
  DashboardTopCreativesAccountGroup,
  DailyTimelinePoint,
  GraphActionEntry,
  GraphAdLevelInsightRow,
  MetaDashboardResult,
  MetricTotals,
  TimeRange,
} from "../types";
import { createEmptyTotals } from "../utils/metrics";
import { extractEntryTotal, normalizeActionType, parseNumber } from "../utils/parsing";
import { resolveMetaAppSecret } from "../utils/app-config";
import { getMetaAccess } from "./access.service";
import { ensureCreativePreviewAsset, getCreativePreviewUrl } from "./creative-assets.service";

const DEFAULT_MANUAL_LOOKBACK_DAYS = 90;
const DEFAULT_REPROCESS_RECENT_DAYS = 7;
const AUTO_RETRY_BACKOFF_MS = 15 * 60 * 1000;

type DateRange = {
  start: string;
  end: string;
};

type DashboardTopCreativesCacheOptions = {
  tenantId: number;
  accounts: Resource[];
  campaignFilterSet?: Set<string>;
  campaignNameSearch?: string;
  objectiveFilterSet?: Set<string>;
  statusFilterSet?: Set<string>;
  startDate?: string;
  endDate?: string;
};

type CacheFilterOptions = {
  campaignFilterSet?: Set<string>;
  campaignNameSearch?: string;
  objectiveFilterSet?: Set<string>;
  statusFilterSet?: Set<string>;
};

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function safeDate(value: string): Date {
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    throw new Error(`Data invalida: ${value}`);
  }
  return parsed;
}

function parseInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseNullableNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function sumActions(entries: GraphActionEntry[] | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((sum, entry) => sum + extractEntryTotal(entry), 0);
}

function extractActionQuantity(
  actions: GraphActionEntry[] | undefined,
  actionTypes: Iterable<string>,
): number {
  if (!Array.isArray(actions)) return 0;
  const wanted = new Set(Array.from(actionTypes).map((entry) => entry.toLowerCase()));
  let total = 0;

  for (const action of actions) {
    const normalized = normalizeActionType(action.action_type);
    if (normalized && wanted.has(normalized)) {
      total += extractEntryTotal(action);
    }
  }

  return total;
}

function extractLeads(actions: GraphActionEntry[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  const leadQuantities = new Map<string, number>();

  for (const action of actions) {
    const type = normalizeActionType(action.action_type);
    if (!type) continue;
    const value = extractEntryTotal(action);
    if (value <= 0 || !LEAD_RESULT_ACTION_TYPES.includes(type)) continue;
    leadQuantities.set(type, value);
  }

  for (const type of LEAD_RESULT_ACTION_TYPES) {
    const value = leadQuantities.get(type) ?? 0;
    if (value > 0) return value;
  }

  return 0;
}

function extractMessages(actions: GraphActionEntry[] | undefined): number {
  return extractActionQuantity(actions, MESSAGE_RESULT_ACTION_TYPES);
}

function isMessagingOrEngagementObjective(objective: string | null | undefined): boolean {
  const normalized = objective?.toUpperCase() ?? "";
  return normalized.includes("MESSAGE") || normalized.includes("MESSENGER") || normalized.includes("ENGAGEMENT");
}

function addRange(ranges: DateRange[], start: Date, end: Date): void {
  if (start > end) return;
  ranges.push({ start: toDateKey(start), end: toDateKey(end) });
}

function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const merged: DateRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(range);
      continue;
    }

    const previousEnd = safeDate(previous.end);
    const currentStart = safeDate(range.start);
    if (differenceInCalendarDays(currentStart, previousEnd) <= 1) {
      if (range.end.localeCompare(previous.end) > 0) {
        previous.end = range.end;
      }
      continue;
    }

    merged.push(range);
  }

  return merged;
}

export async function getMissingDateRanges(options: {
  tenantId: number;
  adAccountId: string;
  dateStart: string;
  dateEnd: string;
  reprocessRecentDays?: number;
}): Promise<DateRange[]> {
  const start = safeDate(options.dateStart);
  const end = safeDate(options.dateEnd);
  if (start > end) {
    throw new Error("dateStart deve ser menor ou igual a dateEnd.");
  }

  const rows = await db
    .select({ dateStart: metaAdInsightsDaily.dateStart })
    .from(metaAdInsightsDaily)
    .where(
      and(
        eq(metaAdInsightsDaily.tenantId, options.tenantId),
        eq(metaAdInsightsDaily.adAccountId, options.adAccountId),
        gte(metaAdInsightsDaily.dateStart, options.dateStart),
        lte(metaAdInsightsDaily.dateStart, options.dateEnd),
      ),
    )
    .groupBy(metaAdInsightsDaily.dateStart);

  const existingDates = new Set(rows.map((row) => row.dateStart));
  const ranges: DateRange[] = [];
  let missingStart: Date | null = null;
  let previousMissing: Date | null = null;

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dateKey = toDateKey(cursor);
    if (!existingDates.has(dateKey)) {
      missingStart ??= cursor;
      previousMissing = cursor;
      continue;
    }

    if (missingStart && previousMissing) {
      addRange(ranges, missingStart, previousMissing);
      missingStart = null;
      previousMissing = null;
    }
  }

  if (missingStart && previousMissing) {
    addRange(ranges, missingStart, previousMissing);
  }

  const recentDays = Math.max(options.reprocessRecentDays ?? DEFAULT_REPROCESS_RECENT_DAYS, 3);
  const recentStart = subDays(end, recentDays - 1);
  addRange(ranges, recentStart > start ? recentStart : start, end);

  return mergeRanges(ranges);
}

function normalizeInsight(row: GraphAdLevelInsightRow, tenantId: number, adAccountId: string) {
  const leads = extractLeads(row.actions);
  const spend = parseNumber(row.spend);

  return {
    tenantId,
    adAccountId,
    campaignId: row.campaign_id ?? "",
    adsetId: row.adset_id ?? "",
    adId: row.ad_id ?? "",
    dateStart: row.date_start ?? "",
    dateStop: row.date_stop ?? row.date_start ?? "",
    campaignName: row.campaign_name ?? null,
    adsetName: row.adset_name ?? null,
    adName: row.ad_name ?? null,
    spend: String(spend),
    impressions: parseInteger(row.impressions),
    reach: parseInteger(row.reach),
    frequency: parseNullableNumber(row.frequency),
    clicks: parseInteger(row.clicks),
    inlineLinkClicks: parseInteger(row.inline_link_clicks),
    linkClicks: extractActionQuantity(row.actions, ["link_click", "onsite_conversion.post_save"]) || parseInteger(row.link_clicks),
    ctr: parseNullableNumber(row.ctr),
    cpc: parseNullableNumber(row.cpc),
    cpm: parseNullableNumber(row.cpm),
    cpp: parseNullableNumber(row.cpp),
    leads,
    costPerLead: leads > 0 ? String(spend / leads) : null,
    videoPlays: sumActions(row.video_play_actions),
    videoP25: sumActions(row.video_p25_watched_actions),
    videoP50: sumActions(row.video_p50_watched_actions),
    videoP75: sumActions(row.video_p75_watched_actions),
    videoP95: sumActions(row.video_p95_watched_actions),
    videoP100: sumActions(row.video_p100_watched_actions),
    thruplays: sumActions(row.video_thruplay_watched_actions),
    actionsJson: row.actions ?? [],
    costPerActionTypeJson: row.cost_per_action_type ?? [],
    rawJson: row as Record<string, unknown>,
    syncedAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function upsertMetaAdInsightsDaily(rows: GraphAdLevelInsightRow[], tenantId: number, adAccountId: string) {
  const normalized = rows
    .map((row) => normalizeInsight(row, tenantId, adAccountId))
    .filter((row) => row.adId && row.campaignId && row.adsetId && row.dateStart && row.dateStop);

  for (const row of normalized) {
    await db
      .insert(metaAdInsightsDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [
          metaAdInsightsDaily.tenantId,
          metaAdInsightsDaily.adAccountId,
          metaAdInsightsDaily.adId,
          metaAdInsightsDaily.dateStart,
          metaAdInsightsDaily.dateStop,
        ],
        set: {
          campaignId: row.campaignId,
          adsetId: row.adsetId,
          campaignName: row.campaignName,
          adsetName: row.adsetName,
          adName: row.adName,
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          frequency: row.frequency,
          clicks: row.clicks,
          inlineLinkClicks: row.inlineLinkClicks,
          linkClicks: row.linkClicks,
          ctr: row.ctr,
          cpc: row.cpc,
          cpm: row.cpm,
          cpp: row.cpp,
          leads: row.leads,
          costPerLead: row.costPerLead,
          videoPlays: row.videoPlays,
          videoP25: row.videoP25,
          videoP50: row.videoP50,
          videoP75: row.videoP75,
          videoP95: row.videoP95,
          videoP100: row.videoP100,
          thruplays: row.thruplays,
          actionsJson: row.actionsJson,
          costPerActionTypeJson: row.costPerActionTypeJson,
          rawJson: row.rawJson,
          syncedAt: row.syncedAt,
          updatedAt: row.updatedAt,
        },
      });
  }

  return normalized.length;
}

export async function syncEntities(options: {
  tenantId: number;
  adAccountId: string;
  client: MetaGraphClient;
}) {
  const syncedAt = new Date();
  const [campaigns, adsets, ads] = await Promise.all([
    options.client.fetchCampaigns(options.adAccountId),
    options.client.fetchAdsets(options.adAccountId),
    options.client.fetchAds(options.adAccountId),
  ]);
  const creativePreviewSources = await options.client.fetchCreativePreviewSources(
    options.adAccountId,
    Array.from(
      new Set(
        ads
          .map((ad) => ad.creative?.id)
          .filter((creativeId): creativeId is string => Boolean(creativeId)),
      ),
    ),
  );

  for (const campaign of campaigns) {
    if (!campaign.id) continue;
    await db.insert(metaCampaigns).values({
      tenantId: options.tenantId,
      adAccountId: options.adAccountId,
      campaignId: campaign.id,
      name: campaign.name ?? null,
      objective: campaign.objective ?? null,
      status: campaign.status ?? null,
      buyingType: campaign.buying_type ?? null,
      configuredStatus: campaign.configured_status ?? null,
      effectiveStatus: campaign.effective_status ?? null,
      dailyBudget: campaign.daily_budget ?? null,
      lifetimeBudget: campaign.lifetime_budget ?? null,
      updatedTime: campaign.updated_time ?? null,
      specialAdCategories: campaign.special_ad_categories ?? [],
      rawJson: campaign as Record<string, unknown>,
      syncedAt,
      updatedAt: syncedAt,
    }).onConflictDoUpdate({
      target: [metaCampaigns.tenantId, metaCampaigns.adAccountId, metaCampaigns.campaignId],
      set: {
        name: campaign.name ?? null,
        objective: campaign.objective ?? null,
        status: campaign.status ?? null,
        buyingType: campaign.buying_type ?? null,
        configuredStatus: campaign.configured_status ?? null,
        effectiveStatus: campaign.effective_status ?? null,
        dailyBudget: campaign.daily_budget ?? null,
        lifetimeBudget: campaign.lifetime_budget ?? null,
        updatedTime: campaign.updated_time ?? null,
        specialAdCategories: campaign.special_ad_categories ?? [],
        rawJson: campaign as Record<string, unknown>,
        syncedAt,
        updatedAt: syncedAt,
      },
    });
  }

  for (const adset of adsets) {
    if (!adset.id || !adset.campaign_id) continue;
    await db.insert(metaAdsets).values({
      tenantId: options.tenantId,
      adAccountId: options.adAccountId,
      campaignId: adset.campaign_id,
      adsetId: adset.id,
      name: adset.name ?? null,
      status: adset.status ?? null,
      configuredStatus: adset.configured_status ?? null,
      effectiveStatus: adset.effective_status ?? null,
      optimizationGoal: adset.optimization_goal ?? null,
      billingEvent: adset.billing_event ?? null,
      bidStrategy: adset.bid_strategy ?? null,
      updatedTime: adset.updated_time ?? null,
      promotedObject: adset.promoted_object ?? null,
      rawJson: adset as Record<string, unknown>,
      syncedAt,
      updatedAt: syncedAt,
    }).onConflictDoUpdate({
      target: [metaAdsets.tenantId, metaAdsets.adAccountId, metaAdsets.adsetId],
      set: {
        campaignId: adset.campaign_id,
        name: adset.name ?? null,
        status: adset.status ?? null,
        configuredStatus: adset.configured_status ?? null,
        effectiveStatus: adset.effective_status ?? null,
        optimizationGoal: adset.optimization_goal ?? null,
        billingEvent: adset.billing_event ?? null,
        bidStrategy: adset.bid_strategy ?? null,
        updatedTime: adset.updated_time ?? null,
        promotedObject: adset.promoted_object ?? null,
        rawJson: adset as Record<string, unknown>,
        syncedAt,
        updatedAt: syncedAt,
      },
    });
  }

  for (const ad of ads) {
    if (!ad.id) continue;
    const creativeId = ad.creative?.id ?? null;
    await db.insert(metaAds).values({
      tenantId: options.tenantId,
      adAccountId: options.adAccountId,
      campaignId: ad.campaign_id ?? null,
      adsetId: ad.adset_id ?? null,
      adId: ad.id,
      creativeId,
      name: ad.name ?? null,
      status: ad.status ?? null,
      effectiveStatus: ad.effective_status ?? null,
      rawJson: ad as Record<string, unknown>,
      syncedAt,
      updatedAt: syncedAt,
    }).onConflictDoUpdate({
      target: [metaAds.tenantId, metaAds.adAccountId, metaAds.adId],
      set: {
        campaignId: ad.campaign_id ?? null,
        adsetId: ad.adset_id ?? null,
        creativeId,
        name: ad.name ?? null,
        status: ad.status ?? null,
        effectiveStatus: ad.effective_status ?? null,
        rawJson: ad as Record<string, unknown>,
        syncedAt,
        updatedAt: syncedAt,
      },
    });

    if (creativeId) {
      const previewSource = creativePreviewSources.get(creativeId);
      const rawCreative = previewSource?.rawJson ?? ad.creative ?? {};
      await db.insert(metaCreatives).values({
        tenantId: options.tenantId,
        adAccountId: options.adAccountId,
        creativeId,
        name: previewSource?.name ?? ad.creative?.name ?? ad.creative?.id ?? null,
        thumbnailUrl: previewSource?.thumbnailUrl ?? ad.creative?.thumbnail_url ?? null,
        imageUrl: previewSource?.previewUrl ?? ad.creative?.image_url ?? null,
        lastSeenAt: syncedAt,
        rawJson: rawCreative as Record<string, unknown>,
        syncedAt,
        updatedAt: syncedAt,
      }).onConflictDoUpdate({
        target: [metaCreatives.tenantId, metaCreatives.adAccountId, metaCreatives.creativeId],
        set: {
          name: previewSource?.name ?? ad.creative?.name ?? ad.creative?.id ?? null,
          thumbnailUrl: previewSource?.thumbnailUrl ?? ad.creative?.thumbnail_url ?? null,
          imageUrl: previewSource?.previewUrl ?? ad.creative?.image_url ?? null,
          lastSeenAt: syncedAt,
          rawJson: rawCreative as Record<string, unknown>,
          syncedAt,
          updatedAt: syncedAt,
        },
      });
    }
  }
}

async function createMetaClient(tenantId: number): Promise<MetaGraphClient> {
  const [metaAccess, settings] = await Promise.all([
    getMetaAccess(tenantId),
    storage.getAppSettings(),
  ]);

  if (!metaAccess) {
    throw new Error("Integracao com Meta nao esta conectada, token expirado ou app secret ausente.");
  }

  const metaAppSecret = resolveMetaAppSecret(settings);
  if (!metaAppSecret) {
    throw new Error("Meta app secret nao configurado.");
  }

  return new MetaGraphClient(metaAccess.accessToken, metaAppSecret);
}

async function getSuccessSyncStatus(tenantId: number, adAccountId: string) {
  const account = await db.query.dashboardSyncAccounts.findFirst({
    where: and(
      eq(dashboardSyncAccounts.tenantId, tenantId),
      eq(dashboardSyncAccounts.adAccountId, adAccountId),
    ),
  });
  return account?.syncEnabled ? "active" : "paused";
}

export async function runDashboardSyncJob(jobId: number) {
  const startedAt = new Date();
  const [job] = await db
    .update(metaSyncJobs)
    .set({
      status: "running",
      startedAt,
      updatedAt: startedAt,
    })
    .where(eq(metaSyncJobs.id, jobId))
    .returning();

  if (!job) {
    throw new Error(`Job ${jobId} nao encontrado.`);
  }
  if (job.attempts >= job.maxAttempts) {
    const finishedAt = new Date();
    const message = "Job atingiu o limite maximo de tentativas.";
    await db.update(metaSyncJobs).set({
      status: "failed",
      finishedAt,
      errorMessage: message,
      updatedAt: finishedAt,
    }).where(eq(metaSyncJobs.id, job.id));

    await db.update(dashboardSyncAccounts).set({
      syncStatus: "error",
      lastFailedSyncAt: finishedAt,
      lastErrorMessage: message,
      updatedAt: finishedAt,
    }).where(
      and(
        eq(dashboardSyncAccounts.tenantId, job.tenantId),
        eq(dashboardSyncAccounts.adAccountId, job.adAccountId),
      ),
    );

    throw new Error(message);
  }

  await db
    .update(dashboardSyncAccounts)
    .set({ syncStatus: "syncing", lastErrorMessage: null, updatedAt: startedAt })
    .where(
      and(
        eq(dashboardSyncAccounts.tenantId, job.tenantId),
        eq(dashboardSyncAccounts.adAccountId, job.adAccountId),
      ),
    );

  try {
    const client = await createMetaClient(job.tenantId);
    await syncEntities({ tenantId: job.tenantId, adAccountId: job.adAccountId, client });

    if (job.jobType === "sync_entities") {
      const finishedAt = new Date();
      await db.update(metaSyncJobs).set({
        status: "completed",
        finishedAt,
        errorMessage: null,
        updatedAt: finishedAt,
      }).where(eq(metaSyncJobs.id, job.id));

      await db.update(dashboardSyncAccounts).set({
        syncStatus: await getSuccessSyncStatus(job.tenantId, job.adAccountId),
        lastSuccessSyncAt: finishedAt,
        lastErrorMessage: null,
        updatedAt: finishedAt,
      }).where(
        and(
          eq(dashboardSyncAccounts.tenantId, job.tenantId),
          eq(dashboardSyncAccounts.adAccountId, job.adAccountId),
        ),
      );

      return { jobId: job.id, savedRows: 0, ranges: [] };
    }

    const dateStart = job.dateStart ?? toDateKey(subDays(new Date(), DEFAULT_MANUAL_LOOKBACK_DAYS - 1));
    const dateEnd = job.dateEnd ?? toDateKey(new Date());
    const ranges = await getMissingDateRanges({
      tenantId: job.tenantId,
      adAccountId: job.adAccountId,
      dateStart,
      dateEnd,
      reprocessRecentDays: DEFAULT_REPROCESS_RECENT_DAYS,
    });

    let savedRows = 0;
    for (const range of ranges) {
      const timeRange: TimeRange = { since: range.start, until: range.end };
      const rows = await client.fetchAdInsights(job.adAccountId, timeRange, { timeIncrement: 1 });
      savedRows += await upsertMetaAdInsightsDaily(rows, job.tenantId, job.adAccountId);
    }

    const finishedAt = new Date();
    await db.update(metaSyncJobs).set({
      status: "completed",
      finishedAt,
      errorMessage: null,
      updatedAt: finishedAt,
    }).where(eq(metaSyncJobs.id, job.id));

    await db.update(dashboardSyncAccounts).set({
      syncStatus: await getSuccessSyncStatus(job.tenantId, job.adAccountId),
      lastSuccessSyncAt: finishedAt,
      lastErrorMessage: null,
      updatedAt: finishedAt,
    }).where(
      and(
        eq(dashboardSyncAccounts.tenantId, job.tenantId),
        eq(dashboardSyncAccounts.adAccountId, job.adAccountId),
      ),
    );

    return { jobId: job.id, savedRows, ranges };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar dashboard.";
    const finishedAt = new Date();
    const nextAttempts = job.attempts + 1;
    const reachedMaxAttempts = nextAttempts >= job.maxAttempts;
    const shouldRetryLater = job.jobSource === "auto" && !reachedMaxAttempts;
    await db.update(metaSyncJobs).set({
      status: shouldRetryLater ? "pending" : "failed",
      attempts: nextAttempts,
      finishedAt: shouldRetryLater ? null : finishedAt,
      errorMessage: message,
      updatedAt: finishedAt,
    }).where(eq(metaSyncJobs.id, job.id));

    await db.update(dashboardSyncAccounts).set({
      syncStatus: "error",
      lastFailedSyncAt: finishedAt,
      lastErrorMessage: message,
      updatedAt: finishedAt,
    }).where(
      and(
        eq(dashboardSyncAccounts.tenantId, job.tenantId),
        eq(dashboardSyncAccounts.adAccountId, job.adAccountId),
      ),
    );

    throw error;
  }
}

export async function createManualDashboardSyncJob(options: {
  tenantId: number;
  adAccountId: string;
  userId: number;
  dateStart?: string;
  dateEnd?: string;
}) {
  const now = new Date();
  const [job] = await db.insert(metaSyncJobs).values({
    tenantId: options.tenantId,
    adAccountId: options.adAccountId,
    jobType: "sync_manual",
    jobSource: "manual",
    dateStart: options.dateStart ?? toDateKey(subDays(now, DEFAULT_MANUAL_LOOKBACK_DAYS - 1)),
    dateEnd: options.dateEnd ?? toDateKey(now),
    status: "pending",
    priority: 10,
    maxAttempts: 3,
    createdBy: options.userId,
    updatedAt: now,
  }).returning();

  await db.update(dashboardSyncAccounts).set({
    lastManualSyncAt: now,
    updatedBy: options.userId,
    updatedAt: now,
  }).where(
    and(
      eq(dashboardSyncAccounts.tenantId, options.tenantId),
      eq(dashboardSyncAccounts.adAccountId, options.adAccountId),
    ),
  );

  return job;
}

async function hasOpenJob(tenantId: number, adAccountId: string): Promise<boolean> {
  const openJob = await db.query.metaSyncJobs.findFirst({
    where: and(
      eq(metaSyncJobs.tenantId, tenantId),
      eq(metaSyncJobs.adAccountId, adAccountId),
      inArray(metaSyncJobs.status, ["pending", "running"]),
    ),
  });
  return Boolean(openJob);
}

async function findRetryableAutoJob(options: {
  tenantId: number;
  adAccountId: string;
  jobType: "sync_today_insights" | "sync_recent_insights" | "sync_entities";
  retryBefore: Date;
}) {
  return db.query.metaSyncJobs.findFirst({
    where: and(
      eq(metaSyncJobs.tenantId, options.tenantId),
      eq(metaSyncJobs.adAccountId, options.adAccountId),
      eq(metaSyncJobs.jobType, options.jobType),
      eq(metaSyncJobs.jobSource, "auto"),
      eq(metaSyncJobs.status, "pending"),
      lte(metaSyncJobs.updatedAt, options.retryBefore),
      sql`${metaSyncJobs.attempts} < ${metaSyncJobs.maxAttempts}`,
    ),
    orderBy: [desc(metaSyncJobs.priority), desc(metaSyncJobs.updatedAt)],
  });
}

function isInsideAutoRetryBackoff(account: {
  lastFailedSyncAt: Date | string | null;
}, now: Date): boolean {
  if (!account.lastFailedSyncAt) return false;
  const failedAt = new Date(account.lastFailedSyncAt);
  if (Number.isNaN(failedAt.getTime())) return false;
  return now.getTime() - failedAt.getTime() < AUTO_RETRY_BACKOFF_MS;
}

async function createAutoJob(options: {
  tenantId: number;
  adAccountId: string;
  jobType: "sync_today_insights" | "sync_recent_insights" | "sync_entities";
  dateStart?: string;
  dateEnd?: string;
}) {
  const now = new Date();
  const [job] = await db.insert(metaSyncJobs).values({
    tenantId: options.tenantId,
    adAccountId: options.adAccountId,
    jobType: options.jobType,
    jobSource: "auto",
    dateStart: options.dateStart ?? null,
    dateEnd: options.dateEnd ?? null,
    status: "pending",
    priority: options.jobType === "sync_today_insights" ? 20 : 50,
    maxAttempts: 3,
    updatedAt: now,
  }).returning();

  await db.update(dashboardSyncAccounts).set({
    lastAutoSyncAt: now,
    updatedAt: now,
  }).where(
    and(
      eq(dashboardSyncAccounts.tenantId, options.tenantId),
      eq(dashboardSyncAccounts.adAccountId, options.adAccountId),
    ),
  );

  return job;
}

async function enqueueAndRunAutomaticDashboardJobs(kind: "today" | "recent" | "entities") {
  const now = new Date();
  const retryBefore = new Date(now.getTime() - AUTO_RETRY_BACKOFF_MS);
  const enabledAccounts = await db.query.dashboardSyncAccounts.findMany({
    where: and(
      eq(dashboardSyncAccounts.syncEnabled, true),
      inArray(dashboardSyncAccounts.syncStatus, ["active", "error"]),
    ),
  });

  for (const account of enabledAccounts) {
    const dateEnd = toDateKey(now);
    const dateStart =
      kind === "today"
        ? dateEnd
        : kind === "recent"
          ? toDateKey(subDays(now, DEFAULT_REPROCESS_RECENT_DAYS - 1))
          : undefined;
    const jobType =
      kind === "today"
        ? "sync_today_insights"
        : kind === "recent"
          ? "sync_recent_insights"
          : "sync_entities";

    const retryJob = await findRetryableAutoJob({
      tenantId: account.tenantId,
      adAccountId: account.adAccountId,
      jobType,
      retryBefore,
    });
    if (retryJob) {
      try {
        await runDashboardSyncJob(retryJob.id);
      } catch (error) {
        console.error("Falha ao retentar job automatico do dashboard", {
          jobId: retryJob.id,
          tenantId: account.tenantId,
          adAccountId: account.adAccountId,
          attempts: retryJob.attempts + 1,
          maxAttempts: retryJob.maxAttempts,
          error,
        });
      }
      continue;
    }

    if (await hasOpenJob(account.tenantId, account.adAccountId)) continue;
    if (isInsideAutoRetryBackoff(account, now)) continue;

    const job = await createAutoJob({
      tenantId: account.tenantId,
      adAccountId: account.adAccountId,
      jobType,
      dateStart,
      dateEnd: kind === "entities" ? undefined : dateEnd,
    });

    try {
      await runDashboardSyncJob(job.id);
    } catch (error) {
      console.error("Falha em job automatico do dashboard", {
        jobId: job.id,
        tenantId: account.tenantId,
        adAccountId: account.adAccountId,
        error,
      });
    }
  }
}

export function startDashboardSyncCron() {
  const runToday = () => {
    void enqueueAndRunAutomaticDashboardJobs("today");
  };
  const runRecent = () => {
    void enqueueAndRunAutomaticDashboardJobs("recent");
  };
  const runEntities = () => {
    void enqueueAndRunAutomaticDashboardJobs("entities");
  };

  setInterval(runToday, 30 * 60 * 1000);
  setInterval(runRecent, 60 * 60 * 1000);
  setInterval(runEntities, 60 * 60 * 1000);
}

function rowMatchesFilters(
  row: {
    campaignId: string;
    campaignName: string | null;
    objective: string | null;
    status: string | null;
  },
  filters: CacheFilterOptions,
): boolean {
  if (filters.campaignFilterSet && !filters.campaignFilterSet.has(row.campaignId)) return false;
  const search = filters.campaignNameSearch?.trim().toLocaleLowerCase("pt-BR");
  if (search && !(row.campaignName ?? "").toLocaleLowerCase("pt-BR").includes(search)) return false;
  const objective = row.objective?.toUpperCase() ?? null;
  if (filters.objectiveFilterSet && (!objective || !filters.objectiveFilterSet.has(objective))) return false;
  const status = row.status?.toUpperCase() ?? null;
  if (filters.statusFilterSet && (!status || !filters.statusFilterSet.has(status))) return false;
  return true;
}

function addRowToTotals(totals: MetricTotals, row: { spend: string; impressions: number; clicks: number; reach: number; leads: number }) {
  totals.spend += parseNumber(row.spend);
  totals.resultSpend += parseNumber(row.spend);
  totals.impressions += row.impressions;
  totals.clicks += row.clicks;
  totals.reach += row.reach;
  totals.leads += row.leads;
  totals.results += row.leads;
  totals.messagingConversationsStarted += 0;
  totals.costPerResult = totals.results > 0 ? totals.resultSpend / totals.results : null;
}

function buildTimeline(options: {
  startDate?: string;
  endDate?: string;
  points: Map<string, Omit<DailyTimelinePoint, "date" | "costPerLead">>;
}): DailyTimelinePoint[] {
  if (!options.startDate || !options.endDate) {
    return Array.from(options.points.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, point]) => ({
      date,
      ...point,
      costPerLead: point.leads > 0 ? point.spend / point.leads : null,
    }));
  }

  const start = safeDate(options.startDate);
  const end = safeDate(options.endDate);
  const timeline: DailyTimelinePoint[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const date = toDateKey(cursor);
    const point = options.points.get(date) ?? {
      spend: 0,
      impressions: 0,
      reach: 0,
      leads: 0,
      messagingConversationsStarted: 0,
    };
    timeline.push({
      date,
      ...point,
      costPerLead: point.leads > 0 ? point.spend / point.leads : null,
    });
  }
  return timeline;
}

export async function fetchDashboardMetricsFromCache(options: {
  tenantId: number;
  accounts: Resource[];
  startDate?: string;
  endDate?: string;
  previousStartDate?: string;
  previousEndDate?: string;
} & CacheFilterOptions): Promise<MetaDashboardResult & { previousTotals: MetricTotals }> {
  const accountValues = options.accounts.map((account) => account.value);
  const accountByValue = new Map(options.accounts.map((account) => [account.value, account] as const));
  if (accountValues.length === 0) {
    return { totals: createEmptyTotals(), previousTotals: createEmptyTotals(), accounts: [], timeline: [] };
  }

  const where = [
    eq(metaAdInsightsDaily.tenantId, options.tenantId),
    inArray(metaAdInsightsDaily.adAccountId, accountValues),
  ];
  if (options.startDate) where.push(gte(metaAdInsightsDaily.dateStart, options.startDate));
  if (options.endDate) where.push(lte(metaAdInsightsDaily.dateStart, options.endDate));

  const rows = await db
    .select({
      adAccountId: metaAdInsightsDaily.adAccountId,
      campaignId: metaAdInsightsDaily.campaignId,
      campaignName: metaAdInsightsDaily.campaignName,
      dateStart: metaAdInsightsDaily.dateStart,
      spend: metaAdInsightsDaily.spend,
      impressions: metaAdInsightsDaily.impressions,
      clicks: metaAdInsightsDaily.clicks,
      reach: metaAdInsightsDaily.reach,
      leads: metaAdInsightsDaily.leads,
      objective: metaCampaigns.objective,
      status: metaCampaigns.effectiveStatus,
    })
    .from(metaAdInsightsDaily)
    .leftJoin(
      metaCampaigns,
      and(
        eq(metaCampaigns.tenantId, metaAdInsightsDaily.tenantId),
        eq(metaCampaigns.adAccountId, metaAdInsightsDaily.adAccountId),
        eq(metaCampaigns.campaignId, metaAdInsightsDaily.campaignId),
      ),
    )
    .where(and(...where));

  const filteredRows = rows.filter((row) => rowMatchesFilters({
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    objective: row.objective,
    status: row.status,
  }, options));

  const totals = createEmptyTotals();
  const globalTimeline = new Map<string, Omit<DailyTimelinePoint, "date" | "costPerLead">>();
  const accountBuckets = new Map<number, {
    totals: MetricTotals;
    timeline: Map<string, Omit<DailyTimelinePoint, "date" | "costPerLead">>;
    campaigns: Map<string, DashboardCampaignMetrics>;
  }>();

  for (const account of options.accounts) {
    accountBuckets.set(account.id, {
      totals: createEmptyTotals(),
      timeline: new Map(),
      campaigns: new Map(),
    });
  }

  for (const row of filteredRows) {
    const account = accountByValue.get(row.adAccountId);
    if (!account) continue;
    const bucket = accountBuckets.get(account.id);
    if (!bucket) continue;

    addRowToTotals(totals, row);
    addRowToTotals(bucket.totals, row);

    const campaign = bucket.campaigns.get(row.campaignId) ?? {
      id: row.campaignId,
      name: row.campaignName,
      objective: row.objective,
      status: row.status,
      metrics: createEmptyTotals(),
      resultado: {
        label: "Leads",
        quantidade: 0,
        custo_por_resultado: null,
      },
    };
    addRowToTotals(campaign.metrics, row);
    campaign.resultado = {
      label: "Leads",
      quantidade: campaign.metrics.leads,
      custo_por_resultado: campaign.metrics.leads > 0 ? campaign.metrics.spend / campaign.metrics.leads : null,
    };
    bucket.campaigns.set(row.campaignId, campaign);

    for (const timeline of [bucket.timeline, globalTimeline]) {
      const point = timeline.get(row.dateStart) ?? {
        spend: 0,
        impressions: 0,
        reach: 0,
        leads: 0,
        messagingConversationsStarted: 0,
      };
      point.spend += parseNumber(row.spend);
      point.impressions += row.impressions;
      point.reach += row.reach;
      point.leads += row.leads;
      timeline.set(row.dateStart, point);
    }
  }

  let previousTotals = createEmptyTotals();
  if (options.previousStartDate && options.previousEndDate) {
    const previous = await fetchDashboardMetricsFromCache({
      ...options,
      startDate: options.previousStartDate,
      endDate: options.previousEndDate,
      previousStartDate: undefined,
      previousEndDate: undefined,
    });
    previousTotals = previous.totals;

    const previousByAccount = new Map(previous.accounts.map((account) => [account.id, account.metrics] as const));
    for (const account of options.accounts) {
      const bucket = accountBuckets.get(account.id);
      const previousMetrics = previousByAccount.get(account.id);
      if (previousMetrics) {
        const currentBucket = accountBuckets.get(account.id);
        if (currentBucket) {
          (currentBucket as typeof currentBucket & { previousMetrics?: MetricTotals }).previousMetrics = previousMetrics;
        }
      }
    }
  }

  const accounts: DashboardAccountMetrics[] = options.accounts.map((account) => {
    const bucket = accountBuckets.get(account.id)!;
    const previousMetrics = (bucket as typeof bucket & { previousMetrics?: MetricTotals }).previousMetrics;
    return {
      id: account.id,
      name: account.name,
      value: account.value,
      metrics: bucket.totals,
      previousMetrics: previousMetrics ?? createEmptyTotals(),
      campaigns: Array.from(bucket.campaigns.values()).sort((a, b) => b.metrics.spend - a.metrics.spend),
      timeline: buildTimeline({ startDate: options.startDate, endDate: options.endDate, points: bucket.timeline }),
    };
  }).sort((a, b) => b.metrics.spend - a.metrics.spend);

  return {
    totals,
    previousTotals,
    accounts,
    timeline: buildTimeline({ startDate: options.startDate, endDate: options.endDate, points: globalTimeline }),
  };
}

export async function fetchDashboardTopCreativesFromCache(
  options: DashboardTopCreativesCacheOptions,
): Promise<DashboardTopCreativesAccountGroup[]> {
  const groups: DashboardTopCreativesAccountGroup[] = [];
  const campaignSearch = options.campaignNameSearch?.trim().toLowerCase() ?? "";

  for (const account of options.accounts) {
    const conditions = [
      eq(metaAdInsightsDaily.tenantId, options.tenantId),
      eq(metaAdInsightsDaily.adAccountId, account.value),
    ];
    if (options.startDate) conditions.push(gte(metaAdInsightsDaily.dateStart, options.startDate));
    if (options.endDate) conditions.push(lte(metaAdInsightsDaily.dateStart, options.endDate));

    const rows = await db
      .select({
        adId: metaAdInsightsDaily.adId,
        adName: metaAdInsightsDaily.adName,
        campaignId: metaAdInsightsDaily.campaignId,
        campaignName: metaAdInsightsDaily.campaignName,
        spend: metaAdInsightsDaily.spend,
        impressions: metaAdInsightsDaily.impressions,
        reach: metaAdInsightsDaily.reach,
        clicks: metaAdInsightsDaily.clicks,
        leads: metaAdInsightsDaily.leads,
        actionsJson: metaAdInsightsDaily.actionsJson,
        creativeId: metaAds.creativeId,
        adStatus: metaAds.effectiveStatus,
        campaignObjective: metaCampaigns.objective,
        campaignStatus: metaCampaigns.effectiveStatus,
        thumbnailUrl: metaCreatives.thumbnailUrl,
        imageUrl: metaCreatives.imageUrl,
        storageThumbnailBucket: metaCreatives.storageThumbnailBucket,
        storageThumbnailPath: metaCreatives.storageThumbnailPath,
      })
      .from(metaAdInsightsDaily)
      .leftJoin(
        metaAds,
        and(
          eq(metaAds.tenantId, metaAdInsightsDaily.tenantId),
          eq(metaAds.adAccountId, metaAdInsightsDaily.adAccountId),
          eq(metaAds.adId, metaAdInsightsDaily.adId),
        ),
      )
      .leftJoin(
        metaCampaigns,
        and(
          eq(metaCampaigns.tenantId, metaAdInsightsDaily.tenantId),
          eq(metaCampaigns.adAccountId, metaAdInsightsDaily.adAccountId),
          eq(metaCampaigns.campaignId, metaAdInsightsDaily.campaignId),
        ),
      )
      .leftJoin(
        metaCreatives,
        and(
          eq(metaCreatives.tenantId, metaAdInsightsDaily.tenantId),
          eq(metaCreatives.adAccountId, metaAdInsightsDaily.adAccountId),
          eq(metaCreatives.creativeId, metaAds.creativeId),
        ),
      )
      .where(and(...conditions));

    const byAd = new Map<string, {
      campaignId: string;
      campaignName: string | null;
      campaignObjective: string | null;
      campaignStatus: string | null;
      adId: string;
      adName: string | null;
      adStatus: string | null;
      creativeId: string | null;
      thumbnailUrl: string | null;
      imageUrl: string | null;
      storageThumbnailBucket: string | null;
      storageThumbnailPath: string | null;
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      leads: number;
      messages: number;
    }>();

    for (const row of rows) {
      if (options.campaignFilterSet?.size && !options.campaignFilterSet.has(row.campaignId)) continue;
      if (campaignSearch && !(row.campaignName ?? "").toLowerCase().includes(campaignSearch)) continue;
      if (options.objectiveFilterSet?.size && !options.objectiveFilterSet.has(row.campaignObjective ?? "")) continue;
      if (options.statusFilterSet?.size && !options.statusFilterSet.has((row.campaignStatus ?? "").toUpperCase())) {
        continue;
      }

      const current = byAd.get(row.adId) ?? {
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        campaignObjective: row.campaignObjective,
        campaignStatus: row.campaignStatus,
        adId: row.adId,
        adName: row.adName,
        adStatus: row.adStatus,
        creativeId: row.creativeId,
        thumbnailUrl: row.thumbnailUrl,
        imageUrl: row.imageUrl,
        storageThumbnailBucket: row.storageThumbnailBucket,
        storageThumbnailPath: row.storageThumbnailPath,
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        leads: 0,
        messages: 0,
      };

      current.spend += parseNumber(row.spend);
      current.impressions += row.impressions ?? 0;
      current.reach += row.reach ?? 0;
      current.clicks += row.clicks ?? 0;
      current.leads += row.leads ?? 0;
      current.messages += extractMessages(row.actionsJson as GraphActionEntry[] | undefined);
      current.thumbnailUrl = current.thumbnailUrl ?? row.thumbnailUrl;
      current.imageUrl = current.imageUrl ?? row.imageUrl;
      current.storageThumbnailBucket = current.storageThumbnailBucket ?? row.storageThumbnailBucket;
      current.storageThumbnailPath = current.storageThumbnailPath ?? row.storageThumbnailPath;
      byAd.set(row.adId, current);
    }

    const topEntries = Array.from(byAd.values())
      .map((entry) => {
        const useMessages = entry.leads <= 0 && isMessagingOrEngagementObjective(entry.campaignObjective);
        const resultQty = entry.leads > 0 ? entry.leads : useMessages ? entry.messages : 0;
        const resultLabel = entry.leads > 0 ? "Leads" : "Conversas iniciadas";
        const costPerResult = resultQty > 0 ? entry.spend / resultQty : null;
        return { ...entry, resultQty, resultLabel, costPerResult };
      })
      .filter((entry) => entry.resultQty > 0)
      .sort((a, b) => {
        const resultDiff = b.resultQty - a.resultQty;
        if (resultDiff !== 0) return resultDiff;
        const aCost = a.costPerResult ?? Number.POSITIVE_INFINITY;
        const bCost = b.costPerResult ?? Number.POSITIVE_INFINITY;
        if (aCost !== bCost) return aCost - bCost;
        return b.spend - a.spend;
      })
      .slice(0, 5);

    await Promise.all(
      topEntries
        .filter((entry) => entry.creativeId)
        .map((entry) =>
          ensureCreativePreviewAsset({
            tenantId: options.tenantId,
            adAccountId: account.value,
            creativeId: entry.creativeId!,
          }),
        ),
    );

    const topCreativeIds = topEntries
      .map((entry) => entry.creativeId)
      .filter((creativeId): creativeId is string => Boolean(creativeId));
    const refreshedCreatives = topCreativeIds.length > 0
      ? await db.query.metaCreatives.findMany({
          where: and(
            eq(metaCreatives.tenantId, options.tenantId),
            eq(metaCreatives.adAccountId, account.value),
            inArray(metaCreatives.creativeId, topCreativeIds),
          ),
        })
      : [];
    const refreshedById = new Map(refreshedCreatives.map((creative) => [creative.creativeId, creative]));

    const creatives: DashboardTopCreative[] = [];
    for (const entry of topEntries) {
      const creative = entry.creativeId ? refreshedById.get(entry.creativeId) : null;
      const thumbnailUrl = creative
        ? await getCreativePreviewUrl(creative)
        : entry.thumbnailUrl || entry.imageUrl || null;
      const resultLabel = entry.resultLabel;

      creatives.push({
        accountId: account.id,
        accountName: account.name,
        accountValue: account.value,
        campaignId: entry.campaignId,
        campaignName: entry.campaignName,
        campaignObjective: entry.campaignObjective,
        campaignStatus: entry.campaignStatus,
        resultLabel,
        ad_id: entry.adId,
        ad_name: entry.adName,
        ad_status: entry.adStatus,
        creative_id: entry.creativeId,
        thumbnailUrl,
        metrics: {
          impressions: entry.impressions,
          clicks: entry.clicks,
          spend: entry.spend,
          ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : null,
          frequency: entry.reach > 0 ? entry.impressions / entry.reach : null,
          leadQty: entry.leads,
          messagingQty: entry.messages,
          resultQty: entry.resultQty,
          costPerResult: entry.costPerResult,
        },
      });
    }

    groups.push({
      accountId: account.id,
      accountName: account.name,
      accountValue: account.value,
      creatives,
    });
  }

  groups.sort((a, b) => a.accountName.localeCompare(b.accountName, "pt-BR"));
  return groups;
}

export async function getDashboardSyncSummary(tenantId: number, adAccountIds: string[]) {
  if (adAccountIds.length === 0) {
    return {
      last_synced_at: null,
      sync_status: "never_synced",
      is_updating: false,
      last_error_message: null,
    };
  }

  const [latestInsight] = await db
    .select({ lastSyncedAt: sql<Date | null>`max(${metaAdInsightsDaily.syncedAt})` })
    .from(metaAdInsightsDaily)
    .where(
      and(
        eq(metaAdInsightsDaily.tenantId, tenantId),
        inArray(metaAdInsightsDaily.adAccountId, adAccountIds),
      ),
    );

  const accounts = await db.query.dashboardSyncAccounts.findMany({
    where: and(
      eq(dashboardSyncAccounts.tenantId, tenantId),
      inArray(dashboardSyncAccounts.adAccountId, adAccountIds),
    ),
  });

  const runningJobs = await db.query.metaSyncJobs.findMany({
    where: and(
      eq(metaSyncJobs.tenantId, tenantId),
      inArray(metaSyncJobs.adAccountId, adAccountIds),
      inArray(metaSyncJobs.status, ["pending", "running"]),
    ),
    orderBy: [desc(metaSyncJobs.createdAt)],
  });

  const status =
    accounts.find((account) => account.syncStatus === "error")?.syncStatus ??
    accounts.find((account) => account.syncStatus === "syncing")?.syncStatus ??
    accounts.find((account) => account.syncStatus === "active")?.syncStatus ??
    accounts[0]?.syncStatus ??
    "never_synced";

  return {
    last_synced_at: latestInsight?.lastSyncedAt ?? null,
    sync_status: status,
    is_updating: runningJobs.length > 0,
    last_error_message: accounts.find((account) => account.lastErrorMessage)?.lastErrorMessage ?? null,
  };
}
