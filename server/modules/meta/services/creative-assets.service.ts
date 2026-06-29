import { and, eq } from "drizzle-orm";
import { metaCreatives } from "@shared/schema";
import { db } from "../../../db";
import { createSignedGcsReadUrl, uploadBufferToGcs } from "../../gcs/service";

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const PREVIEW_SIGNED_URL_SECONDS = 60 * 60;
const FAILED_ASSET_RETRY_MS = 60 * 60 * 1000;

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function extensionFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  return "jpg";
}

function normalizeImageContentType(value: string | null): string {
  const contentType = value?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return contentType;
  }
  return "image/jpeg";
}

function isUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function pickPreviewSource(creative: {
  thumbnailUrl: string | null;
  imageUrl: string | null;
  rawJson?: Record<string, unknown> | null;
}): string | null {
  const raw = creative.rawJson ?? {};
  const objectStorySpec =
    raw.object_story_spec && typeof raw.object_story_spec === "object"
      ? (raw.object_story_spec as Record<string, unknown>)
      : {};
  const linkData =
    objectStorySpec.link_data && typeof objectStorySpec.link_data === "object"
      ? (objectStorySpec.link_data as Record<string, unknown>)
      : {};
  const videoData =
    objectStorySpec.video_data && typeof objectStorySpec.video_data === "object"
      ? (objectStorySpec.video_data as Record<string, unknown>)
      : {};
  const assetFeedSpec =
    raw.asset_feed_spec && typeof raw.asset_feed_spec === "object"
      ? (raw.asset_feed_spec as Record<string, unknown>)
      : {};
  const feedImages = Array.isArray(assetFeedSpec.images) ? assetFeedSpec.images : [];
  const feedVideos = Array.isArray(assetFeedSpec.videos) ? assetFeedSpec.videos : [];
  const firstFeedImage = feedImages.find((item) => item && typeof item === "object") as
    | Record<string, unknown>
    | undefined;
  const firstFeedVideo = feedVideos.find((item) => item && typeof item === "object") as
    | Record<string, unknown>
    | undefined;

  const candidates = [
    creative.imageUrl,
    firstFeedImage?.url,
    linkData.picture,
    videoData.image_url,
    firstFeedVideo?.thumbnail_url,
    creative.thumbnailUrl,
  ];

  return candidates.find(isUrl) ?? null;
}

async function downloadPreviewImage(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Falha ao baixar preview do criativo: HTTP ${response.status}`);
    }

    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_PREVIEW_BYTES) {
      throw new Error("Preview do criativo excede o tamanho maximo permitido.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PREVIEW_BYTES) {
      throw new Error("Preview do criativo excede o tamanho maximo permitido.");
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: normalizeImageContentType(response.headers.get("content-type")),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCreativePreviewUrl(creative: {
  storageThumbnailBucket: string | null;
  storageThumbnailPath: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
}): Promise<string | null> {
  if (creative.storageThumbnailBucket && creative.storageThumbnailPath) {
    try {
      return await createSignedGcsReadUrl({
        bucketName: creative.storageThumbnailBucket,
        objectPath: creative.storageThumbnailPath,
        expiresSeconds: PREVIEW_SIGNED_URL_SECONDS,
      });
    } catch (error) {
      console.error("Falha ao assinar preview de criativo no GCS.", {
        objectPath: creative.storageThumbnailPath,
        error,
      });
    }
  }

  return creative.imageUrl || creative.thumbnailUrl || null;
}

export async function ensureCreativePreviewAsset(options: {
  tenantId: number;
  adAccountId: string;
  creativeId: string;
}): Promise<void> {
  const creative = await db.query.metaCreatives.findFirst({
    where: and(
      eq(metaCreatives.tenantId, options.tenantId),
      eq(metaCreatives.adAccountId, options.adAccountId),
      eq(metaCreatives.creativeId, options.creativeId),
    ),
  });

  if (!creative) return;
  const sourceUrl = pickPreviewSource(creative);
  const assetSyncedAt = creative.assetSyncedAt ? new Date(creative.assetSyncedAt) : null;
  const metadataSyncedAt = new Date(creative.syncedAt);
  const assetIsFresh =
    creative.storageThumbnailBucket &&
    creative.storageThumbnailPath &&
    creative.storageThumbnailSourceUrl === sourceUrl &&
    creative.assetStatus === "ready" &&
    assetSyncedAt &&
    !Number.isNaN(assetSyncedAt.getTime()) &&
    !Number.isNaN(metadataSyncedAt.getTime()) &&
    assetSyncedAt >= metadataSyncedAt;
  if (assetIsFresh) return;

  if (["error", "missing_source"].includes(creative.assetStatus)) {
    const updatedAt = new Date(creative.updatedAt);
    if (!Number.isNaN(updatedAt.getTime()) && Date.now() - updatedAt.getTime() < FAILED_ASSET_RETRY_MS) {
      return;
    }
  }

  if (!sourceUrl) {
    await db.update(metaCreatives).set({
      assetStatus: "missing_source",
      assetErrorMessage: "Criativo sem URL de preview na Meta.",
      updatedAt: new Date(),
    }).where(eq(metaCreatives.id, creative.id));
    return;
  }

  const startedAt = new Date();
  await db.update(metaCreatives).set({
    assetStatus: "syncing",
    assetErrorMessage: null,
    updatedAt: startedAt,
  }).where(eq(metaCreatives.id, creative.id));

  try {
    const preview = await downloadPreviewImage(sourceUrl);
    const extension = extensionFromContentType(preview.contentType);
    const objectPath = [
      "tenants",
      String(options.tenantId),
      "meta-creatives",
      safePathSegment(options.adAccountId),
      safePathSegment(options.creativeId),
      `preview.${extension}`,
    ].join("/");

    const uploaded = await uploadBufferToGcs({
      objectPath,
      buffer: preview.buffer,
      contentType: preview.contentType,
    });
    const finishedAt = new Date();

    await db.update(metaCreatives).set({
      storageThumbnailBucket: uploaded.bucketName,
      storageThumbnailPath: uploaded.objectPath,
      storageThumbnailContentType: uploaded.contentType,
      storageThumbnailSourceUrl: sourceUrl,
      assetStatus: "ready",
      assetSyncedAt: finishedAt,
      assetErrorMessage: null,
      updatedAt: finishedAt,
    }).where(eq(metaCreatives.id, creative.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao salvar preview.";
    const failedAt = new Date();
    await db.update(metaCreatives).set({
      assetStatus: "error",
      assetErrorMessage: message,
      updatedAt: failedAt,
    }).where(eq(metaCreatives.id, creative.id));
    console.error("Falha ao salvar preview de criativo.", {
      tenantId: options.tenantId,
      adAccountId: options.adAccountId,
      creativeId: options.creativeId,
      error,
    });
  }
}
