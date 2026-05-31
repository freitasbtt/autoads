import { db } from "../../db";
import { eq, and, gte, lte, inArray, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as schema from "@shared/schema";
import {
  appSettingsSecretsNeedMigration,
  decryptAppSettingsSecrets,
  encryptAppSettingsSecrets,
} from "../../utils/app-settings-secrets";
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

export class DbStorage implements IStorage {
  async getTenant(id: number): Promise<Tenant | undefined> {
    return db.query.tenants.findFirst({
      where: eq(schema.tenants.id, id),
    });
  }

  async getTenants(): Promise<Tenant[]> {
    return db.query.tenants.findMany();
  }

  async createTenant(insertTenant: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(schema.tenants).values(insertTenant).returning();
    return tenant;
  }

  async getUser(id: number): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
  }

  async getUsersByTenant(tenantId: number): Promise<User[]> {
    return db.query.users.findMany({
      where: eq(schema.users.tenantId, tenantId),
    });
  }

  async getAllUsers(): Promise<User[]> {
    return db.query.users.findMany();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(
    id: number,
    user: Partial<InsertUser>,
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(schema.users)
      .set(user)
      .where(eq(schema.users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await db.delete(schema.users).where(eq(schema.users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getResource(id: number): Promise<Resource | undefined> {
    return db.query.resources.findFirst({
      where: eq(schema.resources.id, id),
    });
  }

  async getResourcesByTenant(tenantId: number): Promise<Resource[]> {
    return db.query.resources.findMany({
      where: eq(schema.resources.tenantId, tenantId),
    });
  }

  async getResourcesByType(tenantId: number, type: string): Promise<Resource[]> {
    return db.query.resources.findMany({
      where: and(eq(schema.resources.tenantId, tenantId), eq(schema.resources.type, type)),
    });
  }

  async createResource(
    resource: InsertResource & { tenantId: number },
  ): Promise<Resource> {
    const [created] = await db
      .insert(schema.resources)
      .values({ ...resource, metadata: resource.metadata ?? {} })
      .returning();
    return created;
  }

  async updateResource(
    id: number,
    resource: Partial<InsertResource>,
    tenantId?: number,
  ): Promise<Resource | undefined> {
    const [updated] = await db
      .update(schema.resources)
      .set(resource)
      .where(
        tenantId === undefined
          ? eq(schema.resources.id, id)
          : and(eq(schema.resources.id, id), eq(schema.resources.tenantId, tenantId)),
      )
      .returning();
    return updated;
  }

  async deleteResource(id: number, tenantId?: number): Promise<boolean> {
    const resource = await this.getResource(id);
    if (!resource || (tenantId !== undefined && resource.tenantId !== tenantId)) {
      return false;
    }

    if (resource.type === "account") {
      await db
        .update(schema.campaigns)
        .set({ accountId: null })
        .where(and(eq(schema.campaigns.tenantId, resource.tenantId), eq(schema.campaigns.accountId, id)));
    }
    if (resource.type === "page") {
      await db
        .update(schema.campaigns)
        .set({ pageId: null })
        .where(and(eq(schema.campaigns.tenantId, resource.tenantId), eq(schema.campaigns.pageId, id)));
    }
    if (resource.type === "instagram") {
      await db
        .update(schema.campaigns)
        .set({ instagramId: null })
        .where(and(eq(schema.campaigns.tenantId, resource.tenantId), eq(schema.campaigns.instagramId, id)));
    }
    if (resource.type === "leadform") {
      await db
        .update(schema.campaigns)
        .set({ leadformId: null })
        .where(and(eq(schema.campaigns.tenantId, resource.tenantId), eq(schema.campaigns.leadformId, id)));
    }
    if (resource.type === "whatsapp") {
      await db
        .update(schema.campaigns)
        .set({ whatsappId: null })
        .where(and(eq(schema.campaigns.tenantId, resource.tenantId), eq(schema.campaigns.whatsappId, id)));
    }

    const result = await db
      .delete(schema.resources)
      .where(and(eq(schema.resources.id, id), eq(schema.resources.tenantId, resource.tenantId)));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteResourcesByType(tenantId: number, type: string): Promise<number> {
    // Primeiro, coleta os IDs dos recursos para limpar chaves estrangeiras antes de apagar
    const resourcesToDelete = await db.query.resources.findMany({
      columns: { id: true },
      where: and(eq(schema.resources.tenantId, tenantId), eq(schema.resources.type, type)),
    });

    const ids = resourcesToDelete.map((r) => r.id);
    if (ids.length === 0) return 0;

    // Limpa referências nas campanhas para evitar violação de FK
    if (type === "account") {
      await db
        .update(schema.campaigns)
        .set({ accountId: null })
        .where(and(eq(schema.campaigns.tenantId, tenantId), inArray(schema.campaigns.accountId, ids)));
    }
    if (type === "page") {
      await db
        .update(schema.campaigns)
        .set({ pageId: null })
        .where(and(eq(schema.campaigns.tenantId, tenantId), inArray(schema.campaigns.pageId, ids)));
    }
    if (type === "instagram") {
      await db
        .update(schema.campaigns)
        .set({ instagramId: null })
        .where(and(eq(schema.campaigns.tenantId, tenantId), inArray(schema.campaigns.instagramId, ids)));
    }
    if (type === "leadform") {
      await db
        .update(schema.campaigns)
        .set({ leadformId: null })
        .where(and(eq(schema.campaigns.tenantId, tenantId), inArray(schema.campaigns.leadformId, ids)));
    }
    if (type === "whatsapp") {
      await db
        .update(schema.campaigns)
        .set({ whatsappId: null })
        .where(and(eq(schema.campaigns.tenantId, tenantId), inArray(schema.campaigns.whatsappId, ids)));
    }

    const result = await db
      .delete(schema.resources)
      .where(and(eq(schema.resources.tenantId, tenantId), eq(schema.resources.type, type)));
    return result.rowCount ?? 0;
  }

  async getMetaDestinationSnapshot(
    tenantId: number,
    adAccountId: string,
    campaignId: string,
    adsetId: string,
  ): Promise<MetaDestinationSnapshot | undefined> {
    return db.query.metaDestinationSnapshots.findFirst({
      where: and(
        eq(schema.metaDestinationSnapshots.tenantId, tenantId),
        eq(schema.metaDestinationSnapshots.adAccountId, adAccountId),
        eq(schema.metaDestinationSnapshots.campaignId, campaignId),
        eq(schema.metaDestinationSnapshots.adsetId, adsetId),
      ),
    });
  }

  async getMetaAccountSnapshot(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaAccountSnapshot | undefined> {
    return db.query.metaAccountSnapshots.findFirst({
      where: and(
        eq(schema.metaAccountSnapshots.tenantId, tenantId),
        eq(schema.metaAccountSnapshots.adAccountId, adAccountId),
      ),
    });
  }

  async upsertMetaAccountSnapshot(
    snapshot: InsertMetaAccountSnapshot & { tenantId: number },
  ): Promise<MetaAccountSnapshot> {
    const values = {
      ...snapshot,
      updatedAt: new Date(),
    };
    const [saved] = await db
      .insert(schema.metaAccountSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.metaAccountSnapshots.tenantId,
          schema.metaAccountSnapshots.adAccountId,
        ],
        set: {
          resourceId: values.resourceId ?? null,
          accountName: values.accountName,
          connectionStatus: values.connectionStatus ?? "connected",
          syncedAt: values.syncedAt,
          expiresAt: values.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async getMetaCampaignSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaCampaignSnapshot[]> {
    return db.query.metaCampaignSnapshots.findMany({
      where: and(
        eq(schema.metaCampaignSnapshots.tenantId, tenantId),
        eq(schema.metaCampaignSnapshots.adAccountId, adAccountId),
      ),
    });
  }

  async replaceMetaCampaignSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
    snapshots: Array<InsertMetaCampaignSnapshot & { tenantId: number }>,
  ): Promise<MetaCampaignSnapshot[]> {
    return db.transaction(async (tx) => {
      await tx
        .delete(schema.metaCampaignSnapshots)
        .where(
          and(
            eq(schema.metaCampaignSnapshots.tenantId, tenantId),
            eq(schema.metaCampaignSnapshots.adAccountId, adAccountId),
          ),
        );

      if (snapshots.length === 0) {
        return [];
      }

      return tx
        .insert(schema.metaCampaignSnapshots)
        .values(
          snapshots.map((snapshot) => ({
            ...snapshot,
            updatedAt: new Date(),
          })),
        )
        .returning();
    });
  }

  async getMetaAdsetSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
  ): Promise<MetaAdsetSnapshot[]> {
    return db.query.metaAdsetSnapshots.findMany({
      where: and(
        eq(schema.metaAdsetSnapshots.tenantId, tenantId),
        eq(schema.metaAdsetSnapshots.adAccountId, adAccountId),
      ),
    });
  }

  async replaceMetaAdsetSnapshotsByAccount(
    tenantId: number,
    adAccountId: string,
    snapshots: Array<InsertMetaAdsetSnapshot & { tenantId: number }>,
  ): Promise<MetaAdsetSnapshot[]> {
    return db.transaction(async (tx) => {
      await tx
        .delete(schema.metaAdsetSnapshots)
        .where(
          and(
            eq(schema.metaAdsetSnapshots.tenantId, tenantId),
            eq(schema.metaAdsetSnapshots.adAccountId, adAccountId),
          ),
        );

      if (snapshots.length === 0) {
        return [];
      }

      return tx
        .insert(schema.metaAdsetSnapshots)
        .values(
          snapshots.map((snapshot) => ({
            ...snapshot,
            updatedAt: new Date(),
          })),
        )
        .returning();
    });
  }

  async upsertMetaDestinationSnapshot(
    snapshot: InsertMetaDestinationSnapshot & { tenantId: number },
  ): Promise<MetaDestinationSnapshot> {
    const values = {
      ...snapshot,
      updatedAt: new Date(),
    };
    const [saved] = await db
      .insert(schema.metaDestinationSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.metaDestinationSnapshots.tenantId,
          schema.metaDestinationSnapshots.adAccountId,
          schema.metaDestinationSnapshots.campaignId,
          schema.metaDestinationSnapshots.adsetId,
        ],
        set: {
          destinationType: values.destinationType ?? "WEBSITE",
          pageId: values.pageId ?? null,
          instagramUserId: values.instagramUserId ?? null,
          leadgenFormId: values.leadgenFormId ?? null,
          whatsappNumber: values.whatsappNumber ?? null,
          source: values.source ?? "meta",
          syncedAt: values.syncedAt,
          expiresAt: values.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async getAudience(id: number): Promise<Audience | undefined> {
    return db.query.audiences.findFirst({
      where: eq(schema.audiences.id, id),
    });
  }

  async getAudiencesByTenant(tenantId: number): Promise<Audience[]> {
    return db.query.audiences.findMany({
      where: eq(schema.audiences.tenantId, tenantId),
    });
  }

  async createAudience(
    audience: InsertAudience & { tenantId: number },
  ): Promise<Audience> {
    const [created] = await db
      .insert(schema.audiences)
      .values(audience)
      .returning();
    return created;
  }

  async updateAudience(
    id: number,
    audience: Partial<InsertAudience>,
    tenantId?: number,
  ): Promise<Audience | undefined> {
    const [updated] = await db
      .update(schema.audiences)
      .set(audience)
      .where(
        tenantId === undefined
          ? eq(schema.audiences.id, id)
          : and(eq(schema.audiences.id, id), eq(schema.audiences.tenantId, tenantId)),
      )
      .returning();
    return updated;
  }

  async deleteAudience(id: number, tenantId?: number): Promise<boolean> {
    const result = await db
      .delete(schema.audiences)
      .where(
        tenantId === undefined
          ? eq(schema.audiences.id, id)
          : and(eq(schema.audiences.id, id), eq(schema.audiences.tenantId, tenantId)),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async getCampaign(id: number): Promise<Campaign | undefined> {
    return db.query.campaigns.findFirst({
      where: eq(schema.campaigns.id, id),
    });
  }

  async getCampaignsByTenant(tenantId: number): Promise<Campaign[]> {
    return db.query.campaigns.findMany({
      where: eq(schema.campaigns.tenantId, tenantId),
    });
  }

  async createCampaign(
    campaign: InsertCampaign & { tenantId: number },
  ): Promise<Campaign> {
    const [created] = await db
      .insert(schema.campaigns)
      .values(campaign)
      .returning();
    return created;
  }

  async updateCampaign(
    id: number,
    campaign: Partial<InsertCampaign>,
    tenantId?: number,
  ): Promise<Campaign | undefined> {
    const [updated] = await db
      .update(schema.campaigns)
      .set(campaign)
      .where(
        tenantId === undefined
          ? eq(schema.campaigns.id, id)
          : and(eq(schema.campaigns.id, id), eq(schema.campaigns.tenantId, tenantId)),
      )
      .returning();
    return updated;
  }

  async deleteCampaign(id: number, tenantId?: number): Promise<boolean> {
    const result = await db
      .delete(schema.campaigns)
      .where(
        tenantId === undefined
          ? eq(schema.campaigns.id, id)
          : and(eq(schema.campaigns.id, id), eq(schema.campaigns.tenantId, tenantId)),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async getCampaignMetrics(
    tenantId: number,
    filters: CampaignMetricsFilter = {},
  ): Promise<CampaignMetric[]> {
    const conditions: SQL[] = [eq(schema.campaignMetrics.tenantId, tenantId)];

    if (filters.startDate) {
      conditions.push(gte(schema.campaignMetrics.date, filters.startDate));
    }

    if (filters.endDate) {
      conditions.push(lte(schema.campaignMetrics.date, filters.endDate));
    }

    if (filters.accountIds && filters.accountIds.length > 0) {
      conditions.push(inArray(schema.campaignMetrics.accountId, filters.accountIds));
    }

    if (filters.campaignIds && filters.campaignIds.length > 0) {
      conditions.push(inArray(schema.campaignMetrics.campaignId, filters.campaignIds));
    }

    return db.query.campaignMetrics.findMany({
      where: and(...conditions),
    });
  }

  async createCampaignMetric(
    metric: InsertCampaignMetric & { tenantId: number },
  ): Promise<CampaignMetric> {
    const [created] = await db
      .insert(schema.campaignMetrics)
      .values(metric)
      .returning();
    return created;
  }

  async getIntegration(id: number): Promise<Integration | undefined> {
    return db.query.integrations.findFirst({
      where: eq(schema.integrations.id, id),
    });
  }

  async getIntegrationsByTenant(tenantId: number): Promise<Integration[]> {
    return db.query.integrations.findMany({
      where: eq(schema.integrations.tenantId, tenantId),
    });
  }

  async getIntegrationByProvider(
    tenantId: number,
    provider: string,
  ): Promise<Integration | undefined> {
    return db.query.integrations.findFirst({
      where: and(
        eq(schema.integrations.tenantId, tenantId),
        eq(schema.integrations.provider, provider),
      ),
    });
  }

  async createIntegration(
    integration: InsertIntegration & { tenantId: number },
  ): Promise<Integration> {
    const [created] = await db
      .insert(schema.integrations)
      .values(integration)
      .returning();
    return created;
  }

  async updateIntegration(
    id: number,
    integration: Partial<InsertIntegration>,
    tenantId?: number,
  ): Promise<Integration | undefined> {
    const [updated] = await db
      .update(schema.integrations)
      .set(integration)
      .where(
        tenantId === undefined
          ? eq(schema.integrations.id, id)
          : and(eq(schema.integrations.id, id), eq(schema.integrations.tenantId, tenantId)),
      )
      .returning();
    return updated;
  }

  async deleteIntegration(id: number, tenantId?: number): Promise<boolean> {
    const result = await db
      .delete(schema.integrations)
      .where(
        tenantId === undefined
          ? eq(schema.integrations.id, id)
          : and(eq(schema.integrations.id, id), eq(schema.integrations.tenantId, tenantId)),
      );
    return (result.rowCount ?? 0) > 0;
  }

  async getAutomation(id: number): Promise<Automation | undefined> {
    return db.query.automations.findFirst({
      where: eq(schema.automations.id, id),
    });
  }

  async getAutomationsByTenant(tenantId: number): Promise<Automation[]> {
    return db.query.automations.findMany({
      where: eq(schema.automations.tenantId, tenantId),
    });
  }

  async getAutomationsByCampaign(campaignId: number): Promise<Automation[]> {
    return db.query.automations.findMany({
      where: eq(schema.automations.campaignId, campaignId),
    });
  }

  async createAutomation(
    automation: InsertAutomation & { tenantId: number },
  ): Promise<Automation> {
    const values = {
      ...automation,
      status: automation.status ?? "pending",
    };
    const [created] = await db.insert(schema.automations).values(values).returning();
    return created;
  }

  async updateAutomation(
    id: number,
    automation: Partial<InsertAutomation>,
  ): Promise<Automation | undefined> {
    const [updated] = await db
      .update(schema.automations)
      .set(automation)
      .where(eq(schema.automations.id, id))
      .returning();
    return updated;
  }

  async createExistingCampaignRun(
    run: InsertExistingCampaignRun & { tenantId: number },
  ): Promise<ExistingCampaignRun> {
    const values = {
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
    };
    const [created] = await db
      .insert(schema.existingCampaignRuns)
      .values(values)
      .returning();
    return created;
  }

  async getStorageUploadLink(id: number): Promise<StorageUploadLink | undefined> {
    return db.query.storageUploadLinks.findFirst({
      where: eq(schema.storageUploadLinks.id, id),
    });
  }

  async getStorageUploadLinksByTenant(tenantId: number): Promise<StorageUploadLink[]> {
    return db.query.storageUploadLinks.findMany({
      where: eq(schema.storageUploadLinks.tenantId, tenantId),
    });
  }

  async getStorageUploadLinkByPublicId(
    publicId: string,
  ): Promise<StorageUploadLink | undefined> {
    return db.query.storageUploadLinks.findFirst({
      where: eq(schema.storageUploadLinks.publicId, publicId),
    });
  }

  async createStorageUploadLink(
    link: InsertStorageUploadLink,
  ): Promise<StorageUploadLink> {
    const [created] = await db
      .insert(schema.storageUploadLinks)
      .values(link)
      .returning();
    return created;
  }

  async revokeStorageUploadLink(
    id: number,
    revokedAt: Date,
    tenantId?: number,
  ): Promise<StorageUploadLink | undefined> {
    const [updated] = await db
      .update(schema.storageUploadLinks)
      .set({ revokedAt })
      .where(
        tenantId === undefined
          ? eq(schema.storageUploadLinks.id, id)
          : and(eq(schema.storageUploadLinks.id, id), eq(schema.storageUploadLinks.tenantId, tenantId)),
      )
      .returning();
    return updated;
  }

  async getStorageUploadsByTenant(tenantId: number): Promise<StorageUpload[]> {
    return db.query.storageUploads.findMany({
      where: eq(schema.storageUploads.tenantId, tenantId),
    });
  }

  async getStorageUploadForTask(
    taskId: number,
    tenantId: number,
    uploadId: number,
  ): Promise<StorageUpload | undefined> {
    const task = await db.query.storageTasks.findFirst({
      where: and(eq(schema.storageTasks.id, taskId), eq(schema.storageTasks.tenantId, tenantId)),
    });
    if (!task) {
      return undefined;
    }

    if (task.storageUploadId !== uploadId) {
      const taskUpload = await db.query.storageTaskUploads.findFirst({
        where: and(
          eq(schema.storageTaskUploads.taskId, taskId),
          eq(schema.storageTaskUploads.storageUploadId, uploadId),
        ),
      });
      if (!taskUpload) {
        return undefined;
      }
    }

    return db.query.storageUploads.findFirst({
      where: and(eq(schema.storageUploads.id, uploadId), eq(schema.storageUploads.tenantId, tenantId)),
    });
  }

  async createStorageUpload(upload: InsertStorageUpload): Promise<StorageUpload> {
    const [created] = await db
      .insert(schema.storageUploads)
      .values(upload)
      .returning();
    return created;
  }

  async getStorageTasksByTenant(tenantId: number): Promise<StorageTask[]> {
    return db.query.storageTasks.findMany({
      where: eq(schema.storageTasks.tenantId, tenantId),
    });
  }

  async getStorageTask(id: number): Promise<StorageTask | undefined> {
    return db.query.storageTasks.findFirst({
      where: eq(schema.storageTasks.id, id),
    });
  }

  async getStorageTaskByBatch(
    tenantId: number,
    uploadLinkId: number | null,
    batchId: string,
  ): Promise<StorageTask | undefined> {
    return db.query.storageTasks.findFirst({
      where: and(
        eq(schema.storageTasks.tenantId, tenantId),
        eq(schema.storageTasks.batchId, batchId),
        uploadLinkId === null
          ? isNull(schema.storageTasks.uploadLinkId)
          : eq(schema.storageTasks.uploadLinkId, uploadLinkId),
      ),
    });
  }

  async createStorageTask(task: InsertStorageTask): Promise<StorageTask> {
    const [created] = await db
      .insert(schema.storageTasks)
      .values(task)
      .returning();
    return created;
  }

  async updateStorageTask(
    id: number,
    task: Partial<InsertStorageTask>,
    tenantId?: number,
  ): Promise<StorageTask | undefined> {
    const [updated] = await db
      .update(schema.storageTasks)
      .set({ ...task, updatedAt: new Date() })
      .where(
        tenantId === undefined
          ? eq(schema.storageTasks.id, id)
          : and(eq(schema.storageTasks.id, id), eq(schema.storageTasks.tenantId, tenantId)),
      )
      .returning();
    return updated;
  }

  async deleteStorageTask(id: number, tenantId: number): Promise<boolean> {
    const task = await db.query.storageTasks.findFirst({
      where: and(eq(schema.storageTasks.id, id), eq(schema.storageTasks.tenantId, tenantId)),
    });
    if (!task) {
      return false;
    }

    await db.delete(schema.storageTaskUploads).where(eq(schema.storageTaskUploads.taskId, id));
    const result = await db
      .delete(schema.storageTasks)
      .where(and(eq(schema.storageTasks.id, id), eq(schema.storageTasks.tenantId, tenantId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getStorageTaskUploads(taskId: number): Promise<StorageTaskUpload[]> {
    return db.query.storageTaskUploads.findMany({
      where: eq(schema.storageTaskUploads.taskId, taskId),
    });
  }

  async createStorageTaskUpload(
    taskUpload: InsertStorageTaskUpload,
  ): Promise<StorageTaskUpload> {
    const [created] = await db
      .insert(schema.storageTaskUploads)
      .values(taskUpload)
      .returning();
    return created;
  }

  async getAppSettings(): Promise<AppSettings | undefined> {
    const settings = await db.query.appSettings.findFirst();
    const decrypted = decryptAppSettingsSecrets(settings);

    if (settings && decrypted && appSettingsSecretsNeedMigration(settings)) {
      const migratedSecretFields = encryptAppSettingsSecrets({
        metaAppSecret: decrypted.metaAppSecret,
        googleClientSecret: decrypted.googleClientSecret,
        gcsServiceAccountJson: decrypted.gcsServiceAccountJson,
      });

      await db
        .update(schema.appSettings)
        .set(migratedSecretFields)
        .where(eq(schema.appSettings.id, settings.id));
    }

    return decrypted;
  }

  async createAppSettings(
    insertSettings: InsertAppSettings,
  ): Promise<AppSettings> {
    const encryptedSettings = encryptAppSettingsSecrets(insertSettings);
    const [settings] = await db
      .insert(schema.appSettings)
      .values(encryptedSettings)
      .returning();
    return decryptAppSettingsSecrets(settings) as AppSettings;
  }

  async updateAppSettings(
    updates: Partial<InsertAppSettings>,
  ): Promise<AppSettings | undefined> {
    const existing = await this.getAppSettings();
    if (!existing) {
      return this.createAppSettings(updates as InsertAppSettings);
    }

    const updateData = encryptAppSettingsSecrets({ ...updates, updatedAt: new Date() });
    const [settings] = await db
      .update(schema.appSettings)
      .set(updateData)
      .where(eq(schema.appSettings.id, existing.id))
      .returning();
    return decryptAppSettingsSecrets(settings);
  }
}
