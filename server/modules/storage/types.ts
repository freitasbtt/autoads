import type {
  AppSettings,
  Audience,
  Automation,
  Campaign,
  CampaignMetric,
  DashboardGoal,
  ExistingCampaignRun,
  InsertAppSettings,
  InsertAudience,
  InsertAutomation,
  InsertCampaign,
  InsertCampaignMetric,
  InsertDashboardGoal,
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
  updateResource(id: number, resource: Partial<InsertResource>, tenantId?: number): Promise<Resource | undefined>;
  deleteResource(id: number, tenantId?: number): Promise<boolean>;
  deleteResourcesByType(tenantId: number, type: string): Promise<number>;
  getMetaDestinationSnapshot(
    tenantId: number,
    adAccountId: string,
    campaignId: string,
    adsetId: string,
  ): Promise<MetaDestinationSnapshot | undefined>;
  getMetaAccountSnapshot(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaAccountSnapshot | undefined>;
  upsertMetaAccountSnapshot(
    snapshot: InsertMetaAccountSnapshot & { tenantId: number },
  ): Promise<MetaAccountSnapshot>;
  getMetaCampaignSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaCampaignSnapshot[]>;
  replaceMetaCampaignSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
    snapshots: Array<InsertMetaCampaignSnapshot & { tenantId: number }>,
  ): Promise<MetaCampaignSnapshot[]>;
  getMetaAdsetSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaAdsetSnapshot[]>;
  replaceMetaAdsetSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
    snapshots: Array<InsertMetaAdsetSnapshot & { tenantId: number }>,
  ): Promise<MetaAdsetSnapshot[]>;
  upsertMetaDestinationSnapshot(
    snapshot: InsertMetaDestinationSnapshot & { tenantId: number },
  ): Promise<MetaDestinationSnapshot>;

  getAudience(id: number): Promise<Audience | undefined>;
  getAudiencesByTenant(tenantId: number): Promise<Audience[]>;
  createAudience(audience: InsertAudience & { tenantId: number }): Promise<Audience>;
  updateAudience(id: number, audience: Partial<InsertAudience>, tenantId?: number): Promise<Audience | undefined>;
  deleteAudience(id: number, tenantId?: number): Promise<boolean>;

  getCampaign(id: number): Promise<Campaign | undefined>;
  getCampaignsByTenant(tenantId: number): Promise<Campaign[]>;
  createCampaign(campaign: InsertCampaign & { tenantId: number }): Promise<Campaign>;
  updateCampaign(id: number, campaign: Partial<InsertCampaign>, tenantId?: number): Promise<Campaign | undefined>;
  deleteCampaign(id: number, tenantId?: number): Promise<boolean>;

  getCampaignMetrics(
    tenantId: number,
    filters?: CampaignMetricsFilter,
  ): Promise<CampaignMetric[]>;
  createCampaignMetric(
    metric: InsertCampaignMetric & { tenantId: number },
  ): Promise<CampaignMetric>;
  getDashboardGoalsByPeriod(
    tenantId: number,
    startDate: string,
    endDate: string,
    accountIds: number[],
  ): Promise<DashboardGoal[]>;
  upsertDashboardGoals(
    tenantId: number,
    goals: Array<InsertDashboardGoal & { tenantId: number }>,
  ): Promise<DashboardGoal[]>;

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
    tenantId?: number,
  ): Promise<Integration | undefined>;
  deleteIntegration(id: number, tenantId?: number): Promise<boolean>;

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

  createExistingCampaignRun(
    run: InsertExistingCampaignRun & { tenantId: number },
  ): Promise<ExistingCampaignRun>;

  getStorageUploadLink(id: number): Promise<StorageUploadLink | undefined>;
  getStorageUploadLinksByTenant(tenantId: number): Promise<StorageUploadLink[]>;
  getStorageUploadLinkByPublicId(publicId: string): Promise<StorageUploadLink | undefined>;
  createStorageUploadLink(link: InsertStorageUploadLink): Promise<StorageUploadLink>;
  revokeStorageUploadLink(id: number, revokedAt: Date, tenantId?: number): Promise<StorageUploadLink | undefined>;

  getStorageUploadsByTenant(tenantId: number): Promise<StorageUpload[]>;
  getStorageUploadForTask(taskId: number, tenantId: number, uploadId: number): Promise<StorageUpload | undefined>;
  createStorageUpload(upload: InsertStorageUpload): Promise<StorageUpload>;

  getStorageTasksByTenant(tenantId: number): Promise<StorageTask[]>;
  getStorageTask(id: number): Promise<StorageTask | undefined>;
  getStorageTaskByBatch(
    tenantId: number,
    uploadLinkId: number | null,
    batchId: string,
  ): Promise<StorageTask | undefined>;
  createStorageTask(task: InsertStorageTask): Promise<StorageTask>;
  updateStorageTask(
    id: number,
    task: Partial<InsertStorageTask>,
    tenantId?: number,
  ): Promise<StorageTask | undefined>;
  deleteStorageTask(id: number, tenantId: number): Promise<boolean>;
  getStorageTaskUploads(taskId: number): Promise<StorageTaskUpload[]>;
  createStorageTaskUpload(taskUpload: InsertStorageTaskUpload): Promise<StorageTaskUpload>;

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
  DashboardGoal,
  ExistingCampaignRun,
  InsertAppSettings,
  InsertAudience,
  InsertAutomation,
  InsertCampaign,
  InsertCampaignMetric,
  InsertDashboardGoal,
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
};
