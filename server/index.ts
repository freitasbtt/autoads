import crypto from "node:crypto";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log, logJson } from "./logger";
import { metricsRegistry, observeHttpRequest } from "./metrics";
import { serveStatic } from "./serve-static";
import type { ListenOptions } from "net";

const app = express();

app.set("trust proxy", 1);

if (process.env.FORCE_HTTPS === "true") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const requestId = req.get("x-request-id")?.trim() || crypto.randomUUID();
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (path !== "/internal/metrics") {
      observeHttpRequest({
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    }

    if (path.startsWith("/api")) {
      const ipHashSecret = process.env.LOG_IP_HASH_SECRET;
      const ipHash = ipHashSecret
        ? crypto.createHmac("sha256", ipHashSecret).update(req.ip).digest("hex").slice(0, 16)
        : undefined;

      logJson({
        event: "http_request",
        request_id: requestId,
        method: req.method,
        route: path,
        status: res.statusCode,
        duration_ms: duration,
        ...(ipHash ? { ip_hash: ipHash } : {}),
        user_agent: (req.get("user-agent") || "").slice(0, 200),
      });
    }
  });

  next();
});

app.get("/internal/metrics", async (req, res, next) => {
  try {
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    const providedSecret = req.get("x-internal-api-secret");
    if (
      !expectedSecret ||
      !providedSecret ||
      expectedSecret.length !== providedSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(providedSecret))
    ) {
      return res.sendStatus(404);
    }

    res.setHeader("Content-Type", metricsRegistry.contentType);
    return res.end(await metricsRegistry.metrics());
  } catch (error) {
    return next(error);
  }
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const isDevelopment = (process.env.NODE_ENV ?? "development") !== "production";
  const viteModulePath = "./" + "vite";
  if (isDevelopment) {
    app.set("env", "development");
    const { setupVite } = await import(viteModulePath);
    await setupVite(app, server);
  } else {
    app.set("env", "production");
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions: ListenOptions & { reusePort?: boolean } = {
    port,
    host: "0.0.0.0",
  };

  // Windows (>= Node 20) doesn't support SO_REUSEPORT; conditional keeps dev experience working cross-platform.
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
