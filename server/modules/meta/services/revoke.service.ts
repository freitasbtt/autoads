import { GRAPH_BASE_URL } from "../constants";

export type MetaTokenRevocationResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function revokeMetaAccessToken(options: {
  accessToken: string;
  appSecretProof: string;
}): Promise<MetaTokenRevocationResult> {
  const url = new URL(`${GRAPH_BASE_URL}/me/permissions`);
  url.searchParams.set("access_token", options.accessToken);
  url.searchParams.set("appsecret_proof", options.appSecretProof);

  let response: globalThis.Response;
  try {
    response = await fetch(url, { method: "DELETE" });
  } catch (networkError) {
    return {
      ok: false,
      status: 0,
      body: { message: `Network error while revoking Meta token: ${String(networkError)}` },
    };
  }

  const text = await response.text();
  let body: unknown = {};
  try {
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  const bodyObject = body as { error?: unknown };
  const ok = response.ok && !bodyObject?.error;

  return { ok, status: response.status, body };
}
