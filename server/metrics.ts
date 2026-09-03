import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

metricsRegistry.setDefaultLabels({ service: "autoads" });
collectDefaultMetrics({ prefix: "autoads_", register: metricsRegistry });

const httpRequestsTotal = new Counter({
  name: "autoads_http_requests_total",
  help: "Total HTTP requests handled by the application.",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: "autoads_http_request_duration_seconds",
  help: "Duration of HTTP requests handled by the application.",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

function metricRoute(path: string) {
  if (path.startsWith("/api/auth")) return "/api/auth";
  if (path.startsWith("/api/public")) return "/api/public";
  if (path.startsWith("/api/webhooks")) return "/api/webhooks";
  if (path.startsWith("/api/integrations")) return "/api/integrations";
  if (path.startsWith("/api/campaigns")) return "/api/campaigns";
  if (path.startsWith("/api")) return "/api/other";
  if (path.startsWith("/internal")) return "/internal";
  return "/web";
}

export function observeHttpRequest(input: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}) {
  const labels = {
    method: input.method,
    route: metricRoute(input.path),
    status: String(input.statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, input.durationMs / 1_000);
}
