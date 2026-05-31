import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type {
  MetaAccountSnapshot,
  MetaAdsetSnapshot,
  MetaCampaignSnapshot,
  MetaDestinationSnapshot,
  Resource,
  StorageTask,
  StorageTaskDistributionAdsetRecord,
  StorageTaskDistributionCampaignRecord,
  StorageTaskDistributionRecord,
  StorageTaskPairRecord,
  User,
} from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { createRateLimit } from "../../middlewares/rate-limit";
import { storage } from "../storage";
import { createSignedGcsReadUrl, downloadObjectFromGcs } from "../gcs/service";
import { MetaGraphClient } from "../meta/client";
import { getMetaAccess } from "../meta/services/access.service";
import { resolveMetaAppSecret } from "../meta/utils/app-config";
import { getPublicAppUrl } from "../../utils/url";

const updatePairsSchema = z.object({
  pairs: z.array(
    z.object({
      feedUploadId: z.number().int().positive().nullable(),
      storiesUploadId: z.number().int().positive().nullable(),
      title: z.string().max(160).nullable(),
      text: z.string().max(4000).nullable(),
    }),
  ),
});

const distributionCampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  objective: z.string().nullable(),
  status: z.string().nullable(),
  buyingType: z.string().nullable(),
  configuredStatus: z.string().nullable(),
  effectiveStatus: z.string().nullable(),
  budget: z.string().nullable(),
  updatedTime: z.string().nullable(),
  specialAdCategories: z.array(z.string()),
});

const distributionAdsetSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  status: z.string().nullable(),
  configuredStatus: z.string().nullable(),
  effectiveStatus: z.string().nullable(),
  optimizationGoal: z.string().nullable(),
  billingEvent: z.string().nullable(),
  bidStrategy: z.string().nullable(),
  destination: z.object({
    type: z.string().min(1),
    pageId: z.string().nullable(),
    instagramUserId: z.string().nullable(),
    leadgenFormId: z.string().nullable(),
    whatsappNumber: z.string().nullable(),
  }),
});

const distributionPairAssignmentSchema = z.object({
  pairId: z.string().min(1),
  useCampaignDefault: z.boolean().default(true),
  leadgenFormId: z.string().nullable(),
  leadgenFormName: z.string().nullable(),
});

const distributionDestinationSchema = z.object({
  resourceId: z.number().int().positive(),
  adAccountId: z.string().min(1),
  adAccountName: z.string().min(1),
  connectionStatus: z.string().min(1),
  campaign: distributionCampaignSchema,
  adsets: z.array(distributionAdsetSchema),
  applyToAllAdsets: z.boolean(),
  selectedAdsetIds: z.array(z.string().min(1)),
  pairIds: z.array(z.string().min(1)),
  campaignLeadgenFormId: z.string().nullable().default(null),
  campaignLeadgenFormName: z.string().nullable().default(null),
  pairAssignments: z.array(distributionPairAssignmentSchema).default([]),
  createAdsStatus: z.union([z.literal("PAUSED"), z.literal("ACTIVE")]),
});

const distributionSchema = z.object({
  destinations: z.array(distributionDestinationSchema),
});

export const publicTasksRouter = Router();
export const tasksRouter = Router();

const TASK_IDLE_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.TASK_CONFIGURATION_IDLE_TIMEOUT_MS ?? "120000", 10),
);
const THUMBNAIL_CACHE_MAX_BYTES = Math.max(
  0,
  Number.parseInt(process.env.THUMBNAIL_MEMORY_CACHE_MAX_BYTES ?? `${64 * 1024 * 1024}`, 10),
);
const THUMBNAIL_BROWSER_CACHE_SECONDS = Math.max(
  300,
  Number.parseInt(process.env.THUMBNAIL_BROWSER_CACHE_SECONDS ?? "86400", 10),
);
const THUMBNAIL_SIGNED_URL_SECONDS = Math.min(
  604800,
  Math.max(60, Number.parseInt(process.env.THUMBNAIL_SIGNED_URL_SECONDS ?? "3600", 10)),
);
const THUMBNAIL_DIRECT_GCS_REDIRECT = process.env.THUMBNAIL_DIRECT_GCS_REDIRECT !== "false";

type ThumbnailCacheEntry = {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
  lastUsedAt: number;
};

const thumbnailMemoryCache = new Map<string, ThumbnailCacheEntry>();
const pendingThumbnailDownloads = new Map<string, Promise<{ buffer: Buffer; contentType: string }>>();
let thumbnailMemoryCacheBytes = 0;

const publicTaskAssetRateLimit = createRateLimit({
  name: "public-task-assets",
  windowMs: 60 * 1000,
  max: 120,
  message: "Muitas requisicoes para assets publicos. Tente novamente em instantes.",
  keyGenerator: (req) => {
    const token =
      typeof req.params.token === "string" && req.params.token.trim().length > 0
        ? req.params.token.trim()
        : "unknown-token";
    return `${req.ip}:${token}`;
  },
});

type UploadRecord = {
  id: number;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  objectPath: string;
  createdAt: Date;
  bucketName: string;
};

type TaskPairView = {
  pairId: string;
  position: number;
  title: string | null;
  text: string | null;
  feedUploadId: number;
  storiesUploadId: number;
  feedOriginalFileName: string;
  storyOriginalFileName: string;
  feedAssetId: string;
  storyAssetId: string;
  feedObjectPath: string;
  storyObjectPath: string;
  feedBucketName: string;
  storyBucketName: string;
  feedMimeType: string;
  storyMimeType: string;
  feedThumbnailUrl: string | null;
  storyThumbnailUrl: string | null;
};

type TaskAssetTokenClaims = {
  taskId: number;
  uploadId: number;
  exp: number;
};

function getTaskAssetTokenSecret() {
  return (
    process.env.TASK_ASSET_TOKEN_SECRET ??
    process.env.PUBLIC_TASK_LINK_SECRET ??
    process.env.SESSION_SECRET ??
    "autoads-task-asset-secret"
  );
}

function signTaskAssetToken(encodedPayload: string) {
  return crypto.createHmac("sha256", getTaskAssetTokenSecret()).update(encodedPayload).digest("base64url");
}

function createTaskAssetToken(claims: TaskAssetTokenClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signTaskAssetToken(payload)}`;
}

function verifyTaskAssetToken(token: string): TaskAssetTokenClaims {
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) {
    throw new Error("Token invalido.");
  }

  const expectedSignature = signTaskAssetToken(payload);
  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))
  ) {
    throw new Error("Assinatura invalida.");
  }

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TaskAssetTokenClaims;
  if (!claims?.taskId || !claims?.uploadId || !claims?.exp) {
    throw new Error("Token invalido.");
  }
  if (claims.exp <= Date.now()) {
    throw new Error("Token expirado.");
  }

  return claims;
}

function buildTaskAssetDownloadUrl(req: Parameters<typeof getPublicAppUrl>[0], taskId: number, uploadId: number) {
  const ttlHoursRaw = Number.parseInt(process.env.TASK_ASSET_TOKEN_TTL_HOURS ?? "24", 10);
  const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 24;
  const token = createTaskAssetToken({
    taskId,
    uploadId,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  });
  return `${getPublicAppUrl(req).replace(/\/$/, "")}/api/public/task-assets/${encodeURIComponent(token)}`;
}

function getThumbnailCacheKey(upload: UploadRecord) {
  return `${upload.bucketName}:${upload.objectPath}`;
}

function buildThumbnailEtag(upload: UploadRecord) {
  const fingerprint = [
    upload.bucketName,
    upload.objectPath,
    upload.sizeBytes,
    upload.contentType,
    upload.createdAt.getTime(),
  ].join(":");
  return `"thumb-${crypto.createHash("sha256").update(fingerprint).digest("base64url")}"`;
}

function requestHasMatchingEtag(req: Request, etag: string) {
  const header = req.headers["if-none-match"];
  if (!header) {
    return false;
  }

  const values = Array.isArray(header) ? header : header.split(",");
  return values.some((value) => value.trim() === etag || value.trim() === "*");
}

function setThumbnailResponseHeaders(res: Response, etag: string) {
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `private, max-age=${THUMBNAIL_BROWSER_CACHE_SECONDS}, immutable`);
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function pruneThumbnailMemoryCache() {
  if (THUMBNAIL_CACHE_MAX_BYTES <= 0) {
    thumbnailMemoryCache.clear();
    thumbnailMemoryCacheBytes = 0;
    return;
  }

  if (thumbnailMemoryCacheBytes <= THUMBNAIL_CACHE_MAX_BYTES) {
    return;
  }

  const oldestEntries = Array.from(thumbnailMemoryCache.entries()).sort(
    (a, b) => a[1].lastUsedAt - b[1].lastUsedAt,
  );
  for (const [key, entry] of oldestEntries) {
    thumbnailMemoryCache.delete(key);
    thumbnailMemoryCacheBytes -= entry.sizeBytes;
    if (thumbnailMemoryCacheBytes <= THUMBNAIL_CACHE_MAX_BYTES) {
      return;
    }
  }
}

function rememberThumbnailFile(key: string, file: { buffer: Buffer; contentType: string }) {
  const sizeBytes = file.buffer.byteLength;
  if (THUMBNAIL_CACHE_MAX_BYTES <= 0 || sizeBytes > THUMBNAIL_CACHE_MAX_BYTES) {
    return;
  }

  const existing = thumbnailMemoryCache.get(key);
  if (existing) {
    thumbnailMemoryCacheBytes -= existing.sizeBytes;
  }

  thumbnailMemoryCache.set(key, {
    buffer: file.buffer,
    contentType: file.contentType,
    sizeBytes,
    lastUsedAt: Date.now(),
  });
  thumbnailMemoryCacheBytes += sizeBytes;
  pruneThumbnailMemoryCache();
}

async function loadThumbnailFile(upload: UploadRecord) {
  const key = getThumbnailCacheKey(upload);
  const cached = thumbnailMemoryCache.get(key);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  const pending = pendingThumbnailDownloads.get(key);
  if (pending) {
    return pending;
  }

  const download = downloadObjectFromGcs({
    bucketName: upload.bucketName,
    objectPath: upload.objectPath,
  }).then((file) => {
    rememberThumbnailFile(key, file);
    return file;
  });

  pendingThumbnailDownloads.set(key, download);
  try {
    return await download;
  } finally {
    pendingThumbnailDownloads.delete(key);
  }
}

function isTerminalTaskStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase() ?? "";
  return normalized === "completed" || normalized === "success" || normalized === "error" || normalized === "failed";
}

function normalizeCallbackTaskStatus(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (["completed", "success", "ok", "active"].includes(normalized)) {
    return "completed";
  }
  if (["error", "failed", "failure"].includes(normalized)) {
    return "error";
  }
  if (["publishing", "pending", "processing", "running"].includes(normalized)) {
    return "publishing";
  }
  return normalized || "publishing";
}

function parseTaskIdentifier(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^task[_-]?(\d+)$/i) ?? raw.match(/^(\d+)$/);
  if (!match) {
    return null;
  }
  const taskId = Number.parseInt(match[1], 10);
  return Number.isFinite(taskId) && taskId > 0 ? taskId : null;
}

function getTaskConfigurationDeltaSeconds(task: StorageTask, now: Date) {
  if (isTerminalTaskStatus(task.status) || task.status === "publishing" || !task.lastActivityAt) {
    return 0;
  }

  const elapsedMs = now.getTime() - task.lastActivityAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }

  return Math.floor(Math.min(elapsedMs, TASK_IDLE_TIMEOUT_MS) / 1000);
}

function getTaskElapsedSeconds(task: StorageTask, now = new Date()) {
  const configurationElapsedSeconds =
    Math.max(0, task.configurationElapsedSeconds ?? 0) + getTaskConfigurationDeltaSeconds(task, now);
  const automationStartedAt = task.automationStartedAt?.getTime();
  const automationFinishedAt = task.automationFinishedAt?.getTime();
  const automationElapsedSeconds =
    typeof automationStartedAt === "number" && Number.isFinite(automationStartedAt)
      ? Math.max(0, Math.floor(((automationFinishedAt ?? now.getTime()) - automationStartedAt) / 1000))
      : 0;

  return {
    configurationElapsedSeconds,
    automationElapsedSeconds,
    totalElapsedSeconds: configurationElapsedSeconds + automationElapsedSeconds,
  };
}

async function touchTaskConfigurationActivity(task: StorageTask, tenantId: number) {
  if (task.status === "publishing" || isTerminalTaskStatus(task.status)) {
    return task;
  }

  const now = new Date();
  const configurationElapsedSeconds =
    Math.max(0, task.configurationElapsedSeconds ?? 0) + getTaskConfigurationDeltaSeconds(task, now);

  return (
    (await storage.updateStorageTask(
      task.id,
      {
        status: "configuring",
        configurationElapsedSeconds,
        lastActivityAt: now,
      },
      tenantId,
    )) ?? task
  );
}

async function startTaskPublishing(task: StorageTask, tenantId: number) {
  const now = new Date();
  const configurationElapsedSeconds =
    Math.max(0, task.configurationElapsedSeconds ?? 0) + getTaskConfigurationDeltaSeconds(task, now);

  return storage.updateStorageTask(
    task.id,
    {
      status: "publishing",
      configurationElapsedSeconds,
      lastActivityAt: null,
      automationStartedAt: now,
      automationFinishedAt: null,
    },
    tenantId,
  );
}

async function loadTaskContext(taskId: number, tenantId: number) {
  const task = await storage.getStorageTask(taskId);
  if (!task || task.tenantId !== tenantId) {
    return null;
  }

  const [taskUploads, uploads, links] = await Promise.all([
    storage.getStorageTaskUploads(task.id),
    storage.getStorageUploadsByTenant(tenantId),
    storage.getStorageUploadLinksByTenant(tenantId),
  ]);

  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
  const linkById = new Map(links.map((link) => [link.id, link]));
  const taskUploadIds =
    taskUploads.length > 0 ? taskUploads.map((entry) => entry.storageUploadId) : [task.storageUploadId];
  const orderedUploads = taskUploadIds
    .map((storageUploadId) => uploadById.get(storageUploadId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    task,
    uploads: orderedUploads,
    uploadLink: task.uploadLinkId ? linkById.get(task.uploadLinkId) ?? null : null,
  };
}

function buildUploadPayload(taskId: number, upload: UploadRecord) {
  return {
    id: upload.id,
    originalFileName: upload.originalFileName,
    contentType: upload.contentType,
    sizeBytes: upload.sizeBytes,
    objectPath: upload.objectPath,
    createdAt: upload.createdAt,
    thumbnailUrl: upload.contentType.startsWith("image/")
      ? `/api/tasks/${taskId}/uploads/${upload.id}/thumbnail`
      : null,
  };
}

publicTasksRouter.get("/task-assets/:token", publicTaskAssetRateLimit, async (req, res, next) => {
  try {
    const token = typeof req.params.token === "string" ? req.params.token : "";
    const claims = verifyTaskAssetToken(token);
    const task = await storage.getStorageTask(claims.taskId);
    if (!task) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const [taskUploads, uploads] = await Promise.all([
      storage.getStorageTaskUploads(task.id),
      storage.getStorageUploadsByTenant(task.tenantId),
    ]);
    const taskUploadIds =
      taskUploads.length > 0 ? taskUploads.map((entry) => entry.storageUploadId) : [task.storageUploadId];
    const upload = uploads.find((item) => item.id === claims.uploadId && taskUploadIds.includes(item.id));
    if (!upload) {
      return res.status(404).json({ message: "Asset nao encontrado." });
    }

    const file = await downloadObjectFromGcs({
      bucketName: upload.bucketName,
      objectPath: upload.objectPath,
    });

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(upload.originalFileName)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});

tasksRouter.use(isAuthenticated);

function normalizePairId(position: number) {
  return `pair_${String(position + 1).padStart(2, "0")}`;
}

function buildTaskPairViews(taskId: number, rawPairs: StorageTaskPairRecord[], uploads: UploadRecord[]) {
  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));

  return rawPairs
    .map((pair, position): TaskPairView | null => {
      if (pair.feedUploadId === null || pair.storiesUploadId === null) {
        return null;
      }

      const feedUpload = uploadById.get(pair.feedUploadId);
      const storiesUpload = uploadById.get(pair.storiesUploadId);
      if (!feedUpload || !storiesUpload) {
        return null;
      }

      return {
        pairId: normalizePairId(position),
        position,
        title: pair.title ?? null,
        text: pair.text ?? null,
        feedUploadId: feedUpload.id,
        storiesUploadId: storiesUpload.id,
        feedOriginalFileName: feedUpload.originalFileName,
        storyOriginalFileName: storiesUpload.originalFileName,
        feedAssetId: `asset_feed_${String(position + 1).padStart(2, "0")}`,
        storyAssetId: `asset_story_${String(position + 1).padStart(2, "0")}`,
        feedObjectPath: feedUpload.objectPath,
        storyObjectPath: storiesUpload.objectPath,
        feedBucketName: feedUpload.bucketName,
        storyBucketName: storiesUpload.bucketName,
        feedMimeType: feedUpload.contentType,
        storyMimeType: storiesUpload.contentType,
        feedThumbnailUrl: feedUpload.contentType.startsWith("image/")
          ? `/api/tasks/${taskId}/uploads/${feedUpload.id}/thumbnail`
          : null,
        storyThumbnailUrl: storiesUpload.contentType.startsWith("image/")
          ? `/api/tasks/${taskId}/uploads/${storiesUpload.id}/thumbnail`
          : null,
      };
    })
    .filter((pair): pair is TaskPairView => Boolean(pair));
}

function sanitizeDistribution(
  distribution: StorageTaskDistributionRecord | null | undefined,
  pairViews: TaskPairView[],
) {
  const availablePairIds = new Set(pairViews.map((pair) => pair.pairId));
  const legacyGlobalPairIds =
    Array.isArray((distribution as { selectedPairIds?: string[] } | null | undefined)?.selectedPairIds)
      ? ((distribution as { selectedPairIds?: string[] }).selectedPairIds ?? []).filter((pairId) =>
          availablePairIds.has(pairId),
        )
      : pairViews.map((pair) => pair.pairId);

  const destinations = Array.isArray(distribution?.destinations)
    ? distribution.destinations
        .map((destination) => {
          const adsetIds = new Set(destination.adsets.map((adset) => adset.id));
          const legacyManualPairIds = Array.isArray(
            (destination as { selectedPairIds?: string[] }).selectedPairIds,
          )
            ? ((destination as { selectedPairIds?: string[] }).selectedPairIds ?? []).filter((pairId) =>
                availablePairIds.has(pairId),
              )
            : [];
          const legacyMode = (destination as { pairSelectionMode?: string }).pairSelectionMode;
          const nextPairIds = Array.isArray((destination as { pairIds?: string[] }).pairIds)
            ? ((destination as { pairIds?: string[] }).pairIds ?? []).filter((pairId) =>
                availablePairIds.has(pairId),
              )
            : legacyMode === "manual"
              ? legacyManualPairIds
              : legacyGlobalPairIds;
          const pairAssignments = normalizePairAssignments(
            nextPairIds,
            Array.isArray(
              (destination as {
                pairAssignments?: Array<{
                  pairId: string;
                  useCampaignDefault?: boolean;
                  leadgenFormId?: string | null;
                  leadgenFormName?: string | null;
                }>;
              })
                .pairAssignments,
            )
              ? ((destination as {
                  pairAssignments?: Array<{
                    pairId: string;
                    useCampaignDefault?: boolean;
                    leadgenFormId?: string | null;
                    leadgenFormName?: string | null;
                  }>;
                }).pairAssignments ?? [])
              : [],
          );

        return {
          ...destination,
          selectedAdsetIds: destination.selectedAdsetIds.filter((adsetId) => adsetIds.has(adsetId)),
          adsets: destination.adsets.map((adset) => ({
            ...adset,
            destination: {
              type:
                (adset as { destination?: { type?: string } }).destination?.type ??
                inferDestinationType(destination.campaign.objective),
              pageId:
                (adset as { destination?: { pageId?: string | null } }).destination?.pageId ?? null,
              instagramUserId:
                (adset as { destination?: { instagramUserId?: string | null } }).destination
                  ?.instagramUserId ?? null,
              leadgenFormId:
                (adset as { destination?: { leadgenFormId?: string | null } }).destination
                  ?.leadgenFormId ?? null,
              whatsappNumber:
                (adset as { destination?: { whatsappNumber?: string | null } }).destination
                  ?.whatsappNumber ?? null,
            },
          })),
          pairIds: Array.from(new Set(nextPairIds)),
          campaignLeadgenFormId:
            (destination as { campaignLeadgenFormId?: string | null }).campaignLeadgenFormId ?? null,
          campaignLeadgenFormName:
            (destination as { campaignLeadgenFormName?: string | null }).campaignLeadgenFormName ?? null,
          pairAssignments,
        };
      })
        .filter((destination) => destination.campaign.id.trim().length > 0)
    : [];

  return {
    destinations,
  } satisfies StorageTaskDistributionRecord;
}

function normalizePairAssignments(
  pairIds: string[],
  pairAssignments: Array<{
    pairId: string;
    useCampaignDefault?: boolean;
    leadgenFormId?: string | null;
    leadgenFormName?: string | null;
  }>,
) {
  const uniquePairIds = Array.from(new Set(pairIds));
  const assignmentByPairId = new Map<
    string,
    {
      pairId: string;
      useCampaignDefault: boolean;
      leadgenFormId: string | null;
      leadgenFormName: string | null;
    }
  >();

  pairAssignments.forEach((assignment) => {
    if (!uniquePairIds.includes(assignment.pairId)) {
      return;
    }
    assignmentByPairId.set(assignment.pairId, {
      pairId: assignment.pairId,
      useCampaignDefault: assignment.useCampaignDefault ?? assignment.leadgenFormId == null,
      leadgenFormId: assignment.leadgenFormId ?? null,
      leadgenFormName: assignment.leadgenFormName ?? null,
    });
  });

  return uniquePairIds.map((pairId) => {
    return (
      assignmentByPairId.get(pairId) ?? {
        pairId,
        useCampaignDefault: true,
        leadgenFormId: null,
        leadgenFormName: null,
      }
    );
  });
}

function buildCampaignBudget(campaign: {
  daily_budget?: string;
  lifetime_budget?: string;
}) {
  return campaign.daily_budget ?? campaign.lifetime_budget ?? null;
}

function mapCampaignSnapshot(campaign: {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  buying_type?: string;
  configured_status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  updated_time?: string;
  special_ad_categories?: string[];
}): StorageTaskDistributionCampaignRecord {
  return {
    id: campaign.id,
    name: campaign.name ?? null,
    objective: campaign.objective ?? null,
    status: campaign.status ?? null,
    buyingType: campaign.buying_type ?? null,
    configuredStatus: campaign.configured_status ?? null,
    effectiveStatus: campaign.effective_status ?? null,
    budget: buildCampaignBudget(campaign),
    updatedTime: campaign.updated_time ?? null,
    specialAdCategories: Array.isArray(campaign.special_ad_categories)
      ? campaign.special_ad_categories.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function mapAdsetSnapshot(adset: {
  id: string;
  name?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
}, defaults?: {
  type?: string | null;
  pageId?: string | null;
  instagramUserId?: string | null;
  leadgenFormId?: string | null;
  whatsappNumber?: string | null;
}): StorageTaskDistributionAdsetRecord {
  return {
    id: adset.id,
    name: adset.name ?? null,
    status: adset.status ?? null,
    configuredStatus: adset.configured_status ?? null,
    effectiveStatus: adset.effective_status ?? null,
    optimizationGoal: adset.optimization_goal ?? null,
    billingEvent: adset.billing_event ?? null,
    bidStrategy: adset.bid_strategy ?? null,
    destination: {
      type: defaults?.type ?? "WEBSITE",
      pageId: defaults?.pageId ?? null,
      instagramUserId: defaults?.instagramUserId ?? null,
      leadgenFormId: defaults?.leadgenFormId ?? null,
      whatsappNumber: defaults?.whatsappNumber ?? null,
    },
  };
}

function mapCampaignSnapshotRecord(snapshot: MetaCampaignSnapshot): StorageTaskDistributionCampaignRecord {
  return {
    id: snapshot.campaignId,
    name: snapshot.name ?? null,
    objective: snapshot.objective ?? null,
    status: snapshot.status ?? null,
    buyingType: snapshot.buyingType ?? null,
    configuredStatus: snapshot.configuredStatus ?? null,
    effectiveStatus: snapshot.effectiveStatus ?? null,
    budget: buildCampaignBudget({
      daily_budget: snapshot.dailyBudget ?? undefined,
      lifetime_budget: snapshot.lifetimeBudget ?? undefined,
    }),
    updatedTime: snapshot.updatedTime ?? null,
    specialAdCategories: Array.isArray(snapshot.specialAdCategories)
      ? snapshot.specialAdCategories.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function mapAdsetSnapshotRecord(
  snapshot: MetaAdsetSnapshot,
  defaults?: {
    type?: string | null;
    pageId?: string | null;
    instagramUserId?: string | null;
    leadgenFormId?: string | null;
    whatsappNumber?: string | null;
  },
): StorageTaskDistributionAdsetRecord {
  return mapAdsetSnapshot(
    {
      id: snapshot.adsetId,
      name: snapshot.name ?? undefined,
      status: snapshot.status ?? undefined,
      configured_status: snapshot.configuredStatus ?? undefined,
      effective_status: snapshot.effectiveStatus ?? undefined,
      optimization_goal: snapshot.optimizationGoal ?? undefined,
      billing_event: snapshot.billingEvent ?? undefined,
      bid_strategy: snapshot.bidStrategy ?? undefined,
    },
    defaults,
  );
}

function toRawAdsetFromSnapshot(snapshot: MetaAdsetSnapshot): RawMetaAdsetRecord {
  return {
    id: snapshot.adsetId,
    campaign_id: snapshot.campaignId,
    name: snapshot.name ?? undefined,
    status: snapshot.status ?? undefined,
    configured_status: snapshot.configuredStatus ?? undefined,
    effective_status: snapshot.effectiveStatus ?? undefined,
    optimization_goal: snapshot.optimizationGoal ?? undefined,
    billing_event: snapshot.billingEvent ?? undefined,
    bid_strategy: snapshot.bidStrategy ?? undefined,
    updated_time: snapshot.updatedTime ?? undefined,
    promoted_object: snapshot.promotedObject ?? undefined,
  };
}

function isActiveCampaign(campaign: {
  status?: string;
  configured_status?: string;
  effective_status?: string;
}) {
  const statuses = [campaign.status, campaign.configured_status, campaign.effective_status]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((status) => status.toUpperCase());

  if (statuses.length === 0) {
    return true;
  }

  return statuses.includes("ACTIVE");
}

async function buildMetaClient(tenantId: number) {
  const metaAccess = await getMetaAccess(tenantId);
  if (!metaAccess) {
    return null;
  }

  const settings = await storage.getAppSettings();
  const metaAppSecret = resolveMetaAppSecret(settings);
  if (!metaAppSecret) {
    return null;
  }

  return new MetaGraphClient(metaAccess.accessToken, metaAppSecret);
}

async function getStoredMetaStructure(tenantId: number, adAccountId: string) {
  const accountSnapshot = await storage.getMetaAccountSnapshot(tenantId, adAccountId);
  if (!accountSnapshot) {
    return null;
  }

  const [campaignSnapshots, adsetSnapshots] = await Promise.all([
    storage.getMetaCampaignSnapshotsByAccount(tenantId, adAccountId),
    storage.getMetaAdsetSnapshotsByAccount(tenantId, adAccountId),
  ]);

  return {
    account: accountSnapshot,
    campaigns: campaignSnapshots,
    adsets: adsetSnapshots,
  };
}

async function getFreshStoredMetaStructure(tenantId: number, adAccountId: string) {
  const stored = await getStoredMetaStructure(tenantId, adAccountId);
  if (
    !stored ||
    !isSnapshotFresh(stored.account) ||
    !areSnapshotsFresh(stored.campaigns) ||
    !areSnapshotsFresh(stored.adsets)
  ) {
    return null;
  }

  setMemoryMetaStructure(stored);

  return {
    ...stored,
    source: "db" as const,
  };
}

async function syncMetaAccountStructure(input: {
  tenantId: number;
  account: Resource;
  client: MetaGraphClient;
}) {
  const [rawCampaigns, rawAdsets] = await Promise.all([
    input.client.fetchCampaigns(input.account.value),
    input.client.fetchAdsets(input.account.value),
  ]);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + getMetaStructureSnapshotTtlMs());

  const [accountSnapshot, campaignSnapshots, adsetSnapshots] = await Promise.all([
    storage.upsertMetaAccountSnapshot({
      tenantId: input.tenantId,
      resourceId: input.account.id,
      adAccountId: input.account.value,
      accountName: input.account.name,
      connectionStatus: "connected",
      syncedAt: now,
      expiresAt,
    }),
    storage.replaceMetaCampaignSnapshotsByAccount(
      input.tenantId,
      input.account.value,
      rawCampaigns.map((campaign) => ({
        tenantId: input.tenantId,
        adAccountId: input.account.value,
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
        specialAdCategories: Array.isArray(campaign.special_ad_categories)
          ? campaign.special_ad_categories.filter((item): item is string => typeof item === "string")
          : [],
        syncedAt: now,
        expiresAt,
      })),
    ),
    storage.replaceMetaAdsetSnapshotsByAccount(
      input.tenantId,
      input.account.value,
      rawAdsets
        .filter((adset) => typeof adset.campaign_id === "string" && adset.campaign_id.length > 0)
        .map((adset) => ({
          tenantId: input.tenantId,
          adAccountId: input.account.value,
          campaignId: adset.campaign_id as string,
          adsetId: adset.id,
          name: adset.name ?? null,
          status: adset.status ?? null,
          configuredStatus: adset.configured_status ?? null,
          effectiveStatus: adset.effective_status ?? null,
          optimizationGoal: adset.optimization_goal ?? null,
          billingEvent: adset.billing_event ?? null,
          bidStrategy: adset.bid_strategy ?? null,
          updatedTime: adset.updated_time ?? null,
          promotedObject: asRecord(adset.promoted_object),
          syncedAt: now,
          expiresAt,
        })),
    ),
  ]);

  setMemoryMetaStructure({
    account: accountSnapshot,
    campaigns: campaignSnapshots,
    adsets: adsetSnapshots,
  });

  return {
    account: accountSnapshot,
    campaigns: campaignSnapshots,
    adsets: adsetSnapshots,
    source: "meta" as const,
  };
}

async function getMetaAccountStructure(input: {
  tenantId: number;
  account: Resource;
  client?: MetaGraphClient | null;
}) {
  const memory = getFreshMemoryMetaStructure(input.tenantId, input.account.value);
  if (memory) {
    return {
      account: memory.account,
      campaigns: memory.campaigns,
      adsets: memory.adsets,
      source: "memory" as const,
    };
  }

  const stored = await getStoredMetaStructure(input.tenantId, input.account.value);
  if (
    stored &&
    isSnapshotFresh(stored.account) &&
    areSnapshotsFresh(stored.campaigns) &&
    areSnapshotsFresh(stored.adsets)
  ) {
    setMemoryMetaStructure(stored);
    return {
      ...stored,
      source: "db" as const,
    };
  }

  if (!input.client) {
    return stored
      ? {
          ...stored,
          source: "db_stale" as const,
        }
      : null;
  }

  try {
    return await syncMetaAccountStructure({
      tenantId: input.tenantId,
      account: input.account,
      client: input.client,
    });
  } catch {
    return stored
      ? {
          ...stored,
          source: "db_stale" as const,
        }
      : null;
  }
}

function slugifyClientId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "tenant";
}

function encodeObjectPath(objectPath: string) {
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildGcsFileUrl(bucketName: string, objectPath: string) {
  return `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodeObjectPath(objectPath)}`;
}

function buildPairAssetPayload(
  req: Parameters<typeof getPublicAppUrl>[0],
  input: {
    taskId: number;
    uploadId: number;
    assetId: string;
    role: "feed" | "story";
    fileName: string;
    bucketName: string;
    objectPath: string;
    mimeType: string;
  },
) {
  const downloadUrl = buildTaskAssetDownloadUrl(req, input.taskId, input.uploadId);
  return {
    asset_id: input.assetId,
    asset_role: input.role,
    file_name: input.fileName,
    file_url: downloadUrl,
    storage_url: buildGcsFileUrl(input.bucketName, input.objectPath),
    mime_type: input.mimeType,
    bucket_name: input.bucketName,
    object_path: input.objectPath,
    upload_to_meta: {
      source_url: downloadUrl,
      expected_hash_field: input.role === "feed" ? "feed_image_hash" : "story_image_hash",
    },
  };
}

function inferDestinationType(objective: string | null) {
  const upper = (objective ?? "").toUpperCase();
  if (upper.includes("LEAD")) {
    return "LEAD_FORM";
  }
  if (upper.includes("WHATSAPP") || upper.includes("MESSAGE")) {
    return "WHATSAPP";
  }
  return "WEBSITE";
}

type DestinationDefaults = {
  pageId: string | null;
  instagramUserId: string | null;
  leadgenFormId: string | null;
  whatsappNumber: string | null;
};

type DestinationSnapshotCacheEntry = {
  snapshot: MetaDestinationSnapshot;
  expiresAtMs: number;
};

const destinationSnapshotMemoryCache = new Map<string, DestinationSnapshotCacheEntry>();
type MetaAccountStructureCacheEntry = {
  account: MetaAccountSnapshot;
  campaigns: MetaCampaignSnapshot[];
  adsets: MetaAdsetSnapshot[];
  expiresAtMs: number;
};

type RawMetaAdsetRecord = {
  id: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  configured_status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  updated_time?: string;
  promoted_object?: unknown;
};

const metaAccountStructureMemoryCache = new Map<string, MetaAccountStructureCacheEntry>();

function getMetaStructureSnapshotTtlMs() {
  const ttlHoursRaw = Number.parseInt(process.env.META_STRUCTURE_SNAPSHOT_TTL_HOURS ?? "6", 10);
  const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 6;
  return ttlHours * 60 * 60 * 1000;
}

function getDestinationSnapshotTtlMs() {
  const ttlHoursRaw = Number.parseInt(process.env.META_DESTINATION_SNAPSHOT_TTL_HOURS ?? "24", 10);
  const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 24;
  return ttlHours * 60 * 60 * 1000;
}

function buildDestinationSnapshotCacheKey(
  tenantId: number,
  adAccountId: string,
  campaignId: string,
  adsetId: string,
) {
  return `${tenantId}:${adAccountId}:${campaignId}:${adsetId}`;
}

function buildMetaStructureCacheKey(tenantId: number, adAccountId: string) {
  return `${tenantId}:${adAccountId}`;
}

function isSnapshotFresh(snapshot: { expiresAt: Date }) {
  return snapshot.expiresAt.getTime() > Date.now();
}

function areSnapshotsFresh<T extends { expiresAt: Date }>(snapshots: T[]) {
  return snapshots.every((snapshot) => isSnapshotFresh(snapshot));
}

function getFreshMemoryMetaStructure(tenantId: number, adAccountId: string) {
  const key = buildMetaStructureCacheKey(tenantId, adAccountId);
  const cached = metaAccountStructureMemoryCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAtMs <= Date.now()) {
    metaAccountStructureMemoryCache.delete(key);
    return null;
  }
  return cached;
}

function setMemoryMetaStructure(input: {
  account: MetaAccountSnapshot;
  campaigns: MetaCampaignSnapshot[];
  adsets: MetaAdsetSnapshot[];
}) {
  const key = buildMetaStructureCacheKey(input.account.tenantId, input.account.adAccountId);
  const snapshotTimes = [
    input.account.expiresAt.getTime(),
    ...input.campaigns.map((campaign) => campaign.expiresAt.getTime()),
    ...input.adsets.map((adset) => adset.expiresAt.getTime()),
  ];

  metaAccountStructureMemoryCache.set(key, {
    ...input,
    expiresAtMs: Math.min(...snapshotTimes),
  });
}

function getFreshMemoryDestinationSnapshot(
  tenantId: number,
  adAccountId: string,
  campaignId: string,
  adsetId: string,
) {
  const key = buildDestinationSnapshotCacheKey(tenantId, adAccountId, campaignId, adsetId);
  const cached = destinationSnapshotMemoryCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAtMs <= Date.now()) {
    destinationSnapshotMemoryCache.delete(key);
    return null;
  }
  return cached.snapshot;
}

function setMemoryDestinationSnapshot(snapshot: MetaDestinationSnapshot) {
  const key = buildDestinationSnapshotCacheKey(
    snapshot.tenantId,
    snapshot.adAccountId,
    snapshot.campaignId,
    snapshot.adsetId,
  );
  destinationSnapshotMemoryCache.set(key, {
    snapshot,
    expiresAtMs: snapshot.expiresAt.getTime(),
  });
}

function snapshotToDestinationDefaults(snapshot: MetaDestinationSnapshot): DestinationDefaults {
  return {
    pageId: snapshot.pageId ?? null,
    instagramUserId: snapshot.instagramUserId ?? null,
    leadgenFormId: snapshot.leadgenFormId ?? null,
    whatsappNumber: normalizeWhatsappNumber(snapshot.whatsappNumber),
  };
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeWhatsappNumber(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function extractCallToActionDefaults(value: unknown): Pick<
  DestinationDefaults,
  "leadgenFormId" | "whatsappNumber"
> {
  const callToAction = asRecord(value);
  const payload = asRecord(callToAction?.value);

  return {
    leadgenFormId: pickFirstNonEmpty(
      typeof payload?.lead_gen_form_id === "string" ? payload.lead_gen_form_id : null,
      typeof payload?.leadgen_form_id === "string" ? payload.leadgen_form_id : null,
      typeof payload?.lead_ads_form_id === "string" ? payload.lead_ads_form_id : null,
    ),
    whatsappNumber: normalizeWhatsappNumber(
      pickFirstNonEmpty(
        typeof payload?.whatsapp_number === "string" ? payload.whatsapp_number : null,
        typeof payload?.phone_number === "string" ? payload.phone_number : null,
      ),
    ),
  };
}

function extractPromotedObjectDefaults(value: unknown): DestinationDefaults {
  const promotedObject = asRecord(value);

  return {
    pageId: pickFirstNonEmpty(
      typeof promotedObject?.page_id === "string" ? promotedObject.page_id : null,
    ),
    instagramUserId: pickFirstNonEmpty(
      typeof promotedObject?.instagram_actor_id === "string" ? promotedObject.instagram_actor_id : null,
      typeof promotedObject?.instagram_user_id === "string" ? promotedObject.instagram_user_id : null,
    ),
    leadgenFormId: pickFirstNonEmpty(
      typeof promotedObject?.lead_ads_form_id === "string" ? promotedObject.lead_ads_form_id : null,
      typeof promotedObject?.leadgen_form_id === "string" ? promotedObject.leadgen_form_id : null,
      typeof promotedObject?.lead_gen_form_id === "string" ? promotedObject.lead_gen_form_id : null,
    ),
    whatsappNumber: normalizeWhatsappNumber(
      pickFirstNonEmpty(
        typeof promotedObject?.whatsapp_number === "string" ? promotedObject.whatsapp_number : null,
        typeof promotedObject?.phone_number === "string" ? promotedObject.phone_number : null,
      ),
    ),
  };
}

function extractCreativeDefaults(
  value:
    | {
        page_id?: string;
        instagram_actor_id?: string;
        instagram_user_id?: string;
        link_data?: { call_to_action?: unknown } | null;
        video_data?: { call_to_action?: unknown } | null;
      }
    | null
    | undefined,
): DestinationDefaults {
  const linkDataDefaults = extractCallToActionDefaults(value?.link_data?.call_to_action);
  const videoDataDefaults = extractCallToActionDefaults(value?.video_data?.call_to_action);

  return {
    pageId: pickFirstNonEmpty(value?.page_id),
    instagramUserId: pickFirstNonEmpty(value?.instagram_actor_id, value?.instagram_user_id),
    leadgenFormId: pickFirstNonEmpty(linkDataDefaults.leadgenFormId, videoDataDefaults.leadgenFormId),
    whatsappNumber: pickFirstNonEmpty(linkDataDefaults.whatsappNumber, videoDataDefaults.whatsappNumber),
  };
}

function mergeDestinationDefaults(
  ...sources: Array<Partial<DestinationDefaults> | null | undefined>
): DestinationDefaults {
  return {
    pageId: pickFirstNonEmpty(...sources.map((source) => source?.pageId)),
    instagramUserId: pickFirstNonEmpty(...sources.map((source) => source?.instagramUserId)),
    leadgenFormId: pickFirstNonEmpty(...sources.map((source) => source?.leadgenFormId)),
    whatsappNumber: pickFirstNonEmpty(...sources.map((source) => source?.whatsappNumber)),
  };
}

async function getFreshDestinationSnapshot(
  tenantId: number,
  adAccountId: string,
  campaignId: string,
  adsetId: string,
) {
  const cached = getFreshMemoryDestinationSnapshot(tenantId, adAccountId, campaignId, adsetId);
  if (cached) {
    return cached;
  }

  const snapshot = await storage.getMetaDestinationSnapshot(tenantId, adAccountId, campaignId, adsetId);
  if (!snapshot || !isSnapshotFresh(snapshot)) {
    return null;
  }

  setMemoryDestinationSnapshot(snapshot);
  return snapshot;
}

async function saveDestinationSnapshot(input: {
  tenantId: number;
  adAccountId: string;
  campaignId: string;
  adsetId: string;
  destinationType: string;
  defaults: DestinationDefaults;
  source: string;
}) {
  const now = new Date();
  const saved = await storage.upsertMetaDestinationSnapshot({
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    campaignId: input.campaignId,
    adsetId: input.adsetId,
    destinationType: input.destinationType,
    pageId: input.defaults.pageId ?? null,
    instagramUserId: input.defaults.instagramUserId ?? null,
    leadgenFormId: input.defaults.leadgenFormId ?? null,
    whatsappNumber: normalizeWhatsappNumber(input.defaults.whatsappNumber),
    source: input.source,
    syncedAt: now,
    expiresAt: new Date(now.getTime() + getDestinationSnapshotTtlMs()),
  });
  setMemoryDestinationSnapshot(saved);
  return saved;
}

async function resolveCampaignDestinationContext(input: {
  client: MetaGraphClient | null;
  tenantId: number;
  adAccountId: string;
  campaign: {
    id: string;
    objective?: string | null;
  };
  rawAdsets: Array<{
    id: string;
    campaign_id?: string;
    name?: string;
    status?: string;
    configured_status?: string;
    effective_status?: string;
    optimization_goal?: string;
    billing_event?: string;
    bid_strategy?: string;
    promoted_object?: unknown;
  }>;
}) {
  const fallbackDefaults = await resolveTenantDestinationDefaults(input.tenantId);
  const campaignType = inferDestinationType(input.campaign.objective ?? null);
  const campaignAdsets = input.rawAdsets.filter((adset) => adset.campaign_id === input.campaign.id);
  const cachedDefaultsByAdsetId = new Map<string, DestinationDefaults>();

  for (const adset of campaignAdsets) {
    const snapshot = await getFreshDestinationSnapshot(
      input.tenantId,
      input.adAccountId,
      input.campaign.id,
      adset.id,
    );
    if (snapshot) {
      cachedDefaultsByAdsetId.set(adset.id, snapshotToDestinationDefaults(snapshot));
    }
  }

  if (campaignAdsets.length > 0 && cachedDefaultsByAdsetId.size === campaignAdsets.length) {
    return campaignAdsets.map((adset) =>
      mapAdsetSnapshot(adset, {
        type: campaignType,
        ...mergeDestinationDefaults(
          cachedDefaultsByAdsetId.get(adset.id),
          extractPromotedObjectDefaults(adset.promoted_object),
          fallbackDefaults,
        ),
      }),
    );
  }

  let rawAds: Awaited<ReturnType<MetaGraphClient["fetchCampaignAdsWithDestination"]>> = [];
  if (input.client) {
    try {
      rawAds = await input.client.fetchCampaignAdsWithDestination(input.campaign.id);
    } catch {
      rawAds = [];
    }
  }

  const adDefaultsByAdsetId = new Map<string, DestinationDefaults>();
  for (const ad of rawAds) {
    const adsetId = ad.adset_id ?? ad.adset?.id;
    if (!adsetId) {
      continue;
    }

    const promotedObjectDefaults = extractPromotedObjectDefaults(ad.adset?.promoted_object);
    const creativeDefaults = extractCreativeDefaults(ad.creative?.object_story_spec);
    adDefaultsByAdsetId.set(
      adsetId,
      mergeDestinationDefaults(
        adDefaultsByAdsetId.get(adsetId),
        creativeDefaults,
        promotedObjectDefaults,
      ),
    );
  }

  const snapshots = await Promise.all(
    campaignAdsets.map(async (adset) => {
      const resolvedDefaults = mergeDestinationDefaults(
        adDefaultsByAdsetId.get(adset.id),
        extractPromotedObjectDefaults(adset.promoted_object),
        fallbackDefaults,
      );
      await saveDestinationSnapshot({
        tenantId: input.tenantId,
        adAccountId: input.adAccountId,
        campaignId: input.campaign.id,
        adsetId: adset.id,
        destinationType: campaignType,
        defaults: resolvedDefaults,
        source: adDefaultsByAdsetId.has(adset.id) ? "meta_ad_or_creative" : "meta_adset_or_tenant_fallback",
      });

      return mapAdsetSnapshot(adset, {
        type: campaignType,
        ...resolvedDefaults,
      });
    }),
  );

  return snapshots;
}

async function resolveTenantDestinationDefaults(tenantId: number) {
  const [pages, instagrams, leadforms, whatsapps] = await Promise.all([
    storage.getResourcesByType(tenantId, "page"),
    storage.getResourcesByType(tenantId, "instagram"),
    storage.getResourcesByType(tenantId, "leadform"),
    storage.getResourcesByType(tenantId, "whatsapp"),
  ]);

  return {
    pageId: pages[0]?.value ?? null,
    instagramUserId: instagrams[0]?.value ?? null,
    leadgenFormId: leadforms[0]?.value ?? null,
    whatsappNumber: normalizeWhatsappNumber(whatsapps[0]?.value ?? null),
  };
}

async function getLatestLeadformByPageId(tenantId: number) {
  const leadforms = await storage.getResourcesByType(tenantId, "leadform");
  const latestByPageId = new Map<
    string,
    {
      id: string;
      name: string | null;
      createdAtMs: number;
    }
  >();

  leadforms.forEach((leadform) => {
    const metadata = (leadform.metadata ?? {}) as Record<string, unknown>;
    const pageId = typeof metadata.pageId === "string" ? metadata.pageId : null;
    if (!pageId) {
      return;
    }

    const metadataCreatedTime =
      typeof metadata.createdTime === "string" ? Date.parse(metadata.createdTime) : Number.NaN;
    const createdAtMs = Number.isFinite(metadataCreatedTime)
      ? metadataCreatedTime
      : leadform.createdAt instanceof Date
        ? leadform.createdAt.getTime()
        : 0;
    const current = latestByPageId.get(pageId);

    if (!current || createdAtMs >= current.createdAtMs) {
      latestByPageId.set(pageId, {
        id: leadform.value,
        name: leadform.name ?? null,
        createdAtMs,
      });
    }
  });

  return latestByPageId;
}

function inferProductToken(value: string | null, fallback: string) {
  const normalized = (value ?? fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const token = normalized.match(/[A-Z0-9]+/)?.[0] ?? fallback.toUpperCase();
  return token;
}

tasksRouter.get("/tasks", async (req, res, next) => {
  try {
    const user = req.user as User;
    const [tasks, uploads] = await Promise.all([
      storage.getStorageTasksByTenant(user.tenantId),
      storage.getStorageUploadsByTenant(user.tenantId),
    ]);
    const tenant = await storage.getTenant(user.tenantId);

    const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
    const list = tasks
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((task) => {
        const cover = uploadById.get(task.storageUploadId);
        const pairViews = buildTaskPairViews(task.id, Array.isArray(task.pairsJson) ? task.pairsJson : [], uploads);
        const distribution = sanitizeDistribution(task.distributionJson, pairViews);
        const elapsed = getTaskElapsedSeconds(task);
        return {
          id: task.id,
          title: task.title,
          status: task.status,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          ...elapsed,
          automationStartedAt: task.automationStartedAt,
          automationFinishedAt: task.automationFinishedAt,
          clientName: tenant?.name ?? `Tenant ${user.tenantId}`,
          responsibleName: null,
          pairCount: pairViews.length,
          destinationCount: distribution.destinations.filter((destination) => destination.pairIds.length > 0).length,
          uploadCount: 0,
          coverThumbnailUrl:
            cover && cover.contentType.startsWith("image/")
              ? `/api/tasks/${task.id}/uploads/${cover.id}/thumbnail`
              : null,
        };
      });

    const taskUploads = await Promise.all(list.map((item) => storage.getStorageTaskUploads(item.id)));
    const uploadCountByTaskId = new Map<number, number>();
    for (let index = 0; index < list.length; index += 1) {
      uploadCountByTaskId.set(list[index].id, taskUploads[index].length || 1);
    }

    res.json(
      list.map((item) => ({
        ...item,
        uploadCount: uploadCountByTaskId.get(item.id) ?? 0,
      })),
    );
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/tasks/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const deleted = await storage.deleteStorageTask(id, user.tenantId);
    if (!deleted) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    res.json({ message: "Tarefa removida com sucesso." });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id/meta/accounts", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const accounts = await storage.getResourcesByType(user.tenantId, "account");
    const metaConnected = Boolean(await buildMetaClient(user.tenantId));
    const filtered = accounts
      .filter((account) => {
        if (!query) return true;
        return `${account.name} ${account.value}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((account) => ({
        resourceId: account.id,
        name: account.name,
        adAccountId: account.value,
        connectionStatus: metaConnected ? "connected" : "disconnected",
      }));

    res.json({ accounts: filtered });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id/meta/accounts/:resourceId/campaigns", async (req, res, next) => {
  try {
    const user = req.user as User;
    const taskId = Number.parseInt(req.params.id, 10);
    const resourceId = Number.parseInt(req.params.resourceId, 10);
    if (!Number.isFinite(taskId) || !Number.isFinite(resourceId)) {
      return res.status(400).json({ message: "Recurso invalido." });
    }

    const context = await loadTaskContext(taskId, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const account = await storage.getResource(resourceId);
    if (!account || account.tenantId !== user.tenantId || account.type !== "account") {
      return res.status(404).json({ message: "Conta Meta nao encontrada." });
    }

    const client = await buildMetaClient(user.tenantId);
    const structure = await getMetaAccountStructure({
      tenantId: user.tenantId,
      account,
      client,
    });
    if (!structure) {
      return res.status(400).json({ message: "Integracao com Meta nao esta conectada." });
    }

    const destinationDefaults = await resolveTenantDestinationDefaults(user.tenantId);
    const campaigns = structure.campaigns.filter((campaign) =>
      isActiveCampaign({
        status: campaign.status ?? undefined,
        configured_status: campaign.configuredStatus ?? undefined,
        effective_status: campaign.effectiveStatus ?? undefined,
      }),
    );
    const campaignIds = new Set(campaigns.map((campaign) => campaign.campaignId));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.campaignId, campaign]));
    const adsetsByCampaignId = new Map<string, StorageTaskDistributionAdsetRecord[]>();

    for (const adset of structure.adsets) {
      if (!adset.campaignId || !campaignIds.has(adset.campaignId)) {
        continue;
      }
      const group = adsetsByCampaignId.get(adset.campaignId) ?? [];
      const parentCampaign = campaignById.get(adset.campaignId);
      const cachedSnapshot = await getFreshDestinationSnapshot(
        user.tenantId,
        account.value,
        adset.campaignId,
        adset.adsetId,
      );
      group.push(
        mapAdsetSnapshotRecord(adset, {
          type: inferDestinationType(parentCampaign?.objective ?? null),
          ...mergeDestinationDefaults(
            cachedSnapshot ? snapshotToDestinationDefaults(cachedSnapshot) : null,
            extractPromotedObjectDefaults(adset.promotedObject),
            destinationDefaults,
          ),
        }),
      );
      adsetsByCampaignId.set(adset.campaignId, group);
    }

    res.json({
      account: {
        resourceId: account.id,
        name: account.name,
        adAccountId: account.value,
        connectionStatus: "connected",
        campaignCount: campaigns.length,
      },
      campaigns: campaigns
        .map((campaign) => {
          const adsets = adsetsByCampaignId.get(campaign.campaignId) ?? [];
          return {
            ...mapCampaignSnapshotRecord(campaign),
            adsetCount: adsets.length,
            lastUpdated: campaign.updatedTime ?? null,
            adsets,
          };
        })
        .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id/meta/accounts/:resourceId/campaigns/:campaignId/context", async (req, res, next) => {
  try {
    const user = req.user as User;
    const taskId = Number.parseInt(req.params.id, 10);
    const resourceId = Number.parseInt(req.params.resourceId, 10);
    const campaignId = typeof req.params.campaignId === "string" ? req.params.campaignId.trim() : "";
    if (!Number.isFinite(taskId) || !Number.isFinite(resourceId) || !campaignId) {
      return res.status(400).json({ message: "Campanha invalida." });
    }

    const context = await loadTaskContext(taskId, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const account = await storage.getResource(resourceId);
    if (!account || account.tenantId !== user.tenantId || account.type !== "account") {
      return res.status(404).json({ message: "Conta Meta nao encontrada." });
    }

    const client = await buildMetaClient(user.tenantId);
    const structure = await getMetaAccountStructure({
      tenantId: user.tenantId,
      account,
      client,
    });
    if (!structure) {
      return res.status(400).json({ message: "Integracao com Meta nao esta conectada." });
    }

    const campaign = structure.campaigns.find((item) => item.campaignId === campaignId);
    if (!campaign || !isActiveCampaign({
      status: campaign.status ?? undefined,
      configured_status: campaign.configuredStatus ?? undefined,
      effective_status: campaign.effectiveStatus ?? undefined,
    })) {
      return res.status(404).json({ message: "Campanha nao encontrada." });
    }

    const adsets = await resolveCampaignDestinationContext({
      client,
      tenantId: user.tenantId,
      adAccountId: account.value,
      campaign: {
        id: campaign.campaignId,
        objective: campaign.objective ?? null,
      },
      rawAdsets: structure.adsets.map(toRawAdsetFromSnapshot),
    });

    res.json({
      campaign: {
        ...mapCampaignSnapshotRecord(campaign),
        adsetCount: adsets.length,
        lastUpdated: campaign.updatedTime ?? null,
        adsets,
      },
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id/distribution", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const pairViews = buildTaskPairViews(
      context.task.id,
      Array.isArray(context.task.pairsJson) ? context.task.pairsJson : [],
      context.uploads,
    );
    const distribution = sanitizeDistribution(context.task.distributionJson, pairViews);

    res.json({
      id: context.task.id,
      title: context.task.title,
      status: context.task.status,
      createdAt: context.task.createdAt,
      updatedAt: context.task.updatedAt,
      ...getTaskElapsedSeconds(context.task),
      automationStartedAt: context.task.automationStartedAt,
      automationFinishedAt: context.task.automationFinishedAt,
      pairs: pairViews,
      distribution,
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.put("/tasks/:id/distribution", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const pairViews = buildTaskPairViews(
      context.task.id,
      Array.isArray(context.task.pairsJson) ? context.task.pairsJson : [],
      context.uploads,
    );
    const pairIdSet = new Set(pairViews.map((pair) => pair.pairId));
    const parsed = distributionSchema.parse(req.body);

    for (const destination of parsed.destinations) {
      if (destination.pairIds.some((pairId) => !pairIdSet.has(pairId))) {
        return res.status(400).json({ message: "Uma campanha contem pares invalidos." });
      }
      const adsetIds = new Set(destination.adsets.map((adset) => adset.id));
      if (destination.selectedAdsetIds.some((adsetId) => !adsetIds.has(adsetId))) {
        return res.status(400).json({ message: "Uma campanha contem conjuntos invalidos." });
      }
    }

    const activityTask = await touchTaskConfigurationActivity(context.task, user.tenantId);
    const updated = await storage.updateStorageTask(id, {
      distributionJson: parsed,
      configurationElapsedSeconds: activityTask.configurationElapsedSeconds,
      lastActivityAt: activityTask.lastActivityAt,
      status: activityTask.status,
    }, user.tenantId);
    if (!updated) {
      return res.status(500).json({ message: "Nao foi possivel salvar a distribuicao." });
    }

    res.json({
      id: updated.id,
      distribution: sanitizeDistribution(updated.distributionJson, pairViews),
      updatedAt: updated.updatedAt,
      ...getTaskElapsedSeconds(updated),
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id/distribution/payload", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const pairViews = buildTaskPairViews(
      context.task.id,
      Array.isArray(context.task.pairsJson) ? context.task.pairsJson : [],
      context.uploads,
    );
    const distribution = sanitizeDistribution(context.task.distributionJson, pairViews);
    const pairById = new Map(pairViews.map((pair) => [pair.pairId, pair]));
    const usedPairIds = Array.from(
      new Set(
        distribution.destinations.flatMap((destination) =>
          destination.pairIds.filter((pairId) => pairById.has(pairId)),
        ),
      ),
    );
    const selectedPairs = usedPairIds
      .map((pairId) => pairById.get(pairId))
      .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair));
    const tenant = await storage.getTenant(user.tenantId);
    const latestLeadformByPageId = await getLatestLeadformByPageId(user.tenantId);
    const callbackBaseUrl = getPublicAppUrl(req).replace(/\/$/, "");
    const callbackUrl = `${callbackBaseUrl}/api/webhooks/n8n/status`;
    const requestId = `req_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 6)}`;
    const clientId = slugifyClientId(tenant?.name ?? `tenant_${user.tenantId}`);
    const pairsPayload = selectedPairs.map((pair) => {
      return {
        pair_id: pair.pairId,
        message_text: pair.text ?? "",
        title_text: pair.title ?? "",
        cta: "SIGN_UP",
        feed_asset: buildPairAssetPayload(req, {
          taskId: context.task.id,
          uploadId: pair.feedUploadId,
          assetId: pair.feedAssetId,
          role: "feed",
          fileName: pair.feedOriginalFileName,
          bucketName: pair.feedBucketName,
          objectPath: pair.feedObjectPath,
          mimeType: pair.feedMimeType,
        }),
        story_asset: buildPairAssetPayload(req, {
          taskId: context.task.id,
          uploadId: pair.storiesUploadId,
          assetId: pair.storyAssetId,
          role: "story",
          fileName: pair.storyOriginalFileName,
          bucketName: pair.storyBucketName,
          objectPath: pair.storyObjectPath,
          mimeType: pair.storyMimeType,
        }),
      };
    });
    const pairPayloadById = new Map(pairsPayload.map((pair) => [pair.pair_id, pair]));
    const pairAssetSeen = new Set<string>();
    const pairAssetsPayload = distribution.destinations
      .filter((destination) => destination.pairIds.length > 0)
      .flatMap((destination) =>
        destination.pairIds
          .map((pairId) => pairPayloadById.get(pairId))
          .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
          .flatMap((pair) => {
            const assetKey = `task_${context.task.id}__${pair.pair_id}__${destination.adAccountId}`;
            const pairEntry = {
              asset_key: assetKey,
              pair_id: pair.pair_id,
              ad_account_id: destination.adAccountId,
              feed: {
                file_name: pair.feed_asset.file_name,
                file_url: pair.feed_asset.file_url,
                mime_type: pair.feed_asset.mime_type,
              },
              story: {
                file_name: pair.story_asset.file_name,
                file_url: pair.story_asset.file_url,
                mime_type: pair.story_asset.mime_type,
              },
            };
            return [pairEntry].filter((entry) => {
              if (pairAssetSeen.has(entry.asset_key)) {
                return false;
              }
              pairAssetSeen.add(entry.asset_key);
              return true;
            });
          }),
      );

    const groupedAccounts = new Map<
      string,
      {
        ad_account_id: string;
        ad_account_name: string;
        campaigns: Array<{
          campaign_id: string;
          campaign_name: string | null;
          objective: string | null;
          adsets: Array<{
            adset_id: string;
            adset_name: string | null;
            destination: {
              type: string;
              page_id: string | null;
              instagram_user_id: string | null;
              leadgen_form_id: string | null;
              whatsapp_number: string | null;
            };
            selected_pair_ids: string[];
            selected_pairs: Array<{
              asset_key: string;
              pair_id: string;
              message_text: string;
              title_text: string;
              cta: string;
            }>;
          }>;
        }>;
      }
    >();

    distribution.destinations
      .filter((destination) => destination.pairIds.length > 0)
      .forEach((destination) => {
        const adsets = destination.applyToAllAdsets
          ? destination.adsets
          : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));
        const accountKey = destination.adAccountId;
        const accountGroup =
          groupedAccounts.get(accountKey) ??
          {
            ad_account_id: destination.adAccountId,
            ad_account_name: destination.adAccountName,
            campaigns: [],
          };

        accountGroup.campaigns.push({
          campaign_id: destination.campaign.id,
          campaign_name: destination.campaign.name,
          objective: destination.campaign.objective,
          adsets: adsets.map((adset) => ({
            adset_id: adset.id,
            adset_name: adset.name,
            destination: {
              type: adset.destination.type,
              page_id: adset.destination.pageId,
              instagram_user_id: adset.destination.instagramUserId,
              leadgen_form_id: adset.destination.leadgenFormId,
              whatsapp_number: normalizeWhatsappNumber(adset.destination.whatsappNumber),
            },
            selected_pair_ids: destination.pairIds.filter((pairId) => pairById.has(pairId)),
            selected_pairs: destination.pairIds
              .map((pairId) => pairPayloadById.get(pairId))
              .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
              .map((pair) => ({
                asset_key: `task_${context.task.id}__${pair.pair_id}__${destination.adAccountId}`,
                pair_id: pair.pair_id,
                message_text: pair.message_text,
                title_text: pair.title_text,
                cta: pair.cta,
              })),
          })),
        });

        groupedAccounts.set(accountKey, accountGroup);
      });

    let creativeJobCounter = 0;
    const payload = {
      action: "add_creatives_to_existing_campaigns",
      task: {
        task_id: `task_${context.task.id}`,
        task_name: context.task.title,
      },
      tenant: {
        tenant_id: String(user.tenantId),
        client_id: clientId,
      },
      pair_assets: pairAssetsPayload,
      creative_jobs: distribution.destinations
        .filter((destination) => destination.pairIds.length > 0)
        .flatMap((destination) => {
          const pairAssignmentByPairId = new Map(
            normalizePairAssignments(destination.pairIds, destination.pairAssignments).map((assignment) => [
              assignment.pairId,
              assignment,
            ]),
          );
          const adsets = destination.applyToAllAdsets
            ? destination.adsets
            : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));

          return adsets.flatMap((adset) =>
            destination.pairIds
              .map((pairId) => pairById.get(pairId))
              .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
              .map((pair) => {
                const pairAssignment = pairAssignmentByPairId.get(pair.pairId);
                const campaignLeadgenFormId =
                  destination.campaignLeadgenFormId ??
                  (adset.destination.pageId
                    ? latestLeadformByPageId.get(adset.destination.pageId)?.id
                    : null) ?? adset.destination.leadgenFormId;
                return {
                  job_id: `job_${String(++creativeJobCounter).padStart(2, "0")}`,
                  tenant_id: String(user.tenantId),
                  client_id: clientId,
                  asset_key: `task_${context.task.id}__${pair.pairId}__${destination.adAccountId}`,
                  ad_account_id: destination.adAccountId,
                  campaign_id: destination.campaign.id,
                  adset_id: adset.id,
                  objective: destination.campaign.objective,
                  destination: {
                    page_id: adset.destination.pageId,
                    instagram_user_id: adset.destination.instagramUserId,
                    leadgen_form_id:
                      pairAssignment?.useCampaignDefault === false
                        ? pairAssignment?.leadgenFormId ?? campaignLeadgenFormId
                        : campaignLeadgenFormId,
                    whatsapp_number: normalizeWhatsappNumber(adset.destination.whatsappNumber),
                  },
                  message_text: pair.text ?? "",
                  title_text: pair.title ?? "",
                  cta: "SIGN_UP",
                };
              }),
          );
        }),
      creative_defaults: {
        ad_status: "PAUSED",
        creative_status: "ACTIVE",
      },
      meta: {
        request_id: requestId,
        callback_url: callbackUrl,
      },
    };

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/tasks/:id/distribution/send", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const settings = await storage.getAppSettings();
    if (!settings?.n8nWebhookUrl) {
      return res
        .status(400)
        .json({ message: "Webhook n8n nao configurado. Configure em Admin > Configuracoes" });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const pairViews = buildTaskPairViews(
      context.task.id,
      Array.isArray(context.task.pairsJson) ? context.task.pairsJson : [],
      context.uploads,
    );
    const distribution = sanitizeDistribution(context.task.distributionJson, pairViews);
    const pairById = new Map(pairViews.map((pair) => [pair.pairId, pair]));
    const usedPairIds = Array.from(
      new Set(
        distribution.destinations.flatMap((destination) =>
          destination.pairIds.filter((pairId) => pairById.has(pairId)),
        ),
      ),
    );
    const selectedPairs = usedPairIds
      .map((pairId) => pairById.get(pairId))
      .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair));
    const tenant = await storage.getTenant(user.tenantId);
    const latestLeadformByPageId = await getLatestLeadformByPageId(user.tenantId);
    const callbackBaseUrl = getPublicAppUrl(req).replace(/\/$/, "");
    const callbackUrl = `${callbackBaseUrl}/api/webhooks/n8n/status`;
    const requestId = `req_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 6)}`;
    const clientId = slugifyClientId(tenant?.name ?? `tenant_${user.tenantId}`);
    const pairsPayload = selectedPairs.map((pair) => {
      return {
        pair_id: pair.pairId,
        message_text: pair.text ?? "",
        title_text: pair.title ?? "",
        cta: "SIGN_UP",
        feed_asset: buildPairAssetPayload(req, {
          taskId: context.task.id,
          uploadId: pair.feedUploadId,
          assetId: pair.feedAssetId,
          role: "feed",
          fileName: pair.feedOriginalFileName,
          bucketName: pair.feedBucketName,
          objectPath: pair.feedObjectPath,
          mimeType: pair.feedMimeType,
        }),
        story_asset: buildPairAssetPayload(req, {
          taskId: context.task.id,
          uploadId: pair.storiesUploadId,
          assetId: pair.storyAssetId,
          role: "story",
          fileName: pair.storyOriginalFileName,
          bucketName: pair.storyBucketName,
          objectPath: pair.storyObjectPath,
          mimeType: pair.storyMimeType,
        }),
      };
    });
    const pairPayloadById = new Map(pairsPayload.map((pair) => [pair.pair_id, pair]));
    const pairAssetSeen = new Set<string>();
    const pairAssetsPayload = distribution.destinations
      .filter((destination) => destination.pairIds.length > 0)
      .flatMap((destination) =>
        destination.pairIds
          .map((pairId) => pairPayloadById.get(pairId))
          .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
          .flatMap((pair) => {
            const assetKey = `task_${context.task.id}__${pair.pair_id}__${destination.adAccountId}`;
            const pairEntry = {
              asset_key: assetKey,
              pair_id: pair.pair_id,
              ad_account_id: destination.adAccountId,
              feed: {
                file_name: pair.feed_asset.file_name,
                file_url: pair.feed_asset.file_url,
                mime_type: pair.feed_asset.mime_type,
              },
              story: {
                file_name: pair.story_asset.file_name,
                file_url: pair.story_asset.file_url,
                mime_type: pair.story_asset.mime_type,
              },
            };
            return [pairEntry].filter((entry) => {
              if (pairAssetSeen.has(entry.asset_key)) {
                return false;
              }
              pairAssetSeen.add(entry.asset_key);
              return true;
            });
          }),
      );

    const groupedAccounts = new Map<string, unknown>();
    distribution.destinations
      .filter((destination) => destination.pairIds.length > 0)
      .forEach((destination) => {
        const adsets = destination.applyToAllAdsets
          ? destination.adsets
          : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));
        const accountKey = destination.adAccountId;
        const existing = groupedAccounts.get(accountKey) as
          | {
              ad_account_id: string;
              ad_account_name: string;
              campaigns: Array<Record<string, unknown>>;
            }
          | undefined;

        const accountGroup =
          existing ??
          {
            ad_account_id: destination.adAccountId,
            ad_account_name: destination.adAccountName,
            campaigns: [],
          };

        accountGroup.campaigns.push({
          campaign_id: destination.campaign.id,
          campaign_name: destination.campaign.name,
          objective: destination.campaign.objective,
          adsets: adsets.map((adset) => ({
            adset_id: adset.id,
            adset_name: adset.name,
            destination: {
              type: adset.destination.type,
              page_id: adset.destination.pageId,
              instagram_user_id: adset.destination.instagramUserId,
              leadgen_form_id: adset.destination.leadgenFormId,
              whatsapp_number: normalizeWhatsappNumber(adset.destination.whatsappNumber),
            },
            selected_pair_ids: destination.pairIds.filter((pairId) => pairById.has(pairId)),
            selected_pairs: destination.pairIds
              .map((pairId) => pairPayloadById.get(pairId))
              .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
              .map((pair) => ({
                asset_key: `task_${context.task.id}__${pair.pair_id}__${destination.adAccountId}`,
                pair_id: pair.pair_id,
                message_text: pair.message_text,
                title_text: pair.title_text,
                cta: pair.cta,
              })),
          })),
        });

        groupedAccounts.set(accountKey, accountGroup);
      });

    let creativeJobCounter = 0;
    const payload = {
      action: "add_creatives_to_existing_campaigns",
      task: {
        task_id: `task_${context.task.id}`,
        task_name: context.task.title,
      },
      tenant: {
        tenant_id: String(user.tenantId),
        client_id: clientId,
      },
      pair_assets: pairAssetsPayload,
      creative_jobs: distribution.destinations
        .filter((destination) => destination.pairIds.length > 0)
        .flatMap((destination) => {
          const pairAssignmentByPairId = new Map(
            normalizePairAssignments(destination.pairIds, destination.pairAssignments).map((assignment) => [
              assignment.pairId,
              assignment,
            ]),
          );
          const adsets = destination.applyToAllAdsets
            ? destination.adsets
            : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));

          return adsets.flatMap((adset) =>
            destination.pairIds
              .map((pairId) => pairById.get(pairId))
              .filter((pair): pair is NonNullable<typeof pair> => Boolean(pair))
              .map((pair) => {
                const pairAssignment = pairAssignmentByPairId.get(pair.pairId);
                const campaignLeadgenFormId =
                  destination.campaignLeadgenFormId ??
                  (adset.destination.pageId
                    ? latestLeadformByPageId.get(adset.destination.pageId)?.id
                    : null) ?? adset.destination.leadgenFormId;
                return {
                  job_id: `job_${String(++creativeJobCounter).padStart(2, "0")}`,
                  tenant_id: String(user.tenantId),
                  client_id: clientId,
                  asset_key: `task_${context.task.id}__${pair.pairId}__${destination.adAccountId}`,
                  ad_account_id: destination.adAccountId,
                  campaign_id: destination.campaign.id,
                  adset_id: adset.id,
                  objective: destination.campaign.objective,
                  destination: {
                    page_id: adset.destination.pageId,
                    instagram_user_id: adset.destination.instagramUserId,
                    leadgen_form_id:
                      pairAssignment?.useCampaignDefault === false
                        ? pairAssignment?.leadgenFormId ?? campaignLeadgenFormId
                        : campaignLeadgenFormId,
                    whatsapp_number: normalizeWhatsappNumber(adset.destination.whatsappNumber),
                  },
                  message_text: pair.text ?? "",
                  title_text: pair.title ?? "",
                  cta: "SIGN_UP",
                };
              }),
          );
        }),
      creative_defaults: {
        ad_status: "PAUSED",
        creative_status: "ACTIVE",
      },
      meta: {
        request_id: requestId,
        callback_url: callbackUrl,
      },
    };

    if (payload.pair_assets.length === 0 || payload.creative_jobs.length === 0) {
      return res.status(400).json({ message: "A distribuicao ainda nao possui contas, campanhas e pares suficientes." });
    }

    const webhookResponse = await fetch(settings.n8nWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: payload }),
    });

    const responseText = await webhookResponse.text();
    let parsedResponse: unknown = responseText;
    try {
      parsedResponse = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsedResponse = responseText;
    }

    if (!webhookResponse.ok) {
      await storage.createAutomation({
        tenantId: user.tenantId,
        campaignId: null,
        webhookUrl: settings.n8nWebhookUrl,
        status: "failed",
        payload,
        response: {
          status: webhookResponse.status,
          body: parsedResponse,
        },
      });

      let userMessage = "Erro ao enviar webhook para n8n";
      if (typeof parsedResponse === "object" && parsedResponse && "message" in parsedResponse) {
        const message = String((parsedResponse as { message?: unknown }).message ?? "");
        if (message.includes("not registered")) {
          userMessage = "Webhook n8n nao esta ativo. No n8n, clique em 'Execute workflow' e tente novamente.";
        }
      }

      return res.status(500).json({ message: userMessage });
    }

    await storage.createAutomation({
      tenantId: user.tenantId,
      campaignId: null,
      webhookUrl: settings.n8nWebhookUrl,
      status: "sent",
      payload,
      response: {
        status: webhookResponse.status,
        body: parsedResponse,
      },
    });

    const updated = await startTaskPublishing(context.task, user.tenantId);

    res.json({
      message: "Configuracao enviada para o n8n com sucesso",
      status: updated?.status ?? "publishing",
      updatedAt: updated?.updatedAt ?? new Date(),
      ...(updated ? getTaskElapsedSeconds(updated) : {}),
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/tasks/:id/activity", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const updated = await touchTaskConfigurationActivity(context.task, user.tenantId);
    res.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
      ...getTaskElapsedSeconds(updated),
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const pairViews = buildTaskPairViews(
      context.task.id,
      Array.isArray(context.task.pairsJson) ? context.task.pairsJson : [],
      context.uploads,
    );

    res.json({
      id: context.task.id,
      title: context.task.title,
      status: context.task.status,
      createdAt: context.task.createdAt,
      updatedAt: context.task.updatedAt,
      ...getTaskElapsedSeconds(context.task),
      automationStartedAt: context.task.automationStartedAt,
      automationFinishedAt: context.task.automationFinishedAt,
      completePairCount: pairViews.length,
      pairs: Array.isArray(context.task.pairsJson) ? context.task.pairsJson : [],
      uploadLink: context.uploadLink
        ? {
            id: context.uploadLink.id,
            name: context.uploadLink.name,
          }
        : null,
      uploads: context.uploads.map((upload) => buildUploadPayload(context.task.id, upload)),
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.put("/tasks/:id/pairs", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Tarefa invalida." });
    }

    const context = await loadTaskContext(id, user.tenantId);
    if (!context) {
      return res.status(404).json({ message: "Tarefa nao encontrada." });
    }

    const parsed = updatePairsSchema.parse(req.body);
    const validUploadIds = new Set(context.uploads.map((upload) => upload.id));
    for (const pair of parsed.pairs) {
      if (
        (pair.feedUploadId !== null && !validUploadIds.has(pair.feedUploadId)) ||
        (pair.storiesUploadId !== null && !validUploadIds.has(pair.storiesUploadId))
      ) {
        return res.status(400).json({ message: "Par contem imagens que nao pertencem a esta tarefa." });
      }
    }

    const activityTask = await touchTaskConfigurationActivity(context.task, user.tenantId);
    const updated = await storage.updateStorageTask(id, {
      pairsJson: parsed.pairs,
      configurationElapsedSeconds: activityTask.configurationElapsedSeconds,
      lastActivityAt: activityTask.lastActivityAt,
      status: activityTask.status,
    }, user.tenantId);
    if (!updated) {
      return res.status(500).json({ message: "Nao foi possivel salvar os pares." });
    }

    res.json({
      id: updated.id,
      pairs: updated.pairsJson,
      updatedAt: updated.updatedAt,
      ...getTaskElapsedSeconds(updated),
    });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/tasks/:taskId/uploads/:uploadId/thumbnail", async (req, res, next) => {
  try {
    const user = req.user as User;
    const taskId = Number.parseInt(req.params.taskId, 10);
    const uploadId = Number.parseInt(req.params.uploadId, 10);
    if (!Number.isFinite(taskId) || !Number.isFinite(uploadId)) {
      return res.status(400).json({ message: "Recurso invalido." });
    }

    const upload = await storage.getStorageUploadForTask(taskId, user.tenantId, uploadId);
    if (!upload) {
      return res.status(404).json({ message: "Upload nao encontrado." });
    }

    if (!upload.contentType.startsWith("image/")) {
      return res.status(400).json({ message: "Este arquivo nao possui miniatura." });
    }

    const etag = buildThumbnailEtag(upload);
    setThumbnailResponseHeaders(res, etag);
    if (requestHasMatchingEtag(req, etag)) {
      return res.status(304).end();
    }

    if (THUMBNAIL_DIRECT_GCS_REDIRECT) {
      const signedUrl = await createSignedGcsReadUrl({
        bucketName: upload.bucketName,
        objectPath: upload.objectPath,
        expiresSeconds: THUMBNAIL_SIGNED_URL_SECONDS,
      });
      res.setHeader("Cache-Control", `private, max-age=${Math.min(THUMBNAIL_BROWSER_CACHE_SECONDS, 300)}`);
      return res.redirect(302, signedUrl);
    }

    const file = await loadThumbnailFile(upload);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.buffer.byteLength));
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});
