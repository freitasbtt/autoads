import { createServer, type Server } from "http";
import { storage } from "./modules/storage";
import { pingDatabase } from "./db";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import memorystore from "memorystore";
import type { Express, Response } from "express";
import type { User } from "@shared/schema";
// ESM: recria __filename / __dirname
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { existsSync } from "node:fs";
import { verifyPassword } from "./modules/auth/services/password.service";
import { resourcesRouter } from "./modules/resources/routes";
import { setNoCacheHeaders } from "./utils/cache";
import { audiencesRouter } from "./modules/audiences/routes";
import { campaignsRouter, campaignWebhookRouter } from "./modules/campaigns/routes";
import { integrationsRouter } from "./modules/integrations/routes";
import { authRouter } from "./modules/auth/routes";
import { adminRouter } from "./modules/admin/routes";
import { metaRouter, internalMetaRouter } from "./modules/meta/routes";
import { oauthRouter } from "./modules/oauth/routes";
import { realtimeRouter } from "./modules/realtime/routes";
import { driveRouter } from "./modules/drive/routes";

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
  // ===== Router Composition =====

  app.use("/api/auth", authRouter);
  app.use("/api/resources", resourcesRouter);
  app.use("/api/integrations", integrationsRouter);
  app.use("/api/audiences", audiencesRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/webhooks", campaignWebhookRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/events", realtimeRouter);
  app.use("/api", driveRouter);
  app.use("/api", metaRouter);
  app.use("/internal", internalMetaRouter);
  app.use("/auth", oauthRouter);

  const httpServer = createServer(app);

  return httpServer;
}





