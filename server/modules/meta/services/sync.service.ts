import { addDays, format, parseISO } from "date-fns";
import type {
  InsertMetaAdCreativeSnapshot,
  InsertMetaAdInsightsDaily,
  InsertMetaAdsetInsightsDaily,
  InsertMetaCampaignInsightsDaily,
  InsertMetaSyncDayCoverage,
  MetaActionEntry,
  Resource,
} from "@shared/schema";
import { storage } from "../../storage";
import { MetaGraphClient } from "../client";
import { getMetaAccess } from "./access.service";
import { attachCreativeAssetsToStorage } from "./creative-cache.service";
import { resolveMetaAppSecret } from "../utils/app-config";
import { parseNumber } from "../utils/parsing";
import { mapWithConcurrency } from "../utils/concurrency";

const CREATIVE_SYNC_CONCURRENCY = 3;
const DASHBOARD_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

type MissingRange = {
  startDate: string;
  endDate: string;
};

export type DashboardSyncSummary = {
  tenantId: number;
  startDate: string;
  endDate: string;
  accountCount: number;
  cachedAccountCount: number;
  syncedAccountCount: number;
  missingRangesByAccount: Array<{
    accountResourceId: number;
    adAccountId: string;
    accountName: string;
    missingRanges: MissingRange[];
  }>;
  persisted: {
    campaignRows: number;
    adsetRows: number;
    adRows: number;
    creativeSnapshots: number;
    coverageRows: number;
  };
};

function serializeActionEntries(entries: Array<{ action_type?: string; value?: string }> | undefined): MetaActionEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      action_type: entry.action_type,
      value: typeof entry.value === "string" ? entry.value : "0",
    }))
    .filter((entry) => typeof entry.action_type === "string" && entry.action_type.length > 0);
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const dates: string[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
  }

  return dates;
}

function computeMissingRanges(
  coverageRows: Array<{
    date: string;
    hasCampaignMetrics: boolean;
    hasAdsetMetrics: boolean;
    hasAdMetrics: boolean;
  }>,
  startDate: string,
  endDate: string,
): MissingRange[] {
  const coverageByDate = new Map(
    coverageRows.map((row) => [
      row.date,
      row.hasCampaignMetrics && row.hasAdsetMetrics && row.hasAdMetrics,
    ] as const),
  );

  const missingRanges: MissingRange[] = [];
  let currentStart: string | null = null;
  let previousDate: string | null = null;

  for (const date of enumerateDates(startDate, endDate)) {
    const covered = coverageByDate.get(date) ?? false;

    if (!covered) {
      if (!currentStart) {
        currentStart = date;
      }
      previousDate = date;
      continue;
    }

    if (currentStart && previousDate) {
      missingRanges.push({
        startDate: currentStart,
        endDate: previousDate,
      });
      currentStart = null;
      previousDate = null;
    }
  }

  if (currentStart && previousDate) {
    missingRanges.push({
      startDate: currentStart,
      endDate: previousDate,
    });
  }

  return missingRanges;
}

function formatNumericMetric(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(6);
}

function buildCoverageRows(options: {
  tenantId: number;
  account: Resource;
  startDate: string;
  endDate: string;
  lastSyncedAt: Date;
}): Array<InsertMetaSyncDayCoverage & { tenantId: number }> {
  const { tenantId, account, startDate, endDate, lastSyncedAt } = options;

  return enumerateDates(startDate, endDate).map((date) => ({
    tenantId,
    accountResourceId: account.id,
    adAccountId: account.value,
    date,
    hasCampaignMetrics: true,
    hasAdsetMetrics: true,
    hasAdMetrics: true,
    lastSyncedAt,
  }));
}

export async function syncMetaDashboardHistory(options: {
  tenantId: number;
  requestedByUserId: number;
  startDate: string;
  endDate: string;
  accounts: Resource[];
  forceRefresh?: boolean;
}): Promise<DashboardSyncSummary> {
  const { tenantId, startDate, endDate, accounts, forceRefresh = false } = options;

  const metaAccess = await getMetaAccess(tenantId);
  if (!metaAccess) {
    throw new Error("Integracao com Meta nao esta conectada ou o token expirou.");
  }

  const settings = await storage.getAppSettings();
  const metaAppSecret = resolveMetaAppSecret(settings);
  if (!metaAppSecret) {
    throw new Error("Meta app secret nao configurado.");
  }

  const client = new MetaGraphClient(metaAccess.accessToken, metaAppSecret);
  const expiresAt = new Date(Date.now() + DASHBOARD_SNAPSHOT_TTL_MS);
  const summary: DashboardSyncSummary = {
    tenantId,
    startDate,
    endDate,
    accountCount: accounts.length,
    cachedAccountCount: 0,
    syncedAccountCount: 0,
    missingRangesByAccount: [],
    persisted: {
      campaignRows: 0,
      adsetRows: 0,
      adRows: 0,
      creativeSnapshots: 0,
      coverageRows: 0,
    },
  };

  for (const account of accounts) {
    const coverageRows = forceRefresh
      ? []
      : await storage.getMetaSyncCoverageDays(tenantId, startDate, endDate, [account.id]);
    const missingRanges = forceRefresh
      ? [{ startDate, endDate }]
      : computeMissingRanges(coverageRows, startDate, endDate);

    if (missingRanges.length === 0) {
      summary.cachedAccountCount += 1;
      continue;
    }

    summary.syncedAccountCount += 1;
    summary.missingRangesByAccount.push({
      accountResourceId: account.id,
      adAccountId: account.value,
      accountName: account.name,
      missingRanges,
    });

    const [campaigns, adsets] = await Promise.all([
      client.fetchCampaigns(account.value),
      client.fetchAdsets(account.value),
    ]);
    const existingCreativeSnapshots = await storage.getMetaAdCreativeSnapshots(
      tenantId,
      [account.id],
      campaigns.map((campaign) => campaign.id),
    );
    const existingCreativeSnapshotByAdKey = new Map(
      existingCreativeSnapshots.map((snapshot) => [
        `${snapshot.campaignId}:${snapshot.adId}`,
        snapshot,
      ] as const),
    );

    await storage.upsertMetaAccountSnapshot({
      tenantId,
      resourceId: account.id,
      adAccountId: account.value,
      accountName: account.name,
      connectionStatus: "connected",
      syncedAt: new Date(),
      expiresAt,
    });

    await storage.replaceMetaCampaignSnapshotsByAccount(
      tenantId,
      account.value,
      campaigns.map((campaign) => ({
        tenantId,
        adAccountId: account.value,
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
        syncedAt: new Date(),
        expiresAt,
      })),
    );

    await storage.replaceMetaAdsetSnapshotsByAccount(
      tenantId,
      account.value,
      adsets.map((adset) => ({
        tenantId,
        adAccountId: account.value,
        campaignId: adset.campaign_id ?? "",
        adsetId: adset.id,
        name: adset.name ?? null,
        endTime: adset.end_time ?? null,
        status: adset.status ?? null,
        configuredStatus: adset.configured_status ?? null,
        effectiveStatus: adset.effective_status ?? null,
        optimizationGoal: adset.optimization_goal ?? null,
        billingEvent: adset.billing_event ?? null,
        bidStrategy: adset.bid_strategy ?? null,
        updatedTime: adset.updated_time ?? null,
        promotedObject: adset.promoted_object ?? null,
        syncedAt: new Date(),
        expiresAt,
      })),
    );

    const creativeSnapshotGroups = await mapWithConcurrency(
      campaigns.filter((campaign) => campaign.id),
      CREATIVE_SYNC_CONCURRENCY,
      async (campaign) => {
        const creativeSnapshots = await client.fetchCampaignAdCreativeSnapshots(
          account.value,
          campaign.id,
        );
        return Promise.all(
          creativeSnapshots.map(
            async (snapshot): Promise<InsertMetaAdCreativeSnapshot & { tenantId: number }> => {
              const existingSnapshot = existingCreativeSnapshotByAdKey.get(
                `${campaign.id}:${snapshot.ad_id}`,
              );
              const cachedAssets = await attachCreativeAssetsToStorage({
                tenantId,
                account,
                campaignId: campaign.id,
                adId: snapshot.ad_id,
                thumbnailUrl: snapshot.thumbnailUrl,
                previewUrl: snapshot.previewUrl,
                existingSnapshot,
              });

              return {
                tenantId,
                accountResourceId: account.id,
                adAccountId: account.value,
                campaignId: campaign.id,
                adId: snapshot.ad_id,
                adName: snapshot.ad_name,
                adStatus: snapshot.ad_status,
                creativeId: snapshot.creative_id,
                thumbnailSourceUrl: snapshot.thumbnailSourceUrl ?? snapshot.thumbnailUrl,
                previewSourceUrl: snapshot.previewSourceUrl ?? snapshot.previewUrl,
                thumbnailUrl: cachedAssets.cachedThumbnailUrl,
                imageUrl: snapshot.imageUrl,
                previewUrl: cachedAssets.cachedPreviewUrl,
                thumbnailStorageUploadId: cachedAssets.thumbnailStorageUploadId,
                previewStorageUploadId: cachedAssets.previewStorageUploadId,
                thumbnailCachedAt: cachedAssets.thumbnailCachedAt,
                previewCachedAt: cachedAssets.previewCachedAt,
                assetHashes: snapshot.assetHashes,
                rawPayload: snapshot.rawPayload,
                syncedAt: new Date(),
              };
            },
          ),
        );
      },
    );

    const flattenedCreativeSnapshots = creativeSnapshotGroups.flat();
    const creativeSnapshotByAdId = new Map(
      flattenedCreativeSnapshots.map((snapshot) => [snapshot.adId, snapshot] as const),
    );
    const persistedCreativeSnapshots = await storage.upsertMetaAdCreativeSnapshots(
      flattenedCreativeSnapshots,
    );
    summary.persisted.creativeSnapshots += persistedCreativeSnapshots.length;

    const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign] as const));

    for (const missingRange of missingRanges) {
      const [campaignRows, adsetRows, adInsightGroups] = await Promise.all([
        client.fetchCampaignInsights(account.value, {
          since: missingRange.startDate,
          until: missingRange.endDate,
        }, { timeIncrement: 1 }),
        client.fetchAdsetInsights(account.value, {
          since: missingRange.startDate,
          until: missingRange.endDate,
        }, { timeIncrement: 1 }),
        mapWithConcurrency(
          campaigns.filter((campaign) => campaign.id),
          CREATIVE_SYNC_CONCURRENCY,
          async (campaign) =>
            client.fetchCampaignAdInsightsDaily(account.value, campaign.id, {
              since: missingRange.startDate,
              until: missingRange.endDate,
            }),
        ),
      ]);

      const campaignInserts: Array<InsertMetaCampaignInsightsDaily & { tenantId: number }> =
        campaignRows
          .filter((row) => row.campaign_id && row.date_start)
          .map((row) => {
            const campaign = campaignMap.get(row.campaign_id);

            return {
              tenantId,
              accountResourceId: account.id,
              adAccountId: account.value,
              campaignId: row.campaign_id,
              date: row.date_start!,
              campaignName: row.campaign_name ?? campaign?.name ?? null,
              objective: campaign?.objective ?? null,
              status: campaign?.status ?? null,
              spend: parseNumber(row.spend).toFixed(2),
              impressions: Math.round(parseNumber(row.impressions)),
              clicks: Math.round(parseNumber(row.clicks)),
              reach: Math.round(parseNumber(row.reach)),
              actions: serializeActionEntries(row.actions),
              costPerActionType: serializeActionEntries(row.cost_per_action_type),
              syncedAt: new Date(),
            };
          });

      const adsetInserts: Array<InsertMetaAdsetInsightsDaily & { tenantId: number }> = adsetRows
        .filter((row) => row.campaign_id && row.adset_id && row.date_start)
        .map((row) => ({
          tenantId,
          accountResourceId: account.id,
          adAccountId: account.value,
          campaignId: row.campaign_id,
          adsetId: row.adset_id,
          date: row.date_start!,
          campaignName: row.campaign_name ?? null,
          adsetName: row.adset_name ?? null,
          optimizationGoal: row.optimization_goal ?? null,
          spend: parseNumber(row.spend).toFixed(2),
          impressions: Math.round(parseNumber(row.impressions)),
          clicks: Math.round(parseNumber(row.clicks)),
          reach: Math.round(parseNumber(row.reach)),
          actions: serializeActionEntries(row.actions),
          costPerActionType: serializeActionEntries(row.cost_per_action_type),
          syncedAt: new Date(),
        }));

      const adInserts: Array<InsertMetaAdInsightsDaily & { tenantId: number }> = adInsightGroups
        .flat()
        .filter((row) => row.ad_id && row.date_start)
        .map((row) => ({
          tenantId,
          accountResourceId: account.id,
          adAccountId: account.value,
          campaignId: creativeSnapshotByAdId.get(row.ad_id!)?.campaignId ?? "",
          adId: row.ad_id!,
          date: row.date_start!,
          adName: row.ad_name ?? null,
          adStatus: creativeSnapshotByAdId.get(row.ad_id!)?.adStatus ?? null,
          creativeId: creativeSnapshotByAdId.get(row.ad_id!)?.creativeId ?? null,
          spend: parseNumber(row.spend).toFixed(2),
          impressions: Math.round(parseNumber(row.impressions)),
          clicks: Math.round(parseNumber(row.clicks)),
          ctr: formatNumericMetric(row.ctr ? Number(row.ctr) / 100 : null),
          frequency: formatNumericMetric(row.frequency ? Number(row.frequency) : null),
          actions: serializeActionEntries(row.actions),
          costPerActionType: serializeActionEntries(row.cost_per_action_type),
          syncedAt: new Date(),
        }))
        .filter((row) => row.campaignId.length > 0);

      const [savedCampaignRows, savedAdsetRows, savedAdRows, savedCoverageRows] = await Promise.all([
        storage.upsertMetaCampaignInsightsDaily(campaignInserts),
        storage.upsertMetaAdsetInsightsDaily(adsetInserts),
        storage.upsertMetaAdInsightsDaily(adInserts),
        storage.upsertMetaSyncCoverageDays(
          buildCoverageRows({
            tenantId,
            account,
            startDate: missingRange.startDate,
            endDate: missingRange.endDate,
            lastSyncedAt: new Date(),
          }),
        ),
      ]);

      summary.persisted.campaignRows += savedCampaignRows.length;
      summary.persisted.adsetRows += savedAdsetRows.length;
      summary.persisted.adRows += savedAdRows.length;
      summary.persisted.coverageRows += savedCoverageRows.length;
    }
  }

  return summary;
}
