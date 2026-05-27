import express, { Router } from "express";
import { z } from "zod";
import type { User } from "@shared/schema";
import { isAdmin, isAuthenticated } from "../../middlewares/auth";
import { createRateLimit } from "../../middlewares/rate-limit";
import { storage } from "../storage";
import { getPublicAppUrl } from "../../utils/url";
import { createStorageUploadPublicId } from "./token";
import {
  buildStorageObjectPath,
  getGcsConfigSummary,
  getGcsObjectGsUri,
  getGcsObjectHttpUrl,
  sanitizePathPrefix,
  uploadBufferToGcs,
} from "./service";

const rawUploadParser = express.raw({
  type: () => true,
  limit: process.env.MAX_STORAGE_UPLOAD_SIZE ?? "100mb",
});

const createLinkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pathPrefix: z.string().trim().max(200).optional().default(""),
  expiresAt: z.string().datetime(),
});

function normalizeFileName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function isLinkActive(link: {
  expiresAt: Date;
  revokedAt: Date | null;
}): boolean {
  if (link.revokedAt) {
    return false;
  }
  return link.expiresAt.getTime() > Date.now();
}

function buildPublicUploadUrl(req: express.Request, publicId: string): string {
  return `${getPublicAppUrl(req)}/upload/${encodeURIComponent(publicId)}`;
}

function serializeLink(req: express.Request, link: {
  id: number;
  name: string;
  publicId: string;
  pathPrefix: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: link.id,
    name: link.name,
    publicId: link.publicId,
    pathPrefix: link.pathPrefix,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    createdAt: link.createdAt,
    active: isLinkActive(link),
    publicUrl: buildPublicUploadUrl(req, link.publicId),
  };
}

async function getActiveLinkByPublicId(publicId: string) {
  const link = await storage.getStorageUploadLinkByPublicId(publicId);
  if (!link) {
    return { link: null, reason: "not_found" as const };
  }
  if (link.revokedAt) {
    return { link: null, reason: "revoked" as const };
  }
  if (link.expiresAt.getTime() <= Date.now()) {
    return { link: null, reason: "expired" as const };
  }
  return { link, reason: null };
}

async function persistUploadedObject(options: {
  tenantId: number;
  uploadedByUserId?: number | null;
  uploadLinkId?: number | null;
  batchId?: string | null;
  taskTitle?: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  pathPrefix?: string;
}) {
  const objectPath = buildStorageObjectPath({
    tenantId: options.tenantId,
    fileName: options.fileName,
    linkId: options.uploadLinkId ?? null,
    pathPrefix: options.pathPrefix,
  });
  const uploaded = await uploadBufferToGcs({
    objectPath,
    buffer: options.buffer,
    contentType: options.contentType,
  });
  const created = await storage.createStorageUpload({
    tenantId: options.tenantId,
    uploadLinkId: options.uploadLinkId ?? null,
    uploadedByUserId: options.uploadedByUserId ?? null,
    bucketName: uploaded.bucketName,
    objectPath: uploaded.objectPath,
    originalFileName: options.fileName,
    contentType: uploaded.contentType,
    sizeBytes: uploaded.sizeBytes,
  });

  let task =
    options.batchId && options.batchId.trim().length > 0
      ? await storage.getStorageTaskByBatch(
          options.tenantId,
          options.uploadLinkId ?? null,
          options.batchId.trim(),
        )
      : undefined;

  if (!task) {
    task = await storage.createStorageTask({
      tenantId: options.tenantId,
      storageUploadId: created.id,
      uploadLinkId: options.uploadLinkId ?? null,
      batchId: options.batchId?.trim() || null,
      title: options.taskTitle?.trim() || `Revisar upload: ${options.fileName}`,
      status: "pending",
      pairsJson: [],
    });
  }

  await storage.createStorageTaskUpload({
    taskId: task.id,
    storageUploadId: created.id,
  });

  return {
    ...created,
    taskId: task.id,
    gsUri: getGcsObjectGsUri(uploaded.bucketName, uploaded.objectPath),
    objectUrl: getGcsObjectHttpUrl(uploaded.bucketName, uploaded.objectPath),
  };
}

export const gcsRouter = Router();
export const publicGcsRouter = Router();

const publicUploadRateLimit = createRateLimit({
  name: "public-storage-upload",
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Muitos uploads enviados por este link. Aguarde antes de tentar novamente.",
  keyGenerator: (req) => {
    const publicId =
      typeof req.params.publicId === "string" && req.params.publicId.trim().length > 0
        ? req.params.publicId.trim()
        : "unknown-link";
    return `${req.ip}:${publicId}`;
  },
});

gcsRouter.use(isAuthenticated, isAdmin);

gcsRouter.get("/storage/config", async (req, res, next) => {
  try {
    const summary = await getGcsConfigSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

gcsRouter.get("/storage/upload-links", async (req, res, next) => {
  try {
    const user = req.user as User;
    const links = await storage.getStorageUploadLinksByTenant(user.tenantId);
    const ordered = links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(ordered.map((link) => serializeLink(req, link)));
  } catch (err) {
    next(err);
  }
});

gcsRouter.post("/storage/upload-links", async (req, res, next) => {
  try {
    const user = req.user as User;
    const parsed = createLinkSchema.parse(req.body);
    const expiresAt = new Date(parsed.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "expiresAt deve estar no futuro." });
    }

    const created = await storage.createStorageUploadLink({
      tenantId: user.tenantId,
      createdByUserId: user.id,
      name: parsed.name,
      pathPrefix: sanitizePathPrefix(parsed.pathPrefix),
      publicId: createStorageUploadPublicId(),
      expiresAt,
      revokedAt: null,
    });

    res.status(201).json(serializeLink(req, created));
  } catch (err) {
    next(err);
  }
});

gcsRouter.delete("/storage/upload-links/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Link invalido." });
    }

    const existing = await storage.getStorageUploadLink(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Link nao encontrado." });
    }

    const revoked = await storage.revokeStorageUploadLink(id, new Date());
    if (!revoked) {
      return res.status(500).json({ message: "Nao foi possivel excluir o link." });
    }

    res.json(serializeLink(req, revoked));
  } catch (err) {
    next(err);
  }
});

gcsRouter.get("/storage/uploads", async (req, res, next) => {
  try {
    const user = req.user as User;
    const uploads = await storage.getStorageUploadsByTenant(user.tenantId);
    const links = await storage.getStorageUploadLinksByTenant(user.tenantId);
    const linkById = new Map(links.map((link) => [link.id, link]));

    const ordered = uploads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(
      ordered.map((upload) => ({
        ...upload,
        gsUri: getGcsObjectGsUri(upload.bucketName, upload.objectPath),
        objectUrl: getGcsObjectHttpUrl(upload.bucketName, upload.objectPath),
        linkName: upload.uploadLinkId ? linkById.get(upload.uploadLinkId)?.name ?? null : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

gcsRouter.post("/storage/uploads", rawUploadParser, async (req, res, next) => {
  try {
    const user = req.user as User;
    const fileName = normalizeFileName(req.query.fileName);
    if (!fileName) {
      return res.status(400).json({ message: "fileName obrigatorio." });
    }

    const contentType =
      typeof req.headers["content-type"] === "string" && req.headers["content-type"].trim().length > 0
        ? req.headers["content-type"].trim()
        : "application/octet-stream";

    const rawBody = req.body;
    const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.alloc(0);
    if (buffer.byteLength === 0) {
      return res.status(400).json({ message: "Arquivo vazio." });
    }

    const pathPrefix =
      typeof req.query.pathPrefix === "string" ? sanitizePathPrefix(req.query.pathPrefix) : "";
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId.trim() : "";

    const created = await persistUploadedObject({
      tenantId: user.tenantId,
      uploadedByUserId: user.id,
      batchId,
      taskTitle: `Revisar upload: ${fileName}`,
      fileName,
      contentType,
      buffer,
      pathPrefix,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

publicGcsRouter.get("/storage/upload-links/:publicId", async (req, res, next) => {
  try {
    const publicId = normalizeFileName(req.params.publicId);
    if (!publicId) {
      return res.status(400).json({ message: "Link invalido." });
    }

    const { link, reason } = await getActiveLinkByPublicId(publicId);
    if (!link) {
      const message =
        reason === "revoked"
          ? "Este link foi excluido pelo administrador."
          : reason === "expired"
          ? "Este link expirou."
          : "Link nao encontrado.";
      return res.status(404).json({ message });
    }

    res.json({
      id: link.id,
      name: link.name,
      pathPrefix: link.pathPrefix,
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

publicGcsRouter.post(
  "/storage/upload-links/:publicId/files",
  publicUploadRateLimit,
  rawUploadParser,
  async (req, res, next) => {
    try {
      const publicId = normalizeFileName(req.params.publicId);
      if (!publicId) {
        return res.status(400).json({ message: "Link invalido." });
      }

      const { link, reason } = await getActiveLinkByPublicId(publicId);
      if (!link) {
        const message =
          reason === "revoked"
            ? "Este link foi excluido pelo administrador."
            : reason === "expired"
            ? "Este link expirou."
            : "Link nao encontrado.";
        return res.status(404).json({ message });
      }

      const fileName = normalizeFileName(req.query.fileName);
      if (!fileName) {
        return res.status(400).json({ message: "fileName obrigatorio." });
      }
      const batchId = typeof req.query.batchId === "string" ? req.query.batchId.trim() : "";

      const contentType =
        typeof req.headers["content-type"] === "string" && req.headers["content-type"].trim().length > 0
          ? req.headers["content-type"].trim()
          : "application/octet-stream";

      const rawBody = req.body;
      const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.alloc(0);
      if (buffer.byteLength === 0) {
        return res.status(400).json({ message: "Arquivo vazio." });
      }

      const created = await persistUploadedObject({
        tenantId: link.tenantId,
        uploadLinkId: link.id,
        batchId,
        taskTitle: `Tarefa: ${link.name}`,
        fileName,
        contentType,
        buffer,
        pathPrefix: link.pathPrefix,
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);
