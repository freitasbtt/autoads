import { Router } from "express";
import type { User } from "@shared/schema";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";
import { setNoCacheHeaders } from "../../utils/cache";

export const driveRouter = Router();

driveRouter.use(isAuthenticated);

driveRouter.get("/drive/folders", async (req, res) => {
  try {
    const user = req.user as User;
    const rawQuery = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const limitParam = typeof req.query.limit === "string" ? req.query.limit : "";
    const limitParsed = Number.parseInt(limitParam, 10);
    const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 25) : 10;

    if (rawQuery.length < 3) {
      return res.json([]);
    }

    const integration = await storage.getIntegrationByProvider(user.tenantId, "Google Drive");
    const config = (integration?.config ?? {}) as Record<string, unknown>;
    const accessToken = typeof config.accessToken === "string" ? config.accessToken : "";

    if (!accessToken) {
      return res.status(400).json({ message: "Integracao com Google Drive nao configurada." });
    }

    const safeQuery = rawQuery.replace(/'/g, "\\'");
    const query = [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `name contains '${safeQuery}'`,
    ].join(" and ");

    const params = new URLSearchParams({
      q: query,
      fields: "files(id,name)",
      pageSize: String(limit),
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Drive search failed:", response.status, errorText);
      const status = response.status === 401 ? 401 : 502;
      return res.status(status).json({
        message:
          response.status === 401
            ? "Token do Google Drive expirado. Refaça a integracao."
            : "Falha ao buscar pastas no Google Drive.",
      });
    }

    const body: any = await response.json();
    const folders = Array.isArray(body?.files)
      ? body.files
          .map((file: any) => ({
            id: typeof file?.id === "string" ? file.id : "",
            name: typeof file?.name === "string" ? file.name : "",
          }))
          .filter((file: { id: string; name: string }) => file.id.length > 0 && file.name.length > 0)
      : [];

    setNoCacheHeaders(res);
    res.removeHeader("ETag");
    return res.json(folders);
  } catch (err) {
    console.error("Drive folder search error:", err);
    return res.status(500).json({ message: "Falha ao buscar pastas no Google Drive." });
  }
});
