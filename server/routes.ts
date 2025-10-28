import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import memorystore from "memorystore";
import { z } from "zod";
import type { User } from "@shared/schema";
import { insertUserSchema, insertResourceSchema, insertAudienceSchema, insertCampaignSchema, insertIntegrationSchema } from "@shared/schema";
import crypto from "crypto";

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
function isAuthenticated(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Middleware to check if user is admin
function isAdmin(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (req.isAuthenticated()) {
    const user = req.user as User;
    if (user.role === "admin") {
      return next();
    }
  }
  res.status(403).json({ message: "Forbidden - Admin access required" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "meta-ads-campaign-manager-secret",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }),
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // ===== Authentication Routes =====

  // Register
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const registerSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        tenantName: z.string().min(1),
      });

      const data = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create tenant
      const tenant = await storage.createTenant({ name: data.tenantName });

      // Hash password and create user
      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        email: data.email,
        password: hashedPassword,
        tenantId: tenant.id,
        role: "admin", // First user is admin
      });

      // Login user automatically
      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });
      });
    } catch (err) {
      next(err);
    }
  });

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
      
      const resource = await storage.createResource({
        ...data,
        tenantId: user.tenantId,
      });

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
      const { tenantId, ...data } = insertResourceSchema.partial().parse(req.body);
      
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
      
      const audience = await storage.createAudience({
        ...data,
        tenantId: user.tenantId,
      });

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
      const { tenantId, ...data } = insertAudienceSchema.partial().parse(req.body);
      
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

  // Create campaign
  app.post("/api/campaigns", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const data = insertCampaignSchema.parse(req.body);
      
      const campaign = await storage.createCampaign({
        ...data,
        tenantId: user.tenantId,
      });

      // Send webhook to n8n if configured
      try {
        const settings = await storage.getAppSettings();
        if (settings?.n8nWebhookUrl) {
          // Fetch resource details
          const accountResource = campaign.accountId ? await storage.getResource(campaign.accountId) : null;
          const pageResource = campaign.pageId ? await storage.getResource(campaign.pageId) : null;
          const instagramResource = campaign.instagramId ? await storage.getResource(campaign.instagramId) : null;
          const whatsappResource = campaign.whatsappId ? await storage.getResource(campaign.whatsappId) : null;
          const leadformResource = campaign.leadformId ? await storage.getResource(campaign.leadformId) : null;

          // Prepare webhook payload matching the provided example
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
                drive_folder_id: campaign.driveFolderId || "",
                message_text: campaign.message || "",
                title_text: campaign.title || "",
                leadgen_form_id: leadformResource ? leadformResource.value : "",
                website_url: campaign.websiteUrl || "",
                status: "PENDING",
                status_detail: "Enviado ao n8n",
                ad_account_id: accountResource ? accountResource.value : "",
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
            console.error("Failed to send webhook to n8n:", await webhookResponse.text());
          }
        }
      } catch (webhookError) {
        // Log webhook error but don't fail the campaign creation
        console.error("Error sending webhook to n8n:", webhookError);
      }

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
      const { tenantId, ...data } = insertCampaignSchema.partial().parse(req.body);
      
      const campaign = await storage.updateCampaign(id, data);
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
        return res.status(400).json({ message: "Webhook n8n não configurado. Configure em Admin > Configurações" });
      }

      // Fetch resource details
      const accountResource = campaign.accountId ? await storage.getResource(campaign.accountId) : null;
      const pageResource = campaign.pageId ? await storage.getResource(campaign.pageId) : null;
      const instagramResource = campaign.instagramId ? await storage.getResource(campaign.instagramId) : null;
      const whatsappResource = campaign.whatsappId ? await storage.getResource(campaign.whatsappId) : null;
      const leadformResource = campaign.leadformId ? await storage.getResource(campaign.leadformId) : null;

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
            drive_folder_id: campaign.driveFolderId || "",
            message_text: campaign.message || "",
            title_text: campaign.title || "",
            leadgen_form_id: leadformResource ? leadformResource.value : "",
            website_url: campaign.websiteUrl || "",
            status: campaign.status.toUpperCase(),
            status_detail: "Reenviado ao n8n",
            ad_account_id: accountResource ? accountResource.value : "",
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
            userMessage = "Webhook n8n não está ativo. No n8n, clique em 'Execute workflow' e tente novamente.";
          }
        } catch (e) {
          // Keep default message if parsing fails
        }
        
        return res.status(500).json({ message: userMessage });
      }

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
        return res.status(400).json({ message: "Webhook n8n não configurado. Configure em Admin > Configurações" });
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
            userMessage = "Webhook n8n não está ativo. No n8n, clique em 'Execute workflow' e tente novamente.";
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
      const { tenantId, ...bodyData } = insertIntegrationSchema.parse(req.body);
      
      // Check if integration already exists
      const existing = await storage.getIntegrationByProvider(user.tenantId, bodyData.provider);
      
      if (existing) {
        // Update existing
        const updated = await storage.updateIntegration(existing.id, bodyData);
        return res.json(updated);
      }

      // Create new
      const integration = await storage.createIntegration({
        ...bodyData,
        tenantId: user.tenantId,
      });

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
  app.get("/api/admin/settings", isAdmin, async (req, res, next) => {
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
  app.put("/api/admin/settings", isAdmin, async (req, res, next) => {
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

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/meta/callback`;
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

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/meta/callback`;

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
          await storage.createResource({
            tenantId,
            type: "account",
            name: account.name || "Ad Account",
            value: account.id,
          });
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
          // Save page
          await storage.createResource({
            tenantId,
            type: "page",
            name: page.name || "Facebook Page",
            value: page.id,
          });

          // Save Instagram account if connected
          if (page.instagram_business_account?.id) {
            await storage.createResource({
              tenantId,
              type: "instagram",
              name: `Instagram - ${page.name}`,
              value: page.instagram_business_account.id,
            });
          }
        }
      }

      // TODO: Fetch WhatsApp numbers and lead forms
      // This requires additional API calls with specific permissions

      // Save access token in integrations table for future use
      await storage.createIntegration({
        tenantId,
        provider: "Meta",
        config: { accessToken, tokenType: tokenData.token_type },
        status: "connected",
      });

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

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;
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

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/google/callback`;

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
      await storage.createIntegration({
        tenantId,
        provider: "Google Drive",
        config: { 
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenType: tokenData.token_type,
          expiresIn: tokenData.expires_in,
        },
        status: "connected",
      });

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
