import { createServer, type Server } from "http";
import { storage } from "./modules/storage";
import {
  MetaGraphClient,
  fetchMetaDashboardMetrics,
} from "./modules/meta";
import type { MetricTotals as MetaMetricTotals } from "./modules/meta";
import { pingDatabase } from "./db";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import memorystore from "memorystore";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import type {
  Campaign,
  InsertAutomation,

  InsertIntegration,
  InsertResource,
  InsertUser,
  Resource,
  User,
} from "@shared/schema";
import {
  insertUserSchema,

  insertIntegrationSchema,
} from "@shared/schema";
import crypto from "crypto";
import { differenceInCalendarDays, format, isValid, parseISO, subDays } from "date-fns";
// ESM: recria __filename / __dirname
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { existsSync } from "node:fs";
import { hashPassword, verifyPassword } from "./modules/auth/services/password.service";
import { isAdminRole, isSystemAdminRole } from "./modules/auth/services/role.service";
import { isAdmin, isAuthenticated, isSystemAdmin } from "./middlewares/auth";
import { resourcesRouter } from "./modules/resources/routes";
import { setNoCacheHeaders } from "./utils/cache";
import { encryptMetaAccessToken, decryptMetaAccessToken } from "./modules/meta/utils/token";
import { generateAppSecretProof } from "./modules/meta/utils/crypto";
import { getMetaAccess } from "./modules/meta/services/access.service";
import { audiencesRouter } from "./modules/audiences/routes";
import { campaignsRouter, campaignWebhookRouter } from "./modules/campaigns/routes";
import { integrationsRouter } from "./modules/integrations/routes";
import { getPublicAppUrl } from "./utils/url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extend session data to include OAuth state
declare module "express-session" {
  interface SessionData {
    oauthUserId?: number;
    oauthTenantId?: number;
  }
}

const MemoryStore = memorystore(session);

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
  const querySecret =
    typeof req.query.api_secret === "string" ? req.query.api_secret : undefined;
  const providedSecret = headerSecret ?? querySecret;

  if (providedSecret !== configuredSecret) {
    return { valid: false, status: 401, message: "Unauthorized" };
  }

  return { valid: true };
}


passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "Incorrect email or password" });
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Incorrect email or password" });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

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

type MetaIntegrationConfig = {
  accessToken?: string | null;
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", async (_req, res) => {
    try {
      await pingDatabase();
      res.json({ status: "ok" });
    } catch (err) {
      console.error("Health check failed", err);
      res.status(500).json({ status: "error" });
    }
  });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === "your-secret-key-change-in-production") {
    throw new Error("SESSION_SECRET must be set to a secure value before starting the server");
  }

  // Configure session
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  const publicDirCandidates = [
    resolve(__dirname, "../client/public"),
    resolve(__dirname, "../../client/public"),
    resolve(__dirname, "../public"),
    resolve(__dirname, "../../public"),
    resolve(process.cwd(), "client/public"),
    resolve(process.cwd(), "public"),
  ];

  const publicDir =
    publicDirCandidates.find((candidate) => existsSync(candidate)) ??
    publicDirCandidates[0];

  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res: Response) {
        setNoCacheHeaders(res);
      },
    })
  );

  const publicPages: Array<{ paths: string[]; file: string }> = [
    { paths: ["/landing", "/landing.html"], file: "landing.html" },
    { paths: ["/privacy", "/privacy.html"], file: "privacy.html" },
    { paths: ["/terms", "/terms.html"], file: "terms.html" },
  ];

  for (const { paths, file } of publicPages) {
    app.get(paths, (_req, res, next) => {
      setNoCacheHeaders(res);
      const filePath = resolve(publicDir, file);
      if (process.env.DEBUG_STATIC === "true") {
        console.info(`[static-public] Request for ${file} (${filePath})`);
      }
      if (!existsSync(filePath)) {
        if (process.env.DEBUG_STATIC === "true") {
          console.warn(`[static-public] File not found: ${filePath}`);
        }
        return next();
      }
      res.type("html");
      return res.sendFile(filePath, (err) => {
        if (err) {
          return next(err);
        }
        if (process.env.DEBUG_STATIC === "true") {
          console.info(`[static-public] Served ${file} from ${filePath}`);
        }
      });
    });
  }



  // ===== Authentication Routes =====

  // Note: Public registration is disabled. Only admins can create users via /api/admin/users

  // Login
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }

      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...userWithoutPassword } = user as User;
        res.json({ user: userWithoutPassword });
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user
  app.get("/api/auth/me", isAuthenticated, (req, res) => {
    const { password: _, ...userWithoutPassword } = req.user as User;
    res.json({ user: userWithoutPassword });
  });

  // ===== Resource Routes =====

  app.use("/api/resources", resourcesRouter);
  app.use("/api/integrations", integrationsRouter);
  app.use("/api/audiences", audiencesRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/webhooks", campaignWebhookRouter);

  app.get("/api/dashboard/metrics", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const query = dashboardMetricsQuerySchema.parse(req.query);

      if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
        return res
          .status(400)
          .json({ message: "Forneca startDate e endDate juntos ou nenhum deles." });
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
        return res
          .status(500)
          .json({ message: "Meta app secret nao configurado." });
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
          return res
            .status(400)
            .json({ message: "O startDate deve ser menor ou igual ao endDate" });
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

  app.get(
    "/api/meta/campaigns/:id/creatives",
    isAuthenticated,
    async (req, res, next) => {
      try {
        const user = req.user as User;
        const campaignId = req.params.id;
        const accountIdParam = req.query.accountId;

        if (typeof accountIdParam !== "string" || accountIdParam.length === 0) {
          return res.status(400).json({
            message: "Parametro accountId obrigatorio.",
          });
        }

        const startParam =
          typeof req.query.startDate === "string" ? req.query.startDate : null;
        const endParam =
          typeof req.query.endDate === "string" ? req.query.endDate : null;

        let timeRange: { since: string; until: string } | null = null;
        if (startParam && endParam) {
          const startDate = parseISO(startParam);
          const endDate = parseISO(endParam);
          if (!isValid(startDate) || !isValid(endDate)) {
            return res
              .status(400)
              .json({ message: "Parametros de data invalidos." });
          }
          if (startDate > endDate) {
            return res.status(400).json({
              message: "O startDate deve ser menor ou igual ao endDate",
            });
          }
          timeRange = {
            since: format(startDate, "yyyy-MM-dd"),
            until: format(endDate, "yyyy-MM-dd"),
          };
        }

        // valida se a conta realmente pertence ao tenant
        const allResources = await storage.getResourcesByTenant(user.tenantId);
        const accountResources = allResources.filter(
          (resource) => resource.type === "account",
        );
        const accountMatch = accountResources.find(
          (resource) => resource.value === accountIdParam,
        );

        if (!accountMatch) {
          return res.status(404).json({
            message: "Conta nao encontrada ou nao pertence ao tenant atual.",
          });
        }

        // integraçao meta / token
        const integration = await storage.getIntegrationByProvider(
          user.tenantId,
          "Meta",
        );
        const metaConfig = (integration?.config ?? {}) as {
          accessToken?: string | null;
        };

        const metaAccessToken = decryptMetaAccessToken(metaConfig.accessToken ?? null);
        if (!metaAccessToken) {
          return res.status(400).json({
            message:
              "Integracao com Meta nao esta conectada ou token indisponivel para este tenant.",
          });
        }

        const settings = await storage.getAppSettings();
        if (!settings?.metaAppSecret) {
          return res
            .status(500)
            .json({ message: "Meta app secret nao configurado." });
        }

        // precisamos do objective da campanha para calcular 'resultado principal'
        // (leads, conversas, vendas...) no relatório por anúncio
        const client = new MetaGraphClient(
          metaAccessToken,
          settings.metaAppSecret,
        );

        const accountCampaigns = await client.fetchCampaigns(accountIdParam);
        const thisCampaign = accountCampaigns.find(
          (c) => c.id === campaignId,
        );
        const campaignObjective = thisCampaign?.objective ?? null;

        // AGORA usamos a nova função que retorna por ANÚNCIO (ad)
        const adReports = await client.fetchCampaignAdReports(
          accountIdParam,
          campaignId,
          campaignObjective,
          timeRange,
        );

        // respondemos no campo 'creatives' para manter compatibilidade
        return res.json({
          creatives: adReports,
        });
      } catch (err) {
        next(err);
      }
    },
  );


  function parseQueryParam(value: unknown): string {
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }
    if (typeof value === "string") {
      return value;
    }
    return "";
  }

  app.get("/api/meta/search/cities", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const rawQuery = parseQueryParam(req.query.q);
      const query = rawQuery.trim();

      if (query.length < 2) {
        return res.json([]);
      }

      const access = await getMetaAccess(user.tenantId);
      if (!access) {
        return res.status(400).json({ message: "Integração com Meta não configurada" });
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

  app.get("/api/meta/search/interests", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const rawQuery = parseQueryParam(req.query.q);
      const query = rawQuery.trim();

      if (query.length < 2) {
        return res.json([]);
      }

      const access = await getMetaAccess(user.tenantId);
      if (!access) {
        return res.status(400).json({ message: "Integração com Meta não configurada" });
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

app.get("/api/meta/pages/:pageId/posts", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as User;
    const rawPageId =
      typeof req.params.pageId === "string" ? req.params.pageId.trim() : "";

    if (rawPageId.length === 0) {
      return res.status(400).json({ message: "pageId obrigatorio" });
    }

    // --- Tratamento do limit ---
    const limitParam = Array.isArray(req.query.limit)
      ? req.query.limit[0]
      : req.query.limit;
    let limit = 20;
    if (typeof limitParam === "string" && limitParam.trim().length > 0) {
      const parsed = Number.parseInt(limitParam, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50);
      }
    }

    // --- 1) Buscar integração da Meta / User Token (via getMetaAccess) ---
    const userAccess = await getMetaAccess(user.tenantId);

    if (
      !userAccess ||
      typeof userAccess.accessToken !== "string" ||
      userAccess.accessToken.trim().length === 0
    ) {
      console.error("Meta access inválido para tenant", user.tenantId, {
        hasAccess: !!userAccess,
        hasToken: !!userAccess?.accessToken,
      });
      return res.status(400).json({
        message:
          "Integracao com Meta nao configurada corretamente (token ausente ou invalido).",
      });
    }

    const userAccessToken = userAccess.accessToken.trim();
    const userAppSecretProof =
      typeof userAccess.appSecretProof === "string" &&
      userAccess.appSecretProof.trim().length > 0
        ? userAccess.appSecretProof.trim()
        : undefined;

    console.debug("Meta user access obtido", {
      tenantId: user.tenantId,
      tokenPreview: userAccessToken.slice(0, 8),
    });

    // --- 2) Obter Page Access Token a partir do User Token ---
    const pageDetailsUrl = new URL(
      `https://graph.facebook.com/v18.0/${encodeURIComponent(rawPageId)}`,
    );
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
        message:
          "Falha de comunicacao com a Meta ao obter token da pagina. Tente novamente.",
      });
    }

    const pageDetailsText = await pageDetailsResponse.text();
    let pageDetailsBody: any = {};
    try {
      pageDetailsBody =
        pageDetailsText.length > 0 ? JSON.parse(pageDetailsText) : {};
    } catch (error) {
      console.error("Parse error ao obter dados da pagina Meta:", {
        error,
        bodyTextPreview: pageDetailsText.slice(0, 200),
      });
      return res.status(500).json({
        message:
          "Falha ao interpretar resposta da Meta ao obter dados da pagina.",
      });
    }

    if (!pageDetailsResponse.ok || pageDetailsBody?.error) {
      const graphCode =
        typeof pageDetailsBody?.error?.code === "number"
          ? pageDetailsBody.error.code
          : undefined;
      const errorSubcode =
        typeof pageDetailsBody?.error?.error_subcode === "number"
          ? pageDetailsBody.error.error_subcode
          : undefined;
      const rawMessage =
        typeof pageDetailsBody?.error?.message === "string"
          ? pageDetailsBody.error.message
          : undefined;

      console.error("Falha ao obter Page Access Token:", {
        status: pageDetailsResponse.status,
        graphCode,
        errorSubcode,
        rawMessage,
        body: pageDetailsBody,
      });

      let clientMessage =
        rawMessage ||
        "Falha ao obter dados da pagina na Meta. Verifique a integracao.";

      if (graphCode === 190) {
        clientMessage =
          "Token de acesso da Meta expirado ou invalido. Reconfigure a integracao.";
      }

      const statusCode =
        pageDetailsResponse.status && pageDetailsResponse.status >= 400
          ? pageDetailsResponse.status
          : 502;

      return res
        .status(statusCode)
        .json({ message: clientMessage, graphCode, errorSubcode });
    }

    const pageAccessTokenRaw = pageDetailsBody?.access_token;
    if (
      typeof pageAccessTokenRaw !== "string" ||
      pageAccessTokenRaw.trim().length === 0
    ) {
      console.error(
        "Nao foi possivel obter access_token da pagina a partir do user token.",
        {
          tenantId: user.tenantId,
          pageId: rawPageId,
          body: pageDetailsBody,
        },
      );
      return res.status(400).json({
        message:
          "Nao foi possivel obter o token da pagina. Verifique se o utilizador conectado tem permissao de administrador nesta pagina e se a app possui pages_read_engagement.",
      });
    }

    const pageAccessToken = pageAccessTokenRaw.trim();

    // --- 2.1) Gerar appsecret_proof especifico para o Page Token (opcional, mas recomendado) ---
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

    // --- 3) Agora sim, chamar /{pageId}/posts com o Page Access Token ---
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
      return res
        .status(500)
        .json({ message: "Falha ao interpretar resposta da Meta" });
    }

    // --- Tratamento de erros do Graph API (token/permissão/etc) ---
    if (!postsResponse.ok || body?.error) {
      const graphCode =
        typeof body?.error?.code === "number" ? body.error.code : undefined;
      const errorSubcode =
        typeof body?.error?.error_subcode === "number"
          ? body.error.error_subcode
          : undefined;
      const errorType =
        typeof body?.error?.type === "string" ? body.error.type : undefined;
      const rawMessage =
        typeof body?.error?.message === "string"
          ? body.error.message
          : undefined;

      console.error("Meta page posts failed:", {
        status: postsResponse.status,
        graphCode,
        errorSubcode,
        errorType,
        rawMessage,
        body,
      });

      let clientMessage =
        rawMessage || "Falha ao carregar posts da pagina na Meta.";

      if (graphCode === 190) {
        clientMessage =
          "Token de acesso da pagina expirado ou invalido. Reconfigure a integracao ou renove as permissoes para esta pagina.";
      }
      if (graphCode === 200) {
        clientMessage =
          "Permissoes insuficientes para ler os posts desta pagina na Meta. Verifique as permissoes da app e do token da pagina.";
      }

      const statusCode =
        postsResponse.status && postsResponse.status >= 400
          ? postsResponse.status
          : 502;

      return res
        .status(statusCode)
        .json({ message: clientMessage, graphCode, errorSubcode });
    }

    // --- Normalização das contagens ---
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

    // --- Mapear posts para formato limpo ---
    const posts = Array.isArray(body?.data)
      ? body.data
          .map((item: any) => {
            const id = typeof item?.id === "string" ? item.id : "";
            if (id.length === 0) {
              return null;
            }
            const message =
              typeof item?.message === "string" ? item.message : "";
            const createdTime =
              typeof item?.created_time === "string"
                ? item.created_time
                : "";
            const likes = ensureCount(item?.likes?.summary?.total_count);
            const comments = ensureCount(
              item?.comments?.summary?.total_count,
            );
            const shares = ensureCount(item?.shares?.count);
            const permalinkUrl =
              typeof item?.permalink_url === "string"
                ? item.permalink_url
                : "";

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
    return res
      .status(500)
      .json({ message: "Falha ao carregar posts da pagina." });
  }
});


          leadgen_form_id: leadFormIdValue,
          drive_folder_id: driveFolderId || "",
          message_text: messageText,
          title_text: titleText,
          whatsapp_number_id: whatsappIdValue,
          website_url: campaignWebsite,
          object_story_id: primaryObjectStoryId || undefined,
          post_id: primaryPostId || undefined,
          post_permalink: primaryPermalinkUrl || undefined,
          creative_mode: primaryCreativeMode || undefined,
        };

      const webhookPayload = {
        body: {
          data: dataPayload,
          meta: {
            request_id: requestId,
            callback_url: callbackUrl,
          },
        },
      };

      // Send webhook
      const webhookResponse = await fetch(settings.n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        console.error("Failed to send webhook to n8n:", errorText);

        // Parse error to provide better user feedback
        let userMessage = "Erro ao enviar webhook para n8n";
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.code === 404 || errorJson.message?.includes("not registered")) {
            userMessage = "Webhook n8n nao esta ativo. No n8n, clique em 'Execute workflow' e tente novamente.";
          }
        } catch (e) {
          // Keep default message if parsing fails
        }

        return res.status(500).json({ message: userMessage });
      }

      // Update campaign status to pending when webhook is sent successfully
      await storage.updateCampaign(id, {
        status: "pending",
        statusDetail: "Aguardando processamento do n8n (reenviado)",
      });

      res.json({ message: "Campanha enviada para n8n com sucesso" });
    } catch (err) {
      next(err);
    }
  });

  // ====== Admin Settings Routes (admin only) ======

  // Get app settings
  app.get("/api/admin/settings", isSystemAdmin, async (req, res, next) => {
    try {
      const settings = await storage.getAppSettings();
      // Never expose secrets to frontend
      if (settings) {
        res.json({
          id: settings.id,
          metaAppId: settings.metaAppId,
          metaAppSecret: settings.metaAppSecret ? '***configured***' : null,
          googleClientId: settings.googleClientId,
          googleClientSecret: settings.googleClientSecret ? '***configured***' : null,
          n8nWebhookUrl: settings.n8nWebhookUrl,
          updatedAt: settings.updatedAt,
        });
      } else {
        res.json(null);
      }
    } catch (err) {
      next(err);
    }
  });

  // Update app settings
  app.put("/api/admin/settings", isSystemAdmin, async (req, res, next) => {
    try {
      const settings = await storage.updateAppSettings(req.body);

      // Never expose secrets to frontend
      if (settings) {
        res.json({
          id: settings.id,
          metaAppId: settings.metaAppId,
          metaAppSecret: settings.metaAppSecret ? '***configured***' : null,
          googleClientId: settings.googleClientId,
          googleClientSecret: settings.googleClientSecret ? '***configured***' : null,
          n8nWebhookUrl: settings.n8nWebhookUrl,
          updatedAt: settings.updatedAt,
        });
      } else {
        res.status(500).json({ message: "Failed to update settings" });
      }
    } catch (err) {
      next(err);
    }
  });

  // ====== User Management Routes (admin only) ======

  // List tenants (system admin only)
  app.get("/api/admin/tenants", isSystemAdmin, async (_req, res, next) => {
    try {
      const tenants = await storage.getTenants();
      res.json(tenants);
    } catch (err) {
      next(err);
    }
  });

  // List users (admin only)
  app.get("/api/admin/users", isAdmin, async (req, res, next) => {
    try {
      const currentUser = req.user as User;
      const tenantIdParam = req.query.tenantId ? Number(req.query.tenantId) : undefined;

      if (tenantIdParam !== undefined && Number.isNaN(tenantIdParam)) {
        return res.status(400).json({ message: "Invalid tenantId" });
      }

      const tenants = await storage.getTenants();
      const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

      let users: User[];
      if (isSystemAdminRole(currentUser.role)) {
        if (tenantIdParam !== undefined) {
          const tenantExists = tenantMap.has(tenantIdParam);
          if (!tenantExists) {
            return res.status(404).json({ message: "Tenant not found" });
          }
          users = await storage.getUsersByTenant(tenantIdParam);
        } else {
          users = await storage.getAllUsers();
        }
      } else {
        users = await storage.getUsersByTenant(currentUser.tenantId);
      }

      const usersWithoutPasswords = users.map((u) => {
        const { password: _, ...userWithoutPassword } = u;
        return {
          ...userWithoutPassword,
          tenantName: tenantMap.get(u.tenantId) ?? null,
        };
      });

      res.json(usersWithoutPasswords);
    } catch (err) {
      next(err);
    }
  });

  // Create new user (admin only)
  app.post("/api/admin/users", isAdmin, async (req, res, next) => {
    try {
      const currentUser = req.user as User;

      const createUserSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["system_admin", "tenant_admin", "member"]),
        tenantId: z.number().int().positive().optional(),
        tenantName: z.string().min(2).optional(),
      });

      const data = createUserSchema.parse(req.body);

      if (!isSystemAdminRole(currentUser.role) && data.role === "system_admin") {
        return res.status(403).json({ message: "Only system admins can create other system admins" });
      }

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      let targetTenantId: number;
      let tenantName: string | null = null;

      if (isSystemAdminRole(currentUser.role)) {
        if (data.tenantId && data.tenantName) {
          return res.status(400).json({ message: "Provide either tenantId or tenantName, not both" });
        }

        if (data.tenantId) {
          const tenant = await storage.getTenant(data.tenantId);
          if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
          }
          targetTenantId = tenant.id;
          tenantName = tenant.name;
        } else if (data.tenantName) {
          const tenant = await storage.createTenant({ name: data.tenantName });
          targetTenantId = tenant.id;
          tenantName = tenant.name;
        } else {
          return res.status(400).json({ message: "tenantId or tenantName must be provided" });
        }
      } else {
        targetTenantId = currentUser.tenantId;
        const tenant = await storage.getTenant(targetTenantId);
        tenantName = tenant?.name ?? null;
      }

      const hashedPassword = await hashPassword(data.password);
      const newUser = await storage.createUser({
        email: data.email,
        password: hashedPassword,
        tenantId: targetTenantId,
        role: data.role,
      });

      const { password: _, ...userWithoutPassword } = newUser;
      res.status(201).json({
        ...userWithoutPassword,
        tenantName,
      });
    } catch (err) {
      next(err);
    }
  });

  // Update user (admin only)
  app.patch("/api/admin/users/:id", isAdmin, async (req, res, next) => {
    try {
      const currentUser = req.user as User;
      const userId = parseInt(req.params.id);

      const updateUserSchema = z.object({
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        role: z.enum(["system_admin", "tenant_admin", "member"]).optional(),
        tenantId: z.number().int().positive().optional(),
        tenantName: z.string().min(2).optional(),
      });

      const data = updateUserSchema.parse(req.body);

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!isSystemAdminRole(currentUser.role) && existingUser.tenantId !== currentUser.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!isSystemAdminRole(currentUser.role) && data.role === "system_admin") {
        return res.status(403).json({ message: "Only system admins can grant system admin role" });
      }

      if (!isSystemAdminRole(currentUser.role) && (data.tenantId || data.tenantName)) {
        return res.status(403).json({ message: "Only system admins can reassign tenants" });
      }

      if (data.email && data.email !== existingUser.email) {
        const emailTaken = await storage.getUserByEmail(data.email);
        if (emailTaken) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }

      let updatedTenantId = existingUser.tenantId;
      let tenantName: string | null = null;

      if (isSystemAdminRole(currentUser.role)) {
        if (data.tenantId && data.tenantName) {
          return res.status(400).json({ message: "Provide either tenantId or tenantName, not both" });
        }

        if (data.tenantId) {
          const tenant = await storage.getTenant(data.tenantId);
          if (!tenant) {
            return res.status(404).json({ message: "Tenant not found" });
          }
          updatedTenantId = tenant.id;
          tenantName = tenant.name;
        } else if (data.tenantName) {
          const tenant = await storage.createTenant({ name: data.tenantName });
          updatedTenantId = tenant.id;
          tenantName = tenant.name;
        } else {
          const tenant = await storage.getTenant(updatedTenantId);
          tenantName = tenant?.name ?? null;
        }
      } else {
        const tenant = await storage.getTenant(updatedTenantId);
        tenantName = tenant?.name ?? null;
      }

      const updateData: Partial<InsertUser> = {};
      if (data.email) updateData.email = data.email;
      if (data.role) updateData.role = data.role;
      if (data.password) {
        updateData.password = await hashPassword(data.password);
      }
      if (updatedTenantId !== existingUser.tenantId) {
        updateData.tenantId = updatedTenantId;
      }

      const updatedUser = await storage.updateUser(userId, updateData);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update user" });
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({
        ...userWithoutPassword,
        tenantName,
      });
    } catch (err) {
      next(err);
    }
  });

  // Delete user (admin only)
  app.delete("/api/admin/users/:id", isAdmin, async (req, res, next) => {
    try {
      const currentUser = req.user as User;
      const userId = parseInt(req.params.id);

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!isSystemAdminRole(currentUser.role) && existingUser.tenantId !== currentUser.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      if (userId === currentUser.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      if (!isSystemAdminRole(currentUser.role) && isSystemAdminRole(existingUser.role)) {
        return res.status(403).json({ message: "Only system admins can remove other system admins" });
      }

      await storage.deleteUser(userId);
      res.json({ message: "User deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  // ====== Meta OAuth Routes ======

  // Generate appsecret_proof for Meta API calls (security)
  app.get("/internal/meta/token", async (req, res) => {
    try {
      const validation = validateInternalRequest(req);
      if (!validation.valid) {
        return res
          .status(validation.status ?? 401)
          .json({ message: validation.message ?? "Unauthorized" });
      }

      const tenantIdParam = req.query.tenant_id;
      if (typeof tenantIdParam !== "string" || tenantIdParam.trim().length === 0) {
        return res.status(400).json({ message: "tenant_id is required" });
      }

      const tenantId = Number(tenantIdParam);
      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        return res
          .status(400)
          .json({ message: "tenant_id must be a positive integer" });
      }

      const metaAccess = await getMetaAccess(tenantId);
      if (!metaAccess) {
        return res
          .status(404)
          .json({ message: "Meta integration not found for tenant" });
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

  // Initiate Meta OAuth flow
  app.get("/auth/meta", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      if (!settings?.metaAppId) {
        return res.status(500).send("Meta OAuth not configured. Please contact admin.");
      }

      const user = req.user as User;

      // Save user info in session for callback
      req.session.oauthUserId = user.id;
      req.session.oauthTenantId = user.tenantId;

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const baseUrl = getPublicAppUrl(req);
      const redirectUri = `${baseUrl}/auth/meta/callback`;
      const scope = "ads_read,pages_read_engagement,instagram_basic,whatsapp_business_management,leads_retrieval";

      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${settings.metaAppId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${scope}&` +
        `state=${user.id}`;

      res.redirect(authUrl);
    } catch (err) {
      console.error("Meta OAuth error:", err);
      res.status(500).send("Failed to initiate OAuth");
    }
  });

  // Meta OAuth callback
  app.get("/auth/meta/callback", async (req, res) => {
    try {
      const { code, state } = req.query;

      // Get user info from session
      const userId = req.session.oauthUserId;
      const tenantId = req.session.oauthTenantId;

      if (!code || !userId || !tenantId || state !== String(userId)) {
        return res.status(400).send("Invalid OAuth callback");
      }

      const settings = await storage.getAppSettings();
      if (!settings?.metaAppId || !settings.metaAppSecret) {
        return res.status(500).send("Meta OAuth not configured");
      }

      const baseUrl = getPublicAppUrl(req);
      const redirectUri = `${baseUrl}/auth/meta/callback`;

      // Exchange code for access token
      const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
        `client_id=${settings.metaAppId}&` +
        `client_secret=${settings.metaAppSecret}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `code=${code}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData: any = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error("Token exchange failed:", tokenData);
        return res.status(500).send("Failed to obtain access token");
      }

      const accessToken = tokenData.access_token;
      const appSecretProof = generateAppSecretProof(accessToken, settings.metaAppSecret);

      // Fetch user's accounts
      const accountsUrl = `https://graph.facebook.com/v18.0/me/adaccounts?` +
        `access_token=${accessToken}&` +
        `appsecret_proof=${appSecretProof}&` +
        `fields=id,name`;

      const accountsResponse = await fetch(accountsUrl);
      const accountsData: any = await accountsResponse.json();

      // Save ad accounts
      if (accountsData.data && accountsData.data.length > 0) {
        for (const account of accountsData.data) {
          const accountResource: InsertResource & { tenantId: number } = {
            tenantId,
            type: "account",
            name: account.name || "Ad Account",
            value: account.id,
          };
          await storage.createResource(accountResource);
        }
      }

      // Fetch pages
      const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?` +
        `access_token=${accessToken}&` +
        `appsecret_proof=${appSecretProof}&` +
        `fields=id,name,instagram_business_account`;

      const pagesResponse = await fetch(pagesUrl);
      const pagesData: any = await pagesResponse.json();

      // Save pages and Instagram accounts
      if (pagesData.data && pagesData.data.length > 0) {
        for (const page of pagesData.data) {
          const pageResource: InsertResource & { tenantId: number } = {
            tenantId,
            type: "page",
            name: page.name || "Facebook Page",
            value: page.id,
          };
          await storage.createResource(pageResource);

          if (page.instagram_business_account?.id) {
            const instagramResource: InsertResource & { tenantId: number } = {
              tenantId,
              type: "instagram",
              name: `Instagram - ${page.name}`,
              value: page.instagram_business_account.id,
            };
            await storage.createResource(instagramResource);
          }
        }
      }

      // TODO: Fetch WhatsApp numbers and lead forms
      // This requires additional API calls with specific permissions

      // Save access token in integrations table for future use
      const storedAccessToken = encryptMetaAccessToken(accessToken);
      const metaIntegration: InsertIntegration & { tenantId: number } = {
        tenantId,
        provider: "Meta",
        config: { accessToken: storedAccessToken, tokenType: tokenData.token_type },
        status: "connected",
      };
      await storage.createIntegration(metaIntegration);

      // Redirect back to resources page
      res.redirect("/resources?oauth=success");
    } catch (err) {
      console.error("Meta OAuth callback error:", err);
      res.status(500).send("Failed to complete OAuth");
    }
  });

  // ====== Google Drive OAuth Routes ======

  // Initiate Google OAuth flow
  app.get("/auth/google", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      if (!settings?.googleClientId) {
        return res.status(500).send("Google OAuth not configured. Please contact admin.");
      }

      const user = req.user as User;

      // Save user info in session for callback
      req.session.oauthUserId = user.id;
      req.session.oauthTenantId = user.tenantId;

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const baseUrl = getPublicAppUrl(req);
      const redirectUri = `${baseUrl}/auth/google/callback`;
      const scope = "https://www.googleapis.com/auth/drive.readonly";

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${settings.googleClientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `state=${user.id}`;

      res.redirect(authUrl);
    } catch (err) {
      console.error("Google OAuth error:", err);
      res.status(500).send("Failed to initiate OAuth");
    }
  });

  // Google OAuth callback
  app.get("/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;

      // Get user info from session
      const userId = req.session.oauthUserId;
      const tenantId = req.session.oauthTenantId;

      if (!code || !userId || !tenantId || state !== String(userId)) {
        return res.status(400).send("Invalid OAuth callback");
      }

      const settings = await storage.getAppSettings();
      if (!settings?.googleClientId || !settings.googleClientSecret) {
        return res.status(500).send("Google OAuth not configured");
      }

      const baseUrl = getPublicAppUrl(req);
      const redirectUri = `${baseUrl}/auth/google/callback`;

      // Exchange code for access token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          client_id: settings.googleClientId,
          client_secret: settings.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData: any = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error("Token exchange failed:", tokenData);
        return res.status(500).send("Failed to obtain access token");
      }

      // Save access token in integrations table
      const googleIntegration: InsertIntegration & { tenantId: number } = {
        tenantId,
        provider: "Google Drive",
        config: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenType: tokenData.token_type,
          expiresIn: tokenData.expires_in,
        },
        status: "connected",
      };
      await storage.createIntegration(googleIntegration);

      // Synchronize Google Drive folders for the tenant
      try {
        const folders: Array<{ id: string; name: string }> = [];
        let pageToken: string | undefined = undefined;

        do {
          const params = new URLSearchParams({
            q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields: "nextPageToken, files(id, name)",
            spaces: "drive",
            pageSize: "100",
          });
          if (pageToken) {
            params.set("pageToken", pageToken);
          }

          const foldersResponse = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          });

          if (!foldersResponse.ok) {
            const errorBody = await foldersResponse.text();
            console.error("Failed to fetch Google Drive folders:", foldersResponse.status, errorBody);
            break;
          }

          const foldersData: any = await foldersResponse.json();
          if (Array.isArray(foldersData.files)) {
            folders.push(
              ...foldersData.files
                .filter((file: any) => Boolean(file?.id) && Boolean(file?.name))
                .map((file: any) => ({ id: file.id as string, name: file.name as string })),
            );
          }

          pageToken = foldersData.nextPageToken ?? undefined;
        } while (pageToken);

        // Remove previous folders for this tenant to avoid duplicates
        const existingFolders = await storage.getResourcesByType(tenantId, "drive_folder");
        for (const folder of existingFolders) {
          await storage.deleteResource(folder.id);
        }

        // Persist fetched folders
        for (const folder of folders) {
          await storage.createResource({
            tenantId,
            type: "drive_folder",
            name: folder.name,
            value: folder.id,
          });
        }
      } catch (folderSyncError) {
        console.error("Google Drive folder sync error:", folderSyncError);
      }

      // Redirect back to integrations page
      res.redirect("/integrations?oauth=success");
    } catch (err) {
      console.error("Google OAuth callback error:", err);
      res.status(500).send("Failed to complete OAuth");
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

