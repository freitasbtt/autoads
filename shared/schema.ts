import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, serial, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "client"]);

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
  role: userRoleEnum("role").notNull().default("client"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Resources table - stores Meta Ads resources per tenant
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  type: text("type").notNull(), // account, page, instagram, whatsapp, leadform, website
  name: text("name").notNull(),
  value: text("value").notNull(), // the actual ID or URL
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resources.$inferSelect;

// Audiences table - target audience profiles
export const audiences = pgTable("audiences", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // interesse, custom_list
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  interests: text("interests").array(),
  behaviors: text("behaviors").array(),
  locations: text("locations").array().notNull(),
  customListFile: text("custom_list_file"), // for CSV uploads
  estimatedSize: text("estimated_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAudienceSchema = createInsertSchema(audiences).omit({
  id: true,
  tenantId: true,
  createdAt: true,
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

// App Settings table - global OAuth and webhook configuration (admin only)
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  metaAppId: text("meta_app_id"),
  metaAppSecret: text("meta_app_secret"),
  googleClientId: text("google_client_id"),
  googleClientSecret: text("google_client_secret"),
  n8nWebhookUrl: text("n8n_webhook_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;
