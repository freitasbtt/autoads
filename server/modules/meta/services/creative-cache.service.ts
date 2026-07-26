import type { MetaAdCreativeSnapshot, Resource, StorageUpload } from "@shared/schema";
import { storage } from "../../storage";
import {
  buildStorageObjectPath,
  getGcsObjectHttpUrl,
  uploadBufferToGcs,
} from "../../gcs/service";

const DEFAULT_MAX_CREATIVE_IMAGE_BYTES = 2 * 1024 * 1024;

function getMaxCreativeImageBytes() {
  const raw = Number.parseInt(process.env.META_CREATIVE_IMAGE_MAX_BYTES ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_MAX_CREATIVE_IMAGE_BYTES;
}

function getFileExtensionFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "img";
}

function buildCreativeAssetPathPrefix(options: {
  account: Resource;
  campaignId: string;
  adId: string;
  variant: "thumb" | "preview";
}) {
  const safeAccount = options.account.value.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const safeCampaign = options.campaignId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const safeAd = options.adId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `meta-creatives/${safeAccount}/${safeCampaign}/${safeAd}/${options.variant}`;
}

async function fetchRemoteImageBuffer(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type")?.trim() ?? "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return null;
  }

  const contentLengthHeader = response.headers.get("content-length");
  const maxBytes = getMaxCreativeImageBytes();
  if (contentLengthHeader) {
    const announcedLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
      return null;
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > maxBytes) {
    return null;
  }

  return { buffer, contentType };
}

async function persistCreativeImage(options: {
  tenantId: number;
  account: Resource;
  campaignId: string;
  adId: string;
  variant: "thumb" | "preview";
  sourceUrl: string;
}): Promise<StorageUpload | null> {
  let downloaded: Awaited<ReturnType<typeof fetchRemoteImageBuffer>>;
  try {
    downloaded = await fetchRemoteImageBuffer(options.sourceUrl);
  } catch (error) {
    console.warn("Falha ao baixar creative da Meta para cache local.", {
      tenantId: options.tenantId,
      accountId: options.account.value,
      campaignId: options.campaignId,
      adId: options.adId,
      variant: options.variant,
      sourceUrl: options.sourceUrl,
      error,
    });
    return null;
  }

  if (!downloaded) {
    return null;
  }

  const extension = getFileExtensionFromContentType(downloaded.contentType);
  const fileName = `${options.adId}-${options.variant}.${extension}`;
  const objectPath = buildStorageObjectPath({
    tenantId: options.tenantId,
    fileName,
    pathPrefix: buildCreativeAssetPathPrefix(options),
  });

  let uploaded: Awaited<ReturnType<typeof uploadBufferToGcs>>;
  try {
    uploaded = await uploadBufferToGcs({
      objectPath,
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
    });
  } catch (error) {
    console.warn("Falha ao salvar creative no storage.", {
      tenantId: options.tenantId,
      accountId: options.account.value,
      campaignId: options.campaignId,
      adId: options.adId,
      variant: options.variant,
      objectPath,
      error,
    });
    return null;
  }

  return storage.createStorageUpload({
    tenantId: options.tenantId,
    uploadLinkId: null,
    uploadedByUserId: null,
    bucketName: uploaded.bucketName,
    objectPath: uploaded.objectPath,
    originalFileName: fileName,
    contentType: uploaded.contentType,
    sizeBytes: uploaded.sizeBytes,
  });
}

export async function attachCreativeAssetsToStorage(options: {
  tenantId: number;
  account: Resource;
  campaignId: string;
  adId: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  existingSnapshot?: MetaAdCreativeSnapshot | undefined;
}): Promise<{
  thumbnailStorageUploadId: number | null;
  previewStorageUploadId: number | null;
  thumbnailCachedAt: Date | null;
  previewCachedAt: Date | null;
  cachedThumbnailUrl: string | null;
  cachedPreviewUrl: string | null;
}> {
  const result = {
    thumbnailStorageUploadId: options.existingSnapshot?.thumbnailStorageUploadId ?? null,
    previewStorageUploadId: options.existingSnapshot?.previewStorageUploadId ?? null,
    thumbnailCachedAt: options.existingSnapshot?.thumbnailCachedAt ?? null,
    previewCachedAt: options.existingSnapshot?.previewCachedAt ?? null,
    cachedThumbnailUrl: options.thumbnailUrl,
    cachedPreviewUrl: options.previewUrl,
  };

  if (
    options.thumbnailUrl &&
    (!options.existingSnapshot ||
      options.existingSnapshot.thumbnailSourceUrl !== options.thumbnailUrl ||
      !options.existingSnapshot.thumbnailStorageUploadId)
  ) {
    const upload = await persistCreativeImage({
      tenantId: options.tenantId,
      account: options.account,
      campaignId: options.campaignId,
      adId: options.adId,
      variant: "thumb",
      sourceUrl: options.thumbnailUrl,
    });

    if (upload) {
      result.thumbnailStorageUploadId = upload.id;
      result.thumbnailCachedAt = new Date();
      result.cachedThumbnailUrl = getGcsObjectHttpUrl(upload.bucketName, upload.objectPath);
    }
  }

  if (
    options.previewUrl &&
    options.previewUrl !== options.thumbnailUrl &&
    (!options.existingSnapshot ||
      options.existingSnapshot.previewSourceUrl !== options.previewUrl ||
      !options.existingSnapshot.previewStorageUploadId)
  ) {
    const upload = await persistCreativeImage({
      tenantId: options.tenantId,
      account: options.account,
      campaignId: options.campaignId,
      adId: options.adId,
      variant: "preview",
      sourceUrl: options.previewUrl,
    });

    if (upload) {
      result.previewStorageUploadId = upload.id;
      result.previewCachedAt = new Date();
      result.cachedPreviewUrl = getGcsObjectHttpUrl(upload.bucketName, upload.objectPath);
    }
  } else if (
    options.previewUrl &&
    options.previewUrl === options.thumbnailUrl &&
    result.thumbnailStorageUploadId
  ) {
    result.previewStorageUploadId = result.thumbnailStorageUploadId;
    result.previewCachedAt = result.thumbnailCachedAt;
    result.cachedPreviewUrl = result.cachedThumbnailUrl;
  }

  return result;
}
