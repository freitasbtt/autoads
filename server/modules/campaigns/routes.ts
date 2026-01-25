import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { isAuthenticated } from "../../middlewares/auth";
import { storage } from "../storage";
import type { InsertCampaign, Resource, User } from "@shared/schema";
import { insertCampaignSchema } from "@shared/schema";
import { getPublicAppUrl } from "../../utils/url";
import { broadcastCampaignUpdate } from "../realtime/sse";

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

const AD_ACCOUNT_COOLDOWN_MS = 5 * 60 * 1000;
const adAccountCooldowns = new Map<string, number>();

function getAdAccountCooldownKey(tenantId: number, adAccountId: string): string {
  return `${tenantId}:${adAccountId}`;
}

function getCooldownRemainingMs(tenantId: number, adAccountId: string, now = Date.now()): number {
  const key = getAdAccountCooldownKey(tenantId, adAccountId);
  const expiresAt = adAccountCooldowns.get(key);
  if (!expiresAt) {
    return 0;
  }
  if (expiresAt <= now) {
    adAccountCooldowns.delete(key);
    return 0;
  }
  return expiresAt - now;
}

function setAdAccountCooldown(tenantId: number, adAccountId: string, now = Date.now()): number {
  const key = getAdAccountCooldownKey(tenantId, adAccountId);
  const expiresAt = now + AD_ACCOUNT_COOLDOWN_MS;
  adAccountCooldowns.set(key, expiresAt);
  return expiresAt;
}

function mapObjectiveToOutcome(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!normalized) {
    return "OUTCOME_LEADS";
  }
  return (
    OBJECTIVE_OUTCOME_MAP[normalized] ??
    (normalized.startsWith("OUTCOME_") ? normalized : "OUTCOME_LEADS")
  );
}

function extractString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBudgetToNumber(raw: unknown): number | undefined {
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
}

function ensureCount(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}

function isPositiveResourceId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function loadTenantResource(
  tenantId: number,
  id: number | null | undefined,
): Promise<{ resource: Resource | null; invalid: boolean }> {
  if (id === null || id === undefined) {
    return { resource: null, invalid: false };
  }
  if (!isPositiveResourceId(id)) {
    return { resource: null, invalid: true };
  }

  const resource = await storage.getResource(id);
  if (!resource || resource.tenantId !== tenantId) {
    return { resource: null, invalid: true };
  }

  return { resource, invalid: false };
}

async function findInvalidTenantResources(
  tenantId: number,
  refs: Array<{ id?: number | null; label: string }>,
): Promise<string[]> {
  const invalid: string[] = [];
  for (const ref of refs) {
    if (ref.id === undefined) {
      continue;
    }
    const { invalid: isInvalid } = await loadTenantResource(tenantId, ref.id);
    if (isInvalid) {
      invalid.push(ref.label);
    }
  }
  return invalid;
}

async function resolveLeadformResourceId(
  tenantId: number,
  leadformId: number | null | undefined,
): Promise<number | null | undefined> {
  if (leadformId === null || leadformId === undefined) {
    return leadformId;
  }

  const leadforms = await storage.getResourcesByType(tenantId, "leadform");
  const directMatch = leadforms.find((resource) => resource.id === leadformId);
  if (directMatch) {
    return directMatch.id;
  }

  const valueMatch = leadforms.find((resource) => resource.value === String(leadformId));
  if (valueMatch) {
    return valueMatch.id;
  }

  return undefined;
}

export const campaignsRouter = Router();
export const campaignWebhookRouter = Router();

campaignsRouter.use(isAuthenticated);

campaignsRouter.get("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const campaigns = await storage.getCampaignsByTenant(user.tenantId);
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/cooldown", async (req, res, next) => {
  try {
    const user = req.user as User;
    const adAccountRaw =
      req.query.ad_account_id ??
      req.query.account_id ??
      req.query.adAccountId ??
      req.query.accountId;
    const resourceIdRaw = req.query.account_resource_id ?? req.query.accountResourceId;

    let adAccountValue = typeof adAccountRaw === "string" ? adAccountRaw : "";
    if (!adAccountValue && typeof resourceIdRaw === "string") {
      const resourceId = Number.parseInt(resourceIdRaw, 10);
      if (Number.isFinite(resourceId)) {
        const { resource, invalid } = await loadTenantResource(user.tenantId, resourceId);
        if (invalid) {
          return res.status(404).json({ message: "Resource not found" });
        }
        adAccountValue = resource?.value ?? "";
      }
    }

    if (!adAccountValue) {
      return res.status(400).json({ message: "ad_account_id obrigatorio" });
    }

    const adAccountId = String(adAccountValue).replace(/\D+/g, "");
    if (!adAccountId) {
      return res.status(400).json({ message: "ad_account_id invalido" });
    }

    const remainingMs = getCooldownRemainingMs(user.tenantId, adAccountId);
    if (remainingMs <= 0) {
      return res.json({ active: false, remaining_seconds: 0 });
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const cooldownUntil = new Date(Date.now() + remainingMs).toISOString();
    return res.json({
      active: true,
      remaining_seconds: remainingSeconds,
      cooldown_until: cooldownUntil,
    });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }
    const campaign = await storage.getCampaign(id);
    if (!campaign || campaign.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Campaign not found" });
    }
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post("/", async (req, res, next) => {
  try {
    const user = req.user as User;
    const data = insertCampaignSchema.parse(req.body);
    const isExistingCampaignFlow =
      Array.isArray(data.adSets) && data.adSets.length === 0;

    if (isExistingCampaignFlow) {
      const recentCampaigns = await storage.getCampaignsByTenant(user.tenantId);
      const cutoff = Date.now() - 2 * 60 * 1000;
      const duplicate = recentCampaigns.find((campaign) => {
        const createdAt =
          campaign.createdAt instanceof Date ? campaign.createdAt.getTime() : 0;
        if (createdAt < cutoff) {
          return false;
        }
        const status = (campaign.status ?? "").toLowerCase();
        if (status !== "draft" && status !== "pending") {
          return false;
        }
        return (
          campaign.accountId === data.accountId &&
          campaign.pageId === data.pageId &&
          campaign.instagramId === data.instagramId &&
          campaign.whatsappId === data.whatsappId &&
          campaign.leadformId === data.leadformId &&
          (campaign.driveFolderId ?? "") === (data.driveFolderId ?? "") &&
          (campaign.title ?? "") === (data.title ?? "") &&
          (campaign.message ?? "") === (data.message ?? "")
        );
      });

      if (duplicate) {
        return res.status(200).json(duplicate);
      }
    }

    const invalidResources = await findInvalidTenantResources(user.tenantId, [
      { id: data.accountId, label: "accountId" },
      { id: data.pageId, label: "pageId" },
      { id: data.instagramId, label: "instagramId" },
      { id: data.whatsappId, label: "whatsappId" },
    ]);
    if (invalidResources.length > 0) {
      return res.status(400).json({
        message: `Recursos invalidos ou fora do tenant: ${invalidResources.join(", ")}`,
      });
    }

    const resolvedLeadformId = await resolveLeadformResourceId(user.tenantId, data.leadformId);
    if (
      data.leadformId !== undefined &&
      data.leadformId !== null &&
      resolvedLeadformId === undefined
    ) {
      return res.status(400).json({
        message:
          "Formulario de leads nao encontrado no sistema. Atualize a lista da pagina e selecione novamente.",
      });
    }
    const campaignValues: InsertCampaign & { tenantId: number } = {
      ...data,
      tenantId: user.tenantId,
      status: "draft",
      ...(resolvedLeadformId !== undefined ? { leadformId: resolvedLeadformId } : {}),
    };
    const campaign = await storage.createCampaign(campaignValues);
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.patch("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }

    const existing = await storage.getCampaign(id);
    if (!existing || existing.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const data = insertCampaignSchema.partial().parse(req.body);
    const resourceRefs: Array<{ id?: number | null; label: string }> = [];
    if (data.accountId !== undefined) {
      resourceRefs.push({ id: data.accountId, label: "accountId" });
    }
    if (data.pageId !== undefined) {
      resourceRefs.push({ id: data.pageId, label: "pageId" });
    }
    if (data.instagramId !== undefined) {
      resourceRefs.push({ id: data.instagramId, label: "instagramId" });
    }
    if (data.whatsappId !== undefined) {
      resourceRefs.push({ id: data.whatsappId, label: "whatsappId" });
    }
    const invalidResources = await findInvalidTenantResources(user.tenantId, resourceRefs);
    if (invalidResources.length > 0) {
      return res.status(400).json({
        message: `Recursos invalidos ou fora do tenant: ${invalidResources.join(", ")}`,
      });
    }

    const updateValues: Partial<InsertCampaign> = { ...data };
    if (data.leadformId !== undefined) {
      let resolvedLeadformId = data.leadformId;
      if (data.leadformId !== null) {
        resolvedLeadformId = await resolveLeadformResourceId(user.tenantId, data.leadformId);
        if (resolvedLeadformId === undefined) {
          return res.status(400).json({
            message:
              "Formulario de leads nao encontrado no sistema. Atualize a lista da pagina e selecione novamente.",
          });
        }
      }
      updateValues.leadformId = resolvedLeadformId;
    }
    const campaign = await storage.updateCampaign(id, updateValues);
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }

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

campaignsRouter.post("/:id/send-webhook", async (req, res, next) => {
  try {
    const user = req.user as User;
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid campaign id" });
    }

    const campaign = await storage.getCampaign(id);
    if (!campaign || campaign.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const settings = await storage.getAppSettings();
    if (!settings?.n8nWebhookUrl) {
      return res
        .status(400)
        .json({ message: "Webhook n8n nao configurado. Configure em Admin > Configuracoes" });
    }

    const accountResult = await loadTenantResource(user.tenantId, campaign.accountId);
    const pageResult = await loadTenantResource(user.tenantId, campaign.pageId);
    const instagramResult = await loadTenantResource(user.tenantId, campaign.instagramId);
    const whatsappResult = await loadTenantResource(user.tenantId, campaign.whatsappId);
    const leadformResult = await loadTenantResource(user.tenantId, campaign.leadformId);

    const invalidResources = [
      accountResult.invalid ? "accountId" : null,
      pageResult.invalid ? "pageId" : null,
      instagramResult.invalid ? "instagramId" : null,
      whatsappResult.invalid ? "whatsappId" : null,
      leadformResult.invalid ? "leadformId" : null,
    ].filter((value): value is string => Boolean(value));
    if (invalidResources.length > 0) {
      return res.status(400).json({
        message: `Recursos da campanha nao pertencem ao tenant atual: ${invalidResources.join(", ")}`,
      });
    }

    const accountResource = accountResult.resource;
    const pageResource = pageResult.resource;
    const instagramResource = instagramResult.resource;
    const whatsappResource = whatsappResult.resource;
    const leadformResource = leadformResult.resource;
    const adAccountId = accountResource?.value ? accountResource.value.replace(/\D+/g, "") : "";
    const adAccountKey = adAccountId;
    if (adAccountKey) {
      const remainingMs = getCooldownRemainingMs(user.tenantId, adAccountKey);
      if (remainingMs > 0) {
        const retryAfterSeconds = Math.ceil(remainingMs / 1000);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          message: "Aguarde o tempo de espera para reenviar para a mesma conta de anuncios.",
          retry_after: retryAfterSeconds,
        });
      }
    }

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
      creativeEntries.map((creative) => extractString(creative["objectStoryId"])).find((value) => value.length > 0) ??
      "";
    const primaryPostId =
      creativeEntries.map((creative) => extractString(creative["postId"])).find((value) => value.length > 0) ?? "";
    const primaryPermalinkUrl =
      creativeEntries.map((creative) => extractString(creative["permalinkUrl"])).find((value) => value.length > 0) ??
      "";
    const primaryCreativeMode =
      creativeEntries.map((creative) => extractString(creative["mode"])).find((value) => value.length > 0) ?? "";
    const primaryPostMessage =
      creativeEntries.map((creative) => extractString(creative["postMessage"])).find((value) => value.length > 0) ??
      "";

    const driveFolderId =
      primaryDriveFolderFromCreative ||
      (typeof campaign.driveFolderId === "string" ? campaign.driveFolderId.trim() : "");

    const tenant = await storage.getTenant(user.tenantId);
    const callbackBaseUrl = getPublicAppUrl(req).replace(/\/$/, "");
    const callbackUrl = `${callbackBaseUrl}/api/webhooks/n8n/status`;
    const requestId = `req-${crypto.randomUUID().replace(/-/g, "")}`;

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
          Number.isFinite(audienceId) && audienceId > 0 ? await storage.getAudience(audienceId) : undefined;

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

        const dailyBudget = budgetValue !== undefined ? Math.max(0, Math.round(budgetValue * 100)) : undefined;
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
      }),
    );

    const clientName = tenant?.name ?? `Tenant-${user.tenantId}`;
    const adAccountValue = adAccountId || (accountResource ? accountResource.value : "");
    const pageIdValue = pageResource ? pageResource.value : "";
    const instagramIdValue = instagramResource ? instagramResource.value : "";
    const leadFormIdValue = leadformResource ? leadformResource.value : "";
    const leadFormNameValue = leadformResource?.name ?? "";
    const whatsappIdValue = whatsappResource ? whatsappResource.value : "";
    const campaignWebsite = extractString(campaign.websiteUrl);

    const messageText = extractString(campaign.message) || primaryPostMessage || primaryCreativeText;
    const titleText =
      extractString(campaign.title) ||
      primaryCreativeTitle ||
      (primaryPostMessage.length > 0 ? primaryPostMessage.slice(0, 80) : "");

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

      let userMessage = "Erro ao enviar webhook para n8n";
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 404 || errorJson.message?.includes("not registered")) {
          userMessage = "Webhook n8n nao esta ativo. No n8n, clique em 'Execute workflow' e tente novamente.";
        }
      } catch {
        // ignore
      }

      return res.status(500).json({ message: userMessage });
    }

    await storage.updateCampaign(id, {
      status: "pending",
      statusDetail: "Aguardando processamento do n8n (reenviado)",
    });

    let cooldownUntil: string | null = null;
    let cooldownSeconds: number | null = null;
    if (adAccountKey) {
      const expiresAt = setAdAccountCooldown(user.tenantId, adAccountKey);
      cooldownUntil = new Date(expiresAt).toISOString();
      cooldownSeconds = Math.ceil(AD_ACCOUNT_COOLDOWN_MS / 1000);
    }

    res.json({
      message: "Campanha enviada para n8n com sucesso",
      ...(cooldownSeconds
        ? {
            cooldown_seconds: cooldownSeconds,
            cooldown_until: cooldownUntil,
          }
        : {}),
    });
  } catch (err) {
    next(err);
  }
});

campaignWebhookRouter.post("/n8n", isAuthenticated, async (req, res, next) => {
  try {
    const user = req.user as User;

    const settings = await storage.getAppSettings();
    if (!settings?.n8nWebhookUrl) {
      return res
        .status(400)
        .json({ message: "Webhook n8n nao configurado. Configure em Admin > Configuracoes" });
    }

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
      (typeof request_id === "string" && request_id.length > 0 ? request_id : undefined) ||
      (typeof incomingMeta["request_id"] === "string" && (incomingMeta["request_id"] as string).length > 0
        ? (incomingMeta["request_id"] as string)
        : `req-${crypto.randomUUID().replace(/-/g, "")}`);

    const computedCallbackUrl =
      (typeof callback_url === "string" && callback_url.length > 0 ? callback_url : undefined) ||
      (typeof incomingMeta["callback_url"] === "string" && (incomingMeta["callback_url"] as string).length > 0
        ? (incomingMeta["callback_url"] as string)
        : inferredCallbackUrl);

    const objectiveValueRaw =
      objective ??
      (Array.isArray(objectives) && objectives.length > 0 ? objectives[0] : undefined);
    const objectiveOutcome = mapObjectiveToOutcome(objectiveValueRaw);

    const sanitizedAdAccountId =
      typeof ad_account_id === "string"
        ? ad_account_id
        : typeof account_id === "string"
        ? account_id
        : typeof account_resource_id === "string"
        ? account_resource_id
        : "";

    const resolvedLeadFormId =
      lead_form_id ?? leadgen_form_id ?? (typeof lead_form_name === "string" ? lead_form_name : undefined);
    const resolvedLeadFormName =
      lead_form_name ?? leadgen_form_name ?? (typeof lead_form_id === "string" ? lead_form_id : undefined);

    const clientName =
      typeof client === "string" && client.length > 0 ? client : tenant?.name ?? `Tenant-${user.tenantId}`;

    const campaignIdentifier = external_id ?? campaign_id;
    const outgoingExternalId =
      campaignIdentifier !== undefined && campaignIdentifier !== null ? String(campaignIdentifier) : "";

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
              : undefined) ||
            (typeof title_text === "string" && title_text.length > 0 ? title_text : title ?? ""),
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
            (typeof message_text === "string" && message_text.length > 0 ? message_text : message) || "",
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

      let userMessage = "Erro ao enviar webhook para n8n";
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 404 || errorJson.message?.includes("not registered")) {
          userMessage = "Webhook n8n nao esta ativo. No n8n, clique em 'Execute workflow' e tente novamente.";
        }
      } catch {
        // ignore
      }

      return res.status(500).json({ message: userMessage });
    }

    const cooldownAccountId = String(sanitizedAdAccountId).replace(/\D+/g, "");
    if (cooldownAccountId) {
      setAdAccountCooldown(user.tenantId, cooldownAccountId);
    }

    res.json({ message: "Dados enviados para n8n com sucesso" });
  } catch (err) {
    next(err);
  }
});

campaignWebhookRouter.post("/n8n/status", async (req, res, next) => {
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

    const validStatuses = ["active", "error", "paused", "completed"];
    if (!validStatuses.includes(String(status).toLowerCase())) {
      return res
        .status(400)
        .json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const campaignIdentifier = external_id ?? campaign_id;
    if (!campaignIdentifier) {
      return res
        .status(400)
        .json({ message: "Envie campaign_id ou external_id para identificar a campanha" });
    }

    const campaignId = Number.parseInt(String(campaignIdentifier), 10);
    if (!Number.isFinite(campaignId)) {
      return res.status(400).json({ message: "campaign_id/external_id devem ser numeros" });
    }

    const existing = await storage.getCampaign(campaignId);
    if (!existing) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const normalizedStatus = String(status).toLowerCase();
    const statusDetailValue = typeof status_detail === "string" ? status_detail : null;
    const updated = await storage.updateCampaign(campaignId, {
      status: normalizedStatus,
      statusDetail: statusDetailValue,
    });
    const campaignForBroadcast =
      updated ?? { ...existing, status: normalizedStatus, statusDetail: statusDetailValue };

    if (!updated) {
      return res
        .status(500)
        .json({ message: "Nao foi possivel atualizar a campanha" });
    }

    broadcastCampaignUpdate(existing.tenantId, campaignForBroadcast);

    res.json({ message: "Status da campanha atualizado", campaign: campaignForBroadcast });
  } catch (err) {
    next(err as Error);
  }
});
