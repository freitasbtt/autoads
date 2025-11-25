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

export interface CampaignMetricsFilter {
  startDate?: string;
  endDate?: string;
  accountIds?: number[];
  campaignIds?: number[];
}

export interface IStorage {
  getTenant(id: number): Promise<Tenant | undefined>;
  getTenants(): Promise<Tenant[]>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;

  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: number): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  getResource(id: number): Promise<Resource | undefined>;
  getResourcesByTenant(tenantId: number): Promise<Resource[]>;
  getResourcesByType(tenantId: number, type: string): Promise<Resource[]>;
  createResource(resource: InsertResource & { tenantId: number }): Promise<Resource>;
  updateResource(id: number, resource: Partial<InsertResource>): Promise<Resource | undefined>;
  deleteResource(id: number): Promise<boolean>;
  deleteResourcesByType(tenantId: number, type: string): Promise<number>;

  getAudience(id: number): Promise<Audience | undefined>;
  getAudiencesByTenant(tenantId: number): Promise<Audience[]>;
  createAudience(audience: InsertAudience & { tenantId: number }): Promise<Audience>;
  updateAudience(id: number, audience: Partial<InsertAudience>): Promise<Audience | undefined>;
  deleteAudience(id: number): Promise<boolean>;

  getCampaign(id: number): Promise<Campaign | undefined>;
  getCampaignsByTenant(tenantId: number): Promise<Campaign[]>;
  createCampaign(campaign: InsertCampaign & { tenantId: number }): Promise<Campaign>;
  updateCampaign(id: number, campaign: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<boolean>;

  getCampaignMetrics(
    tenantId: number,
    filters?: CampaignMetricsFilter,
  ): Promise<CampaignMetric[]>;
  createCampaignMetric(
    metric: InsertCampaignMetric & { tenantId: number },
  ): Promise<CampaignMetric>;

  getIntegration(id: number): Promise<Integration | undefined>;
  getIntegrationsByTenant(tenantId: number): Promise<Integration[]>;
  getIntegrationByProvider(
    tenantId: number,
    provider: string,
  ): Promise<Integration | undefined>;
  createIntegration(
    integration: InsertIntegration & { tenantId: number },
  ): Promise<Integration>;
  updateIntegration(
    id: number,
    integration: Partial<InsertIntegration>,
  ): Promise<Integration | undefined>;
  deleteIntegration(id: number): Promise<boolean>;

  getAutomation(id: number): Promise<Automation | undefined>;
  getAutomationsByTenant(tenantId: number): Promise<Automation[]>;
  getAutomationsByCampaign(campaignId: number): Promise<Automation[]>;
  createAutomation(
    automation: InsertAutomation & { tenantId: number },
  ): Promise<Automation>;
  updateAutomation(
    id: number,
    automation: Partial<InsertAutomation>,
  ): Promise<Automation | undefined>;

  getAppSettings(): Promise<AppSettings | undefined>;
  createAppSettings(settings: InsertAppSettings): Promise<AppSettings>;
  updateAppSettings(settings: Partial<InsertAppSettings>): Promise<AppSettings | undefined>;
}

export type {
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
};
