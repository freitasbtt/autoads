import type {
  AppSettings,
  Audience,
  Automation,
  Campaign,
  CampaignMetric,
  ExistingCampaignRun,
  InsertAppSettings,
  InsertAudience,
  InsertAutomation,
  InsertCampaign,
  InsertCampaignMetric,
  InsertExistingCampaignRun,
  InsertIntegration,
  InsertMetaAccountSnapshot,
  InsertMetaAdsetSnapshot,
  InsertMetaCampaignSnapshot,
  InsertMetaDestinationSnapshot,
  InsertResource,
  InsertStorageUpload,
  InsertStorageUploadLink,
  InsertStorageTask,
  InsertStorageTaskUpload,
  InsertTenant,
  InsertUser,
  Integration,
  MetaAccountSnapshot,
  MetaAdsetSnapshot,
  MetaCampaignSnapshot,
  MetaDestinationSnapshot,
  Resource,
  StorageTask,
  StorageTaskUpload,
  StorageUpload,
  StorageUploadLink,
  Tenant,
  User,
} from "@shared/schema";
import type { CampaignMetricsFilter, IStorage } from "./types";
import {
  decryptAppSettingsSecrets,
  encryptAppSettingsSecrets,
} from "../../utils/app-settings-secrets";

export class MemStorage implements IStorage {
  private tenants = new Map<number, Tenant>();
  private users = new Map<number, User>();
  private resources = new Map<number, Resource>();
  private metaAccountSnapshots = new Map<number, MetaAccountSnapshot>();
  private metaCampaignSnapshots = new Map<number, MetaCampaignSnapshot>();
  private metaAdsetSnapshots = new Map<number, MetaAdsetSnapshot>();
  private metaDestinationSnapshots = new Map<number, MetaDestinationSnapshot>();
  private audiences = new Map<number, Audience>();
  private campaigns = new Map<number, Campaign>();
  private integrations = new Map<number, Integration>();
  private automations = new Map<number, Automation>();
  private campaignMetrics = new Map<number, CampaignMetric>();
  private existingCampaignRuns = new Map<string, ExistingCampaignRun>();
  private storageUploadLinks = new Map<number, StorageUploadLink>();
  private storageUploads = new Map<number, StorageUpload>();
  private storageTasks = new Map<number, StorageTask>();
  private storageTaskUploads = new Map<number, StorageTaskUpload>();
  private nextId = 1;
  private appSettings: AppSettings | undefined;

  async getTenant(id: number): Promise<Tenant | undefined> {
    return this.tenants.get(id);
  }

  async getTenants(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  async createTenant(insertTenant: InsertTenant): Promise<Tenant> {
    const id = this.nextId++;
    const tenant: Tenant = {
      ...insertTenant,
      id,
      createdAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }

  async getUsersByTenant(tenantId: number): Promise<User[]> {
    return Array.from(this.users.values()).filter((u) => u.tenantId === tenantId);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.nextId++;
    const user: User = {
      ...insertUser,
      id,
      createdAt: new Date(),
      role: insertUser.role ?? "member",
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...user };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  async getResource(id: number): Promise<Resource | undefined> {
    return this.resources.get(id);
  }

  async getResourcesByTenant(tenantId: number): Promise<Resource[]> {
    return Array.from(this.resources.values()).filter((r) => r.tenantId === tenantId);
  }

  async getResourcesByType(tenantId: number, type: string): Promise<Resource[]> {
    return Array.from(this.resources.values()).filter(
      (r) => r.tenantId === tenantId && r.type === type,
    );
  }

  async createResource(
    resource: InsertResource & { tenantId: number },
  ): Promise<Resource> {
    const id = this.nextId++;
    const newResource: Resource = {
      ...resource,
      metadata: resource.metadata ?? {},
      id,
      createdAt: new Date(),
    };
    this.resources.set(id, newResource);
    return newResource;
  }

  async updateResource(
    id: number,
    resource: Partial<InsertResource>,
  ): Promise<Resource | undefined> {
    const existing = this.resources.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...resource };
    this.resources.set(id, updated);
    return updated;
  }

  async deleteResource(id: number): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource) {
      return false;
    }

    for (const [cid, campaign] of this.campaigns.entries()) {
      if (resource.type === "account" && campaign.accountId === id) {
        this.campaigns.set(cid, { ...campaign, accountId: null, updatedAt: new Date() });
      }
      if (resource.type === "page" && campaign.pageId === id) {
        this.campaigns.set(cid, { ...campaign, pageId: null, updatedAt: new Date() });
      }
      if (resource.type === "instagram" && campaign.instagramId === id) {
        this.campaigns.set(cid, { ...campaign, instagramId: null, updatedAt: new Date() });
      }
      if (resource.type === "leadform" && campaign.leadformId === id) {
        this.campaigns.set(cid, { ...campaign, leadformId: null, updatedAt: new Date() });
      }
      if (resource.type === "whatsapp" && campaign.whatsappId === id) {
        this.campaigns.set(cid, { ...campaign, whatsappId: null, updatedAt: new Date() });
      }
    }

    return this.resources.delete(id);
  }

  async deleteResourcesByType(tenantId: number, type: string): Promise<number> {
    const idsToDelete: number[] = [];
    for (const [id, resource] of this.resources.entries()) {
      if (resource.tenantId === tenantId && resource.type === type) {
        idsToDelete.push(id);
      }
    }

    if (idsToDelete.length === 0) return 0;

    for (const [cid, campaign] of this.campaigns.entries()) {
      if (type === "account" && campaign.accountId && idsToDelete.includes(campaign.accountId)) {
        this.campaigns.set(cid, { ...campaign, accountId: null });
      }
      if (type === "page" && campaign.pageId && idsToDelete.includes(campaign.pageId)) {
        this.campaigns.set(cid, { ...campaign, pageId: null });
      }
      if (type === "instagram" && campaign.instagramId && idsToDelete.includes(campaign.instagramId)) {
        this.campaigns.set(cid, { ...campaign, instagramId: null });
      }
      if (type === "leadform" && campaign.leadformId && idsToDelete.includes(campaign.leadformId)) {
        this.campaigns.set(cid, { ...campaign, leadformId: null });
      }
      if (type === "whatsapp" && campaign.whatsappId && idsToDelete.includes(campaign.whatsappId)) {
        this.campaigns.set(cid, { ...campaign, whatsappId: null });
      }
    }

    let deleted = 0;
    for (const id of idsToDelete) {
      if (this.resources.delete(id)) {
        deleted += 1;
      }
    }
    return deleted;
  }

  async getMetaDestinationSnapshot(
    tenantId: number,
    adAccountId: string,
    campaignId: string,
    adsetId: string,
  ): Promise<MetaDestinationSnapshot | undefined> {
    return Array.from(this.metaDestinationSnapshots.values()).find(
      (snapshot) =>
        snapshot.tenantId === tenantId &&
        snapshot.adAccountId === adAccountId &&
        snapshot.campaignId === campaignId &&
        snapshot.adsetId === adsetId,
    );
  }

  async getMetaAccountSnapshot(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaAccountSnapshot | undefined> {
    return Array.from(this.metaAccountSnapshots.values()).find(
      (snapshot) => snapshot.tenantId === tenantId && snapshot.adAccountId === adAccountId,
    );
  }

  async upsertMetaAccountSnapshot(
    snapshot: InsertMetaAccountSnapshot & { tenantId: number },
  ): Promise<MetaAccountSnapshot> {
    const existing = await this.getMetaAccountSnapshot(snapshot.tenantId, snapshot.adAccountId);
    const id = existing?.id ?? this.nextId++;
    const saved: MetaAccountSnapshot = {
      id,
      tenantId: snapshot.tenantId,
      resourceId: snapshot.resourceId ?? null,
      adAccountId: snapshot.adAccountId,
      accountName: snapshot.accountName,
      connectionStatus: snapshot.connectionStatus ?? "connected",
      syncedAt: snapshot.syncedAt ?? new Date(),
      expiresAt: snapshot.expiresAt,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.metaAccountSnapshots.set(id, saved);
    return saved;
  }

  async getMetaCampaignSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaCampaignSnapshot[]> {
    return Array.from(this.metaCampaignSnapshots.values()).filter(
      (snapshot) => snapshot.tenantId === tenantId && snapshot.adAccountId === adAccountId,
    );
  }

  async replaceMetaCampaignSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
    snapshots: Array<InsertMetaCampaignSnapshot & { tenantId: number }>,
  ): Promise<MetaCampaignSnapshot[]> {
    for (const [id, snapshot] of this.metaCampaignSnapshots.entries()) {
      if (snapshot.tenantId === tenantId && snapshot.adAccountId === adAccountId) {
        this.metaCampaignSnapshots.delete(id);
      }
    }

    return snapshots.map((snapshot) => {
      const id = this.nextId++;
      const saved: MetaCampaignSnapshot = {
        id,
        tenantId: snapshot.tenantId,
        adAccountId: snapshot.adAccountId,
        campaignId: snapshot.campaignId,
        name: snapshot.name ?? null,
        objective: snapshot.objective ?? null,
        status: snapshot.status ?? null,
        buyingType: snapshot.buyingType ?? null,
        configuredStatus: snapshot.configuredStatus ?? null,
        effectiveStatus: snapshot.effectiveStatus ?? null,
        dailyBudget: snapshot.dailyBudget ?? null,
        lifetimeBudget: snapshot.lifetimeBudget ?? null,
        updatedTime: snapshot.updatedTime ?? null,
        specialAdCategories: snapshot.specialAdCategories ?? [],
        syncedAt: snapshot.syncedAt ?? new Date(),
        expiresAt: snapshot.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.metaCampaignSnapshots.set(id, saved);
      return saved;
    });
  }

  async getMetaAdsetSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaAdsetSnapshot[]> {
    return Array.from(this.metaAdsetSnapshots.values()).filter(
      (snapshot) => snapshot.tenantId === tenantId && snapshot.adAccountId === adAccountId,
    );
  }

  async replaceMetaAdsetSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
    snapshots: Array<InsertMetaAdsetSnapshot & { tenantId: number }>,
  ): Promise<MetaAdsetSnapshot[]> {
    for (const [id, snapshot] of this.metaAdsetSnapshots.entries()) {
      if (snapshot.tenantId === tenantId && snapshot.adAccountId === adAccountId) {
        this.metaAdsetSnapshots.delete(id);
      }
    }

    return snapshots.map((snapshot) => {
      const id = this.nextId++;
      const saved: MetaAdsetSnapshot = {
        id,
        tenantId: snapshot.tenantId,
        adAccountId: snapshot.adAccountId,
        campaignId: snapshot.campaignId,
        adsetId: snapshot.adsetId,
        name: snapshot.name ?? null,
        status: snapshot.status ?? null,
        configuredStatus: snapshot.configuredStatus ?? null,
        effectiveStatus: snapshot.effectiveStatus ?? null,
        optimizationGoal: snapshot.optimizationGoal ?? null,
        billingEvent: snapshot.billingEvent ?? null,
        bidStrategy: snapshot.bidStrategy ?? null,
        updatedTime: snapshot.updatedTime ?? null,
        promotedObject: snapshot.promotedObject ?? null,
        syncedAt: snapshot.syncedAt ?? new Date(),
        expiresAt: snapshot.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.metaAdsetSnapshots.set(id, saved);
      return saved;
    });
  }

  async upsertMetaDestinationSnapshot(
    snapshot: InsertMetaDestinationSnapshot & { tenantId: number },
  ): Promise<MetaDestinationSnapshot> {
    const existing = await this.getMetaDestinationSnapshot(
      snapshot.tenantId,
      snapshot.adAccountId,
      snapshot.campaignId,
      snapshot.adsetId,
    );
    const id = existing?.id ?? this.nextId++;
    const saved: MetaDestinationSnapshot = {
      id,
      tenantId: snapshot.tenantId,
      adAccountId: snapshot.adAccountId,
      campaignId: snapshot.campaignId,
      adsetId: snapshot.adsetId,
      destinationType: snapshot.destinationType ?? "WEBSITE",
      pageId: snapshot.pageId ?? null,
      instagramUserId: snapshot.instagramUserId ?? null,
      leadgenFormId: snapshot.leadgenFormId ?? null,
      whatsappNumber: snapshot.whatsappNumber ?? null,
      source: snapshot.source ?? "meta",
      syncedAt: snapshot.syncedAt ?? new Date(),
      expiresAt: snapshot.expiresAt,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.metaDestinationSnapshots.set(id, saved);
    return saved;
  }

  async getAudience(id: number): Promise<Audience | undefined> {
    return this.audiences.get(id);
  }

  async getAudiencesByTenant(tenantId: number): Promise<Audience[]> {
    return Array.from(this.audiences.values()).filter((a) => a.tenantId === tenantId);
  }

  async createAudience(
    audience: InsertAudience & { tenantId: number },
  ): Promise<Audience> {
    const id = this.nextId++;
    const newAudience: Audience = {
      ...audience,
      id,
      createdAt: new Date(),
      cities: audience.cities ?? [],
      interests: audience.interests ?? [],
      behaviors: audience.behaviors ?? [],
      locations: audience.locations ?? [],
      customListFile: audience.customListFile ?? null,
      estimatedSize: audience.estimatedSize ?? null,
    };
    this.audiences.set(id, newAudience);
    return newAudience;
  }

  async updateAudience(
    id: number,
    audience: Partial<InsertAudience>,
  ): Promise<Audience | undefined> {
    const existing = this.audiences.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...audience };
    this.audiences.set(id, updated);
    return updated;
  }

  async deleteAudience(id: number): Promise<boolean> {
    return this.audiences.delete(id);
  }

  async getCampaign(id: number): Promise<Campaign | undefined> {
    return this.campaigns.get(id);
  }

  async getCampaignsByTenant(tenantId: number): Promise<Campaign[]> {
    return Array.from(this.campaigns.values()).filter((c) => c.tenantId === tenantId);
  }

  async createCampaign(
    campaign: InsertCampaign & { tenantId: number },
  ): Promise<Campaign> {
    const id = this.nextId++;
    const newCampaign: Campaign = {
      ...campaign,
      id,
      status: campaign.status ?? "draft",
      statusDetail: campaign.statusDetail ?? null,
      accountId: campaign.accountId ?? null,
      pageId: campaign.pageId ?? null,
      instagramId: campaign.instagramId ?? null,
      whatsappId: campaign.whatsappId ?? null,
      leadformId: campaign.leadformId ?? null,
      websiteUrl: campaign.websiteUrl ?? null,
      adSets: campaign.adSets ?? null,
      creatives: campaign.creatives ?? null,
      budget: campaign.budget ?? null,
      audienceIds: campaign.audienceIds ?? null,
      title: campaign.title ?? null,
      message: campaign.message ?? null,
      driveFolderId: campaign.driveFolderId ?? null,
      startTime: campaign.startTime ?? null,
      endTime: campaign.endTime ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.campaigns.set(id, newCampaign);
    return newCampaign;
  }

  async updateCampaign(
    id: number,
    campaign: Partial<InsertCampaign>,
  ): Promise<Campaign | undefined> {
    const existing = this.campaigns.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...campaign, updatedAt: new Date() };
    this.campaigns.set(id, updated);
    return updated;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    return this.campaigns.delete(id);
  }

  async getCampaignMetrics(
    tenantId: number,
    filters: CampaignMetricsFilter = {},
  ): Promise<CampaignMetric[]> {
    const { startDate, endDate, accountIds, campaignIds } = filters;
    return Array.from(this.campaignMetrics.values()).filter((metric) => {
      if (metric.tenantId !== tenantId) {
        return false;
      }

      const metricDate = new Date(`${metric.date}T00:00:00Z`);

      if (startDate && metricDate < new Date(`${startDate}T00:00:00Z`)) {
        return false;
      }

      if (endDate && metricDate > new Date(`${endDate}T00:00:00Z`)) {
        return false;
      }

      if (accountIds && accountIds.length > 0 && !accountIds.includes(metric.accountId)) {
        return false;
      }

      if (
        campaignIds &&
        campaignIds.length > 0 &&
        (metric.campaignId === null ||
          metric.campaignId === undefined ||
          !campaignIds.includes(metric.campaignId))
      ) {
        return false;
      }

      return true;
    });
  }

  async createCampaignMetric(
    metric: InsertCampaignMetric & { tenantId: number },
  ): Promise<CampaignMetric> {
    const id = this.nextId++;
    const spendValue =
      metric.spend !== undefined && metric.spend !== null ? String(metric.spend) : "0";
    const created: CampaignMetric = {
      id,
      tenantId: metric.tenantId,
      accountId: metric.accountId,
      campaignId: metric.campaignId ?? null,
      date: metric.date,
      spend: spendValue ?? "0",
      impressions: metric.impressions ?? 0,
      clicks: metric.clicks ?? 0,
      leads: metric.leads ?? 0,
      createdAt: new Date(),
    };
    this.campaignMetrics.set(id, created);
    return created;
  }

  async getIntegration(id: number): Promise<Integration | undefined> {
    return this.integrations.get(id);
  }

  async getIntegrationsByTenant(tenantId: number): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter((i) => i.tenantId === tenantId);
  }

  async getIntegrationByProvider(
    tenantId: number,
    provider: string,
  ): Promise<Integration | undefined> {
    return Array.from(this.integrations.values()).find(
      (i) => i.tenantId === tenantId && i.provider === provider,
    );
  }

  async createIntegration(
    integration: InsertIntegration & { tenantId: number },
  ): Promise<Integration> {
    const id = this.nextId++;
    const newIntegration: Integration = {
      ...integration,
      id,
      status: integration.status || "pending",
      lastChecked: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.integrations.set(id, newIntegration);
    return newIntegration;
  }

  async updateIntegration(
    id: number,
    integration: Partial<InsertIntegration>,
  ): Promise<Integration | undefined> {
    const existing = this.integrations.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...integration, updatedAt: new Date() };
    this.integrations.set(id, updated);
    return updated;
  }

  async deleteIntegration(id: number): Promise<boolean> {
    return this.integrations.delete(id);
  }

  async getAutomation(id: number): Promise<Automation | undefined> {
    return this.automations.get(id);
  }

  async getAutomationsByTenant(tenantId: number): Promise<Automation[]> {
    return Array.from(this.automations.values()).filter((a) => a.tenantId === tenantId);
  }

  async getAutomationsByCampaign(campaignId: number): Promise<Automation[]> {
    return Array.from(this.automations.values()).filter((a) => a.campaignId === campaignId);
  }

  async createAutomation(
    insertAutomation: InsertAutomation & { tenantId: number },
  ): Promise<Automation> {
    const id = this.nextId++;
    const automation: Automation = {
      ...insertAutomation,
      id,
      status: insertAutomation.status || "pending",
      campaignId: insertAutomation.campaignId ?? null,
      payload: insertAutomation.payload ?? null,
      response: insertAutomation.response ?? null,
      completedAt: null,
      createdAt: new Date(),
    };
    this.automations.set(id, automation);
    return automation;
  }

  async updateAutomation(
    id: number,
    automation: Partial<InsertAutomation>,
  ): Promise<Automation | undefined> {
    const existing = this.automations.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...automation };
    this.automations.set(id, updated);
    return updated;
  }

  async createExistingCampaignRun(
    run: InsertExistingCampaignRun & { tenantId: number },
  ): Promise<ExistingCampaignRun> {
    const created: ExistingCampaignRun = {
      ...run,
      externalId: run.externalId ?? null,
      payloadOriginal: run.payloadOriginal ?? {},
      pairsArray: Array.isArray(run.pairsArray)
        ? (run.pairsArray as Array<Record<string, unknown>>)
        : [],
      previewText: run.previewText ?? "",
      warnings: Array.isArray(run.warnings)
        ? (run.warnings as Array<Record<string, unknown>>)
        : [],
      errors: Array.isArray(run.errors)
        ? (run.errors as Array<Record<string, unknown>>)
        : [],
      summary: run.summary ?? {},
      canContinue: run.canContinue ?? false,
      createdAt: new Date(),
    };
    this.existingCampaignRuns.set(run.runId, created);
    return created;
  }

  async getStorageUploadLink(id: number): Promise<StorageUploadLink | undefined> {
    return this.storageUploadLinks.get(id);
  }

  async getStorageUploadLinksByTenant(tenantId: number): Promise<StorageUploadLink[]> {
    return Array.from(this.storageUploadLinks.values()).filter(
      (link) => link.tenantId === tenantId,
    );
  }

  async getStorageUploadLinkByPublicId(
    publicId: string,
  ): Promise<StorageUploadLink | undefined> {
    return Array.from(this.storageUploadLinks.values()).find(
      (link) => link.publicId === publicId,
    );
  }

  async createStorageUploadLink(
    link: InsertStorageUploadLink,
  ): Promise<StorageUploadLink> {
    const id = this.nextId++;
    const created: StorageUploadLink = {
      id,
      tenantId: link.tenantId,
      createdByUserId: link.createdByUserId ?? null,
      name: link.name,
      pathPrefix: link.pathPrefix ?? "",
      publicId: link.publicId,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt ?? null,
      createdAt: new Date(),
    };
    this.storageUploadLinks.set(id, created);
    return created;
  }

  async revokeStorageUploadLink(
    id: number,
    revokedAt: Date,
  ): Promise<StorageUploadLink | undefined> {
    const existing = this.storageUploadLinks.get(id);
    if (!existing) return undefined;
    const updated: StorageUploadLink = { ...existing, revokedAt };
    this.storageUploadLinks.set(id, updated);
    return updated;
  }

  async getStorageUploadsByTenant(tenantId: number): Promise<StorageUpload[]> {
    return Array.from(this.storageUploads.values()).filter(
      (upload) => upload.tenantId === tenantId,
    );
  }

  async createStorageUpload(upload: InsertStorageUpload): Promise<StorageUpload> {
    const id = this.nextId++;
    const created: StorageUpload = {
      id,
      tenantId: upload.tenantId,
      uploadLinkId: upload.uploadLinkId ?? null,
      uploadedByUserId: upload.uploadedByUserId ?? null,
      bucketName: upload.bucketName,
      objectPath: upload.objectPath,
      originalFileName: upload.originalFileName,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      createdAt: new Date(),
    };
    this.storageUploads.set(id, created);
    return created;
  }

  async getStorageTasksByTenant(tenantId: number): Promise<StorageTask[]> {
    return Array.from(this.storageTasks.values()).filter((task) => task.tenantId === tenantId);
  }

  async getStorageTask(id: number): Promise<StorageTask | undefined> {
    return this.storageTasks.get(id);
  }

  async getStorageTaskByBatch(
    tenantId: number,
    uploadLinkId: number | null,
    batchId: string,
  ): Promise<StorageTask | undefined> {
    return Array.from(this.storageTasks.values()).find(
      (task) =>
        task.tenantId === tenantId &&
        task.batchId === batchId &&
        (task.uploadLinkId ?? null) === uploadLinkId,
    );
  }

  async createStorageTask(task: InsertStorageTask): Promise<StorageTask> {
    const id = this.nextId++;
    const created: StorageTask = {
      id,
      tenantId: task.tenantId,
      storageUploadId: task.storageUploadId,
      uploadLinkId: task.uploadLinkId ?? null,
      batchId: task.batchId ?? null,
      title: task.title,
      status: task.status ?? "pending",
      pairsJson: task.pairsJson ?? [],
      distributionJson: task.distributionJson ?? {
        destinations: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.storageTasks.set(id, created);
    return created;
  }

  async updateStorageTask(
    id: number,
    task: Partial<InsertStorageTask>,
  ): Promise<StorageTask | undefined> {
    const existing = this.storageTasks.get(id);
    if (!existing) return undefined;
    const updated: StorageTask = {
      ...existing,
      ...task,
      uploadLinkId: task.uploadLinkId === undefined ? existing.uploadLinkId : task.uploadLinkId,
      batchId: task.batchId === undefined ? existing.batchId : task.batchId,
      pairsJson: task.pairsJson === undefined ? existing.pairsJson : task.pairsJson,
      distributionJson:
        task.distributionJson === undefined ? existing.distributionJson : task.distributionJson,
      updatedAt: new Date(),
    };
    this.storageTasks.set(id, updated);
    return updated;
  }

  async getStorageTaskUploads(taskId: number): Promise<StorageTaskUpload[]> {
    return Array.from(this.storageTaskUploads.values()).filter((entry) => entry.taskId === taskId);
  }

  async createStorageTaskUpload(
    taskUpload: InsertStorageTaskUpload,
  ): Promise<StorageTaskUpload> {
    const id = this.nextId++;
    const created: StorageTaskUpload = {
      id,
      taskId: taskUpload.taskId,
      storageUploadId: taskUpload.storageUploadId,
      createdAt: new Date(),
    };
    this.storageTaskUploads.set(id, created);
    return created;
  }

  async getAppSettings(): Promise<AppSettings | undefined> {
    return decryptAppSettingsSecrets(this.appSettings);
  }

  async createAppSettings(insertSettings: InsertAppSettings): Promise<AppSettings> {
    const encryptedSettings = encryptAppSettingsSecrets(insertSettings);
    const settings: AppSettings = {
      ...encryptedSettings,
      id: 1,
      metaAppId: encryptedSettings.metaAppId ?? null,
      metaAppSecret: encryptedSettings.metaAppSecret ?? null,
      googleClientId: encryptedSettings.googleClientId ?? null,
      googleClientSecret: encryptedSettings.googleClientSecret ?? null,
      gcsBucketName: encryptedSettings.gcsBucketName ?? null,
      gcsServiceAccountJson: encryptedSettings.gcsServiceAccountJson ?? null,
      n8nWebhookUrl: encryptedSettings.n8nWebhookUrl ?? null,
      updatedAt: new Date(),
    };
    this.appSettings = settings;
    return decryptAppSettingsSecrets(settings) as AppSettings;
  }

  async updateAppSettings(
    updates: Partial<InsertAppSettings>,
  ): Promise<AppSettings | undefined> {
    if (!this.appSettings) {
      return this.createAppSettings(updates as InsertAppSettings);
    }
    const encryptedUpdates = encryptAppSettingsSecrets(updates);
    const updated = { ...this.appSettings, ...encryptedUpdates, updatedAt: new Date() };
    this.appSettings = updated;
    return decryptAppSettingsSecrets(updated);
  }
}
