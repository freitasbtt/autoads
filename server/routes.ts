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
  insertCampaignSchema,
  insertIntegrationSchema,
} from "@shared/schema";
import crypto from "crypto";
import { differenceInCalendarDays, format, isValid, parseISO, subDays } from "date-fns";

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

      if (!metaConfig.accessToken) {
        return res.status(400).json({
          message: "Integracao com Meta nao esta conectada para este tenant.",
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

      const client = new MetaGraphClient(metaConfig.accessToken, settings.metaAppSecret);

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

        if (!metaConfig.accessToken) {
          return res.status(400).json({
            message:
              "Integracao com Meta nao esta conectada para este tenant.",
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
          metaConfig.accessToken,
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
      const data = insertAudienceSchema.partial().parse(req.body);
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

      const creativeEntries = Array.isArray(campaign.creatives)
        ? (campaign.creatives as Array<{ driveFolderId?: unknown }>)
        : [];

      const primaryDriveFolderFromCreative = creativeEntries
        .map((creative) => {
          const value = typeof creative?.driveFolderId === "string" ? creative.driveFolderId.trim() : "";
          return value;
        })
        .find((value) => value.length > 0);

      const driveFolderId =
        primaryDriveFolderFromCreative ||
        (typeof campaign.driveFolderId === "string" ? campaign.driveFolderId : "");

      // Prepare webhook payload
      const webhookPayload = [{
        headers: {
          "content-type": "application/json",
          "user-agent": "Meta-Ads-Platform/1.0"
        },
        params: {},
        query: {},
        body: {
          rowIndex: campaign.id,
          sheet: accountResource ? `ACC:${accountResource.value}` : "Unknown",
          data: {
            submit: "ON",
            campaign_id: String(campaign.id),
            campaign_name: campaign.name,
            objective: campaign.objective,
            budget_type: "DAILY",
            daily_budget: campaign.budget,
            page_id: pageResource ? pageResource.value : "",
            instagram_user_id: instagramResource ? instagramResource.value : "",
            whatsapp_number_id: whatsappResource ? whatsappResource.value : "",
            drive_folder_id: driveFolderId || "",
            message_text: campaign.message || "",
            title_text: campaign.title || "",
            leadgen_form_id: leadformResource ? leadformResource.value : "",
            website_url: campaign.websiteUrl || "",
            status: campaign.status.toUpperCase(),
            status_detail: "Reenviado ao n8n",
            ad_account_id: adAccountId || (accountResource ? accountResource.value : ""),
            client: `Tenant-${user.tenantId}`
          },
          ts: new Date().toISOString()
        },
        webhookUrl: settings.n8nWebhookUrl,
        executionMode: "production"
      }];

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
        objectives,
        page_id,
        page_name,
        instagram_user_id,
        instagram_name,
        whatsapp_number_id,
        whatsapp_name,
        leadgen_form_id,
        leadgen_form_name,
        website_url,
        drive_folder_id,
        drive_folder_name,
        title,
        message,
        metadata
      } = req.body;

      // Prepare webhook payload matching n8n expected format
      const webhookPayload = [{
        headers: {
          "content-type": "application/json",
          "user-agent": "Meta-Ads-Platform/1.0"
        },
        params: {},
        query: {},
        body: {
          rowIndex: Date.now(), // Use timestamp as unique identifier
          sheet: "EXISTING_CAMPAIGN",
          data: {
            submit: "ON",
            objectives: objectives,
            page_id: page_id || "",
            page_name: page_name || "",
            instagram_user_id: instagram_user_id || "",
            instagram_name: instagram_name || "",
            whatsapp_number_id: whatsapp_number_id || "",
            whatsapp_name: whatsapp_name || "",
            leadgen_form_id: leadgen_form_id || "",
            leadgen_form_name: leadgen_form_name || "",
            website_url: website_url || "",
            drive_folder_id: drive_folder_id || "",
            drive_folder_name: drive_folder_name || "",
            message_text: message || "",
            title_text: title || "",
            status: "PENDING",
            status_detail: "Enviado ao n8n (campanha existente)",
            client: `Tenant-${user.tenantId}`,
            form_type: metadata?.form_type || "existing_campaign",
            timestamp: metadata?.timestamp || new Date().toISOString()
          },
          ts: new Date().toISOString()
        },
        webhookUrl: settings.n8nWebhookUrl,
        executionMode: "production"
      }];

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
      const { campaign_id, status, status_detail } = req.body;

      if (!campaign_id) {
        return res.status(400).json({ message: "campaign_id is required" });
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

      // Get campaign to verify it exists
      const campaign = await storage.getCampaign(parseInt(campaign_id));
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Update campaign status
      const updated = await storage.updateCampaign(parseInt(campaign_id), {
        status: status.toLowerCase(),
        statusDetail: status_detail || null,
      });

      console.log(`[n8n-status] Campaign ${campaign_id} status updated to: ${status}`, status_detail || '');

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
      const metaIntegration: InsertIntegration & { tenantId: number } = {
        tenantId,
        provider: "Meta",
        config: { accessToken, tokenType: tokenData.token_type },
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



