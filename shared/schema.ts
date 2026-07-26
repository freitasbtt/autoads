import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, serial, pgEnum, date as pgDate, numeric, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["system_admin", "tenant_admin", "member"]);

// Tenants table for multi-tenancy
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// Users table with tenant association and RBAC
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Resources table - stores Meta Ads resources per tenant
export const resources = pgTable(
  "resources",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    type: text("type").notNull(),
    name: text("name").notNull(),
    value: text("value").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      uniqueTenantResource: uniqueIndex("uniq_tenant_resource")
        .on(table.tenantId, table.type, table.value),
    };
  }
);

const resourceMetadataSchema = z.record(z.any()).optional();

export const insertResourceSchema = createInsertSchema(resources)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
  })
  .extend({
    metadata: resourceMetadataSchema,
  });
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resources.$inferSelect;

// Audiences table - target audience profiles
export const audienceCitySchema = z.object({
  key: z.string().min(1),
  radius: z.number().int().min(1).max(100),
  distance_unit: z.literal("kilometer"),
  name: z.string().optional(),
  region: z.string().optional(),
});

export const audienceInterestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export type AudienceCity = z.infer<typeof audienceCitySchema>;
export type AudienceInterest = z.infer<typeof audienceInterestSchema>;

export const audiences = pgTable("audiences", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // interesse, custom_list
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  interests: jsonb("interests").$type<AudienceInterest[] | null>().default(sql`'[]'::jsonb`),
  cities: jsonb("cities").$type<AudienceCity[] | null>().default(sql`'[]'::jsonb`),
  behaviors: text("behaviors").array(),
  locations: text("locations").array(),
  customListFile: text("custom_list_file"), // for CSV uploads
  estimatedSize: text("estimated_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const audienceCoreSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  interests: z.array(audienceInterestSchema).default([]),
  cities: z.array(audienceCitySchema).default([]),
  behaviors: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  customListFile: z.string().nullable().optional(),
  estimatedSize: z.string().nullable().optional(),
});

export const insertAudienceSchema = audienceCoreSchema.superRefine((data, ctx) => {
  if (data.ageMin > data.ageMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ageMax"],
      message: "ageMin must be less than or equal to ageMax",
    });
  }
});

export const updateAudienceSchema = audienceCoreSchema.partial().superRefine((data, ctx) => {
  if (data.ageMin !== undefined && data.ageMax !== undefined && data.ageMin > data.ageMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ageMax"],
      message: "ageMin must be less than or equal to ageMax",
    });
  }
});

export type InsertAudience = z.infer<typeof insertAudienceSchema>;
export type Audience = typeof audiences.$inferSelect;

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  objective: text("objective").notNull(), // LEAD, TRAFFIC, WHATSAPP, CONVERSIONS, REACH
  status: text("status").notNull().default("draft"), // draft, pending (sent to n8n), active (confirmed by n8n), error (n8n error), paused, completed
  statusDetail: text("status_detail"), // Additional status info from n8n
  accountId: integer("account_id").references(() => resources.id),
  pageId: integer("page_id").references(() => resources.id),
  instagramId: integer("instagram_id").references(() => resources.id),
  whatsappId: integer("whatsapp_id").references(() => resources.id),
  leadformId: integer("leadform_id").references(() => resources.id),
  websiteUrl: text("website_url"),
  // Ad Sets - array of ad set configurations
  adSets: jsonb("ad_sets"), // [{ audienceId, budget, startDate, endDate }]
  // Creatives - array of creative assets
  creatives: jsonb("creatives"), // [{ title, text, driveFolderId }]
  // Legacy fields (kept for backwards compatibility)
  budget: text("budget"),
  audienceIds: integer("audience_ids").array(),
  title: text("title"),
  message: text("message"),
  driveFolderId: text("drive_folder_id"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Integrations table - API configurations
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  provider: text("provider").notNull(), // meta_ads, google_drive
  config: jsonb("config").notNull(), // stores API keys, tokens, etc (encrypted)
  status: text("status").notNull().default("pending"), // pending, connected, error
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrations.$inferSelect;

// Automations table - n8n webhook tracking
export const automations = pgTable("automations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  webhookUrl: text("webhook_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, sent, success, failed
  payload: jsonb("payload"),
  response: jsonb("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertAutomationSchema = createInsertSchema(automations).omit({
  id: true,
  createdAt: true,
});
export type InsertAutomation = z.infer<typeof insertAutomationSchema>;
export type Automation = typeof automations.$inferSelect;

// Existing campaign preflight runs
export const existingCampaignRuns = pgTable("existing_campaign_runs", {
  runId: text("run_id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  externalId: text("external_id"),
  payloadOriginal: jsonb("payload_original")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  pairsArray: jsonb("pairs_array")
    .$type<Array<Record<string, unknown>>>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  previewText: text("preview_text").notNull().default(""),
  warnings: jsonb("warnings")
    .$type<Array<Record<string, unknown>>>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  errors: jsonb("errors")
    .$type<Array<Record<string, unknown>>>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  summary: jsonb("summary")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  status: text("status").notNull(),
  canContinue: boolean("can_continue").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExistingCampaignRunSchema = createInsertSchema(existingCampaignRuns).omit({
  createdAt: true,
});
export type InsertExistingCampaignRun = z.infer<typeof insertExistingCampaignRunSchema>;
export type ExistingCampaignRun = typeof existingCampaignRuns.$inferSelect;

// Campaign metrics table - aggregated performance data per campaign/account
export const campaignMetrics = pgTable("campaign_metrics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  accountId: integer("account_id").notNull().references(() => resources.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  date: pgDate("date").notNull(),
  spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignMetricSchema = createInsertSchema(campaignMetrics).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});
export type InsertCampaignMetric = z.infer<typeof insertCampaignMetricSchema>;
export type CampaignMetric = typeof campaignMetrics.$inferSelect;

export const dashboardGoals = pgTable(
  "dashboard_goals",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    accountId: integer("account_id").notNull().references(() => resources.id),
    accountName: text("account_name").notNull(),
    startDate: pgDate("start_date").notNull(),
    endDate: pgDate("end_date").notNull(),
    targetSpend: numeric("target_spend", { precision: 14, scale: 2 }).notNull(),
    targetLeads: integer("target_leads").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueTenantDashboardGoal: uniqueIndex("uniq_tenant_dashboard_goal")
      .on(table.tenantId, table.accountId, table.startDate, table.endDate),
  }),
);

export const insertDashboardGoalSchema = createInsertSchema(dashboardGoals).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDashboardGoal = z.infer<typeof insertDashboardGoalSchema>;
export type DashboardGoal = typeof dashboardGoals.$inferSelect;

// App Settings table - global OAuth and webhook configuration (admin only)
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  metaAppId: text("meta_app_id"),
  metaAppSecret: text("meta_app_secret"),
  googleClientId: text("google_client_id"),
  googleClientSecret: text("google_client_secret"),
  gcsBucketName: text("gcs_bucket_name"),
  gcsServiceAccountJson: text("gcs_service_account_json"),
  n8nWebhookUrl: text("n8n_webhook_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;

export const storageUploadLinks = pgTable("storage_upload_links", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  name: text("name").notNull(),
  pathPrefix: text("path_prefix").notNull().default(""),
  publicId: text("public_id").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStorageUploadLinkSchema = createInsertSchema(storageUploadLinks).omit({
  id: true,
  createdAt: true,
});
export type InsertStorageUploadLink = typeof storageUploadLinks.$inferInsert;
export type StorageUploadLink = typeof storageUploadLinks.$inferSelect;

export const storageUploads = pgTable("storage_uploads", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  uploadLinkId: integer("upload_link_id").references(() => storageUploadLinks.id),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => users.id),
  bucketName: text("bucket_name").notNull(),
  objectPath: text("object_path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStorageUploadSchema = createInsertSchema(storageUploads).omit({
  id: true,
  createdAt: true,
});
export type InsertStorageUpload = typeof storageUploads.$inferInsert;
export type StorageUpload = typeof storageUploads.$inferSelect;

export type StorageTaskPairRecord = {
  feedUploadId: number | null;
  storiesUploadId: number | null;
  name: string | null;
  title: string | null;
  text: string | null;
};

export type StorageTaskDistributionCampaignRecord = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  buyingType: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  budget: string | null;
  updatedTime: string | null;
  specialAdCategories: string[];
};

export type StorageTaskDistributionAdsetRecord = {
  id: string;
  name: string | null;
  status: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  bidStrategy: string | null;
  endTime: string | null;
  destination: {
    type: string;
    pageId: string | null;
    instagramUserId: string | null;
    leadgenFormId: string | null;
    whatsappNumber: string | null;
  };
};

export type StorageTaskDistributionPairAssignmentRecord = {
  pairId: string;
  useCampaignDefault: boolean;
  leadgenFormId: string | null;
  leadgenFormName: string | null;
};

export type StorageTaskDistributionDestinationRecord = {
  resourceId: number;
  adAccountId: string;
  adAccountName: string;
  connectionStatus: string;
  campaign: StorageTaskDistributionCampaignRecord;
  adsets: StorageTaskDistributionAdsetRecord[];
  applyToAllAdsets: boolean;
  selectedAdsetIds: string[];
  pairIds: string[];
  campaignLeadgenFormId: string | null;
  campaignLeadgenFormName: string | null;
  pairAssignments: StorageTaskDistributionPairAssignmentRecord[];
  createAdsStatus: "PAUSED" | "ACTIVE";
};

export type StorageTaskDistributionRecord = {
  destinations: StorageTaskDistributionDestinationRecord[];
};

export const storageTasks = pgTable("storage_tasks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  storageUploadId: integer("storage_upload_id").notNull().references(() => storageUploads.id),
  uploadLinkId: integer("upload_link_id").references(() => storageUploadLinks.id),
  batchId: text("batch_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  configurationElapsedSeconds: integer("configuration_elapsed_seconds").notNull().default(0),
  lastActivityAt: timestamp("last_activity_at"),
  automationStartedAt: timestamp("automation_started_at"),
  automationFinishedAt: timestamp("automation_finished_at"),
  pairsJson: jsonb("pairs_json")
    .$type<StorageTaskPairRecord[]>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  distributionJson: jsonb("distribution_json")
    .$type<StorageTaskDistributionRecord>()
    .default(sql`'{"destinations":[]}'::jsonb`)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStorageTaskSchema = createInsertSchema(storageTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStorageTask = typeof storageTasks.$inferInsert;
export type StorageTask = typeof storageTasks.$inferSelect;

export const metaDestinationSnapshots = pgTable("meta_destination_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  adAccountId: text("ad_account_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  adsetId: text("adset_id").notNull(),
  destinationType: text("destination_type").notNull().default("WEBSITE"),
  pageId: text("page_id"),
  instagramUserId: text("instagram_user_id"),
  leadgenFormId: text("leadgen_form_id"),
  whatsappNumber: text("whatsapp_number"),
  source: text("source").notNull().default("meta"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMetaDestinationSnapshotSchema = createInsertSchema(metaDestinationSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMetaDestinationSnapshot = typeof metaDestinationSnapshots.$inferInsert;
export type MetaDestinationSnapshot = typeof metaDestinationSnapshots.$inferSelect;

export const metaAccountSnapshots = pgTable(
  "meta_account_snapshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    resourceId: integer("resource_id").references(() => resources.id),
    adAccountId: text("ad_account_id").notNull(),
    accountName: text("account_name").notNull(),
    connectionStatus: text("connection_status").notNull().default("connected"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueTenantAccount: uniqueIndex("uniq_meta_account_snapshots")
      .on(table.tenantId, table.adAccountId),
  }),
);

export const insertMetaAccountSnapshotSchema = createInsertSchema(metaAccountSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMetaAccountSnapshot = typeof metaAccountSnapshots.$inferInsert;
export type MetaAccountSnapshot = typeof metaAccountSnapshots.$inferSelect;

export const metaCampaignSnapshots = pgTable(
  "meta_campaign_snapshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    adAccountId: text("ad_account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    name: text("name"),
    objective: text("objective"),
    status: text("status"),
    buyingType: text("buying_type"),
    configuredStatus: text("configured_status"),
    effectiveStatus: text("effective_status"),
    dailyBudget: text("daily_budget"),
    lifetimeBudget: text("lifetime_budget"),
    updatedTime: text("updated_time"),
    specialAdCategories: jsonb("special_ad_categories")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueTenantCampaign: uniqueIndex("uniq_meta_campaign_snapshots")
      .on(table.tenantId, table.adAccountId, table.campaignId),
  }),
);

export const insertMetaCampaignSnapshotSchema = createInsertSchema(metaCampaignSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMetaCampaignSnapshot = typeof metaCampaignSnapshots.$inferInsert;
export type MetaCampaignSnapshot = typeof metaCampaignSnapshots.$inferSelect;

export const metaAdsetSnapshots = pgTable(
  "meta_adset_snapshots",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id),
    adAccountId: text("ad_account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    adsetId: text("adset_id").notNull(),
    name: text("name"),
    status: text("status"),
    configuredStatus: text("configured_status"),
    effectiveStatus: text("effective_status"),
    optimizationGoal: text("optimization_goal"),
    billingEvent: text("billing_event"),
    bidStrategy: text("bid_strategy"),
    endTime: text("end_time"),
    updatedTime: text("updated_time"),
    promotedObject: jsonb("promoted_object").$type<Record<string, unknown> | null>(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueTenantAdset: uniqueIndex("uniq_meta_adset_snapshots")
      .on(table.tenantId, table.adAccountId, table.campaignId, table.adsetId),
  }),
);

export const insertMetaAdsetSnapshotSchema = createInsertSchema(metaAdsetSnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMetaAdsetSnapshot = typeof metaAdsetSnapshots.$inferInsert;
export type MetaAdsetSnapshot = typeof metaAdsetSnapshots.$inferSelect;

export const storageTaskUploads = pgTable("storage_task_uploads", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => storageTasks.id),
  storageUploadId: integer("storage_upload_id").notNull().references(() => storageUploads.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStorageTaskUploadSchema = createInsertSchema(storageTaskUploads).omit({
  id: true,
  createdAt: true,
});
export type InsertStorageTaskUpload = typeof storageTaskUploads.$inferInsert;
export type StorageTaskUpload = typeof storageTaskUploads.$inferSelect;
