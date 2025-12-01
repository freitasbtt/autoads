import { Router } from "express";
import type { InsertIntegration, User } from "@shared/schema";
import { storage } from "../storage";
import { isAuthenticated } from "../../middlewares/auth";
import { getPublicAppUrl } from "../../utils/url";
import { encryptMetaAccessToken } from "../meta/utils/token";
import { generateAppSecretProof } from "../meta/utils/crypto";

export const oauthRouter = Router();

type MetaAdAccount = {
  id?: string;
  name?: string;
  account_id?: string;
  account_status?: number;
};

type MetaPageWithInstagram = {
  id?: string;
  name?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
  } | null;
};

function appendSecurityParams(url: URL, accessToken: string, appSecretProof?: string) {
  if (!url.searchParams.has("access_token")) {
    url.searchParams.set("access_token", accessToken);
  }
  if (appSecretProof && !url.searchParams.has("appsecret_proof")) {
    url.searchParams.set("appsecret_proof", appSecretProof);
  }
}

async function fetchPagedMetaList<T>(
  initialUrl: URL,
  accessToken: string,
  appSecretProof?: string,
): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: URL | null = initialUrl;

  while (nextUrl) {
    appendSecurityParams(nextUrl, accessToken, appSecretProof);

    let response: globalThis.Response;
    try {
      response = await fetch(nextUrl);
    } catch (networkError) {
      throw new Error(`Network error while contacting Meta: ${String(networkError)}`);
    }

    const text = await response.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (parseError) {
      throw new Error("Failed to parse Meta response while importing resources");
    }

    if (!response.ok || body?.error) {
      const message =
        typeof body?.error?.message === "string"
          ? body.error.message
          : `Meta request failed with status ${response.status}`;
      throw new Error(message);
    }

    if (Array.isArray(body?.data)) {
      items.push(...body.data);
    }

    const next = body?.paging?.next;
    nextUrl = next ? new URL(next) : null;
  }

  return items;
}

async function fetchMetaAdAccounts(
  accessToken: string,
  appSecretProof?: string,
): Promise<MetaAdAccount[]> {
  const url = new URL("https://graph.facebook.com/v18.0/me/adaccounts");
  url.searchParams.set("fields", "id,name,account_id,account_status");
  url.searchParams.set("limit", "200");
  return fetchPagedMetaList<MetaAdAccount>(url, accessToken, appSecretProof);
}

async function fetchMetaPagesWithInstagram(
  accessToken: string,
  appSecretProof?: string,
): Promise<MetaPageWithInstagram[]> {
  const url = new URL("https://graph.facebook.com/v18.0/me/accounts");
  url.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  url.searchParams.set("limit", "200");
  return fetchPagedMetaList<MetaPageWithInstagram>(url, accessToken, appSecretProof);
}

async function syncMetaResourcesFromOAuth(options: {
  tenantId: number;
  accessToken: string;
  appSecret: string;
}) {
  const { tenantId, accessToken, appSecret } = options;
  const appSecretProof = generateAppSecretProof(accessToken, appSecret);

  const [adAccounts, pages, existingResources] = await Promise.all([
    fetchMetaAdAccounts(accessToken, appSecretProof),
    fetchMetaPagesWithInstagram(accessToken, appSecretProof),
    storage.getResourcesByTenant(tenantId),
  ]);

  const existingByTypeAndValue = new Map<string, number>();
  for (const res of existingResources) {
    existingByTypeAndValue.set(`${res.type}|${res.value}`, res.id);
  }

  const upsertResource = async (
    type: string,
    value: string,
    name: string,
    metadata: Record<string, unknown>,
  ): Promise<number> => {
    const key = `${type}|${value}`;
    const existingId = existingByTypeAndValue.get(key);
    if (existingId) {
      await storage.updateResource(existingId, { name, metadata });
      return existingId;
    }
    const created = await storage.createResource({
      tenantId,
      type,
      name,
      value,
      metadata,
    });
    existingByTypeAndValue.set(key, created.id);
    return created.id;
  };

  const instagramIndex = new Map<string, number>();

  for (const account of adAccounts) {
    const accountId =
      typeof account.id === "string"
        ? account.id
        : typeof account.account_id === "string"
          ? account.account_id
          : null;

    if (!accountId) continue;

    const accountName =
      typeof account.name === "string" && account.name.trim().length > 0
        ? account.name
        : accountId;

    await upsertResource("account", accountId, accountName, {
      accountStatus: typeof account.account_status === "number" ? account.account_status : null,
    });
  }

  for (const page of pages) {
    const pageId = typeof page.id === "string" ? page.id : null;
    if (!pageId) continue;

    const pageName =
      typeof page.name === "string" && page.name.trim().length > 0 ? page.name : pageId;

    const instagramId =
      typeof page.instagram_business_account?.id === "string"
        ? page.instagram_business_account.id
        : null;
    const instagramUsername =
      typeof page.instagram_business_account?.username === "string"
        ? page.instagram_business_account.username
        : null;

    let instagramResourceId: number | null = null;

    if (instagramId) {
      const cachedId = instagramIndex.get(instagramId);
      if (cachedId) {
        instagramResourceId = cachedId;
      } else {
        const createdId = await upsertResource(
          "instagram",
          instagramId,
          instagramUsername ? `@${instagramUsername}` : instagramId,
          {
            username: instagramUsername,
            pageId,
          },
        );
        instagramResourceId = createdId;
        instagramIndex.set(instagramId, createdId);
      }
    }

    await upsertResource("page", pageId, pageName, {
      instagramId,
      instagramUsername,
      instagramResourceId,
    });
  }

  return {
    accounts: adAccounts.length,
    pages: pages.length,
  };
}

oauthRouter.get("/meta", isAuthenticated, async (req, res) => {
  try {
    const settings = await storage.getAppSettings();
    if (!settings?.metaAppId) {
      return res.status(500).send("Meta OAuth not configured. Please contact admin.");
    }

    const user = req.user as User;

    req.session.oauthUserId = user.id;
    req.session.oauthTenantId = user.tenantId;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const baseUrl = getPublicAppUrl(req);
    const redirectUri = `${baseUrl}/auth/meta/callback`;
    const scope =
      "ads_read,pages_read_engagement,instagram_basic,whatsapp_business_management,leads_retrieval";

    const authUrl =
      `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${settings.metaAppId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${scope}&` +
      `state=${user.id}`;

    res.redirect(authUrl);
  } catch (err) {
    console.error("Meta OAuth error:", err);
    res.status(500).send("Failed to initiate OAuth");
  }
});

oauthRouter.get("/meta/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    const userId = req.session.oauthUserId;
    const tenantId = req.session.oauthTenantId;

    if (!code || !userId || !tenantId || state !== String(userId)) {
      return res.status(400).send("Invalid OAuth callback");
    }

    const settings = await storage.getAppSettings();
    if (!settings?.metaAppId || !settings.metaAppSecret) {
      return res.status(500).send("Meta OAuth not configured");
    }

    const baseUrl = getPublicAppUrl(req);
    const redirectUri = `${baseUrl}/auth/meta/callback`;

    const tokenUrl =
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${settings.metaAppId}&` +
      `client_secret=${settings.metaAppSecret}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData: any = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return res.status(500).send("Failed to obtain access token");
    }

    const accessToken = tokenData.access_token;

    const storedAccessToken = encryptMetaAccessToken(accessToken);
    const metaIntegration: InsertIntegration & { tenantId: number } = {
      tenantId,
      provider: "Meta",
      config: { accessToken: storedAccessToken, tokenType: tokenData.token_type },
      status: "connected",
    };
    const existingIntegration = await storage.getIntegrationByProvider(tenantId, "Meta");
    if (existingIntegration) {
      await storage.updateIntegration(existingIntegration.id, {
        config: metaIntegration.config,
        status: metaIntegration.status,
      });
    } else {
      await storage.createIntegration(metaIntegration);
    }

    await syncMetaResourcesFromOAuth({
      tenantId,
      accessToken,
      appSecret: settings.metaAppSecret,
    });

    res.redirect("/resources?oauth=success");
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    res.status(500).send("Failed to complete OAuth");
  }
});

oauthRouter.get("/google", isAuthenticated, async (req, res) => {
  try {
    const settings = await storage.getAppSettings();
    if (!settings?.googleClientId) {
      return res.status(500).send("Google OAuth not configured. Please contact admin.");
    }

    const user = req.user as User;

    req.session.oauthUserId = user.id;
    req.session.oauthTenantId = user.tenantId;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const baseUrl = getPublicAppUrl(req);
    const redirectUri = `${baseUrl}/auth/google/callback`;
    const scope = "https://www.googleapis.com/auth/drive.readonly";

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${settings.googleClientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `state=${user.id}`;

    res.redirect(authUrl);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).send("Failed to initiate OAuth");
  }
});

oauthRouter.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    const userId = req.session.oauthUserId;
    const tenantId = req.session.oauthTenantId;

    if (!code || !userId || !tenantId || state !== String(userId)) {
      return res.status(400).send("Invalid OAuth callback");
    }

    const settings = await storage.getAppSettings();
    if (!settings?.googleClientId || !settings.googleClientSecret) {
      return res.status(500).send("Google OAuth not configured");
    }

    const baseUrl = getPublicAppUrl(req);
    const redirectUri = `${baseUrl}/auth/google/callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: settings.googleClientId,
        client_secret: settings.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData: any = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return res.status(500).send("Failed to obtain access token");
    }

    const googleIntegration: InsertIntegration & { tenantId: number } = {
      tenantId,
      provider: "Google Drive",
      config: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
      },
      status: "connected",
    };
    await storage.createIntegration(googleIntegration);

    res.redirect("/integrations?oauth=success");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.status(500).send("Failed to complete OAuth");
  }
});
