import { Router, type Request } from "express";
import { z } from "zod";
import { differenceInCalendarDays, format, isValid, parseISO, subDays } from "date-fns";
import type { User } from "@shared/schema";
import { storage } from "../storage";
import { MetaGraphClient, fetchMetaDashboardMetrics } from ".";
import type { MetricTotals as MetaMetricTotals } from ".";
import { decryptMetaAccessToken } from "./utils/token";
import { getMetaAccess } from "./services/access.service";
import { setNoCacheHeaders } from "../../utils/cache";
import { isAuthenticated } from "../../middlewares/auth";
import { generateAppSecretProof } from "./utils/crypto";

type MetaIntegrationConfig = {
  accessToken?: string | null;
};

const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const dashboardMetricsQuerySchema = z.object({
  startDate: z.string().regex(DATE_PARAM_REGEX).optional(),
  endDate: z.string().regex(DATE_PARAM_REGEX).optional(),
});

function normalizeQueryArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return undefined;
}

function parseNumberQueryParam(value: unknown): number[] | undefined {
  const entries = normalizeQueryArray(value);
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const numbers = entries
    .map((entry) => Number.parseInt(entry, 10))
    .filter((num) => Number.isFinite(num));

  return numbers.length > 0 ? numbers : undefined;
}

function parseStringQueryParam(value: unknown): string[] | undefined {
  const entries = normalizeQueryArray(value);
  if (!entries || entries.length === 0) {
    return undefined;
  }
  return entries;
}

function emptyTotals(): MetaMetricTotals {
  return {
    spend: 0,
    resultSpend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    results: 0,
    costPerResult: null,
  };
}

function parseQueryParam(value: unknown): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function validateInternalRequest(req: Request): {
  valid: boolean;
  status?: number;
  message?: string;
} {
  const configuredSecret = process.env.INTERNAL_API_SECRET;
  if (!configuredSecret || configuredSecret.length === 0) {
    return {
      valid: false,
      status: 500,
      message: "Internal API secret not configured",
    };
  }

  const headerSecret = req.get("x-internal-api-secret");
  const querySecret = typeof req.query.api_secret === "string" ? req.query.api_secret : undefined;
  const providedSecret = headerSecret ?? querySecret;

  if (providedSecret !== configuredSecret) {
    return { valid: false, status: 401, message: "Unauthorized" };
  }

  return { valid: true };
}

export const metaRouter = Router();
export const internalMetaRouter = Router();

metaRouter.use(isAuthenticated);

metaRouter.get("/dashboard/metrics", async (req, res, next) => {
  try {
    const user = req.user as User;
    const query = dashboardMetricsQuerySchema.parse(req.query);

    if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
      return res.status(400).json({ message: "Forneca startDate e endDate juntos ou nenhum deles." });
    }

    const accountIds = parseNumberQueryParam(req.query.accountId);
    const campaignIdParams = parseStringQueryParam(req.query.campaignId);
    const objectivesParam = parseStringQueryParam(req.query.objective);
    const statusParam = parseStringQueryParam(req.query.status);

    const allResources = await storage.getResourcesByTenant(user.tenantId);
    const accountResources = allResources.filter((resource) => resource.type === "account");

    const selectedAccounts =
      accountIds && accountIds.length > 0
        ? accountResources.filter((resource) => accountIds.includes(resource.id))
        : accountResources;

    if (selectedAccounts.length === 0) {
      return res.json({
        dateRange: {
          start: query.startDate ?? null,
          end: query.endDate ?? null,
          previousStart: null,
          previousEnd: null,
        },
        totals: emptyTotals(),
        previousTotals: emptyTotals(),
        accounts: [],
      });
    }

    const integration = await storage.getIntegrationByProvider(user.tenantId, "Meta");
    const metaConfig = (integration?.config ?? {}) as MetaIntegrationConfig;

    const metaAccessToken = decryptMetaAccessToken(metaConfig.accessToken ?? null);
    if (!metaAccessToken) {
      return res.status(400).json({
        message: "Integracao com Meta nao esta conectada ou token indisponivel para este tenant.",
      });
    }

    const settings = await storage.getAppSettings();
    if (!settings?.metaAppSecret) {
      return res.status(500).json({ message: "Meta app secret nao configurado." });
    }

    const campaignFilterSet =
      campaignIdParams && campaignIdParams.length > 0
        ? new Set(campaignIdParams.map(String))
        : undefined;
    const objectiveFilterSet =
      objectivesParam && objectivesParam.length > 0
        ? new Set(objectivesParam.map((value) => value.toUpperCase()))
        : undefined;
    const statusFilterSet =
      statusParam && statusParam.length > 0
        ? new Set(statusParam.map((value) => value.toUpperCase()))
        : undefined;

    let previousStart: string | null = null;
    let previousEnd: string | null = null;

    if (query.startDate && query.endDate) {
      const startDate = parseISO(query.startDate);
      const endDate = parseISO(query.endDate);
      if (!isValid(startDate) || !isValid(endDate)) {
        return res.status(400).json({ message: "Parametros de data invalidos." });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "O startDate deve ser menor ou igual ao endDate" });
      }

      const rangeDays = differenceInCalendarDays(endDate, startDate) + 1;
      const previousEndDate = subDays(startDate, 1);
      const previousStartDate = subDays(previousEndDate, Math.max(rangeDays - 1, 0));
      previousStart = format(previousStartDate, "yyyy-MM-dd");
      previousEnd = format(previousEndDate, "yyyy-MM-dd");
    }

    const client = new MetaGraphClient(metaAccessToken, settings.metaAppSecret);

    const metrics = await fetchMetaDashboardMetrics({
      accounts: selectedAccounts,
      client,
      campaignFilterSet,
      objectiveFilterSet,
      statusFilterSet,
      startDate: query.startDate ?? undefined,
      endDate: query.endDate ?? undefined,
      previousStartDate: previousStart ?? undefined,
      previousEndDate: previousEnd ?? undefined,
    });

    res.json({
      dateRange: {
        start: query.startDate ?? null,
        end: query.endDate ?? null,
        previousStart,
        previousEnd,
      },
      totals: metrics.totals,
      previousTotals: metrics.previousTotals,
      accounts: metrics.accounts,
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/meta/campaigns/:id/creatives", async (req, res, next) => {
  try {
    const user = req.user as User;
    const campaignId = req.params.id;
    const accountIdParam = req.query.accountId;

    if (typeof accountIdParam !== "string" || accountIdParam.length === 0) {
      return res.status(400).json({
        message: "Parametro accountId obrigatorio.",
      });
    }

    const startParam = typeof req.query.startDate === "string" ? req.query.startDate : null;
    const endParam = typeof req.query.endDate === "string" ? req.query.endDate : null;

    let timeRange: { since: string; until: string } | null = null;
    if (startParam && endParam) {
      const startDate = parseISO(startParam);
      const endDate = parseISO(endParam);
      if (!isValid(startDate) || !isValid(endDate)) {
        return res.status(400).json({ message: "Parametros de data invalidos." });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "O startDate deve ser menor ou igual ao endDate" });
      }
      timeRange = {
        since: format(startDate, "yyyy-MM-dd"),
        until: format(endDate, "yyyy-MM-dd"),
      };
    }

    const allResources = await storage.getResourcesByTenant(user.tenantId);
    const accountResources = allResources.filter((resource) => resource.type === "account");
    const accountMatch = accountResources.find((resource) => resource.value === accountIdParam);

    if (!accountMatch) {
      return res.status(404).json({
        message: "Conta nao encontrada ou nao pertence ao tenant atual.",
      });
    }

    const integration = await storage.getIntegrationByProvider(user.tenantId, "Meta");
    const metaConfig = (integration?.config ?? {}) as MetaIntegrationConfig;

    const metaAccessToken = decryptMetaAccessToken(metaConfig.accessToken ?? null);
    if (!metaAccessToken) {
      return res.status(400).json({
        message: "Integracao com Meta nao esta conectada ou token indisponivel para este tenant.",
      });
    }

    const settings = await storage.getAppSettings();
    if (!settings?.metaAppSecret) {
      return res.status(500).json({ message: "Meta app secret nao configurado." });
    }

    const client = new MetaGraphClient(metaAccessToken, settings.metaAppSecret);

    const accountCampaigns = await client.fetchCampaigns(accountIdParam);
    const thisCampaign = accountCampaigns.find((c) => c.id === campaignId);
    const campaignObjective = thisCampaign?.objective ?? null;

    const adReports = await client.fetchCampaignAdReports(
      accountIdParam,
      campaignId,
      campaignObjective,
      timeRange,
    );

    return res.json({
      creatives: adReports,
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/meta/search/cities", async (req, res, next) => {
  try {
    const user = req.user as User;
    const rawQuery = parseQueryParam(req.query.q);
    const query = rawQuery.trim();

    if (query.length < 2) {
      return res.json([]);
    }

    const access = await getMetaAccess(user.tenantId);
    if (!access) {
      return res.status(400).json({ message: "Integracao com Meta nao configurada" });
    }

    const params = new URLSearchParams({
      type: "adgeolocation",
      q: query,
      country_code: "BR",
      location_types: JSON.stringify(["city"]),
      access_token: access.accessToken,
    });

    if (access.appSecretProof) {
      params.set("appsecret_proof", access.appSecretProof);
    }

    const response = await fetch(`https://graph.facebook.com/v23.0/search?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Meta city search failed:", response.status, errorText);
      return res
        .status(response.status)
        .json({ message: "Falha ao buscar cidades no Meta", details: errorText });
    }

    const body: any = await response.json();
    const results = Array.isArray(body?.data)
      ? body.data
          .map((item: any) => ({
            id: String(item?.key ?? item?.id ?? ""),
            name: typeof item?.name === "string" ? item.name : "",
            region:
              typeof item?.region === "string"
                ? item.region
                : typeof item?.country_name === "string"
                  ? item.country_name
                  : undefined,
          }))
          .filter((item: { id: string; name: string }) => item.id.length > 0 && item.name.length > 0)
      : [];

    setNoCacheHeaders(res);
    res.removeHeader("ETag");
    setNoCacheHeaders(res);
    res.removeHeader("ETag");
    res.json(results);
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/meta/search/interests", async (req, res, next) => {
  try {
    const user = req.user as User;
    const rawQuery = parseQueryParam(req.query.q);
    const query = rawQuery.trim();

    if (query.length < 2) {
      return res.json([]);
    }

    const access = await getMetaAccess(user.tenantId);
    if (!access) {
      return res.status(400).json({ message: "Integracao com Meta nao configurada" });
    }

    const params = new URLSearchParams({
      type: "adinterest",
      q: query,
      limit: "10",
      locale: "pt_BR",
      access_token: access.accessToken,
    });

    if (access.appSecretProof) {
      params.set("appsecret_proof", access.appSecretProof);
    }

    const response = await fetch(`https://graph.facebook.com/v23.0/search?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Meta interest search failed:", response.status, errorText);
      return res
        .status(response.status)
        .json({ message: "Falha ao buscar interesses no Meta", details: errorText });
    }

    const body: any = await response.json();
    const results = Array.isArray(body?.data)
      ? body.data
          .map((item: any) => ({
            id: String(item?.id ?? ""),
            name: typeof item?.name === "string" ? item.name : "",
          }))
          .filter((item: { id: string; name: string }) => item.id.length > 0 && item.name.length > 0)
      : [];

    res.json(results);
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/meta/pages/:pageId/posts", async (req, res) => {
  try {
    const user = req.user as User;
    const rawPageId = typeof req.params.pageId === "string" ? req.params.pageId.trim() : "";

    if (rawPageId.length === 0) {
      return res.status(400).json({ message: "pageId obrigatorio" });
    }

    const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    let limit = 20;
    if (typeof limitParam === "string" && limitParam.trim().length > 0) {
      const parsed = Number.parseInt(limitParam, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50);
      }
    }

    const userAccess = await getMetaAccess(user.tenantId);

    if (!userAccess || typeof userAccess.accessToken !== "string" || userAccess.accessToken.trim().length === 0) {
      console.error("Meta access invalido para tenant", user.tenantId, {
        hasAccess: !!userAccess,
        hasToken: !!userAccess?.accessToken,
      });
      return res.status(400).json({
        message: "Integracao com Meta nao configurada corretamente (token ausente ou invalido).",
      });
    }

    const userAccessToken = userAccess.accessToken.trim();
    const userAppSecretProof =
      typeof userAccess.appSecretProof === "string" && userAccess.appSecretProof.trim().length > 0
        ? userAccess.appSecretProof.trim()
        : undefined;

    console.debug("Meta user access obtido", {
      tenantId: user.tenantId,
      tokenPreview: userAccessToken.slice(0, 8),
    });

    const pageDetailsUrl = new URL(`https://graph.facebook.com/v18.0/${encodeURIComponent(rawPageId)}`);
    pageDetailsUrl.searchParams.set("fields", "id,access_token");
    pageDetailsUrl.searchParams.set("access_token", userAccessToken);
    if (userAppSecretProof) {
      pageDetailsUrl.searchParams.set("appsecret_proof", userAppSecretProof);
    }

    let pageDetailsResponse: globalThis.Response;
    try {
      pageDetailsResponse = await fetch(pageDetailsUrl);
    } catch (networkError) {
      console.error("Erro de rede ao obter Page Access Token:", {
        error: networkError,
        tenantId: user.tenantId,
        pageId: rawPageId,
      });
      return res.status(502).json({
        message: "Falha de comunicacao com a Meta ao obter token da pagina. Tente novamente.",
      });
    }

    const pageDetailsText = await pageDetailsResponse.text();
    let pageDetailsBody: any = {};
    try {
      pageDetailsBody = pageDetailsText.length > 0 ? JSON.parse(pageDetailsText) : {};
    } catch (error) {
      console.error("Parse error ao obter dados da pagina Meta:", {
        error,
        bodyTextPreview: pageDetailsText.slice(0, 200),
      });
      return res.status(500).json({
        message: "Falha ao interpretar resposta da Meta ao obter dados da pagina.",
      });
    }

    if (!pageDetailsResponse.ok || pageDetailsBody?.error) {
      const graphCode = typeof pageDetailsBody?.error?.code === "number" ? pageDetailsBody.error.code : undefined;
      const errorSubcode =
        typeof pageDetailsBody?.error?.error_subcode === "number"
          ? pageDetailsBody.error.error_subcode
          : undefined;
      const rawMessage =
        typeof pageDetailsBody?.error?.message === "string" ? pageDetailsBody.error.message : undefined;

      console.error("Falha ao obter Page Access Token:", {
        status: pageDetailsResponse.status,
        graphCode,
        errorSubcode,
        rawMessage,
        body: pageDetailsBody,
      });

      let clientMessage = rawMessage || "Falha ao obter dados da pagina na Meta. Verifique a integracao.";

      if (graphCode === 190) {
        clientMessage = "Token de acesso da Meta expirado ou invalido. Reconfigure a integracao.";
      }

      const statusCode = pageDetailsResponse.status && pageDetailsResponse.status >= 400 ? pageDetailsResponse.status : 502;

      return res.status(statusCode).json({ message: clientMessage, graphCode, errorSubcode });
    }

    const pageAccessTokenRaw = pageDetailsBody?.access_token;
    if (typeof pageAccessTokenRaw !== "string" || pageAccessTokenRaw.trim().length === 0) {
      console.error("Nao foi possivel obter access_token da pagina a partir do user token.", {
        tenantId: user.tenantId,
        pageId: rawPageId,
        body: pageDetailsBody,
      });
      return res.status(400).json({
        message:
          "Nao foi possivel obter o token da pagina. Verifique se o utilizador conectado tem permissao de administrador nesta pagina e se a app possui pages_read_engagement.",
      });
    }

    const pageAccessToken = pageAccessTokenRaw.trim();

    const settings = await storage.getAppSettings();
    const pageAppSecretProof =
      settings?.metaAppSecret && settings.metaAppSecret.length > 0
        ? generateAppSecretProof(pageAccessToken, settings.metaAppSecret)
        : undefined;

    console.debug("Page access token obtido com sucesso", {
      tenantId: user.tenantId,
      pageId: rawPageId,
      tokenPreview: pageAccessToken.slice(0, 8),
    });

    const postsUrl = new URL(
      `https://graph.facebook.com/v18.0/${encodeURIComponent(rawPageId)}/posts`,
    );
    postsUrl.searchParams.set(
      "fields",
      [
        "id",
        "permalink_url",
        "message",
        "created_time",
        "likes.limit(0).summary(true)",
        "comments.limit(0).summary(true)",
        "shares",
      ].join(","),
    );
    postsUrl.searchParams.set("limit", String(limit));
    postsUrl.searchParams.set("access_token", pageAccessToken);
    if (pageAppSecretProof) {
      postsUrl.searchParams.set("appsecret_proof", pageAppSecretProof);
    }

    let postsResponse: globalThis.Response;
    try {
      postsResponse = await fetch(postsUrl);
    } catch (networkError) {
      console.error("Erro de rede ao chamar Meta page posts:", {
        error: networkError,
        tenantId: user.tenantId,
        pageId: rawPageId,
      });
      return res.status(502).json({
        message: "Falha de comunicacao com a Meta ao carregar posts da pagina.",
      });
    }

    const bodyText = await postsResponse.text();

    let body: any = {};
    try {
      body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
    } catch (error) {
      console.error("Meta page posts parse error:", {
        error,
        bodyTextPreview: bodyText.slice(0, 200),
      });
      return res.status(500).json({ message: "Falha ao interpretar resposta da Meta" });
    }

    if (!postsResponse.ok || body?.error) {
      const graphCode = typeof body?.error?.code === "number" ? body.error.code : undefined;
      const errorSubcode =
        typeof body?.error?.error_subcode === "number" ? body.error.error_subcode : undefined;
      const errorType = typeof body?.error?.type === "string" ? body.error.type : undefined;
      const rawMessage = typeof body?.error?.message === "string" ? body.error.message : undefined;

      console.error("Meta page posts failed:", {
        status: postsResponse.status,
        graphCode,
        errorSubcode,
        errorType,
        rawMessage,
        body,
      });

      let clientMessage = rawMessage || "Falha ao carregar posts da pagina na Meta.";

      if (graphCode === 190) {
        clientMessage =
          "Token de acesso da pagina expirado ou invalido. Reconfigure a integracao ou renove as permissoes para esta pagina.";
      }
      if (graphCode === 200) {
        clientMessage =
          "Permissoes insuficientes para ler os posts desta pagina na Meta. Verifique as permissoes da app e do token da pagina.";
      }

      const statusCode = postsResponse.status && postsResponse.status >= 400 ? postsResponse.status : 502;

      return res.status(statusCode).json({ message: clientMessage, graphCode, errorSubcode });
    }

    const ensureCount = (value: unknown): number => {
      if (typeof value === "number") {
        return Number.isFinite(value) && value >= 0 ? value : 0;
      }
      if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }
      return 0;
    };

    const posts = Array.isArray(body?.data)
      ? body.data
          .map((item: any) => {
            const id = typeof item?.id === "string" ? item.id : "";
            if (id.length === 0) {
              return null;
            }
            const message = typeof item?.message === "string" ? item.message : "";
            const createdTime = typeof item?.created_time === "string" ? item.created_time : "";
            const likes = ensureCount(item?.likes?.summary?.total_count);
            const comments = ensureCount(item?.comments?.summary?.total_count);
            const shares = ensureCount(item?.shares?.count);
            const permalinkUrl = typeof item?.permalink_url === "string" ? item.permalink_url : "";

            return {
              id,
              message,
              created_time: createdTime,
              likes,
              comments,
              shares,
              permalink_url: permalinkUrl,
            };
          })
          .filter(Boolean)
      : [];

    setNoCacheHeaders(res);
    res.removeHeader("ETag");
    return res.json(posts);
  } catch (err) {
    console.error("Failed to load Meta page posts:", err);
    return res.status(500).json({ message: "Falha ao carregar posts da pagina." });
  }
});

internalMetaRouter.get("/meta/token", async (req, res) => {
  try {
    const validation = validateInternalRequest(req);
    if (!validation.valid) {
      return res.status(validation.status ?? 401).json({ message: validation.message ?? "Unauthorized" });
    }

    const tenantIdParam = req.query.tenant_id;
    if (typeof tenantIdParam !== "string" || tenantIdParam.trim().length === 0) {
      return res.status(400).json({ message: "tenant_id is required" });
    }

    const tenantId = Number(tenantIdParam);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ message: "tenant_id must be a positive integer" });
    }

    const metaAccess = await getMetaAccess(tenantId);
    if (!metaAccess) {
      return res.status(404).json({ message: "Meta integration not found for tenant" });
    }

    res.json({
      tenantId,
      accessToken: metaAccess.accessToken,
      appSecretProof: metaAccess.appSecretProof ?? null,
    });
  } catch (err) {
    console.error("Internal Meta token error:", err);
    res.status(500).json({ message: "Failed to load Meta token" });
  }
});
