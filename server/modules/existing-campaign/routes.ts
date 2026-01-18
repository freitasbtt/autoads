import { Router } from "express";
import type { User } from "@shared/schema";
import crypto from "crypto";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";
import { MetaGraphClient } from "../meta";
import { getMetaAccess } from "../meta/services/access.service";
import { resolveMetaAppSecret } from "../meta/utils/app-config";

type Issue = {
  code: string;
  message?: string;
  count?: number;
  examples?: string[];
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

type PairEntry = {
  key: string;
  pairId: string;
  productToken: string;
  positions: Set<"FEED" | "STORIES">;
  files: Partial<Record<"FEED" | "STORIES", string>>;
};

const SUPPORTED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
]);

function extractString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function normalizeToken(value: string): string {
  const stripped = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  if (!stripped) return "";
  const parts = stripped.split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function normalizeWords(value: string): string[] {
  const stripped = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  if (!stripped) return [];
  return stripped.split(/\s+/);
}

function parsePosition(raw: string): "FEED" | "STORIES" | null {
  const upper = raw.toUpperCase();
  if (upper === "FEED") return "FEED";
  if (upper === "STORY" || upper === "STORIES") return "STORIES";
  return null;
}

function parseFileName(baseName: string): {
  pairId: string;
  productToken: string;
  position: "FEED" | "STORIES";
} | null {
  const parts = baseName.split("_").filter((part) => part.length > 0);
  if (parts.length < 4) {
    return null;
  }

  const position = parsePosition(parts[parts.length - 1]);
  if (!position) {
    return null;
  }

  const pairBase = parts.slice(0, 2);
  if (pairBase.length < 2 || pairBase.some((part) => part.length === 0)) {
    return null;
  }

  const productPart = parts.slice(2, -1).join("_");
  if (!productPart) {
    return null;
  }

  const productToken = normalizeToken(productPart);
  if (!productToken) {
    return null;
  }

  return {
    pairId: `${pairBase[0]}_${pairBase[1]}`,
    productToken,
    position,
  };
}

async function refreshDriveToken(options: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; tokenType?: string; expiresIn?: number } | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data: any = await response.json();
  if (data?.access_token) {
    return {
      accessToken: String(data.access_token),
      tokenType: typeof data.token_type === "string" ? data.token_type : undefined,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    };
  }

  return null;
}

async function listDriveFiles(
  user: User,
  driveFolderId: string,
): Promise<{
  files: DriveFile[];
  error?: string;
}> {
  const integration = await storage.getIntegrationByProvider(user.tenantId, "Google Drive");
  const config = (integration?.config ?? {}) as Record<string, unknown>;
  let accessToken = typeof config.accessToken === "string" ? config.accessToken : "";
  const refreshToken = typeof config.refreshToken === "string" ? config.refreshToken : "";

  if (!accessToken) {
    return { files: [], error: "missing_drive_access" };
  }

  const safeFolderId = driveFolderId.replace(/'/g, "\\'");
  const query = [
    `'${safeFolderId}' in parents`,
    "trashed = false",
    "mimeType != 'application/vnd.google-apps.folder'",
  ].join(" and ");

  const fetchPage = async (token: string, pageToken?: string) => {
    const params = new URLSearchParams({
      q: query,
      fields: "files(id,name,mimeType),nextPageToken",
      pageSize: "1000",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    return fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  };

  let pageToken: string | undefined;
  const files: DriveFile[] = [];
  let refreshed = false;

  do {
    let response = await fetchPage(accessToken, pageToken);

    if (response.status === 401 && refreshToken && !refreshed) {
      const settings = await storage.getAppSettings();
      if (settings?.googleClientId && settings.googleClientSecret) {
        const refreshedToken = await refreshDriveToken({
          refreshToken,
          clientId: settings.googleClientId,
          clientSecret: settings.googleClientSecret,
        });
        if (refreshedToken?.accessToken) {
          accessToken = refreshedToken.accessToken;
          refreshed = true;
          if (integration?.id) {
            await storage.updateIntegration(integration.id, {
              config: {
                ...config,
                accessToken,
                tokenType: refreshedToken.tokenType ?? config.tokenType,
                expiresIn: refreshedToken.expiresIn ?? config.expiresIn,
              },
              status: "connected",
              lastChecked: new Date(),
            });
          }
          response = await fetchPage(accessToken, pageToken);
        }
      }
    }

    if (!response.ok) {
      return { files: [], error: `drive_error_${response.status}` };
    }

    const body: any = await response.json();
    const pageFiles = Array.isArray(body?.files) ? body.files : [];
    pageFiles.forEach((file: any) => {
      const id = typeof file?.id === "string" ? file.id : "";
      const name = typeof file?.name === "string" ? file.name : "";
      const mimeType = typeof file?.mimeType === "string" ? file.mimeType : "";
      if (id && name) {
        files.push({ id, name, mimeType });
      }
    });

    pageToken = typeof body?.nextPageToken === "string" ? body.nextPageToken : undefined;
  } while (pageToken);

  return { files };
}

export const existingCampaignRouter = Router();

existingCampaignRouter.use(isAuthenticated);

existingCampaignRouter.post("/existing-campaign/preflight", async (req, res, next) => {
  try {
    const user = req.user as User;
    const payload = req.body ?? {};

    const adAccountId = extractString(
      payload.ad_account_id ??
        payload.account_id ??
        payload.accountId ??
        payload.account_resource_id,
    );
    const driveFolderId = extractString(payload.drive_folder_id ?? payload.driveFolderId);
    const pageId = extractString(payload.page_id ?? payload.pageId);
    const instagramUserId = extractString(
      payload.instagram_user_id ?? payload.instagramId,
    );
    const leadFormId = extractString(
      payload.lead_form_id ?? payload.leadgen_form_id ?? payload.leadFormId,
    );
    const externalId = extractString(
      payload.external_id ?? payload.campaign_id ?? payload.externalId,
    );

    const adAccountNumeric = adAccountId.replace(/\D+/g, "");
    if (!adAccountNumeric) {
      return res.status(400).json({ message: "ad_account_id obrigatorio" });
    }
    const adAccountIdForMeta = adAccountId.toLowerCase().startsWith("act_")
      ? adAccountId
      : `act_${adAccountNumeric}`;
    if (!driveFolderId) {
      return res.status(400).json({ message: "drive_folder_id obrigatorio" });
    }

    const warnings: Issue[] = [];
    const errors: Issue[] = [];

    const tenantResources = await storage.getResourcesByTenant(user.tenantId);
    const pageResource =
      pageId.length > 0
        ? tenantResources.find(
            (resource) => resource.type === "page" && resource.value === pageId,
          )
        : null;
    const instagramResource =
      instagramUserId.length > 0
        ? tenantResources.find(
            (resource) =>
              resource.type === "instagram" && resource.value === instagramUserId,
          )
        : null;
    const leadformResource =
      leadFormId.length > 0
        ? tenantResources.find(
            (resource) => resource.type === "leadform" && resource.value === leadFormId,
          )
        : null;

    if (pageResource && instagramUserId.length > 0) {
      const metadata = (pageResource.metadata ?? {}) as Record<string, unknown>;
      const instagramIdFromPage =
        typeof metadata.instagramId === "string" ? metadata.instagramId : null;
      const instagramResourceIdRaw = metadata.instagramResourceId;
      const instagramResourceId =
        typeof instagramResourceIdRaw === "number"
          ? instagramResourceIdRaw
          : typeof instagramResourceIdRaw === "string"
            ? Number.parseInt(instagramResourceIdRaw, 10)
            : null;
      const instagramById =
        instagramResourceId && Number.isFinite(instagramResourceId)
          ? tenantResources.find(
              (resource) =>
                resource.type === "instagram" && resource.id === instagramResourceId,
            )
          : null;
      const expectedInstagram =
        instagramIdFromPage || (instagramById?.value ?? null);

      if (expectedInstagram && expectedInstagram !== instagramUserId) {
        warnings.push({
          code: "PAGE_INSTAGRAM_MISMATCH",
          message: "Instagram nao vinculado a pagina informada.",
        });
      }
      if (!expectedInstagram && !instagramResource) {
        warnings.push({
          code: "PAGE_INSTAGRAM_MISMATCH",
          message: "Instagram informado nao encontrado nos recursos do tenant.",
        });
      }
    }

    if (pageResource && leadformResource) {
      const leadMeta = (leadformResource.metadata ?? {}) as Record<string, unknown>;
      const leadPageId =
        typeof leadMeta.pageId === "string"
          ? leadMeta.pageId
          : typeof leadMeta.pageValue === "string"
            ? leadMeta.pageValue
            : null;
      const leadPageResourceId =
        typeof leadMeta.pageResourceId === "number"
          ? leadMeta.pageResourceId
          : typeof leadMeta.pageResourceId === "string"
            ? Number.parseInt(leadMeta.pageResourceId, 10)
            : null;

      const matchesPage =
        (leadPageId && leadPageId === pageId) ||
        (leadPageResourceId &&
          Number.isFinite(leadPageResourceId) &&
          leadPageResourceId === pageResource.id);

      if (!matchesPage) {
        warnings.push({
          code: "PAGE_LEADFORM_MISMATCH",
          message: "Formulario nao vinculado a pagina informada.",
        });
      }
    }

    const driveResult = await listDriveFiles(user, driveFolderId);
    if (driveResult.error) {
      errors.push({
        code: "DRIVE_NO_ACCESS",
        message: "Sem permissao para acessar a pasta do Drive.",
      });
    }

    const files = driveResult.files;
    if (!driveResult.error && files.length === 0) {
      errors.push({
        code: "DRIVE_EMPTY",
        message: "Pasta do Drive sem arquivos.",
      });
    }

    let invalidNamingCount = 0;
    const invalidNamingExamples: string[] = [];
    let unsupportedExtCount = 0;
    let duplicatePositioningCount = 0;
    let validFilesCount = 0;

    const pairMap = new Map<string, PairEntry>();

    if (!driveResult.error && files.length > 0) {
      for (const file of files) {
        const name = file.name ?? "";
        const dotIndex = name.lastIndexOf(".");
        const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
        const baseName = dotIndex >= 0 ? name.slice(0, dotIndex) : name;

        if (!SUPPORTED_EXTENSIONS.has(extension)) {
          unsupportedExtCount += 1;
          continue;
        }

        const parsed = parseFileName(baseName);
        if (!parsed) {
          invalidNamingCount += 1;
          if (invalidNamingExamples.length < 10) {
            invalidNamingExamples.push(name);
          }
          continue;
        }

        validFilesCount += 1;
        const key = `${parsed.pairId}__${parsed.productToken}`;
        let entry = pairMap.get(key);
        if (!entry) {
          entry = {
            key,
            pairId: parsed.pairId,
            productToken: parsed.productToken,
            positions: new Set(),
            files: {},
          };
          pairMap.set(key, entry);
        }

        if (entry.files[parsed.position]) {
          duplicatePositioningCount += 1;
        } else {
          entry.files[parsed.position] = name;
          entry.positions.add(parsed.position);
        }
      }
    }

    if (invalidNamingCount > 0) {
      warnings.push({
        code: "INVALID_FILE_NAMING",
        count: invalidNamingCount,
        examples: invalidNamingExamples,
      });
    }

    if (unsupportedExtCount > 0) {
      warnings.push({
        code: "FILE_EXT_UNSUPPORTED",
        count: unsupportedExtCount,
      });
    }

    if (duplicatePositioningCount > 0) {
      warnings.push({
        code: "DUPLICATE_POSITIONING",
        count: duplicatePositioningCount,
      });
    }

    const detectedPairs = Array.from(pairMap.values());
    const completePairs = detectedPairs.filter((pair) => pair.positions.size === 2);
    const orphanPairsCount = Math.max(detectedPairs.length - completePairs.length, 0);

    if (orphanPairsCount > 0) {
      warnings.push({
        code: "DRIVE_ORPHAN_FILES",
        count: orphanPairsCount,
      });
    }

    if (!driveResult.error && files.length > 0 && completePairs.length === 0) {
      errors.push({
        code: "NO_COMPLETE_PAIRS",
        message: "Nenhum par completo FEED+STORIES encontrado.",
      });
    }

    let metaError: string | null = null;
    let campaigns: Array<{ id: string; name?: string }> = [];
    let adsets: Array<{
      id: string;
      name?: string;
      campaign_id?: string;
      end_time?: string;
    }> = [];

    const metaAccess = await getMetaAccess(user.tenantId);
    const settings = await storage.getAppSettings();
    const metaAppSecret = resolveMetaAppSecret(settings);

    if (!metaAccess || !metaAppSecret) {
      metaError =
        "Meta access token ou app secret ausente para consultar campanhas.";
    } else {
      try {
        const client = new MetaGraphClient(metaAccess.accessToken, metaAppSecret);
        const fetchedCampaigns = await client.fetchCampaigns(adAccountIdForMeta);
        const activeCampaigns = fetchedCampaigns.filter(
          (campaign) => (campaign.status ?? "").toUpperCase() === "ACTIVE",
        );
        campaigns = activeCampaigns;

        const fetchedAdsets = await client.fetchAdsets(adAccountIdForMeta);
        const activeCampaignIds = new Set(activeCampaigns.map((campaign) => campaign.id));
        if (activeCampaignIds.size > 0) {
          adsets = fetchedAdsets.filter((adset) =>
            adset.campaign_id ? activeCampaignIds.has(adset.campaign_id) : false,
          );
        } else {
          adsets = [];
        }
      } catch (err: any) {
        metaError = err?.message ?? "Falha ao consultar campanhas na Meta.";
      }
    }
    if (metaError) {
      warnings.push({
        code: "META_FETCH_FAILED",
        message: metaError,
      });
    }

    const pairsArray = completePairs.map((pair) => ({
      key: pair.key,
      pair_id: pair.pairId,
      product_token: pair.productToken,
      feed_file: pair.files.FEED ?? null,
      stories_file: pair.files.STORIES ?? null,
    }));

    const pairMatchesByCampaign = new Map<string, PairEntry[]>();
    const campaignTokensCache = new Map<string, Set<string>>();

    if (!metaError && completePairs.length > 0) {
      for (const campaign of campaigns) {
        const campaignName = campaign.name ?? "";
        const tokens = new Set(normalizeWords(campaignName));
        campaignTokensCache.set(campaign.id, tokens);
      }

      for (const pair of completePairs) {
        for (const campaign of campaigns) {
          const tokens = campaignTokensCache.get(campaign.id);
          if (!tokens || tokens.size === 0) continue;
          if (tokens.has(pair.productToken)) {
            const list = pairMatchesByCampaign.get(campaign.id) ?? [];
            list.push(pair);
            pairMatchesByCampaign.set(campaign.id, list);
          }
        }
      }
    }

    const matchedCampaigns = campaigns.filter((campaign) =>
      pairMatchesByCampaign.has(campaign.id),
    );

    if (!metaError && completePairs.length > 0 && matchedCampaigns.length === 0) {
      warnings.push({ code: "NO_CAMPAIGN_MATCH" });
    }

    const adsetsByCampaign = new Map<
      string,
      Array<{ id: string; name: string; endTime: string | null }>
    >();
    for (const adset of adsets) {
      const campaignId = adset.campaign_id;
      const adsetId = adset.id;
      if (!campaignId || !adsetId) continue;
      const name = adset.name ?? adsetId;
      const endTime = typeof adset.end_time === "string" ? adset.end_time : null;
      const entries = adsetsByCampaign.get(campaignId) ?? [];
      if (!entries.find((entry) => entry.id === adsetId)) {
        entries.push({ id: adsetId, name, endTime });
        adsetsByCampaign.set(campaignId, entries);
      }
    }

    const expiredAdsetExamples: string[] = [];
    let expiredAdsetCount = 0;
    const now = Date.now();
    for (const campaign of matchedCampaigns) {
      const campaignAdsets = adsetsByCampaign.get(campaign.id) ?? [];
      for (const adset of campaignAdsets) {
        if (!adset.endTime) continue;
        const parsed = Date.parse(adset.endTime);
        if (!Number.isFinite(parsed)) continue;
        if (parsed < now) {
          expiredAdsetCount += 1;
          if (expiredAdsetExamples.length < 10) {
            expiredAdsetExamples.push(adset.name);
          }
        }
      }
    }

    if (expiredAdsetCount > 0) {
      warnings.push({
        code: "ADSET_END_DATE_EXPIRED",
        count: expiredAdsetCount,
        examples: expiredAdsetExamples,
      });
    }

    const previewLines: string[] = [];
    if (matchedCampaigns.length === 0) {
      previewLines.push("Nenhuma campanha encontrada para os pares do Drive.");
    } else {
      previewLines.push("Campanhas formadas:");
      for (const campaign of matchedCampaigns) {
        const campaignName = campaign.name ?? campaign.id;
        previewLines.push(`Campanha: ${campaignName}`);
        const adsets = adsetsByCampaign.get(campaign.id) ?? [
          { id: "unknown", name: "Sem conjunto" },
        ];
        const pairsForCampaign = pairMatchesByCampaign.get(campaign.id) ?? [];
        for (const adset of adsets) {
          previewLines.push(`  Conjunto: ${adset.name}`);
          const limitedPairs = pairsForCampaign.slice(0, 10);
          for (const pair of limitedPairs) {
            previewLines.push(
              `    Anuncio: ${pair.pairId}_${pair.productToken} (FEED+STORIES)`,
            );
          }
          if (pairsForCampaign.length > 10) {
            previewLines.push(
              `    + ${pairsForCampaign.length - 10} anuncios`,
            );
          }
        }
      }
    }

    const previewText = previewLines.join("\n");

    const summary = {
      total_files: files.length,
      valid_files: validFilesCount,
      invalid_naming: invalidNamingCount,
      unsupported_ext: unsupportedExtCount,
      duplicate_positioning: duplicatePositioningCount,
      pairs_detected: detectedPairs.length,
      complete_pairs: completePairs.length,
      campaigns_matched: matchedCampaigns.length,
      adsets_matched: matchedCampaigns.reduce(
        (total, campaign) => total + (adsetsByCampaign.get(campaign.id)?.length ?? 0),
        0,
      ),
      adsets_expired: expiredAdsetCount,
      meta_error: metaError ?? undefined,
    };

    const status =
      errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARN" : "OK";
    const canContinue = status !== "ERROR";

    const runId = crypto.randomUUID();
    const runRecord = await storage.createExistingCampaignRun({
      runId,
      tenantId: user.tenantId,
      externalId: externalId || null,
      payloadOriginal: payload,
      pairsArray,
      previewText,
      warnings,
      errors,
      summary,
      status,
      canContinue,
    });

    return res.json({
      run_id: runRecord.runId,
      tenant_id: runRecord.tenantId,
      external_id: runRecord.externalId,
      payload_original: runRecord.payloadOriginal,
      pairs_array: runRecord.pairsArray,
      preview_text: runRecord.previewText,
      warnings: runRecord.warnings,
      errors: runRecord.errors,
      summary: runRecord.summary,
      status: runRecord.status,
      can_continue: runRecord.canContinue,
    });
  } catch (err) {
    next(err);
  }
});
