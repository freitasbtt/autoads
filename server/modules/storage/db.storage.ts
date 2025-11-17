import { db } from "../../db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as schema from "@shared/schema";
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
      .values(resource)
      .returning();
    return created;
  }

  async updateResource(
    id: number,
    resource: Partial<InsertResource>,
  ): Promise<Resource | undefined> {
    const [updated] = await db
      .update(schema.resources)
      .set(resource)
      .where(eq(schema.resources.id, id))
      .returning();
    return updated;
  }

  async deleteResource(id: number): Promise<boolean> {
    const result = await db.delete(schema.resources).where(eq(schema.resources.id, id));
    return (result.rowCount ?? 0) > 0;
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
  ): Promise<Audience | undefined> {
    const [updated] = await db
      .update(schema.audiences)
      .set(audience)
      .where(eq(schema.audiences.id, id))
      .returning();
    return updated;
  }

  async deleteAudience(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.audiences)
      .where(eq(schema.audiences.id, id));
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
  ): Promise<Campaign | undefined> {
    const [updated] = await db
      .update(schema.campaigns)
      .set(campaign)
      .where(eq(schema.campaigns.id, id))
      .returning();
    return updated;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    const result = await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
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
  ): Promise<Integration | undefined> {
    const [updated] = await db
      .update(schema.integrations)
      .set(integration)
      .where(eq(schema.integrations.id, id))
      .returning();
    return updated;
  }

  async deleteIntegration(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.integrations)
      .where(eq(schema.integrations.id, id));
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

  async getAppSettings(): Promise<AppSettings | undefined> {
    return db.query.appSettings.findFirst();
  }

  async createAppSettings(
    insertSettings: InsertAppSettings,
  ): Promise<AppSettings> {
    const [settings] = await db
      .insert(schema.appSettings)
      .values(insertSettings)
      .returning();
    return settings;
  }

  async updateAppSettings(
    updates: Partial<InsertAppSettings>,
  ): Promise<AppSettings | undefined> {
    const existing = await this.getAppSettings();
    if (!existing) {
      return this.createAppSettings(updates as InsertAppSettings);
    }

    const updateData = { ...updates, updatedAt: new Date() };
    const [settings] = await db
      .update(schema.appSettings)
      .set(updateData)
      .where(eq(schema.appSettings.id, existing.id))
      .returning();
    return settings;
  }
}
