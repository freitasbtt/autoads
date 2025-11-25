import type {
  AppSettings,
  Audience,
  Automation,
  Campaign,
  CampaignMetric,
  InsertAppSettings,
  InsertAudience,
  InsertAutomation,
  InsertCampaign,
  InsertCampaignMetric,
  InsertIntegration,
  InsertResource,
  InsertTenant,
  InsertUser,
  Integration,
  Resource,
  Tenant,
  User,
} from "@shared/schema";
import type { CampaignMetricsFilter, IStorage } from "./types";

export class MemStorage implements IStorage {
  private tenants = new Map<number, Tenant>();
  private users = new Map<number, User>();
  private resources = new Map<number, Resource>();
  private audiences = new Map<number, Audience>();
  private campaigns = new Map<number, Campaign>();
  private integrations = new Map<number, Integration>();
  private automations = new Map<number, Automation>();
  private campaignMetrics = new Map<number, CampaignMetric>();
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
    return this.resources.delete(id);
  }

  async deleteResourcesByType(tenantId: number, type: string): Promise<number> {
    let deleted = 0;
    for (const [id, resource] of this.resources.entries()) {
      if (resource.tenantId === tenantId && resource.type === type) {
        this.resources.delete(id);
        deleted += 1;
      }
    }
    return deleted;
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

  async getAppSettings(): Promise<AppSettings | undefined> {
    return this.appSettings;
  }

  async createAppSettings(insertSettings: InsertAppSettings): Promise<AppSettings> {
    const settings: AppSettings = {
      ...insertSettings,
      id: 1,
      metaAppId: insertSettings.metaAppId ?? null,
      metaAppSecret: insertSettings.metaAppSecret ?? null,
      googleClientId: insertSettings.googleClientId ?? null,
      googleClientSecret: insertSettings.googleClientSecret ?? null,
      n8nWebhookUrl: insertSettings.n8nWebhookUrl ?? null,
      updatedAt: new Date(),
    };
    this.appSettings = settings;
    return settings;
  }

  async updateAppSettings(
    updates: Partial<InsertAppSettings>,
  ): Promise<AppSettings | undefined> {
    if (!this.appSettings) {
      return this.createAppSettings(updates as InsertAppSettings);
    }
    const updated = { ...this.appSettings, ...updates, updatedAt: new Date() };
    this.appSettings = updated;
    return updated;
  }
}
