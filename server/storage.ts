import type {
  User,
  InsertUser,
  Tenant,
  InsertTenant,
  Resource,
  InsertResource,
  Audience,
  InsertAudience,
  Campaign,
  InsertCampaign,
  Integration,
  InsertIntegration,
  Automation,
  InsertAutomation,
} from "@shared/schema";

export interface IStorage {
  // Tenant operations
  getTenant(id: number): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;

  // Resource operations
  getResource(id: number): Promise<Resource | undefined>;
  getResourcesByTenant(tenantId: number): Promise<Resource[]>;
  getResourcesByType(tenantId: number, type: string): Promise<Resource[]>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: number, resource: Partial<InsertResource>): Promise<Resource | undefined>;
  deleteResource(id: number): Promise<boolean>;

  // Audience operations
  getAudience(id: number): Promise<Audience | undefined>;
  getAudiencesByTenant(tenantId: number): Promise<Audience[]>;
  createAudience(audience: InsertAudience): Promise<Audience>;
  updateAudience(id: number, audience: Partial<InsertAudience>): Promise<Audience | undefined>;
  deleteAudience(id: number): Promise<boolean>;

  // Campaign operations
  getCampaign(id: number): Promise<Campaign | undefined>;
  getCampaignsByTenant(tenantId: number): Promise<Campaign[]>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<boolean>;

  // Integration operations
  getIntegration(id: number): Promise<Integration | undefined>;
  getIntegrationsByTenant(tenantId: number): Promise<Integration[]>;
  getIntegrationByProvider(tenantId: number, provider: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<InsertIntegration>): Promise<Integration | undefined>;
  deleteIntegration(id: number): Promise<boolean>;

  // Automation operations
  getAutomation(id: number): Promise<Automation | undefined>;
  getAutomationsByTenant(tenantId: number): Promise<Automation[]>;
  getAutomationsByCampaign(campaignId: number): Promise<Automation[]>;
  createAutomation(automation: InsertAutomation): Promise<Automation>;
  updateAutomation(id: number, automation: Partial<InsertAutomation>): Promise<Automation | undefined>;
}

export class MemStorage implements IStorage {
  private tenants: Map<number, Tenant>;
  private users: Map<number, User>;
  private resources: Map<number, Resource>;
  private audiences: Map<number, Audience>;
  private campaigns: Map<number, Campaign>;
  private integrations: Map<number, Integration>;
  private automations: Map<number, Automation>;
  private nextId: number;

  constructor() {
    this.tenants = new Map();
    this.users = new Map();
    this.resources = new Map();
    this.audiences = new Map();
    this.campaigns = new Map();
    this.integrations = new Map();
    this.automations = new Map();
    this.nextId = 1;
  }

  // Tenant operations
  async getTenant(id: number): Promise<Tenant | undefined> {
    return this.tenants.get(id);
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

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async getUsersByTenant(tenantId: number): Promise<User[]> {
    return Array.from(this.users.values()).filter((user) => user.tenantId === tenantId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.nextId++;
    const user: User = {
      ...insertUser,
      id,
      role: insertUser.role || "user",
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  // Resource operations
  async getResource(id: number): Promise<Resource | undefined> {
    return this.resources.get(id);
  }

  async getResourcesByTenant(tenantId: number): Promise<Resource[]> {
    return Array.from(this.resources.values()).filter((r) => r.tenantId === tenantId);
  }

  async getResourcesByType(tenantId: number, type: string): Promise<Resource[]> {
    return Array.from(this.resources.values()).filter(
      (r) => r.tenantId === tenantId && r.type === type
    );
  }

  async createResource(insertResource: InsertResource): Promise<Resource> {
    const id = this.nextId++;
    const resource: Resource = {
      ...insertResource,
      id,
      createdAt: new Date(),
    };
    this.resources.set(id, resource);
    return resource;
  }

  async updateResource(id: number, updates: Partial<InsertResource>): Promise<Resource | undefined> {
    const resource = this.resources.get(id);
    if (!resource) return undefined;
    const updated = { ...resource, ...updates };
    this.resources.set(id, updated);
    return updated;
  }

  async deleteResource(id: number): Promise<boolean> {
    return this.resources.delete(id);
  }

  // Audience operations
  async getAudience(id: number): Promise<Audience | undefined> {
    return this.audiences.get(id);
  }

  async getAudiencesByTenant(tenantId: number): Promise<Audience[]> {
    return Array.from(this.audiences.values()).filter((a) => a.tenantId === tenantId);
  }

  async createAudience(insertAudience: InsertAudience): Promise<Audience> {
    const id = this.nextId++;
    const audience: Audience = {
      ...insertAudience,
      id,
      ageMin: insertAudience.ageMin ?? null,
      ageMax: insertAudience.ageMax ?? null,
      interests: insertAudience.interests ?? null,
      behaviors: insertAudience.behaviors ?? null,
      customListFile: insertAudience.customListFile ?? null,
      estimatedSize: insertAudience.estimatedSize ?? null,
      createdAt: new Date(),
    };
    this.audiences.set(id, audience);
    return audience;
  }

  async updateAudience(id: number, updates: Partial<InsertAudience>): Promise<Audience | undefined> {
    const audience = this.audiences.get(id);
    if (!audience) return undefined;
    const updated = { ...audience, ...updates };
    this.audiences.set(id, updated);
    return updated;
  }

  async deleteAudience(id: number): Promise<boolean> {
    return this.audiences.delete(id);
  }

  // Campaign operations
  async getCampaign(id: number): Promise<Campaign | undefined> {
    return this.campaigns.get(id);
  }

  async getCampaignsByTenant(tenantId: number): Promise<Campaign[]> {
    return Array.from(this.campaigns.values()).filter((c) => c.tenantId === tenantId);
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const id = this.nextId++;
    const campaign: Campaign = {
      ...insertCampaign,
      id,
      status: insertCampaign.status || "draft",
      accountId: insertCampaign.accountId ?? null,
      pageId: insertCampaign.pageId ?? null,
      instagramId: insertCampaign.instagramId ?? null,
      whatsappId: insertCampaign.whatsappId ?? null,
      leadformId: insertCampaign.leadformId ?? null,
      websiteUrl: insertCampaign.websiteUrl ?? null,
      title: insertCampaign.title ?? null,
      message: insertCampaign.message ?? null,
      driveFolderId: insertCampaign.driveFolderId ?? null,
      startTime: insertCampaign.startTime ?? null,
      endTime: insertCampaign.endTime ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  async updateCampaign(id: number, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const campaign = this.campaigns.get(id);
    if (!campaign) return undefined;
    const updated = { ...campaign, ...updates, updatedAt: new Date() };
    this.campaigns.set(id, updated);
    return updated;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    return this.campaigns.delete(id);
  }

  // Integration operations
  async getIntegration(id: number): Promise<Integration | undefined> {
    return this.integrations.get(id);
  }

  async getIntegrationsByTenant(tenantId: number): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter((i) => i.tenantId === tenantId);
  }

  async getIntegrationByProvider(tenantId: number, provider: string): Promise<Integration | undefined> {
    return Array.from(this.integrations.values()).find(
      (i) => i.tenantId === tenantId && i.provider === provider
    );
  }

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const id = this.nextId++;
    const integration: Integration = {
      ...insertIntegration,
      id,
      status: insertIntegration.status || "pending",
      lastChecked: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.integrations.set(id, integration);
    return integration;
  }

  async updateIntegration(
    id: number,
    updates: Partial<InsertIntegration>
  ): Promise<Integration | undefined> {
    const integration = this.integrations.get(id);
    if (!integration) return undefined;
    const updated = { ...integration, ...updates, updatedAt: new Date() };
    this.integrations.set(id, updated);
    return updated;
  }

  async deleteIntegration(id: number): Promise<boolean> {
    return this.integrations.delete(id);
  }

  // Automation operations
  async getAutomation(id: number): Promise<Automation | undefined> {
    return this.automations.get(id);
  }

  async getAutomationsByTenant(tenantId: number): Promise<Automation[]> {
    return Array.from(this.automations.values()).filter((a) => a.tenantId === tenantId);
  }

  async getAutomationsByCampaign(campaignId: number): Promise<Automation[]> {
    return Array.from(this.automations.values()).filter((a) => a.campaignId === campaignId);
  }

  async createAutomation(insertAutomation: InsertAutomation): Promise<Automation> {
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
    updates: Partial<InsertAutomation>
  ): Promise<Automation | undefined> {
    const automation = this.automations.get(id);
    if (!automation) return undefined;
    const updated = { ...automation, ...updates };
    this.automations.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
