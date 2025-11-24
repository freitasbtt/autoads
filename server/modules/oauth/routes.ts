import { Router } from "express";
import type { InsertIntegration, User } from "@shared/schema";
import { storage } from "../storage";
import { isAuthenticated } from "../../middlewares/auth";
import { getPublicAppUrl } from "../../utils/url";
import { encryptMetaAccessToken } from "../meta/utils/token";

export const oauthRouter = Router();

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
    await storage.createIntegration(metaIntegration);

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

    try {
      const folders: Array<{ id: string; name: string }> = [];
      let pageToken: string | undefined = undefined;

      do {
        const params = new URLSearchParams({
          q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: "nextPageToken, files(id, name)",
          spaces: "drive",
          pageSize: "100",
        });
        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        const foldersResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          },
        );

        if (!foldersResponse.ok) {
          const errorBody = await foldersResponse.text();
          console.error("Failed to fetch Google Drive folders:", foldersResponse.status, errorBody);
          break;
        }

        const foldersData: any = await foldersResponse.json();
        if (Array.isArray(foldersData.files)) {
          folders.push(
            ...foldersData.files
              .filter((file: any) => Boolean(file?.id) && Boolean(file?.name))
              .map((file: any) => ({ id: file.id as string, name: file.name as string })),
          );
        }

        pageToken = foldersData.nextPageToken ?? undefined;
      } while (pageToken);

      const existingFolders = await storage.getResourcesByType(tenantId, "drive_folder");
      for (const folder of existingFolders) {
        await storage.deleteResource(folder.id);
      }

      for (const folder of folders) {
        await storage.createResource({
          tenantId,
          type: "drive_folder",
          name: folder.name,
          value: folder.id,
        });
      }
    } catch (folderSyncError) {
      console.error("Google Drive folder sync error:", folderSyncError);
    }

    res.redirect("/integrations?oauth=success");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.status(500).send("Failed to complete OAuth");
  }
});
