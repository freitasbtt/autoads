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

  const httpServer = createServer(app);

  return httpServer;
}
