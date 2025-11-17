import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  MetaGraphClient,
  fetchMetaDashboardMetrics,
} from "./meta/graph";
import type { MetricTotals as MetaMetricTotals } from "./meta/graph";
import { pingDatabase } from "./db";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import memorystore from "memorystore";
import { z } from "zod";
import type { Express, NextFunction, Request, Response } from "express";
import type {
  Campaign,
  InsertAudience,
  InsertAutomation,
  InsertCampaign,
  InsertIntegration,
  InsertResource,
  InsertUser,
  Resource,
  User,
} from "@shared/schema";
import {
  insertUserSchema,
  insertResourceSchema,
  insertAudienceSchema,
  updateAudienceSchema,
  insertCampaignSchema,
  insertIntegrationSchema,
} from "@shared/schema";
import crypto from "crypto";
import { differenceInCalendarDays, format, isValid, parseISO, subDays } from "date-fns";
// ESM: recria __filename / __dirname
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



function setNoCacheHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

// Extend session data to include OAuth state
declare module "express-session" {
  interface SessionData {
    oauthUserId?: number;
    oauthTenantId?: number;
  }
}

const MemoryStore = memorystore(session);

// Password hashing utilities
import bcrypt from "bcryptjs";

async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

const ADMIN_ROLES = new Set<User["role"]>(["system_admin", "tenant_admin"]);

function isAdminRole(role: User["role"]): boolean {
  return ADMIN_ROLES.has(role);
}

function isSystemAdminRole(role: User["role"]): boolean {
  return role === "system_admin";
}

function getPublicAppUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }

  const host = req.get("host");
  if (!host) {
    throw new Error("Unable to determine host for OAuth redirects");
  }

  return `${req.protocol}://${host}`;
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
  const querySecret =
    typeof req.query.api_secret === "string" ? req.query.api_secret : undefined;
  const providedSecret = headerSecret ?? querySecret;

  if (providedSecret !== configuredSecret) {
    return { valid: false, status: 401, message: "Unauthorized" };
  }

  return { valid: true };
}

const META_TOKEN_ENC_PREFIX = "enc.v1";
let cachedMetaTokenKey: Buffer | null | undefined;

function getMetaTokenEncryptionKey(): Buffer | null {
  if (cachedMetaTokenKey !== undefined) {
    return cachedMetaTokenKey;
  }

  const rawKey = process.env.META_TOKEN_ENC_KEY?.trim();
  if (!rawKey) {
    cachedMetaTokenKey = null;
    return null;
  }

  const tryDecode = (value: string, encoding: BufferEncoding): Buffer | null => {
    try {
      const decoded = Buffer.from(value, encoding);
      return decoded.length === 32 ? decoded : null;
    } catch {
      return null;
    }
  };

  const base64Key = tryDecode(rawKey, "base64");
  if (base64Key) {
    cachedMetaTokenKey = base64Key;
    return base64Key;
  }

  if (rawKey.length === 32) {
    const utf8Key = tryDecode(rawKey, "utf8");
    if (utf8Key) {
      cachedMetaTokenKey = utf8Key;
      return utf8Key;
    }
  }

  console.warn("META_TOKEN_ENC_KEY must decode to exactly 32 bytes (AES-256).");
  cachedMetaTokenKey = null;
  return null;
}

function encryptMetaAccessToken(token: string): string {
  if (!token) {
    return token;
  }
  const key = getMetaTokenEncryptionKey();
  if (!key) {
    return token;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    META_TOKEN_ENC_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptMetaAccessToken(token?: string | null): string | null {
  if (!token || token.length === 0) {
    return null;
  }
  if (!token.startsWith(`${META_TOKEN_ENC_PREFIX}:`)) {
    return token;
  }
  const key = getMetaTokenEncryptionKey();
  if (!key) {
    console.error("Encrypted Meta token stored but META_TOKEN_ENC_KEY is missing or invalid.");
    return null;
  }
  const [, ivB64, tagB64, payloadB64] = token.split(":");
  if (!ivB64 || !tagB64 || !payloadB64) {
    console.error("Invalid encrypted Meta token format.");
    return null;
  }
  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const payload = Buffer.from(payloadB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("Failed to decrypt Meta token:", err);
    return null;
  }
}

const OBJECTIVE_OUTCOME_MAP: Record<string, string> = {
  LEAD: "OUTCOME_LEADS",
  LEADS: "OUTCOME_LEADS",
  OUTCOME_LEADS: "OUTCOME_LEADS",
  TRAFFIC: "OUTCOME_TRAFFIC",
  OUTCOME_TRAFFIC: "OUTCOME_TRAFFIC",
  WHATSAPP: "OUTCOME_ENGAGEMENT",
  MESSAGES: "OUTCOME_ENGAGEMENT",
  MESSAGE: "OUTCOME_ENGAGEMENT",
  OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  CONVERSIONS: "OUTCOME_SALES",
  SALES: "OUTCOME_SALES",
  OUTCOME_SALES: "OUTCOME_SALES",
  REACH: "OUTCOME_AWARENESS",
  OUTCOME_AWARENESS: "OUTCOME_AWARENESS",
};

const OBJECTIVE_OPTIMIZATION_MAP: Record<string, string> = {
  OUTCOME_LEADS: "LEAD_GENERATION",
  OUTCOME_ENGAGEMENT: "CONVERSATIONS",
  OUTCOME_TRAFFIC: "LINK_CLICKS",
  OUTCOME_SALES: "OFFSITE_CONVERSIONS",
  OUTCOME_AWARENESS: "IMPRESSIONS",
};

const DEFAULT_PUBLISHER_PLATFORMS = [
  "facebook",
  "instagram",
  "messenger",
  "audience_network",
] as const;

function mapObjectiveToOutcome(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized) {
    return "OUTCOME_LEADS";
  }
  return OBJECTIVE_OUTCOME_MAP[normalized] ?? (normalized.startsWith("OUTCOME_") ? normalized : "OUTCOME_LEADS");
}

// Configure passport
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

// Middleware to check authentication
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

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

// Middleware to check if user is admin
function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    const user = req.user as User;
    if (isAdminRole(user.role)) {
      return next();
    }
  }
  res.status(403).json({ message: "Forbidden - Admin access required" });
}

function isSystemAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    const user = req.user as User;
    if (isSystemAdminRole(user.role)) {
      return next();
    }
  }
  res.status(403).json({ message: "Forbidden - System admin access required" });
}

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

  // Get all resources for tenant
  app.get("/api/resources", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const resources = await storage.getResourcesByTenant(user.tenantId);
      res.json(resources);
    } catch (err) {
      next(err);
    }
  });

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


  // Get resources by type
  app.get("/api/resources/:type", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const resources = await storage.getResourcesByType(user.tenantId, req.params.type);
      res.json(resources);
    } catch (err) {
      next(err);
    }
  });

  // Create resource
  app.post("/api/resources", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const data = insertResourceSchema.parse(req.body);
      const resourceValues: InsertResource & { tenantId: number } = {
        ...data,
        tenantId: user.tenantId,
      };
      const resource = await storage.createResource(resourceValues);

      res.status(201).json(resource);
    } catch (err) {
      next(err);
    }
  });

  // Update resource
  app.patch("/api/resources/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify resource belongs to user's tenant
      const existing = await storage.getResource(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Resource not found" });
      }

      // Prevent tenantId override
      const data = insertResourceSchema.partial().parse(req.body);
      const resource = await storage.updateResource(id, data);
      res.json(resource);
    } catch (err) {
      next(err);
    }
  });

  // Delete resource
  app.delete("/api/resources/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify resource belongs to user's tenant
      const existing = await storage.getResource(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Resource not found" });
      }

      await storage.deleteResource(id);
      res.json({ message: "Resource deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  // ===== Audience Routes =====

  // Get all audiences for tenant
  app.get("/api/audiences", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const audiences = await storage.getAudiencesByTenant(user.tenantId);
      res.json(audiences);
    } catch (err) {
      next(err);
    }
  });

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


  // Get single audience
  app.get("/api/audiences/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);
      const audience = await storage.getAudience(id);

      if (!audience || audience.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Audience not found" });
      }

      res.json(audience);
    } catch (err) {
      next(err);
    }
  });

  // Create audience
  app.post("/api/audiences", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const data = insertAudienceSchema.parse(req.body);
      const audienceValues: InsertAudience & { tenantId: number } = {
        ...data,
        tenantId: user.tenantId,
      };
      const audience = await storage.createAudience(audienceValues);

      res.status(201).json(audience);
    } catch (err) {
      next(err);
    }
  });

  // Update audience
  app.patch("/api/audiences/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify audience belongs to user's tenant
      const existing = await storage.getAudience(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Audience not found" });
      }

      // Prevent tenantId override
      const data = updateAudienceSchema.parse(req.body);
      const audience = await storage.updateAudience(id, data);
      res.json(audience);
    } catch (err) {
      next(err);
    }
  });

  // Delete audience
  app.delete("/api/audiences/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify audience belongs to user's tenant
      const existing = await storage.getAudience(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Audience not found" });
      }

      await storage.deleteAudience(id);
      res.json({ message: "Audience deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  // ===== Campaign Routes =====

  // Get all campaigns for tenant
  app.get("/api/campaigns", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const campaigns = await storage.getCampaignsByTenant(user.tenantId);
      res.json(campaigns);
    } catch (err) {
      next(err);
    }
  });

  // Get single campaign
  app.get("/api/campaigns/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);
      const campaign = await storage.getCampaign(id);

      if (!campaign || campaign.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign);
    } catch (err) {
      next(err);
    }
  });

  // Create campaign (always as draft)
  app.post("/api/campaigns", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const data = insertCampaignSchema.parse(req.body);

      // Always create campaigns as draft - webhook will be sent manually via send-webhook endpoint
      const campaignValues: InsertCampaign & { tenantId: number } = {
        ...data,
        tenantId: user.tenantId,
        status: "draft", // Explicitly set to draft
      };
      const campaign = await storage.createCampaign(campaignValues);

      res.status(201).json(campaign);
    } catch (err) {
      next(err);
    }
  });

  // Update campaign
  app.patch("/api/campaigns/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify campaign belongs to user's tenant
      const existing = await storage.getCampaign(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Prevent tenantId override
      const data = insertCampaignSchema.partial().parse(req.body);
      const campaign = await storage.updateCampaign(id, { ...data });
      res.json(campaign);
    } catch (err) {
      next(err);
    }
  });

  // Delete campaign
  app.delete("/api/campaigns/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify campaign belongs to user's tenant
      const existing = await storage.getCampaign(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      await storage.deleteCampaign(id);
      res.json({ message: "Campaign deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  // Send campaign to n8n webhook
  app.post("/api/campaigns/:id/send-webhook", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify campaign belongs to user's tenant
      const campaign = await storage.getCampaign(id);
      if (!campaign || campaign.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Get webhook URL
      const settings = await storage.getAppSettings();
      if (!settings?.n8nWebhookUrl) {
        return res.status(400).json({ message: "Webhook n8n nao configurado. Configure em Admin > Configuracoes" });
      }

      // Fetch resource details
      const accountResource = campaign.accountId ? await storage.getResource(campaign.accountId) : null;
      const pageResource = campaign.pageId ? await storage.getResource(campaign.pageId) : null;
      const instagramResource = campaign.instagramId ? await storage.getResource(campaign.instagramId) : null;
      const whatsappResource = campaign.whatsappId ? await storage.getResource(campaign.whatsappId) : null;
      const leadformResource = campaign.leadformId ? await storage.getResource(campaign.leadformId) : null;
      const adAccountId = accountResource?.value
        ? accountResource.value.replace(/\D+/g, "")
        : "";

      const extractString = (value: unknown) =>
        typeof value === "string" ? value.trim() : "";

      const creativeEntries = Array.isArray(campaign.creatives)
        ? (campaign.creatives as Array<Record<string, unknown>>)
        : [];

      const primaryDriveFolderFromCreative = creativeEntries
        .map((creative) => extractString(creative["driveFolderId"]))
        .find((value) => value.length > 0);

      const primaryCreativeEntry =
        creativeEntries.find((creative) => {
          const titleValue = extractString(creative["title"]);
          const textValue = extractString(creative["text"]);
          return titleValue.length > 0 || textValue.length > 0;
        }) ?? creativeEntries[0];

      const primaryCreativeTitle = extractString(primaryCreativeEntry?.["title"]);
      const primaryCreativeText = extractString(primaryCreativeEntry?.["text"]);
      const primaryObjectStoryId =
        creativeEntries
          .map((creative) => extractString(creative["objectStoryId"]))
          .find((value) => value.length > 0) ?? "";
      const primaryPostId =
        creativeEntries
          .map((creative) => extractString(creative["postId"]))
          .find((value) => value.length > 0) ?? "";
      const primaryPermalinkUrl =
        creativeEntries
          .map((creative) => extractString(creative["permalinkUrl"]))
          .find((value) => value.length > 0) ?? "";
      const primaryCreativeMode =
        creativeEntries
          .map((creative) => extractString(creative["mode"]))
          .find((value) => value.length > 0) ?? "";
      const primaryPostMessage =
        creativeEntries
          .map((creative) => extractString(creative["postMessage"]))
          .find((value) => value.length > 0) ?? "";

      const driveFolderId =
        primaryDriveFolderFromCreative ||
        (typeof campaign.driveFolderId === "string" ? campaign.driveFolderId.trim() : "");

      const tenant = await storage.getTenant(user.tenantId);
      const callbackBaseUrl = getPublicAppUrl(req).replace(/\/$/, "");
      const callbackUrl = `${callbackBaseUrl}/api/webhooks/n8n/status`;
      const requestId = `req-${crypto.randomUUID().replace(/-/g, "")}`;

      const parseBudgetToNumber = (raw: unknown): number | undefined => {
        if (typeof raw === "number" && Number.isFinite(raw)) {
          return raw;
        }
        if (typeof raw === "string") {
          const normalized = raw.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
          const value = Number.parseFloat(normalized);
          if (Number.isFinite(value)) {
            return value;
          }
        }
        return undefined;
      };

      const mappedObjective = mapObjectiveToOutcome(campaign.objective);

      const adSetEntries = Array.isArray(campaign.adSets)
        ? (campaign.adSets as Array<Record<string, unknown>>)
        : [];

      const adSetsPayload = await Promise.all(
        adSetEntries.map(async (rawAdSet, index) => {
          const adSet = rawAdSet as Record<string, unknown>;

          const audienceIdInput = adSet["audienceId"];
          const audienceId =
            typeof audienceIdInput === "number"
              ? audienceIdInput
              : Number.parseInt(String(audienceIdInput ?? ""), 10);

          const audience =
            Number.isFinite(audienceId) && audienceId > 0
              ? await storage.getAudience(audienceId)
              : undefined;

          const audienceData =
            audience && audience.tenantId === user.tenantId ? audience : undefined;

          const adSetNameRaw = adSet["name"];
          const adSetName =
            typeof adSetNameRaw === "string" && adSetNameRaw.trim().length > 0
              ? adSetNameRaw.trim()
              : audienceData?.name ?? `Conjunto ${index + 1}`;

          const budgetValue = parseBudgetToNumber(adSet["budget"]);
          const startDateRaw = adSet["startDate"];
          const endDateRaw = adSet["endDate"];
          const gendersRaw = adSet["genders"];

          const dailyBudget =
            budgetValue !== undefined ? Math.max(0, Math.round(budgetValue * 100)) : undefined;
          const startDate =
            typeof startDateRaw === "string" && startDateRaw.trim().length > 0
              ? startDateRaw
              : new Date().toISOString().slice(0, 10);
          const endDate =
            typeof endDateRaw === "string" && endDateRaw.trim().length > 0 ? endDateRaw : undefined;

          const genders =
            Array.isArray(gendersRaw) && gendersRaw.every((g) => typeof g === "number")
              ? (gendersRaw as number[])
              : [];

          const publisherPlatforms = Array.from(DEFAULT_PUBLISHER_PLATFORMS);

          const cityTargets = (audienceData?.cities ?? []).map(({ key, radius, distance_unit }) => ({
            key,
            radius,
            distance_unit,
          }));

          const interestTargets = (audienceData?.interests ?? []).map(({ id, name }) => ({
            id,
            name,
          }));

          const geoLocations =
            cityTargets.length > 0
              ? {
                cities: cityTargets,
              }
              : undefined;

          const flexibleSpec =
            interestTargets.length > 0
              ? [
                {
                  interests: interestTargets,
                },
              ]
              : undefined;

          const optimizationGoalRaw = adSet["optimizationGoal"];
          const optimizationGoal =
            typeof optimizationGoalRaw === "string" && optimizationGoalRaw.trim().length > 0
              ? optimizationGoalRaw.trim()
              : OBJECTIVE_OPTIMIZATION_MAP[mappedObjective] ?? "LEAD_GENERATION";

          return {
            name: adSetName,
            billing_event: "IMPRESSIONS",
            optimization_goal: optimizationGoal,
            bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            daily_budget: dailyBudget,
            targeting: {
              age_min: audienceData?.ageMin ?? undefined,
              age_max: audienceData?.ageMax ?? undefined,
              genders,
              geo_locations: geoLocations,
              flexible_spec: flexibleSpec,
              publisher_platforms: publisherPlatforms,
              targeting_automation: {
                advantage_audience: 1,
              },
            },
            status: "PAUSED",
            start_time: startDate,
            end_time: endDate,
          };
        })
      );

      const clientName = tenant?.name ?? `Tenant-${user.tenantId}`;
      const adAccountValue = adAccountId || (accountResource ? accountResource.value : "");
      const pageIdValue = pageResource ? pageResource.value : "";
      const instagramIdValue = instagramResource ? instagramResource.value : "";
      const leadFormIdValue = leadformResource ? leadformResource.value : "";
      const leadFormNameValue = leadformResource?.name ?? "";
      const whatsappIdValue = whatsappResource ? whatsappResource.value : "";
      const campaignWebsite = extractString(campaign.websiteUrl);

      const messageText =
        extractString(campaign.message) ||
        primaryPostMessage ||
        primaryCreativeText;
      const titleText =
        extractString(campaign.title) ||
        primaryCreativeTitle ||
        (primaryPostMessage.length > 0
          ? primaryPostMessage.slice(0, 80)
          : "");

      const isAddCreativesFlow = adSetsPayload.length === 0;

      const dataPayload = isAddCreativesFlow
        ? {
          action: "add_creatives" as const,
          tenant_id: user.tenantId,
          client: clientName,
          ad_account_id: adAccountValue,
          external_id: String(campaign.id),
          campaign_name: extractString(campaign.name) || titleText,
          objective: mappedObjective,
          page_id: pageIdValue,
          instagram_user_id: instagramIdValue,
          lead_form_id: leadFormIdValue,
          leadgen_form_id: leadFormIdValue,
          drive_folder_id: driveFolderId || "",
          message_text: messageText,
          title_text: titleText,
          whatsapp_number_id: whatsappIdValue,
          website_url: campaignWebsite,
          page_name: pageResource?.name ?? "",
          instagram_name: instagramResource?.name ?? "",
          whatsapp_name: whatsappResource?.name ?? "",
          leadgen_form_name: leadFormNameValue,
          lead_form_name: leadFormNameValue,
          drive_folder_name: "",
          object_story_id: primaryObjectStoryId || undefined,
          post_id: primaryPostId || undefined,
          post_permalink: primaryPermalinkUrl || undefined,
          creative_mode: primaryCreativeMode || undefined,
        }
        : {
          action: "create_campaign" as const,
          tenant_id: user.tenantId,
          client: clientName,
          ad_account_id: adAccountValue,
          external_id: String(campaign.id),
          campaign: {
            name: campaign.name,
            objective: mappedObjective,
            buying_type: "AUCTION",
            status: campaign.status ? campaign.status.toUpperCase() : "PAUSED",
            special_ad_categories: ["NONE"],
          },
          adsets: adSetsPayload,
          page_id: pageIdValue,
          instagram_user_id: instagramIdValue,
          lead_form_id: leadFormIdValue,
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

  // Send data directly to n8n webhook (for existing campaign form)
  app.post("/api/webhooks/n8n", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;

      // Get webhook URL
      const settings = await storage.getAppSettings();
      if (!settings?.n8nWebhookUrl) {
        return res.status(400).json({ message: "Webhook n8n nao configurado. Configure em Admin > Configuracoes" });
      }

      // Extract data from request
      const {
        ad_account_id,
        account_id,
        account_resource_id,
        campaign_id,
        external_id,
        campaign_name,
        objective,
        objectives,
        page_id,
        page_name,
        instagram_user_id,
        instagram_name,
        whatsapp_number_id,
        whatsapp_name,
        leadgen_form_id,
        lead_form_id,
        leadgen_form_name,
        lead_form_name,
        website_url,
        drive_folder_id,
        drive_folder_name,
        title,
        title_text,
        message,
        message_text,
        metadata,
        client,
        callback_url,
        request_id,
      } = req.body ?? {};

      const tenant = await storage.getTenant(user.tenantId);
      const callbackBaseUrl = getPublicAppUrl(req).replace(/\/$/, "");
      const inferredCallbackUrl = `${callbackBaseUrl}/api/webhooks/n8n/status`;

      const incomingMeta =
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};

      const computedRequestId =
        (typeof request_id === "string" && request_id.length > 0
          ? request_id
          : undefined) ||
        (typeof incomingMeta["request_id"] === "string" && (incomingMeta["request_id"] as string).length > 0
          ? (incomingMeta["request_id"] as string)
          : `req-${crypto.randomUUID().replace(/-/g, "")}`);

      const computedCallbackUrl =
        (typeof callback_url === "string" && callback_url.length > 0
          ? callback_url
          : undefined) ||
        (typeof incomingMeta["callback_url"] === "string" &&
          (incomingMeta["callback_url"] as string).length > 0
          ? (incomingMeta["callback_url"] as string)
          : inferredCallbackUrl);

      const accountResourceIdInput = account_resource_id ?? account_id;
      const accountResourceId =
        typeof accountResourceIdInput === "number"
          ? accountResourceIdInput
          : Number.parseInt(String(accountResourceIdInput ?? ""), 10);

      const accountResource =
        Number.isFinite(accountResourceId) && accountResourceId > 0
          ? await storage.getResource(accountResourceId)
          : undefined;

      const sanitizedAdAccountId =
        (typeof ad_account_id === "string" && ad_account_id.length > 0
          ? ad_account_id
          : undefined) ??
        accountResource?.value ??
        "";

      const resolvedLeadFormId =
        typeof leadgen_form_id !== "undefined" && leadgen_form_id !== null
          ? leadgen_form_id
          : lead_form_id;

      const resolvedLeadFormName =
        typeof leadgen_form_name === "string" && leadgen_form_name.trim().length > 0
          ? leadgen_form_name
          : typeof lead_form_name === "string"
            ? lead_form_name
            : "";

      const clientName =
        (typeof client === "string" && client.trim().length > 0
          ? client.trim()
          : undefined) ??
        tenant?.name ??
        `Tenant-${user.tenantId}`;

      const objectiveValueRaw =
        (typeof objective === "string" && objective.length > 0 ? objective : undefined) ??
        (Array.isArray(objectives) && objectives.length > 0 ? String(objectives[0]) : "");
      const objectiveOutcome = mapObjectiveToOutcome(objectiveValueRaw);

      const campaignIdentifier = external_id ?? campaign_id;
      const outgoingExternalId = campaignIdentifier !== undefined && campaignIdentifier !== null
        ? String(campaignIdentifier)
        : "";

      const webhookMeta: Record<string, unknown> = {
        ...incomingMeta,
        request_id: computedRequestId,
        callback_url: computedCallbackUrl,
      };

      const webhookPayload = {
        body: {
          data: {
            action: "add_creatives" as const,
            tenant_id: user.tenantId,
            client: clientName,
            ad_account_id: sanitizedAdAccountId,
            external_id: outgoingExternalId,
            campaign_name:
              (typeof campaign_name === "string" && campaign_name.length > 0
                ? campaign_name
                : undefined) || (typeof title_text === "string" && title_text.length > 0
                  ? title_text
                  : title ?? ""),
            objective: objectiveOutcome,
            page_id: page_id !== undefined && page_id !== null ? String(page_id) : "",
            instagram_user_id:
              instagram_user_id !== undefined && instagram_user_id !== null
                ? String(instagram_user_id)
                : "",
            leadgen_form_id:
              resolvedLeadFormId !== undefined && resolvedLeadFormId !== null
                ? String(resolvedLeadFormId)
                : "",
            lead_form_id:
              resolvedLeadFormId !== undefined && resolvedLeadFormId !== null
                ? String(resolvedLeadFormId)
                : "",
            drive_folder_id:
              drive_folder_id !== undefined && drive_folder_id !== null
                ? String(drive_folder_id)
                : "",
            message_text:
              (typeof message_text === "string" && message_text.length > 0
                ? message_text
                : message) || "",
            title_text:
              (typeof title_text === "string" && title_text.length > 0 ? title_text : title) || "",
            whatsapp_number_id:
              whatsapp_number_id !== undefined && whatsapp_number_id !== null
                ? String(whatsapp_number_id)
                : "",
            website_url: typeof website_url === "string" ? website_url : "",
            page_name: typeof page_name === "string" ? page_name : "",
            instagram_name: typeof instagram_name === "string" ? instagram_name : "",
            whatsapp_name: typeof whatsapp_name === "string" ? whatsapp_name : "",
            leadgen_form_name: resolvedLeadFormName,
            lead_form_name: resolvedLeadFormName,
            drive_folder_name: typeof drive_folder_name === "string" ? drive_folder_name : "",
          },
          meta: webhookMeta,
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

      res.json({ message: "Dados enviados para n8n com sucesso" });
    } catch (err) {
      next(err);
    }
  });

  // Receive status update from n8n
  app.post("/api/webhooks/n8n/status", async (req, res, next) => {
    try {
      const { campaign_id, external_id, status, status_detail } = req.body;

      if (campaign_id && external_id && String(campaign_id) !== String(external_id)) {
        return res
          .status(400)
          .json({ message: "campaign_id e external_id nao correspondem ao mesmo valor" });
      }

      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }

      // Validate status values
      const validStatuses = ["active", "error", "paused", "completed"];
      if (!validStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
        });
      }

      const campaignIdentifier = external_id ?? campaign_id;
      if (!campaignIdentifier) {
        return res
          .status(400)
          .json({ message: "Envie campaign_id ou external_id para identificar a campanha" });
      }

      const parsedCampaignId = Number.parseInt(String(campaignIdentifier), 10);
      if (!Number.isFinite(parsedCampaignId)) {
        return res
          .status(400)
          .json({ message: "campaign_id/external_id deve ser numerico" });
      }

      // Get campaign to verify it exists
      const campaign = await storage.getCampaign(parsedCampaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Update campaign status
      const updated = await storage.updateCampaign(parsedCampaignId, {
        status: status.toLowerCase(),
        statusDetail: status_detail || null,
      });

      console.log(
        `[n8n-status] Campaign ${parsedCampaignId} status updated to: ${status}`,
        status_detail || ""
      );

      res.json({
        message: "Status updated successfully",
        campaign: updated
      });
    } catch (err) {
      console.error("[n8n-status] Error updating campaign status:", err);
      next(err);
    }
  });

  // ===== Integration Routes =====

  // Get all integrations for tenant
  app.get("/api/integrations", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const integrations = await storage.getIntegrationsByTenant(user.tenantId);
      res.json(integrations);
    } catch (err) {
      next(err);
    }
  });

  // Get integration by provider
  app.get("/api/integrations/:provider", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const integration = await storage.getIntegrationByProvider(user.tenantId, req.params.provider);

      if (!integration || integration.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Integration not found" });
      }

      res.json(integration);
    } catch (err) {
      next(err);
    }
  });

  // Create/Update integration
  app.post("/api/integrations", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;

      // Prevent tenantId override in create/update
      const bodyData = insertIntegrationSchema.parse(req.body);

      // Check if integration already exists
      const existing = await storage.getIntegrationByProvider(user.tenantId, bodyData.provider);

      if (existing) {
        // Update existing
        const updated = await storage.updateIntegration(existing.id, bodyData);
        return res.json(updated);
      }

      // Create new
      const integrationValues: InsertIntegration & { tenantId: number } = {
        ...bodyData,
        tenantId: user.tenantId,
      };
      const integration = await storage.createIntegration(integrationValues);

      res.status(201).json(integration);
    } catch (err) {
      next(err);
    }
  });

  // Delete integration
  app.delete("/api/integrations/:id", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const id = parseInt(req.params.id);

      // Verify integration belongs to user's tenant
      const existing = await storage.getIntegration(id);
      if (!existing || existing.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Integration not found" });
      }

      await storage.deleteIntegration(id);
      res.json({ message: "Integration deleted successfully" });
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
  function generateAppSecretProof(accessToken: string, appSecret: string): string {
    return crypto.createHmac('sha256', appSecret)
      .update(accessToken)
      .digest('hex');
  }

  async function getMetaAccess(tenantId: number): Promise<{
    accessToken: string;
    appSecretProof?: string;
  } | null> {
    const integration = await storage.getIntegrationByProvider(tenantId, "Meta");
    if (!integration) {
      return null;
    }
    const config = integration.config as Record<string, unknown>;
    const storedToken =
      typeof config?.accessToken === "string" ? config.accessToken : undefined;
    if (!storedToken) {
      return null;
    }
    const accessToken = decryptMetaAccessToken(storedToken);
    if (!accessToken) {
      return null;
    }
    const settings = await storage.getAppSettings();
    const appSecretProof =
      settings?.metaAppSecret && settings.metaAppSecret.length > 0
        ? generateAppSecretProof(accessToken, settings.metaAppSecret)
        : undefined;
    return { accessToken, appSecretProof };
  }

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
