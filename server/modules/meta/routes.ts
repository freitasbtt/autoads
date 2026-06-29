import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type { DashboardShareLink, Resource, User } from "@shared/schema";
import { dashboardShareLinks, dashboardSyncAccounts, metaAdInsightsDaily, metaSyncJobs } from "@shared/schema";
import { db } from "../../db";
import { storage } from "../storage";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  MetaGraphClient,
} from ".";
import type { MetricTotals as MetaMetricTotals } from ".";
import { getMetaAccess } from "./services/access.service";
import { resolveMetaAppId, resolveMetaAppSecret } from "./utils/app-config";
import { setNoCacheHeaders } from "../../utils/cache";
import { isAuthenticated } from "../../middlewares/auth";
import { createRateLimit } from "../../middlewares/rate-limit";
import { generateAppSecretProof } from "./utils/crypto";
import { isSystemAdminRole } from "../auth/services/role.service";
import { hashPassword, verifyPassword } from "../auth/services/password.service";
import { verifyDashboardShareToken, type DashboardShareClaims } from "./utils/dashboard-share";
import {
  buildDashboardCacheKey,
  clearDashboardCache,
  getOrCreateDashboardCache,
} from "./utils/dashboard-cache";
import {
  createManualDashboardSyncJob,
  fetchDashboardMetricsFromCache,
  fetchDashboardTopCreativesFromCache,
  getDashboardSyncSummary,
  runDashboardSyncJob,
} from "./services/dashboard-sync.service";

const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const dashboardMetricsQuerySchema = z.object({
  startDate: z.string().regex(DATE_PARAM_REGEX).optional(),
  endDate: z.string().regex(DATE_PARAM_REGEX).optional(),
});
const dashboardShareBodySchema = z.object({
  startDate: z.string().regex(DATE_PARAM_REGEX),
  endDate: z.string().regex(DATE_PARAM_REGEX),
  accountIds: z.array(z.number().int().positive()).min(1),
  campaignId: z.string().min(1).nullable().optional(),
  objective: z.string().min(1).nullable().optional(),
  status: z.string().min(1).nullable().optional(),
  expiresInHours: z.number().int().min(1).max(168).optional(),
  password: z.string().min(4).max(120),
});
const dashboardShareUnlockBodySchema = z.object({
  password: z.string().min(1).max(120),
});
const dashboardGoalUpsertBodySchema = z.object({
  startDate: z.string().regex(DATE_PARAM_REGEX),
  endDate: z.string().regex(DATE_PARAM_REGEX),
  goals: z.array(
    z.object({
      accountId: z.number().int().positive(),
      accountName: z.string().min(1),
      targetSpend: z.number().positive(),
      targetLeads: z.number().int().positive(),
    }),
  ),
});
const dashboardSyncNowBodySchema = z.object({
  dateStart: z.string().regex(DATE_PARAM_REGEX).optional(),
  dateEnd: z.string().regex(DATE_PARAM_REGEX).optional(),
}).superRefine((data, ctx) => {
  if ((data.dateStart && !data.dateEnd) || (!data.dateStart && data.dateEnd)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "dateStart e dateEnd devem ser enviados juntos.",
      path: ["dateEnd"],
    });
  }
});
const dashboardAddSyncAccountBodySchema = z.object({
  accountName: z.string().min(1).optional(),
});

const DASHBOARD_METRICS_CACHE_TTL_MS = 60_000;
const DASHBOARD_TOP_CREATIVES_CACHE_TTL_MS = 90_000;

function sortStrings(values?: Iterable<string>): string[] {
  return Array.from(values ?? []).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function sortNumbers(values?: Iterable<number>): number[] {
  return Array.from(values ?? []).sort((a, b) => a - b);
}

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
    reach: 0,
    leads: 0,
    messagingConversationsStarted: 0,
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

function buildPreviousMonthRange(startDate: Date, endDate: Date) {
  return {
    previousStart: format(subMonths(startDate, 1), "yyyy-MM-dd"),
    previousEnd: format(subMonths(endDate, 1), "yyyy-MM-dd"),
  };
}

function buildGoalMetrics(options: {
  targetSpend: number;
  targetLeads: number;
  actualSpend: number;
  actualLeads: number;
  periodDays: number;
}) {
  const { targetSpend, targetLeads, actualSpend, actualLeads, periodDays } = options;
  const targetCostPerLead = targetLeads > 0 ? targetSpend / targetLeads : null;
  const actualCostPerLead = actualLeads > 0 ? actualSpend / actualLeads : null;

  return {
    targetSpend,
    targetLeads,
    targetCostPerLead,
    spendProgress: targetSpend > 0 ? (actualSpend / targetSpend) * 100 : null,
    leadsProgress: targetLeads > 0 ? (actualLeads / targetLeads) * 100 : null,
    remainingSpend: Math.max(targetSpend - actualSpend, 0),
    remainingLeads: Math.max(targetLeads - actualLeads, 0),
    costPerLeadDelta:
      actualCostPerLead !== null && targetCostPerLead !== null
        ? actualCostPerLead - targetCostPerLead
        : null,
    dailyLeadTarget: periodDays > 0 ? targetLeads / periodDays : null,
  };
}

function resolveGoalPeriodRange(startDateText: string, endDateText: string) {
  const startDate = parseISO(startDateText);
  const endDate = parseISO(endDateText);

  if (!isValid(startDate) || !isValid(endDate)) {
    return null;
  }

  if (isSameMonth(startDate, endDate)) {
    const goalStart = startOfMonth(startDate);
    const goalEnd = endOfMonth(startDate);

    return {
      startDate: format(goalStart, "yyyy-MM-dd"),
      endDate: format(goalEnd, "yyyy-MM-dd"),
      periodDays: differenceInCalendarDays(goalEnd, goalStart) + 1,
    };
  }

  return {
    startDate: startDateText,
    endDate: endDateText,
    periodDays: differenceInCalendarDays(endDate, startDate) + 1,
  };
}
function validateInternalRequest(req: Request): {
  valid: boolean;
  status?: number;
  message?: string;
} {
  const configuredSecret = process.env.INTERNAL_API_SECRET?.trim();
  if (!configuredSecret) {
    return {
      valid: false,
      status: 500,
      message: "Internal API secret not configured",
    };
  }

  const providedSecret = req.get("x-internal-api-secret")?.trim();
  if (!providedSecret) {
    return {
      valid: false,
      status: 401,
      message: "Missing x-internal-api-secret header",
    };
  }

  const expectedBuffer = Buffer.from(configuredSecret, "utf8");
  const providedBuffer = Buffer.from(providedSecret, "utf8");
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return { valid: false, status: 401, message: "Unauthorized" };
  }

  return { valid: true };
}

async function fetchMetaTokenDebug(options: {
  token: string;
  appId: string;
  appSecret: string;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = new URL("https://graph.facebook.com/v24.0/debug_token");
  url.searchParams.set("input_token", options.token);
  url.searchParams.set("access_token", `${options.appId}|${options.appSecret}`);

  let response: globalThis.Response;
  try {
    response = await fetch(url);
  } catch (networkError) {
    return {
      ok: false,
      status: 0,
      body: { message: `Network error while debugging token: ${String(networkError)}` },
    };
  }

  const text = await response.text();
  let body: unknown = {};
  try {
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { ok: response.ok, status: response.status, body };
}

async function fetchMetaAdAccountsForDashboard(options: {
  accessToken: string;
  appSecretProof: string;
}): Promise<MetaAdAccountListItem[]> {
  const items: MetaAdAccountListItem[] = [];
  let nextUrl: URL | null = new URL("https://graph.facebook.com/v24.0/me/adaccounts");
  nextUrl.searchParams.set("fields", "id,name,account_id,account_status");
  nextUrl.searchParams.set("limit", "200");

  while (nextUrl) {
    nextUrl.searchParams.set("access_token", options.accessToken);
    nextUrl.searchParams.set("appsecret_proof", options.appSecretProof);

    const response = await fetch(nextUrl);
    const text = await response.text();
    let body: any = {};
    try {
      body = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      throw new Error("Falha ao interpretar resposta da Meta ao buscar contas.");
    }

    if (!response.ok || body?.error) {
      const message =
        typeof body?.error?.message === "string"
          ? body.error.message
          : "Falha ao buscar contas de anuncio na Meta.";
      throw new Error(message);
    }

    if (Array.isArray(body?.data)) {
      items.push(...body.data);
    }

    nextUrl = typeof body?.paging?.next === "string" ? new URL(body.paging.next) : null;
  }

  return items;
}

type FetchRetryOptions = {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
};

type MetaAdAccountListItem = {
  id?: string;
  name?: string;
  account_id?: string;
  account_status?: number;
};

type LeadformPageCacheEntry = {
  forms: Resource[];
  expiresAtMs: number;
};

const leadformPageMemoryCache = new Map<string, LeadformPageCacheEntry>();

function getLeadformCacheTtlMs() {
  const ttlHoursRaw = Number.parseInt(process.env.META_PAGE_LEADFORMS_TTL_HOURS ?? "24", 10);
  const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 24;
  return ttlHours * 60 * 60 * 1000;
}

function buildLeadformCacheKey(tenantId: number, pageId: string) {
  return `${tenantId}:${pageId}`;
}

function asResourceMetadata(resource: Resource) {
  return (resource.metadata ?? {}) as Record<string, unknown>;
}

function parseMetadataDate(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortLeadformResources(forms: Resource[]) {
  return [...forms].sort((a, b) => {
    const aMeta = asResourceMetadata(a);
    const bMeta = asResourceMetadata(b);
    const aCreatedTime = parseMetadataDate(aMeta.createdTime) ?? a.createdAt.getTime();
    const bCreatedTime = parseMetadataDate(bMeta.createdTime) ?? b.createdAt.getTime();
    return bCreatedTime - aCreatedTime;
  });
}

function getFreshMemoryLeadforms(tenantId: number, pageId: string) {
  const key = buildLeadformCacheKey(tenantId, pageId);
  const cached = leadformPageMemoryCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAtMs <= Date.now()) {
    leadformPageMemoryCache.delete(key);
    return null;
  }
  return cached.forms;
}

function setMemoryLeadforms(tenantId: number, pageId: string, forms: Resource[], expiresAt: Date) {
  const key = buildLeadformCacheKey(tenantId, pageId);
  leadformPageMemoryCache.set(key, {
    forms,
    expiresAtMs: expiresAt.getTime(),
  });
}

async function getStoredLeadformsByPage(tenantId: number, pageId: string) {
  const [leadforms, syncMarkers] = await Promise.all([
    storage.getResourcesByType(tenantId, "leadform"),
    storage.getResourcesByType(tenantId, "leadform_page_sync"),
  ]);

  const formsForPage = sortLeadformResources(
    leadforms.filter((resource) => {
      const metadata = asResourceMetadata(resource);
      return metadata.pageId === pageId;
    }),
  );

  const syncMarker = syncMarkers.find((resource) => resource.value === pageId);
  if (!syncMarker) {
    return {
      forms: formsForPage,
      syncMarker: null,
      fresh: false,
      expiresAt: null,
    };
  }

  const expiresAtMs = parseMetadataDate(asResourceMetadata(syncMarker).expiresAt);
  const isFresh = typeof expiresAtMs === "number" && expiresAtMs > Date.now();

  return {
    forms: formsForPage,
    syncMarker,
    fresh: isFresh,
    expiresAt: typeof expiresAtMs === "number" ? new Date(expiresAtMs) : null,
  };
}

async function respondWithStoredLeadformsIfAny(
  res: Response,
  tenantId: number,
  pageId: string,
  source: "db" | "db_stale" = "db_stale",
) {
  const stored = await getStoredLeadformsByPage(tenantId, pageId);
  if (stored.forms.length === 0) {
    return false;
  }

  if (stored.fresh && stored.expiresAt) {
    setMemoryLeadforms(tenantId, pageId, stored.forms, stored.expiresAt);
  }

  setNoCacheHeaders(res);
  res.setHeader("X-Autoads-Leadforms-Source", source);
  res.removeHeader("ETag");
  res.json(stored.forms);
  return true;
}

async function fetchWithTimeoutRetry(
  input: string | URL,
  init: RequestInit | undefined,
  options: FetchRetryOptions,
): Promise<globalThis.Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (attempt < options.retryCount) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));
      }
    }
  }

  throw lastError;
}

export const metaRouter = Router();
export const internalMetaRouter = Router();
export const publicMetaRouter = Router();

const internalMetaTokenRateLimit = createRateLimit({
  name: "internal-meta-token",
  windowMs: 60 * 1000,
  max: 60,
  message: "Muitas requisicoes para o token interno da Meta. Tente novamente em instantes.",
  keyGenerator: (req) => {
    const tenantId =
      typeof req.query.tenant_id === "string" && req.query.tenant_id.trim().length > 0
        ? req.query.tenant_id.trim()
        : "unknown-tenant";
    return `${req.ip}:${tenantId}`;
  },
});

const publicDashboardShareUnlockRateLimit = createRateLimit({
  name: "public-dashboard-share-unlock",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas de senha. Tente novamente em alguns minutos.",
  keyGenerator: (req) => {
    const token =
      typeof req.query.token === "string" && req.query.token.trim().length > 0
        ? req.query.token.trim()
        : "unknown-token";
    return `${req.ip}:${token}`;
  },
});

function buildShareClaimsFromLink(link: DashboardShareLink): DashboardShareClaims {
  return {
    v: 1,
    tenantId: link.tenantId,
    startDate: String(link.startDate),
    endDate: String(link.endDate),
    accountIds: Array.isArray(link.accountIds) ? link.accountIds : [],
    campaignId: link.campaignId ?? null,
    objective: link.objective ?? null,
    status: link.status ?? null,
    expiresAt: link.expiresAt instanceof Date ? link.expiresAt.toISOString() : new Date(link.expiresAt).toISOString(),
  };
}

async function getDashboardShareLink(token: string) {
  return db.query.dashboardShareLinks.findFirst({
    where: eq(dashboardShareLinks.publicId, token),
  });
}

function ensureShareUnlocked(req: Request, token: string): void {
  if (req.session.dashboardShareUnlocks?.[token]) return;
  const error = new Error("Informe a senha para acessar este dashboard compartilhado.");
  (error as Error & { status?: number }).status = 423;
  throw error;
}

function resolvePublicDashboardDateRange(claims: DashboardShareClaims, query: Request["query"]) {
  const parsed = dashboardMetricsQuerySchema.parse(query);
  const start = parsed.startDate ?? claims.startDate;
  const end = parsed.endDate ?? claims.endDate;
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (!isValid(startDate) || !isValid(endDate) || startDate > endDate) {
    const error = new Error("Periodo invalido.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return { start, end, startDate, endDate };
}

async function hasCachedDashboardData(options: {
  tenantId: number;
  accounts: Resource[];
  startDate: string;
  endDate: string;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  if (options.endDate > today) {
    return false;
  }

  const rows = await db
    .select({
      adAccountId: metaAdInsightsDaily.adAccountId,
      firstDate: sql<string | null>`min(${metaAdInsightsDaily.dateStart})`,
      lastDate: sql<string | null>`max(${metaAdInsightsDaily.dateStart})`,
    })
    .from(metaAdInsightsDaily)
    .where(
      and(
        eq(metaAdInsightsDaily.tenantId, options.tenantId),
        inArray(metaAdInsightsDaily.adAccountId, options.accounts.map((account) => account.value)),
        gte(metaAdInsightsDaily.dateStart, options.startDate),
        lte(metaAdInsightsDaily.dateStart, options.endDate),
      ),
    )
    .groupBy(metaAdInsightsDaily.adAccountId);
  const requiredEndDate =
    options.endDate === today ? format(subDays(new Date(), 1), "yyyy-MM-dd") : options.endDate;
  const coverageByAccount = new Map(rows.map((row) => [row.adAccountId, row] as const));

  return options.accounts.every((account) => {
    const coverage = coverageByAccount.get(account.value);
    return Boolean(
      coverage?.firstDate &&
        coverage.lastDate &&
        coverage.firstDate <= options.startDate &&
        coverage.lastDate >= requiredEndDate,
    );
  });
}

async function resolveDashboardShareContext(req: Request, token: string): Promise<{
  claims: DashboardShareClaims;
  selectedAccounts: Resource[];
  campaignFilterSet: Set<string> | undefined;
  objectiveFilterSet: Set<string> | undefined;
  statusFilterSet: Set<string> | undefined;
}> {
  let claims: DashboardShareClaims;
  const link = await getDashboardShareLink(token);
  if (link) {
    if (new Date(link.expiresAt).getTime() <= Date.now()) {
      const error = new Error("Link compartilhado invalido ou expirado.");
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    ensureShareUnlocked(req, token);
    claims = buildShareClaimsFromLink(link);
  } else {
    try {
      claims = verifyDashboardShareToken(token);
    } catch {
      const error = new Error("Link compartilhado invalido ou expirado.");
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
  }
  const allResources = await storage.getResourcesByTenant(claims.tenantId);
  const accountResources = allResources.filter((resource) => resource.type === "account");
  const selectedAccounts = accountResources.filter((resource) =>
    claims.accountIds.includes(resource.id),
  );

  if (selectedAccounts.length === 0) {
    const error = new Error("Nenhuma conta encontrada para este link compartilhado.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  return {
    claims,
    selectedAccounts,
    campaignFilterSet: claims.campaignId ? new Set([claims.campaignId]) : undefined,
    objectiveFilterSet: claims.objective ? new Set([claims.objective.toUpperCase()]) : undefined,
    statusFilterSet: claims.status ? new Set([claims.status.toUpperCase()]) : undefined,
  };
}

metaRouter.use(isAuthenticated);

async function resolveTenantAdAccount(user: User, adAccountId: string): Promise<Resource | null> {
  const accounts = (await storage.getResourcesByTenant(user.tenantId)).filter(
    (resource) => resource.type === "account",
  );
  return accounts.find((account) => account.value === adAccountId) ?? null;
}

function buildInitialDashboardSyncRange() {
  const now = new Date();
  return {
    dateStart: format(subDays(now, 89), "yyyy-MM-dd"),
    dateEnd: format(now, "yyyy-MM-dd"),
  };
}

async function upsertTenantMetaAccountResource(options: {
  tenantId: number;
  adAccountId: string;
  accountName: string;
  accountStatus?: number | null;
}) {
  const resources = await storage.getResourcesByTenant(options.tenantId);
  const existing = resources.find(
    (resource) => resource.type === "account" && resource.value === options.adAccountId,
  );
  const metadata = {
    accountStatus: typeof options.accountStatus === "number" ? options.accountStatus : null,
    source: "meta",
    syncedAt: new Date().toISOString(),
  };

  if (existing) {
    return storage.updateResource(existing.id, {
      name: options.accountName,
      metadata,
    }, options.tenantId);
  }

  return storage.createResource({
    tenantId: options.tenantId,
    type: "account",
    name: options.accountName,
    value: options.adAccountId,
    metadata,
  });
}

async function ensureHistoricalDashboardRangeForAccounts(options: {
  tenantId: number;
  userId: number;
  accounts: Resource[];
  startDate?: string;
  endDate?: string;
}) {
  if (!options.startDate || !options.endDate || options.accounts.length === 0) return;

  const requestedStart = parseISO(options.startDate);
  const requestedEnd = parseISO(options.endDate);
  if (!isValid(requestedStart) || !isValid(requestedEnd) || requestedStart > requestedEnd) return;

  const defaultWindowStart = subDays(new Date(), 89);
  if (requestedStart >= defaultWindowStart) return;

  for (const account of options.accounts) {
    const completedCoverage = await db.query.metaSyncJobs.findFirst({
      where: and(
        eq(metaSyncJobs.tenantId, options.tenantId),
        eq(metaSyncJobs.adAccountId, account.value),
        inArray(metaSyncJobs.jobType, ["sync_historical_insights", "sync_manual"]),
        eq(metaSyncJobs.status, "completed"),
        lte(metaSyncJobs.dateStart, options.startDate),
        gte(metaSyncJobs.dateEnd, options.endDate),
      ),
    });
    if (completedCoverage) continue;

    const [job] = await db.insert(metaSyncJobs).values({
      tenantId: options.tenantId,
      adAccountId: account.value,
      jobType: "sync_historical_insights",
      jobSource: "dashboard_filter",
      dateStart: options.startDate,
      dateEnd: options.endDate,
      status: "pending",
      priority: 30,
      createdBy: options.userId,
      updatedAt: new Date(),
    }).returning();

    await runDashboardSyncJob(job.id);
  }

  clearDashboardCache();
}

metaRouter.get("/dashboard/sync-accounts", async (req, res, next) => {
  try {
    const user = req.user as User;
    const accounts = (await storage.getResourcesByTenant(user.tenantId)).filter(
      (resource) => resource.type === "account",
    );
    const resourceByAccount = new Map(accounts.map((account) => [account.value, account] as const));
    const syncRows = await db.query.dashboardSyncAccounts.findMany({
      where: eq(dashboardSyncAccounts.tenantId, user.tenantId),
    });

    return res.json({
      accounts: syncRows.flatMap((sync) => {
        const account = resourceByAccount.get(sync.adAccountId);
        if (!account) return [];
        return {
          id: sync.id,
          resourceId: account.id,
          tenantId: user.tenantId,
          adAccountId: sync.adAccountId,
          accountName: sync.accountName,
          syncEnabled: sync.syncEnabled,
          syncStatus: sync.syncStatus,
          syncFrequencyMinutes: sync.syncFrequencyMinutes,
          firstEnabledAt: sync.firstEnabledAt,
          lastEnabledAt: sync.lastEnabledAt,
          disabledAt: sync.disabledAt,
          lastManualSyncAt: sync.lastManualSyncAt,
          lastAutoSyncAt: sync.lastAutoSyncAt,
          lastSuccessSyncAt: sync.lastSuccessSyncAt,
          lastFailedSyncAt: sync.lastFailedSyncAt,
          lastErrorMessage: sync.lastErrorMessage,
          createdAt: sync.createdAt,
          updatedAt: sync.updatedAt,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/sync-accounts/import-meta-accounts", async (req, res, next) => {
  try {
    const user = req.user as User;
    const metaAccess = await getMetaAccess(user.tenantId);
    if (!metaAccess) {
      return res.status(400).json({
        message: "Integracao com Meta nao esta conectada, token expirado ou app secret ausente.",
      });
    }

    const [metaAccounts, existingResources, existingSyncRows] = await Promise.all([
      fetchMetaAdAccountsForDashboard({
        accessToken: metaAccess.accessToken,
        appSecretProof: metaAccess.appSecretProof,
      }),
      storage.getResourcesByTenant(user.tenantId),
      db.query.dashboardSyncAccounts.findMany({
        where: eq(dashboardSyncAccounts.tenantId, user.tenantId),
      }),
    ]);

    const existingResourceByValue = new Map(
      existingResources
        .filter((resource) => resource.type === "account")
        .map((resource) => [resource.value, resource] as const),
    );
    const existingSyncByValue = new Map(existingSyncRows.map((row) => [row.adAccountId, row] as const));

    const importedAccounts = [];
    const now = new Date();

    for (const account of metaAccounts) {
      const adAccountId =
        typeof account.id === "string" && account.id.trim().length > 0
          ? account.id.trim()
          : typeof account.account_id === "string" && account.account_id.trim().length > 0
            ? account.account_id.trim()
            : null;
      if (!adAccountId) continue;

      const accountName =
        typeof account.name === "string" && account.name.trim().length > 0
          ? account.name.trim()
          : adAccountId;
      const metadata = {
        accountStatus: typeof account.account_status === "number" ? account.account_status : null,
        source: "meta",
        syncedAt: now.toISOString(),
      };

      const existingResource = existingResourceByValue.get(adAccountId);
      const resource = existingResource
        ? await storage.updateResource(existingResource.id, { name: accountName, metadata }, user.tenantId)
        : await storage.createResource({
            tenantId: user.tenantId,
            type: "account",
            name: accountName,
            value: adAccountId,
            metadata,
          });

      const existingSync = existingSyncByValue.get(adAccountId);
      const [syncAccount] = await db
        .insert(dashboardSyncAccounts)
        .values({
          tenantId: user.tenantId,
          adAccountId,
          accountName,
          syncEnabled: existingSync?.syncEnabled ?? false,
          syncStatus: existingSync?.syncStatus ?? "never_synced",
          createdBy: user.id,
          updatedBy: user.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [dashboardSyncAccounts.tenantId, dashboardSyncAccounts.adAccountId],
          set: {
            accountName,
            updatedBy: user.id,
            updatedAt: now,
          },
        })
        .returning();

      importedAccounts.push({
        resourceId: resource?.id ?? existingResource?.id ?? null,
        adAccountId,
        accountName,
        syncAccount,
      });
    }

    return res.json({
      imported: importedAccounts.length,
      accounts: importedAccounts,
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/dashboard/sync-accounts/meta-accounts", async (req, res, next) => {
  try {
    const user = req.user as User;
    const metaAccess = await getMetaAccess(user.tenantId);
    if (!metaAccess) {
      return res.status(400).json({
        message: "Integracao com Meta nao esta conectada, token expirado ou app secret ausente.",
      });
    }

    const [metaAccounts, syncRows] = await Promise.all([
      fetchMetaAdAccountsForDashboard({
        accessToken: metaAccess.accessToken,
        appSecretProof: metaAccess.appSecretProof,
      }),
      db.query.dashboardSyncAccounts.findMany({
        where: eq(dashboardSyncAccounts.tenantId, user.tenantId),
      }),
    ]);
    const syncByAccountId = new Map(syncRows.map((row) => [row.adAccountId, row] as const));

    return res.json({
      accounts: metaAccounts.flatMap((account) => {
        const adAccountId =
          typeof account.id === "string" && account.id.trim().length > 0
            ? account.id.trim()
            : typeof account.account_id === "string" && account.account_id.trim().length > 0
              ? account.account_id.trim()
              : null;
        if (!adAccountId) return [];

        const accountName =
          typeof account.name === "string" && account.name.trim().length > 0
            ? account.name.trim()
            : adAccountId;
        const sync = syncByAccountId.get(adAccountId);

        return {
          adAccountId,
          accountName,
          accountStatus: typeof account.account_status === "number" ? account.account_status : null,
          isAdded: Boolean(sync),
          syncEnabled: sync?.syncEnabled ?? false,
          syncStatus: sync?.syncStatus ?? "never_synced",
          lastSuccessSyncAt: sync?.lastSuccessSyncAt ?? null,
          lastErrorMessage: sync?.lastErrorMessage ?? null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/sync-accounts/:adAccountId/add", async (req, res, next) => {
  try {
    const user = req.user as User;
    const adAccountId = req.params.adAccountId.trim();
    const body = dashboardAddSyncAccountBodySchema.parse(req.body ?? {});
    let accountName = body.accountName?.trim() || "";
    let accountStatus: number | null = null;
    let resource = await resolveTenantAdAccount(user, adAccountId);

    if (resource) {
      accountName = accountName || resource.name;
      const metadata = (resource.metadata ?? {}) as Record<string, unknown>;
      accountStatus = typeof metadata.accountStatus === "number" ? metadata.accountStatus : null;
    } else {
      const metaAccess = await getMetaAccess(user.tenantId);
      if (!metaAccess) {
        return res.status(400).json({
          message: "Integracao com Meta nao esta conectada, token expirado ou app secret ausente.",
        });
      }

      const metaAccounts = await fetchMetaAdAccountsForDashboard({
        accessToken: metaAccess.accessToken,
        appSecretProof: metaAccess.appSecretProof,
      });
      const metaAccount = metaAccounts.find((account) => {
        const id = typeof account.id === "string" ? account.id.trim() : "";
        const accountId = typeof account.account_id === "string" ? account.account_id.trim() : "";
        return id === adAccountId || accountId === adAccountId;
      });

      if (!metaAccount) {
        return res.status(404).json({ message: "Conta nao encontrada na integracao Meta." });
      }

      accountName =
        accountName ||
        (typeof metaAccount.name === "string" && metaAccount.name.trim().length > 0
          ? metaAccount.name.trim()
          : adAccountId);
      accountStatus = typeof metaAccount.account_status === "number" ? metaAccount.account_status : null;
      resource = await upsertTenantMetaAccountResource({
        tenantId: user.tenantId,
        adAccountId,
        accountName,
        accountStatus,
      });
    }

    accountName = accountName || adAccountId;

    const now = new Date();
    const [syncAccount] = await db
      .insert(dashboardSyncAccounts)
      .values({
        tenantId: user.tenantId,
        adAccountId,
        accountName,
        syncEnabled: false,
        syncStatus: "never_synced",
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dashboardSyncAccounts.tenantId, dashboardSyncAccounts.adAccountId],
        set: {
          accountName,
          updatedBy: user.id,
          updatedAt: now,
        },
      })
      .returning();

    return res.json({ resource, account: syncAccount, initialJob: null });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/sync-accounts/:adAccountId/enable", async (req, res, next) => {
  try {
    const user = req.user as User;
    const adAccountId = req.params.adAccountId.trim();
    const account = await resolveTenantAdAccount(user, adAccountId);
    if (!account) {
      return res.status(404).json({ message: "Conta nao encontrada ou nao pertence ao tenant atual." });
    }

    const now = new Date();
    const existing = await db.query.dashboardSyncAccounts.findFirst({
      where: and(
        eq(dashboardSyncAccounts.tenantId, user.tenantId),
        eq(dashboardSyncAccounts.adAccountId, adAccountId),
      ),
    });

    const [syncAccount] = await db
      .insert(dashboardSyncAccounts)
      .values({
        tenantId: user.tenantId,
        adAccountId,
        accountName: account.name,
        syncEnabled: true,
        syncStatus: "active",
        firstEnabledAt: now,
        lastEnabledAt: now,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dashboardSyncAccounts.tenantId, dashboardSyncAccounts.adAccountId],
        set: {
          accountName: account.name,
          syncEnabled: true,
          syncStatus: "active",
          firstEnabledAt: existing?.firstEnabledAt ?? now,
          lastEnabledAt: now,
          disabledAt: null,
          updatedBy: user.id,
          updatedAt: now,
        },
      })
      .returning();

    let initialJob = null;
    if (!existing?.lastSuccessSyncAt) {
      const initialRange = buildInitialDashboardSyncRange();
      initialJob = await createManualDashboardSyncJob({
        tenantId: user.tenantId,
        adAccountId,
        userId: user.id,
        dateStart: initialRange.dateStart,
        dateEnd: initialRange.dateEnd,
      });
      await db
        .update(dashboardSyncAccounts)
        .set({
          syncStatus: "syncing",
          lastErrorMessage: null,
          updatedBy: user.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(dashboardSyncAccounts.tenantId, user.tenantId),
            eq(dashboardSyncAccounts.adAccountId, adAccountId),
          ),
        );
      void runDashboardSyncJob(initialJob.id).catch((error) => {
        console.error("Falha ao executar job inicial do dashboard", {
          jobId: initialJob?.id,
          tenantId: user.tenantId,
          adAccountId,
          error,
        });
      });
    }

    return res.json({
      account: initialJob ? { ...syncAccount, syncStatus: "syncing", lastErrorMessage: null } : syncAccount,
      initialJob,
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/sync-accounts/:adAccountId/disable", async (req, res, next) => {
  try {
    const user = req.user as User;
    const adAccountId = req.params.adAccountId.trim();
    const account = await resolveTenantAdAccount(user, adAccountId);
    if (!account) {
      return res.status(404).json({ message: "Conta nao encontrada ou nao pertence ao tenant atual." });
    }

    const now = new Date();
    const [syncAccount] = await db
      .insert(dashboardSyncAccounts)
      .values({
        tenantId: user.tenantId,
        adAccountId,
        accountName: account.name,
        syncEnabled: false,
        syncStatus: "paused",
        disabledAt: now,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dashboardSyncAccounts.tenantId, dashboardSyncAccounts.adAccountId],
        set: {
          accountName: account.name,
          syncEnabled: false,
          syncStatus: "paused",
          disabledAt: now,
          updatedBy: user.id,
          updatedAt: now,
        },
      })
      .returning();

    return res.json({ account: syncAccount });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/sync-accounts/:adAccountId/sync-now", async (req, res, next) => {
  try {
    const user = req.user as User;
    const adAccountId = req.params.adAccountId.trim();
    const body = dashboardSyncNowBodySchema.parse(req.body ?? {});
    if (body.dateStart && body.dateEnd) {
      const startDate = parseISO(body.dateStart);
      const endDate = parseISO(body.dateEnd);
      if (!isValid(startDate) || !isValid(endDate)) {
        return res.status(400).json({ message: "Parametros de data invalidos." });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "dateStart deve ser menor ou igual a dateEnd." });
      }
    }

    const account = await resolveTenantAdAccount(user, adAccountId);
    if (!account) {
      return res.status(404).json({ message: "Conta nao encontrada ou nao pertence ao tenant atual." });
    }

    const now = new Date();
    await db
      .insert(dashboardSyncAccounts)
      .values({
        tenantId: user.tenantId,
        adAccountId,
        accountName: account.name,
        syncEnabled: false,
        syncStatus: "never_synced",
        lastManualSyncAt: now,
        createdBy: user.id,
        updatedBy: user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dashboardSyncAccounts.tenantId, dashboardSyncAccounts.adAccountId],
        set: {
          accountName: account.name,
          lastManualSyncAt: now,
          updatedBy: user.id,
          updatedAt: now,
        },
      });

    const job = await createManualDashboardSyncJob({
      tenantId: user.tenantId,
      adAccountId,
      userId: user.id,
      dateStart: body.dateStart,
      dateEnd: body.dateEnd,
    });
    const result = await runDashboardSyncJob(job.id);
    clearDashboardCache();

    return res.json({ job: { ...job, status: "completed" }, result });
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/dashboard/sync-accounts/:adAccountId/status", async (req, res, next) => {
  try {
    const user = req.user as User;
    const adAccountId = req.params.adAccountId.trim();
    const account = await resolveTenantAdAccount(user, adAccountId);
    if (!account) {
      return res.status(404).json({ message: "Conta nao encontrada ou nao pertence ao tenant atual." });
    }

    const syncAccount = await db.query.dashboardSyncAccounts.findFirst({
      where: and(
        eq(dashboardSyncAccounts.tenantId, user.tenantId),
        eq(dashboardSyncAccounts.adAccountId, adAccountId),
      ),
    });
    const recentJobs = await db.query.metaSyncJobs.findMany({
      where: and(
        eq(metaSyncJobs.tenantId, user.tenantId),
        eq(metaSyncJobs.adAccountId, adAccountId),
      ),
      orderBy: [desc(metaSyncJobs.createdAt)],
      limit: 5,
    });

    return res.json({
      account: syncAccount ?? {
        adAccountId,
        accountName: account.name,
        syncEnabled: false,
        syncStatus: "never_synced",
      },
      jobs: recentJobs,
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/share", async (req, res, next) => {
  try {
    const user = req.user as User;
    const body = dashboardShareBodySchema.parse(req.body);
    const accountResources = (await storage.getResourcesByTenant(user.tenantId)).filter(
      (resource) => resource.type === "account",
    );
    const tenantAccountIds = new Set(accountResources.map((resource) => resource.id));
    const invalidAccountIds = body.accountIds.filter((accountId) => !tenantAccountIds.has(accountId));
    if (invalidAccountIds.length > 0) {
      return res.status(400).json({
        message: "Uma ou mais contas nao pertencem ao tenant atual.",
      });
    }

    const expiresAt = new Date(Date.now() + (body.expiresInHours ?? 72) * 60 * 60 * 1000);
    const publicId = crypto.randomBytes(24).toString("base64url");
    const passwordHash = await hashPassword(body.password);

    const [shareLink] = await db.insert(dashboardShareLinks).values({
      tenantId: user.tenantId,
      publicId,
      passwordHash,
      startDate: body.startDate,
      endDate: body.endDate,
      accountIds: body.accountIds,
      campaignId: body.campaignId ?? null,
      objective: body.objective ?? null,
      status: body.status ?? null,
      expiresAt,
      createdBy: user.id,
      updatedAt: new Date(),
    }).returning();

    return res.json({
      token: shareLink.publicId,
      path: `/shared/dashboard?token=${encodeURIComponent(shareLink.publicId)}`,
      expiresAt: shareLink.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/dashboard/goals", async (req, res, next) => {
  try {
    const user = req.user as User;
    const query = dashboardMetricsQuerySchema.parse(req.query);

    if (!query.startDate || !query.endDate) {
      return res.status(400).json({ message: "Forneca startDate e endDate para carregar metas." });
    }

    const startDate = parseISO(query.startDate);
    const endDate = parseISO(query.endDate);
    if (!isValid(startDate) || !isValid(endDate) || startDate > endDate) {
      return res.status(400).json({ message: "Periodo de metas invalido." });
    }
    const goalRange = resolveGoalPeriodRange(query.startDate, query.endDate);
    if (!goalRange) {
      return res.status(400).json({ message: "Periodo de metas invalido." });
    }

    const accountIds = parseNumberQueryParam(req.query.accountId) ?? [];
    const allResources = await storage.getResourcesByTenant(user.tenantId);
    const accountResources = allResources.filter((resource) => resource.type === "account");
    const selectedAccounts =
      accountIds.length > 0
        ? accountResources.filter((resource) => accountIds.includes(resource.id))
        : [];

    const goals = await storage.getDashboardGoalsByPeriod(
      user.tenantId,
      goalRange.startDate,
      goalRange.endDate,
      selectedAccounts.map((account) => account.id),
    );
    const goalByAccountId = new Map(goals.map((goal) => [goal.accountId, goal] as const));

    const rows = selectedAccounts.map((account) => ({
      accountId: account.id,
      accountName: account.name,
      accountValue: account.value,
      goal: (() => {
        const goal = goalByAccountId.get(account.id);
        if (!goal) return null;
        return {
          ...goal,
          targetSpend: Number(goal.targetSpend),
        };
      })(),
    }));

    const goalsCount = rows.filter((row) => row.goal).length;
    const missingCount = Math.max(rows.length - goalsCount, 0);
    const status =
      goalsCount === 0 ? "empty" : missingCount === 0 ? "complete" : "partial";

    return res.json({
      startDate: goalRange.startDate,
      endDate: goalRange.endDate,
      accounts: rows,
      summary: {
        totalAccounts: rows.length,
        goalsCount,
        missingCount,
        status,
      },
    });
  } catch (err) {
    next(err);
  }
});

metaRouter.post("/dashboard/goals", async (req, res, next) => {
  try {
    const user = req.user as User;
    const body = dashboardGoalUpsertBodySchema.parse(req.body);

    const startDate = parseISO(body.startDate);
    const endDate = parseISO(body.endDate);
    if (!isValid(startDate) || !isValid(endDate) || startDate > endDate) {
      return res.status(400).json({ message: "Periodo de metas invalido." });
    }
    const goalRange = resolveGoalPeriodRange(body.startDate, body.endDate);
    if (!goalRange) {
      return res.status(400).json({ message: "Periodo de metas invalido." });
    }

    const allResources = await storage.getResourcesByTenant(user.tenantId);
    const accountResources = allResources.filter((resource) => resource.type === "account");
    const validAccountIds = new Set(accountResources.map((resource) => resource.id));

    const invalidGoal = body.goals.find((goal) => !validAccountIds.has(goal.accountId));
    if (invalidGoal) {
      return res.status(400).json({
        message: `Conta invalida para metas: ${invalidGoal.accountId}.`,
      });
    }

    const savedGoals = await storage.upsertDashboardGoals(
      user.tenantId,
      body.goals.map((goal) => ({
        tenantId: user.tenantId,
        accountId: goal.accountId,
        accountName: goal.accountName,
        startDate: goalRange.startDate,
        endDate: goalRange.endDate,
        targetSpend: goal.targetSpend.toFixed(2),
        targetLeads: goal.targetLeads,
      })),
    );

    clearDashboardCache();

    return res.json({
      message: "Metas salvas com sucesso.",
      goals: savedGoals.map((goal) => ({
        ...goal,
        targetSpend: Number(goal.targetSpend),
      })),
    });
  } catch (err) {
    next(err);
  }
});

publicMetaRouter.get("/dashboard/share/metadata", async (req, res, next) => {
  try {
    const token = parseQueryParam(req.query.token);
    const { claims, selectedAccounts } = await resolveDashboardShareContext(req, token);

    return res.json({
      expiresAt: claims.expiresAt,
      dateRange: {
        start: claims.startDate,
        end: claims.endDate,
      },
      filters: {
        campaignId: claims.campaignId ?? null,
        objective: claims.objective ?? null,
        status: claims.status ?? null,
      },
      accounts: selectedAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        value: account.value,
      })),
    });
  } catch (err) {
    next(err);
  }
});

publicMetaRouter.get("/dashboard/share/status", async (req, res, next) => {
  try {
    const token = parseQueryParam(req.query.token);
    const link = await getDashboardShareLink(token);
    if (!link) {
      try {
        verifyDashboardShareToken(token);
        return res.json({ exists: true, requiresPassword: false, unlocked: true });
      } catch {
        return res.status(404).json({ message: "Link compartilhado invalido ou expirado." });
      }
    }
    if (new Date(link.expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ message: "Link compartilhado invalido ou expirado." });
    }
    return res.json({
      exists: true,
      requiresPassword: true,
      unlocked: Boolean(req.session.dashboardShareUnlocks?.[token]),
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

publicMetaRouter.post("/dashboard/share/unlock", publicDashboardShareUnlockRateLimit, async (req, res, next) => {
  try {
    const token = parseQueryParam(req.query.token);
    const body = dashboardShareUnlockBodySchema.parse(req.body ?? {});
    const link = await getDashboardShareLink(token);
    if (!link || new Date(link.expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ message: "Link compartilhado invalido ou expirado." });
    }

    const valid = await verifyPassword(body.password, link.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Senha invalida." });
    }

    req.session.dashboardShareUnlocks = {
      ...(req.session.dashboardShareUnlocks ?? {}),
      [token]: true,
    };
    req.session.save((saveError) => {
      if (saveError) {
        next(saveError);
        return;
      }
      res.json({ unlocked: true });
    });
  } catch (err) {
    next(err);
  }
});

publicMetaRouter.get("/dashboard/metrics", async (req, res, next) => {
  try {
    const token = parseQueryParam(req.query.token);
    const { claims, selectedAccounts, campaignFilterSet, objectiveFilterSet, statusFilterSet } =
      await resolveDashboardShareContext(req, token);

    const requestedRange = resolvePublicDashboardDateRange(claims, req.query);
    const startDate = requestedRange.startDate;
    const endDate = requestedRange.endDate;
    const { previousStart, previousEnd } = buildPreviousMonthRange(startDate, endDate);
    const goalRange = resolveGoalPeriodRange(requestedRange.start, requestedRange.end);
    if (!goalRange) {
      return res.status(400).json({ message: "Periodo de metas invalido." });
    }
    if (!(await hasCachedDashboardData({
      tenantId: claims.tenantId,
      accounts: selectedAccounts,
      startDate: requestedRange.start,
      endDate: requestedRange.end,
    }))) {
      return res.status(404).json({
        message: "Dados indisponiveis para este periodo. Solicite ao administrador o carregamento desses dados.",
      });
    }

    const payload = await getOrCreateDashboardCache(
      buildDashboardCacheKey("public-dashboard-metrics", {
        token,
        startDate: requestedRange.start,
        endDate: requestedRange.end,
      }),
      DASHBOARD_METRICS_CACHE_TTL_MS,
      async () => {
        const metrics = await fetchDashboardMetricsFromCache({
          tenantId: claims.tenantId,
          accounts: selectedAccounts,
          campaignFilterSet,
          objectiveFilterSet,
          statusFilterSet,
          startDate: requestedRange.start,
          endDate: requestedRange.end,
          previousStartDate: previousStart,
          previousEndDate: previousEnd,
        });
        const syncSummary = await getDashboardSyncSummary(
          claims.tenantId,
          selectedAccounts.map((account) => account.value),
        );
        const goals = await storage.getDashboardGoalsByPeriod(
          claims.tenantId,
          goalRange.startDate,
          goalRange.endDate,
          selectedAccounts.map((account) => account.id),
        );
        const goalByAccountId = new Map(goals.map((goal) => [goal.accountId, goal] as const));
        let targetSpendTotal = 0;
        let targetLeadsTotal = 0;

        const accountsWithGoals = metrics.accounts.map((account) => {
          const goal = goalByAccountId.get(account.id);
          if (!goal) {
            return {
              ...account,
              goal: null,
            };
          }

          const targetSpend = Number(goal.targetSpend);

          targetSpendTotal += targetSpend;
          targetLeadsTotal += goal.targetLeads;

          return {
            ...account,
            goal: buildGoalMetrics({
              targetSpend,
              targetLeads: goal.targetLeads,
              actualSpend: account.metrics.spend,
              actualLeads: account.metrics.leads,
              periodDays: goalRange.periodDays,
            }),
          };
        });

        const response = {
          dateRange: {
            start: requestedRange.start,
            end: requestedRange.end,
            previousStart,
            previousEnd,
          },
          totals: metrics.totals,
          previousTotals: metrics.previousTotals,
          accounts: accountsWithGoals,
          goalTotals:
            targetSpendTotal > 0 || targetLeadsTotal > 0
              ? buildGoalMetrics({
                  targetSpend: targetSpendTotal,
                  targetLeads: targetLeadsTotal,
                  actualSpend: metrics.totals.spend,
                  actualLeads: metrics.totals.leads,
                  periodDays: goalRange.periodDays,
                })
              : null,
          timeline: metrics.timeline,
          ...syncSummary,
        };

        return {
          ...response,
          data: {
            totals: response.totals,
            previousTotals: response.previousTotals,
            goalTotals: response.goalTotals,
            accounts: response.accounts,
            timeline: response.timeline,
          },
        };
      },
    );

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

publicMetaRouter.get("/dashboard/top-creatives", async (req, res, next) => {
  try {
    const token = parseQueryParam(req.query.token);
    const { claims, selectedAccounts, campaignFilterSet, objectiveFilterSet, statusFilterSet } =
      await resolveDashboardShareContext(req, token);
    const requestedRange = resolvePublicDashboardDateRange(claims, req.query);
    if (!(await hasCachedDashboardData({
      tenantId: claims.tenantId,
      accounts: selectedAccounts,
      startDate: requestedRange.start,
      endDate: requestedRange.end,
    }))) {
      return res.status(404).json({
        message: "Dados indisponiveis para este periodo. Solicite ao administrador o carregamento desses dados.",
      });
    }
    const payload = await getOrCreateDashboardCache(
      buildDashboardCacheKey("public-dashboard-top-creatives", {
        token,
        startDate: requestedRange.start,
        endDate: requestedRange.end,
      }),
      DASHBOARD_TOP_CREATIVES_CACHE_TTL_MS,
      async () => ({
        accounts: await fetchDashboardTopCreativesFromCache({
          tenantId: claims.tenantId,
          accounts: selectedAccounts,
          campaignFilterSet,
          objectiveFilterSet,
          statusFilterSet,
          startDate: requestedRange.start,
          endDate: requestedRange.end,
        }),
      }),
    );

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/dashboard/metrics", async (req, res, next) => {
  try {
    const user = req.user as User;
    const query = dashboardMetricsQuerySchema.parse(req.query);

    if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
      return res.status(400).json({ message: "Forneca startDate e endDate juntos ou nenhum deles." });
    }

    const accountIds = parseNumberQueryParam(req.query.accountId);
    const campaignIdParams = parseStringQueryParam(req.query.campaignId);
    const campaignNameSearch = parseQueryParam(req.query.campaignSearch).trim();
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
        data: null,
        dateRange: {
          start: query.startDate ?? null,
          end: query.endDate ?? null,
          previousStart: null,
          previousEnd: null,
        },
        totals: emptyTotals(),
        previousTotals: emptyTotals(),
        goalTotals: null,
        accounts: [],
        timeline: [],
        last_synced_at: null,
        sync_status: "never_synced",
        is_updating: false,
        last_error_message: null,
      });
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

      const previousRange = buildPreviousMonthRange(startDate, endDate);
      previousStart = previousRange.previousStart;
      previousEnd = previousRange.previousEnd;
    }

    const goalRange =
      query.startDate && query.endDate
        ? resolveGoalPeriodRange(query.startDate, query.endDate)
        : null;
    if (query.startDate && query.endDate && !goalRange) {
      return res.status(400).json({ message: "Periodo de metas invalido." });
    }

    await ensureHistoricalDashboardRangeForAccounts({
      tenantId: user.tenantId,
      userId: user.id,
      accounts: selectedAccounts,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const cacheKey = buildDashboardCacheKey("dashboard-metrics", {
      tenantId: user.tenantId,
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      accountIds: sortNumbers(selectedAccounts.map((account) => account.id)),
      campaignIds: sortStrings(campaignFilterSet),
      campaignNameSearch: campaignNameSearch || null,
      objectives: sortStrings(objectiveFilterSet),
      status: sortStrings(statusFilterSet),
    });

    const payload = await getOrCreateDashboardCache(
      cacheKey,
      DASHBOARD_METRICS_CACHE_TTL_MS,
      async () => {
        const metrics = await fetchDashboardMetricsFromCache({
          tenantId: user.tenantId,
          accounts: selectedAccounts,
          campaignFilterSet,
          campaignNameSearch: campaignNameSearch || undefined,
          objectiveFilterSet,
          statusFilterSet,
          startDate: query.startDate ?? undefined,
          endDate: query.endDate ?? undefined,
          previousStartDate: previousStart ?? undefined,
          previousEndDate: previousEnd ?? undefined,
        });
        const syncSummary = await getDashboardSyncSummary(
          user.tenantId,
          selectedAccounts.map((account) => account.value),
        );
        const goals =
          query.startDate && query.endDate
            ? await storage.getDashboardGoalsByPeriod(
                user.tenantId,
                goalRange!.startDate,
                goalRange!.endDate,
                selectedAccounts.map((account) => account.id),
              )
            : [];
        const goalByAccountId = new Map(goals.map((goal) => [goal.accountId, goal] as const));
        let targetSpendTotal = 0;
        let targetLeadsTotal = 0;

        const accountsWithGoals = metrics.accounts.map((account) => {
          const goal = goalByAccountId.get(account.id);
          if (!goal) {
            return {
              ...account,
              goal: null,
            };
          }

          const targetSpend = Number(goal.targetSpend);

          targetSpendTotal += targetSpend;
          targetLeadsTotal += goal.targetLeads;

          return {
            ...account,
            goal: buildGoalMetrics({
              targetSpend,
              targetLeads: goal.targetLeads,
              actualSpend: account.metrics.spend,
              actualLeads: account.metrics.leads,
              periodDays: goalRange?.periodDays ?? 0,
            }),
          };
        });

        const response = {
          dateRange: {
            start: query.startDate ?? null,
            end: query.endDate ?? null,
            previousStart,
            previousEnd,
          },
          totals: metrics.totals,
          previousTotals: metrics.previousTotals,
          goalTotals:
            targetSpendTotal > 0 || targetLeadsTotal > 0
              ? buildGoalMetrics({
                  targetSpend: targetSpendTotal,
                  targetLeads: targetLeadsTotal,
                  actualSpend: metrics.totals.spend,
                  actualLeads: metrics.totals.leads,
                  periodDays: goalRange?.periodDays ?? 0,
                })
              : null,
          accounts: accountsWithGoals,
          timeline: metrics.timeline,
          ...syncSummary,
        };

        return {
          ...response,
          data: {
            totals: response.totals,
            previousTotals: response.previousTotals,
            goalTotals: response.goalTotals,
            accounts: response.accounts,
            timeline: response.timeline,
          },
        };
      },
    );

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

metaRouter.get("/dashboard/top-creatives", async (req, res, next) => {
  try {
    const user = req.user as User;
    const query = dashboardMetricsQuerySchema.parse(req.query);

    if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
      return res.status(400).json({ message: "Forneca startDate e endDate juntos ou nenhum deles." });
    }

    const accountIds = parseNumberQueryParam(req.query.accountId);
    const campaignIdParams = parseStringQueryParam(req.query.campaignId);
    const campaignNameSearch = parseQueryParam(req.query.campaignSearch).trim();
    const objectivesParam = parseStringQueryParam(req.query.objective);
    const statusParam = parseStringQueryParam(req.query.status);

    const allResources = await storage.getResourcesByTenant(user.tenantId);
    const accountResources = allResources.filter((resource) => resource.type === "account");

    const selectedAccounts =
      accountIds && accountIds.length > 0
        ? accountResources.filter((resource) => accountIds.includes(resource.id))
        : [];

    if (selectedAccounts.length === 0) {
      return res.json({ accounts: [] });
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

    const cacheKey = buildDashboardCacheKey("dashboard-top-creatives", {
      tenantId: user.tenantId,
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
      accountIds: sortNumbers(selectedAccounts.map((account) => account.id)),
      campaignIds: sortStrings(campaignFilterSet),
      campaignNameSearch: campaignNameSearch || null,
      objectives: sortStrings(objectiveFilterSet),
      status: sortStrings(statusFilterSet),
    });

    const payload = await getOrCreateDashboardCache(
      cacheKey,
      DASHBOARD_TOP_CREATIVES_CACHE_TTL_MS,
      async () => ({
        accounts: await fetchDashboardTopCreativesFromCache({
          tenantId: user.tenantId,
          accounts: selectedAccounts,
          campaignFilterSet,
          campaignNameSearch: campaignNameSearch || undefined,
          objectiveFilterSet,
          statusFilterSet,
          startDate: query.startDate ?? undefined,
          endDate: query.endDate ?? undefined,
        }),
      }),
    );

    return res.json(payload);
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

    const metaAccess = await getMetaAccess(user.tenantId);
    if (!metaAccess) {
      return res.status(400).json({
        message:
          "Integracao com Meta nao esta conectada, token expirado ou app secret ausente.",
      });
    }

    const settings = await storage.getAppSettings();
    const metaAppSecret = resolveMetaAppSecret(settings);
    if (!metaAppSecret) {
      return res.status(500).json({ message: "Meta app secret nao configurado." });
    }

    const client = new MetaGraphClient(metaAccess.accessToken, metaAppSecret);

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
      return res.status(400).json({
        message: "Integracao com Meta nao configurada, token expirado ou app secret ausente.",
      });
    }

    const params = new URLSearchParams({
      type: "adgeolocation",
      q: query,
      country_code: "BR",
      location_types: JSON.stringify(["city"]),
      access_token: access.accessToken,
    });

    params.set("appsecret_proof", access.appSecretProof);

    const response = await fetch(`https://graph.facebook.com/v24.0/search?${params.toString()}`);
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
      return res.status(400).json({
        message: "Integracao com Meta nao configurada, token expirado ou app secret ausente.",
      });
    }

    const params = new URLSearchParams({
      type: "adinterest",
      q: query,
      limit: "10",
      locale: "pt_BR",
      access_token: access.accessToken,
    });

    params.set("appsecret_proof", access.appSecretProof);

    const response = await fetch(`https://graph.facebook.com/v24.0/search?${params.toString()}`);
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

metaRouter.get("/meta/pages/:pageId/leadforms", async (req, res) => {
  try {
    const user = req.user as User;
    const rawPageId = typeof req.params.pageId === "string" ? req.params.pageId.trim() : "";
    const debugParam = parseQueryParam(req.query.debug).toLowerCase();
    const refreshParam = parseQueryParam(req.query.refresh).toLowerCase();
    const forceRefresh = refreshParam === "1" || refreshParam === "true" || refreshParam === "yes";
    const debugRequested = debugParam === "1" || debugParam === "true" || debugParam === "yes";
    const debugEnabled = debugRequested && isSystemAdminRole(user.role);
    const debugContext: Record<string, unknown> | null = debugRequested
      ? { requested: true, enabled: debugEnabled }
      : null;

    if (debugRequested && !debugEnabled && debugContext) {
      debugContext.reason = "requires_system_admin";
    }

    const attachDebug = (body: Record<string, unknown>) => {
      if (!debugRequested || !debugContext) {
        return body;
      }
      return { ...body, debug: debugContext };
    };

    if (rawPageId.length === 0) {
      return res.status(400).json(attachDebug({ message: "pageId obrigatorio" }));
    }

    const pageResources = await storage.getResourcesByType(user.tenantId, "page");
    const pageResource = pageResources.find((resource) => resource.value === rawPageId);
    if (!pageResource) {
      return res.status(404).json(
        attachDebug({
          message: "Pagina nao encontrada ou nao pertence ao tenant atual.",
        }),
      );
    }

    if (!forceRefresh) {
      const memoryForms = getFreshMemoryLeadforms(user.tenantId, rawPageId);
      if (memoryForms) {
        setNoCacheHeaders(res);
        res.setHeader("X-Autoads-Leadforms-Source", "memory");
        res.removeHeader("ETag");
        return res.json(memoryForms);
      }

      const stored = await getStoredLeadformsByPage(user.tenantId, rawPageId);
      if (stored.fresh && stored.expiresAt) {
        setMemoryLeadforms(user.tenantId, rawPageId, stored.forms, stored.expiresAt);
        setNoCacheHeaders(res);
        res.setHeader("X-Autoads-Leadforms-Source", "db");
        res.removeHeader("ETag");
        return res.json(stored.forms);
      }
    }

    const userAccess = await getMetaAccess(user.tenantId);
    if (!userAccess || typeof userAccess.accessToken !== "string" || userAccess.accessToken.trim().length === 0) {
      console.error("Meta access invalido para tenant ao carregar lead forms", user.tenantId, {
        hasAccess: !!userAccess,
        hasToken: !!userAccess?.accessToken,
      });
      if (await respondWithStoredLeadformsIfAny(res, user.tenantId, rawPageId, "db_stale")) {
        return;
      }
      return res.status(400).json(
        attachDebug({
          message:
            "Integracao com Meta nao configurada corretamente (token expirado, ausente ou invalido).",
        }),
      );
    }

    const userAccessToken = userAccess.accessToken.trim();
    const userAppSecretProof = userAccess.appSecretProof.trim();
    const settings = await storage.getAppSettings();
    const metaAppId = resolveMetaAppId(settings);
    const metaAppSecret = resolveMetaAppSecret(settings);
    if (!metaAppSecret) {
      return res.status(500).json(
        attachDebug({ message: "Meta app secret nao configurado." }),
      );
    }

    if (debugEnabled && debugContext) {
      debugContext.metaAppIdConfigured = Boolean(metaAppId);
      debugContext.metaAppSecretConfigured = Boolean(metaAppSecret);

      if (metaAppId && metaAppSecret) {
        debugContext.userToken = await fetchMetaTokenDebug({
          token: userAccessToken,
          appId: metaAppId,
          appSecret: metaAppSecret,
        });
      } else {
        debugContext.userToken = {
          ok: false,
          status: 0,
          body: { message: "Meta appId/appSecret missing for debug_token" },
        };
      }
    }

    const pageDetailsUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(rawPageId)}`);
    pageDetailsUrl.searchParams.set("fields", "id,access_token");
    pageDetailsUrl.searchParams.set("access_token", userAccessToken);
    pageDetailsUrl.searchParams.set("appsecret_proof", userAppSecretProof);

    let pageDetailsResponse: globalThis.Response;
    try {
      pageDetailsResponse = await fetchWithTimeoutRetry(pageDetailsUrl, undefined, {
        timeoutMs: 10000,
        retryCount: 1,
        retryDelayMs: 300,
      });
    } catch (networkError) {
      console.error("Erro de rede ao obter Page Access Token (leadforms):", {
        error: networkError,
        tenantId: user.tenantId,
        pageId: rawPageId,
      });
      return res.status(502).json(
        attachDebug({
          message: "Falha de comunicacao com a Meta ao obter token da pagina. Tente novamente.",
        }),
      );
    }

    const pageDetailsText = await pageDetailsResponse.text();
    let pageDetailsBody: any = {};
    try {
      pageDetailsBody = pageDetailsText.length > 0 ? JSON.parse(pageDetailsText) : {};
    } catch (error) {
      console.error("Parse error ao obter dados da pagina Meta (leadforms):", {
        error,
        bodyTextPreview: pageDetailsText.slice(0, 200),
      });
      return res.status(500).json(
        attachDebug({
          message: "Falha ao interpretar resposta da Meta ao obter dados da pagina.",
        }),
      );
    }

    if (!pageDetailsResponse.ok || pageDetailsBody?.error) {
      const graphCode = typeof pageDetailsBody?.error?.code === "number" ? pageDetailsBody.error.code : undefined;
      const errorSubcode =
        typeof pageDetailsBody?.error?.error_subcode === "number"
          ? pageDetailsBody.error.error_subcode
          : undefined;
      const rawMessage =
        typeof pageDetailsBody?.error?.message === "string" ? pageDetailsBody.error.message : undefined;

      console.error("1Falha ao obter Page Access Token (leadforms):", {
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

      if (await respondWithStoredLeadformsIfAny(res, user.tenantId, rawPageId, "db_stale")) {
        return;
      }

      const statusCode =
        pageDetailsResponse.status && pageDetailsResponse.status >= 400 ? pageDetailsResponse.status : 502;

      return res.status(statusCode).json(attachDebug({ message: clientMessage, graphCode, errorSubcode }));
    }

    const pageAccessTokenRaw = pageDetailsBody?.access_token;
    if (typeof pageAccessTokenRaw !== "string" || pageAccessTokenRaw.trim().length === 0) {
      console.error("Nao foi possivel obter access_token da pagina a partir do user token (leadforms).", {
        tenantId: user.tenantId,
        pageId: rawPageId,
        body: pageDetailsBody,
      });
      if (await respondWithStoredLeadformsIfAny(res, user.tenantId, rawPageId, "db_stale")) {
        return;
      }
      return res.status(400).json(
        attachDebug({
          message:
            "Nao foi possivel obter o token da pagina. Verifique se o utilizador conectado tem permissao de administrador nesta pagina e se a app possui pages_read_engagement.",
        }),
      );
    }

    const pageAccessToken = pageAccessTokenRaw.trim();

    if (debugEnabled && debugContext && metaAppId && metaAppSecret) {
      debugContext.pageToken = await fetchMetaTokenDebug({
        token: pageAccessToken,
        appId: metaAppId,
        appSecret: metaAppSecret,
      });
    }

    const pageAppSecretProof = generateAppSecretProof(
      pageAccessToken,
      metaAppSecret,
    );

    const leadFormsUrl = new URL(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(rawPageId)}/leadgen_forms`,
    );
    leadFormsUrl.searchParams.set("fields", "id,name,status,locale,created_time");
    leadFormsUrl.searchParams.set("access_token", pageAccessToken);
    leadFormsUrl.searchParams.set("appsecret_proof", pageAppSecretProof);

    let leadFormsResponse: globalThis.Response;
    try {
      leadFormsResponse = await fetchWithTimeoutRetry(leadFormsUrl, undefined, {
        timeoutMs: 10000,
        retryCount: 1,
        retryDelayMs: 300,
      });
    } catch (networkError) {
      console.error("Erro de rede ao chamar Meta leadgen_forms:", {
        error: networkError,
        tenantId: user.tenantId,
        pageId: rawPageId,
      });
      return res.status(502).json(
        attachDebug({
          message: "Falha de comunicacao com a Meta ao carregar formularios de lead.",
        }),
      );
    }

    const leadFormsText = await leadFormsResponse.text();
    let leadFormsBody: any = {};
    try {
      leadFormsBody = leadFormsText.length > 0 ? JSON.parse(leadFormsText) : {};
    } catch (error) {
      console.error("Meta leadgen_forms parse error:", {
        error,
        bodyTextPreview: leadFormsText.slice(0, 200),
      });
      return res.status(500).json(attachDebug({ message: "Falha ao interpretar resposta da Meta" }));
    }

    if (!leadFormsResponse.ok || leadFormsBody?.error) {
      const graphCode = typeof leadFormsBody?.error?.code === "number" ? leadFormsBody.error.code : undefined;
      const errorSubcode =
        typeof leadFormsBody?.error?.error_subcode === "number"
          ? leadFormsBody.error.error_subcode
          : undefined;
      const errorType = typeof leadFormsBody?.error?.type === "string" ? leadFormsBody.error.type : undefined;
      const rawMessage =
        typeof leadFormsBody?.error?.message === "string" ? leadFormsBody.error.message : undefined;

      console.error("Meta leadgen_forms failed:", {
        status: leadFormsResponse.status,
        graphCode,
        errorSubcode,
        errorType,
        rawMessage,
        body: leadFormsBody,
      });

      let clientMessage = rawMessage || "Falha ao carregar formularios de lead da pagina na Meta.";

      if (graphCode === 190) {
        clientMessage =
          "Token de acesso da pagina expirado ou invalido. Reconfigure a integracao ou renove as permissoes para esta pagina.";
      }
      if (graphCode === 200) {
        clientMessage =
          "Permissoes insuficientes para ler os formularios desta pagina na Meta. Verifique as permissoes da app e do token da pagina.";
      }

      if (await respondWithStoredLeadformsIfAny(res, user.tenantId, rawPageId, "db_stale")) {
        return;
      }

      const statusCode =
        leadFormsResponse.status && leadFormsResponse.status >= 400 ? leadFormsResponse.status : 502;

      return res.status(statusCode).json(attachDebug({ message: clientMessage, graphCode, errorSubcode }));
    }

    const forms =
      Array.isArray(leadFormsBody?.data) && leadFormsBody.data.length > 0
        ? leadFormsBody.data
            .map((item: any) => {
              const id = typeof item?.id === "string" ? item.id : "";
              if (!id) return null;

              const name = typeof item?.name === "string" && item.name.length > 0 ? item.name : id;
              const status = typeof item?.status === "string" ? item.status : null;
              const createdTime = typeof item?.created_time === "string" ? item.created_time : null;

              return { id, name, status, createdTime };
            })
            .filter(Boolean)
        : [];

    const [existingLeadforms, existingSyncMarkers] = await Promise.all([
      storage.getResourcesByType(user.tenantId, "leadform"),
      storage.getResourcesByType(user.tenantId, "leadform_page_sync"),
    ]);
    const manualLeadforms = existingLeadforms.filter((resource) => {
      const metadata = (resource.metadata ?? {}) as Record<string, unknown>;
      const metaPageId = typeof metadata.pageId === "string" ? metadata.pageId : null;
      const source = typeof metadata.source === "string" ? metadata.source : null;
      return metaPageId === rawPageId && source === "manual";
    });
    const manualValueSet = new Set(manualLeadforms.map((resource) => resource.value));
    const existingMetaByValue = new Map(
      existingLeadforms
        .filter((resource) => {
          const metadata = (resource.metadata ?? {}) as Record<string, unknown>;
          const metaPageId = typeof metadata.pageId === "string" ? metadata.pageId : null;
          const source = typeof metadata.source === "string" ? metadata.source : null;
          return metaPageId === rawPageId && source !== "manual";
        })
        .map((resource) => [resource.value, resource]),
    );
    const metaLeadformsForPage = existingLeadforms.filter((resource) => {
      const metadata = (resource.metadata ?? {}) as Record<string, unknown>;
      const metaPageId = typeof metadata.pageId === "string" ? metadata.pageId : null;
      const source = typeof metadata.source === "string" ? metadata.source : null;
      return metaPageId === rawPageId && source !== "manual";
    });
    const returnedFormIds = new Set(forms.map((form: any) => form.id));
    const staleMetaLeadforms = metaLeadformsForPage.filter((resource) => !returnedFormIds.has(resource.value));

    const syncedForms = await Promise.all(
      forms.map((form: any) => {
        if (manualValueSet.has(form.id)) {
          return null;
        }

        const existing = existingMetaByValue.get(form.id);
        const metadata = {
          pageId: rawPageId,
          pageName: pageResource?.name ?? null,
          status: form.status ?? null,
          createdTime: form.createdTime ?? null,
          source: "meta",
        };

        if (existing) {
          return storage.updateResource(existing.id, {
            name: form.name,
            metadata,
          }, user.tenantId);
        }

        return storage.createResource({
          tenantId: user.tenantId,
          type: "leadform",
          name: form.name,
          value: form.id,
          metadata,
        });
      }),
    );

    await Promise.all(staleMetaLeadforms.map((resource) => storage.deleteResource(resource.id, user.tenantId)));

    const createdForms = syncedForms.filter(
      (resource): resource is NonNullable<typeof resource> => Boolean(resource),
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getLeadformCacheTtlMs());
    const syncMarker = existingSyncMarkers.find((resource) => resource.value === rawPageId);
    const syncMarkerMetadata = {
      pageId: rawPageId,
      pageName: pageResource?.name ?? null,
      source: "meta_cache",
      syncedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      resultCount: forms.length,
    };

    if (syncMarker) {
      await storage.updateResource(syncMarker.id, {
        name: `Leadforms cache ${pageResource?.name ?? rawPageId}`,
        metadata: syncMarkerMetadata,
      }, user.tenantId);
    } else {
      await storage.createResource({
        tenantId: user.tenantId,
        type: "leadform_page_sync",
        name: `Leadforms cache ${pageResource?.name ?? rawPageId}`,
        value: rawPageId,
        metadata: syncMarkerMetadata,
      });
    }

    const responseForms = sortLeadformResources([...createdForms, ...manualLeadforms]);
    setMemoryLeadforms(user.tenantId, rawPageId, responseForms, expiresAt);

    setNoCacheHeaders(res);
    res.setHeader("X-Autoads-Leadforms-Source", "meta");
    res.removeHeader("ETag");
    return res.json(responseForms);
  } catch (err) {
    console.error("Failed to load Meta lead forms:", err);
    const user = req.user as User;
    const rawPageId = typeof req.params.pageId === "string" ? req.params.pageId.trim() : "";
    if (rawPageId.length > 0 && (await respondWithStoredLeadformsIfAny(res, user.tenantId, rawPageId, "db_stale"))) {
      return;
    }
    return res.status(500).json({ message: "Falha ao carregar formularios da pagina." });
  }
});

metaRouter.get("/meta/pages/:pageId/posts", async (req, res) => {
  try {
    const user = req.user as User;
    const rawPageId = typeof req.params.pageId === "string" ? req.params.pageId.trim() : "";

    if (rawPageId.length === 0) {
      return res.status(400).json({ message: "pageId obrigatorio" });
    }

    const pageResources = await storage.getResourcesByType(user.tenantId, "page");
    const pageResource = pageResources.find((resource) => resource.value === rawPageId);
    if (!pageResource) {
      return res.status(404).json({
        message: "Pagina nao encontrada ou nao pertence ao tenant atual.",
      });
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
        message:
          "Integracao com Meta nao configurada corretamente (token expirado, ausente ou invalido).",
      });
    }

    const userAccessToken = userAccess.accessToken.trim();
    const userAppSecretProof = userAccess.appSecretProof.trim();

    console.debug("Meta user access obtido", {
      tenantId: user.tenantId,
      tokenPreview: userAccessToken.slice(0, 8),
    });

    const pageDetailsUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(rawPageId)}`);
    pageDetailsUrl.searchParams.set("fields", "id,access_token");
    pageDetailsUrl.searchParams.set("access_token", userAccessToken);
    pageDetailsUrl.searchParams.set("appsecret_proof", userAppSecretProof);

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
    const metaAppSecret = resolveMetaAppSecret(settings);
    if (!metaAppSecret) {
      return res.status(500).json({ message: "Meta app secret nao configurado." });
    }
    const pageAppSecretProof = generateAppSecretProof(
      pageAccessToken,
      metaAppSecret,
    );

    console.debug("Page access token obtido com sucesso", {
      tenantId: user.tenantId,
      pageId: rawPageId,
      tokenPreview: pageAccessToken.slice(0, 8),
    });

    const postsUrl = new URL(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(rawPageId)}/posts`,
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
    postsUrl.searchParams.set("appsecret_proof", pageAppSecretProof);

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

internalMetaRouter.get("/meta/token", internalMetaTokenRateLimit, async (req, res) => {
  try {
    const validation = validateInternalRequest(req);
    if (!validation.valid) {
      return res.status(validation.status ?? 401).json({ message: validation.message ?? "Unauthorized" });
    }

    setNoCacheHeaders(res);

    const tenantIdParam = req.query.tenant_id;
    if (typeof tenantIdParam !== "string" || tenantIdParam.trim().length === 0) {
      return res.status(400).json({ message: "tenant_id is required" });
    }

    const tenantId = Number(tenantIdParam);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ message: "tenant_id must be a positive integer" });
    }
    const tenantHeader = req.get("x-tenant-id")?.trim();
    if (!tenantHeader || Number(tenantHeader) !== tenantId) {
      return res.status(400).json({ message: "x-tenant-id must match tenant_id" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    const metaAccess = await getMetaAccess(tenantId);
    if (!metaAccess) {
      return res.status(404).json({
        message: "Meta integration not found or token expired for tenant",
      });
    }

    res.json({
      tenantId,
      accessToken: metaAccess.accessToken,
      appSecretProof: metaAccess.appSecretProof,
      expiresAt: metaAccess.expiresAt,
    });
  } catch (err) {
    console.error("Internal Meta token error:", err);
    res.status(500).json({ message: "Failed to load Meta token" });
  }
});
