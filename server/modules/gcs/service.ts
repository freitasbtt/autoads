import crypto from "crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { storage } from "../storage";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

type ServiceAccountSource =
  | "env_json"
  | "env_file"
  | "root_file"
  | "local_secrets_file"
  | "admin_ui";

type ServiceAccountFileCandidate = {
  source: Exclude<ServiceAccountSource, "env_json" | "admin_ui">;
  path: string;
};

type ServiceAccountInput = {
  json: string;
  source: ServiceAccountSource | null;
  filePath: string | null;
  checkedFilePaths: string[];
};

export type ResolvedGcsConfig = {
  bucketName: string;
  clientEmail: string;
  privateKey: string;
  projectId: string | null;
};

type AccessTokenCacheEntry = {
  accessToken: string;
  expiresAt: number;
};

const accessTokenCache = new Map<string, AccessTokenCacheEntry>();

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function normalizeMultilineValue(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function parseServiceAccountJson(value: string): ServiceAccountCredentials | null {
  try {
    const parsed = JSON.parse(value) as Partial<ServiceAccountCredentials>;
    if (
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string"
    ) {
      return null;
    }

    return {
      client_email: parsed.client_email,
      private_key: normalizeMultilineValue(parsed.private_key),
      project_id: typeof parsed.project_id === "string" ? parsed.project_id : undefined,
    };
  } catch {
    return null;
  }
}

function getServiceAccountSourceLabel(source: ServiceAccountSource | null): string | null {
  if (!source) {
    return null;
  }

  switch (source) {
    case "env_json":
      return "Variavel GCS_SERVICE_ACCOUNT_JSON";
    case "env_file":
      return "Arquivo definido em GCS_SERVICE_ACCOUNT_FILE";
    case "root_file":
      return "Arquivo JSON na raiz do projeto";
    case "local_secrets_file":
      return "Arquivo .local/secrets/gcs.json";
    case "admin_ui":
      return "Configuracao salva no Admin";
    default:
      return null;
  }
}

function resolveCandidateServiceAccountFiles(): ServiceAccountFileCandidate[] {
  const configuredPath = process.env.GCS_SERVICE_ACCOUNT_FILE?.trim();
  const candidates: ServiceAccountFileCandidate[] = [];

  if (configuredPath) {
    candidates.push({
      source: "env_file",
      path: resolve(process.cwd(), configuredPath),
    });
  }

  candidates.push(
    {
      source: "root_file",
      path: resolve(process.cwd(), "focus-copilot-430220-a8-9affb0c35e8a.json"),
    },
    {
      source: "local_secrets_file",
      path: resolve(process.cwd(), ".local/secrets/gcs.json"),
    },
  );

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) {
      return false;
    }
    seen.add(candidate.path);
    return true;
  });
}

function readServiceAccountJsonFromFile(): ServiceAccountInput {
  const candidates = resolveCandidateServiceAccountFiles();

  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) {
      continue;
    }

    return {
      json: readFileSync(candidate.path, "utf8"),
      source: candidate.source,
      filePath: candidate.path,
      checkedFilePaths: candidates.map((entry) => entry.path),
    };
  }

  return {
    json: "",
    source: null,
    filePath: null,
    checkedFilePaths: candidates.map((entry) => entry.path),
  };
}

function resolveServiceAccountInput(savedJson: string | null | undefined): ServiceAccountInput {
  const envJson = process.env.GCS_SERVICE_ACCOUNT_JSON?.trim();
  if (envJson) {
    return {
      json: envJson,
      source: "env_json",
      filePath: null,
      checkedFilePaths: resolveCandidateServiceAccountFiles().map((entry) => entry.path),
    };
  }

  const fileResult = readServiceAccountJsonFromFile();
  if (fileResult.json.trim()) {
    return {
      ...fileResult,
      json: fileResult.json.trim(),
    };
  }

  const adminJson = savedJson?.trim() ?? "";
  if (adminJson) {
    return {
      json: adminJson,
      source: "admin_ui",
      filePath: null,
      checkedFilePaths: fileResult.checkedFilePaths,
    };
  }

  return fileResult;
}

export async function resolveGcsConfig(): Promise<ResolvedGcsConfig | null> {
  const settings = await storage.getAppSettings();
  const bucketName =
    process.env.GCS_BUCKET_NAME?.trim() || settings?.gcsBucketName?.trim() || "";
  const serviceAccountInput = resolveServiceAccountInput(settings?.gcsServiceAccountJson);
  const serviceAccountJson = serviceAccountInput.json;

  if (!bucketName || !serviceAccountJson) {
    return null;
  }

  const credentials = parseServiceAccountJson(serviceAccountJson);
  if (!credentials) {
    throw new Error("GCS service account JSON invalido.");
  }

  return {
    bucketName,
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    projectId: credentials.project_id ?? null,
  };
}

export async function getGcsConfigSummary(): Promise<{
  configured: boolean;
  bucketName: string | null;
  clientEmail: string | null;
  projectId: string | null;
  source: ServiceAccountSource | null;
  sourceLabel: string | null;
  filePath: string | null;
  checkedFilePaths: string[];
  reason: string | null;
  message: string | null;
}> {
  const settings = await storage.getAppSettings();
  const bucketName =
    process.env.GCS_BUCKET_NAME?.trim() || settings?.gcsBucketName?.trim() || "";
  const serviceAccountInput = resolveServiceAccountInput(settings?.gcsServiceAccountJson);
  const serviceAccountJson = serviceAccountInput.json;

  if (!bucketName) {
    return {
      configured: false,
      bucketName: null,
      clientEmail: null,
      projectId: null,
      source: serviceAccountInput.source,
      sourceLabel: getServiceAccountSourceLabel(serviceAccountInput.source),
      filePath: serviceAccountInput.filePath,
      checkedFilePaths: serviceAccountInput.checkedFilePaths,
      reason: "missing_bucket",
      message: "GCS_BUCKET_NAME nao foi definido no servidor.",
    };
  }

  if (!serviceAccountJson) {
    return {
      configured: false,
      bucketName,
      clientEmail: null,
      projectId: null,
      source: null,
      sourceLabel: null,
      filePath: null,
      checkedFilePaths: serviceAccountInput.checkedFilePaths,
      reason: "missing_service_account",
      message: "Nenhuma chave JSON de service account foi encontrada pelo backend.",
    };
  }

  const credentials = parseServiceAccountJson(serviceAccountJson);
  if (!credentials) {
    return {
      configured: false,
      bucketName,
      clientEmail: null,
      projectId: null,
      source: serviceAccountInput.source,
      sourceLabel: getServiceAccountSourceLabel(serviceAccountInput.source),
      filePath: serviceAccountInput.filePath,
      checkedFilePaths: serviceAccountInput.checkedFilePaths,
      reason: "invalid_service_account_json",
      message: "A chave JSON encontrada nao e uma service account valida.",
    };
  }

  return {
    configured: true,
    bucketName,
    clientEmail: credentials.client_email,
    projectId: credentials.project_id ?? null,
    source: serviceAccountInput.source,
    sourceLabel: getServiceAccountSourceLabel(serviceAccountInput.source),
    filePath: serviceAccountInput.filePath,
    checkedFilePaths: serviceAccountInput.checkedFilePaths,
    reason: null,
    message: null,
  };
}

async function getGcsAccessToken(config: ResolvedGcsConfig): Promise<string> {
  const cacheKey = `${config.clientEmail}:${config.bucketName}`;
  const cached = accessTokenCache.get(cacheKey);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (cached && cached.expiresAt > nowSeconds + 60) {
    return cached.accessToken;
  }

  const header = encodeBase64Url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );
  const claims = encodeBase64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      aud: "https://oauth2.googleapis.com/token",
      exp: nowSeconds + 3600,
      iat: nowSeconds,
    }),
  );
  const unsignedToken = `${header}.${claims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(config.privateKey, "base64url");

  const assertion = `${unsignedToken}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body: any = await response.json();
  if (!response.ok || !body?.access_token) {
    throw new Error("Falha ao autenticar no Google Cloud Storage.");
  }

  const accessToken = String(body.access_token);
  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 3600;

  accessTokenCache.set(cacheKey, {
    accessToken,
    expiresAt: nowSeconds + expiresIn,
  });

  return accessToken;
}

function sanitizeFileName(value: string): string {
  const lastSegment = value.split(/[/\\]/).pop() ?? "arquivo";
  const sanitized = lastSegment.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-+|-+$/g, "") || "arquivo";
}

export function sanitizePathPrefix(value: string): string {
  return value
    .split("/")
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9._-]+/g, "-"))
    .filter((segment) => segment.length > 0)
    .join("/");
}

export function buildStorageObjectPath(options: {
  tenantId: number;
  fileName: string;
  linkId?: number | null;
  pathPrefix?: string;
}) {
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");
  const baseFileName = sanitizeFileName(options.fileName);
  const uniqueName = `${crypto.randomUUID()}-${baseFileName}`;
  const pathSegments = [`tenant-${options.tenantId}`];

  if (options.linkId) {
    pathSegments.push("public-links", String(options.linkId));
  } else {
    pathSegments.push("manual");
  }

  const customPrefix = sanitizePathPrefix(options.pathPrefix ?? "");
  if (customPrefix) {
    pathSegments.push(customPrefix);
  }

  pathSegments.push(datePath, uniqueName);
  return pathSegments.join("/");
}

export async function uploadBufferToGcs(options: {
  objectPath: string;
  buffer: Buffer;
  contentType: string;
}) {
  const config = await resolveGcsConfig();
  if (!config) {
    throw new Error("Google Cloud Storage nao configurado.");
  }

  const accessToken = await getGcsAccessToken(config);
  const response = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
      config.bucketName,
    )}/o?uploadType=media&name=${encodeURIComponent(options.objectPath)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": options.contentType,
        "Content-Length": String(options.buffer.byteLength),
      },
      body: options.buffer,
    },
  );

  const bodyText = await response.text();
  let body: any = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(
      typeof body?.error?.message === "string"
        ? body.error.message
        : "Falha ao enviar arquivo para o Google Cloud Storage.",
    );
  }

  return {
    bucketName: config.bucketName,
    objectPath: typeof body?.name === "string" ? body.name : options.objectPath,
    sizeBytes:
      typeof body?.size === "string" ? Number.parseInt(body.size, 10) : options.buffer.byteLength,
    contentType:
      typeof body?.contentType === "string" ? body.contentType : options.contentType,
    projectId: config.projectId,
  };
}

export async function downloadObjectFromGcs(options: {
  bucketName: string;
  objectPath: string;
}): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const config = await resolveGcsConfig();
  if (!config) {
    throw new Error("Google Cloud Storage nao configurado.");
  }

  const accessToken = await getGcsAccessToken(config);
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
      options.bucketName,
    )}/o/${encodeURIComponent(options.objectPath)}?alt=media`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Falha ao ler arquivo do Google Cloud Storage.");
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type")?.trim() || "application/octet-stream",
  };
}

export function getGcsObjectHttpUrl(bucketName: string, objectPath: string): string {
  return `https://storage.googleapis.com/${bucketName}/${objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function getGcsObjectGsUri(bucketName: string, objectPath: string): string {
  return `gs://${bucketName}/${objectPath}`;
}
