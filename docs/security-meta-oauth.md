# Meta OAuth Security

This document explains how Meta OAuth tokens are protected in this system and
how internal workflows (like n8n) should access them safely.

## Threat model (plain language)
- If someone steals a raw access token, they can call the Meta API without
  logging in.
- If someone steals the database, they should NOT be able to use tokens because
  tokens are stored encrypted.
- If someone steals the App Secret, they can generate proofs and use tokens.

The goal is to keep tokens safe at rest and make stolen tokens unusable.

## Security controls in this codebase

### 1) OAuth state anti-CSRF
- A random `state` is generated and stored in the session before redirecting to
  Meta.
- The callback validates that `state` matches before exchanging the code.
- This blocks login-forgery/CSRF attacks.
- The code-to-token exchange is sent as `POST` form data, so `client_secret`
  does not travel in the URL query string.

### 2) App Secret stored in ENV (not DB)
- The Meta App Secret is read from `META_APP_SECRET` (environment variable).
- This keeps the secret out of the database and reduces blast radius.
- The admin UI will show "***configured***" if the secret exists in ENV.

### 3) appsecret_proof required for Graph API
- Every Graph API call includes `appsecret_proof` (HMAC-SHA256 of the token with
  the App Secret).
- With "Require App Secret" enabled in the Meta app, a stolen token is useless
  without the App Secret.

### 4) Token encryption at rest
- Access tokens are encrypted in the DB using `META_TOKEN_ENC_KEY`.
- Decryption happens only on the server.
- Sensitive app settings stored in `app_settings` (`metaAppSecret`,
  `googleClientSecret`, `gcsServiceAccountJson`) are also encrypted at rest.
- `APP_SETTINGS_ENC_KEY` is preferred for these settings; if absent, the server
  falls back to `META_TOKEN_ENC_KEY`.

### 5) Token expiration enforced
- The OAuth response `expires_in` is stored and converted to `expiresAt`.
- If a token is expired, the server refuses to use it.
- Result: integrations must be re-authorized after expiry.

### 6) Revocation on disconnect
- When disconnecting an integration, the server calls `DELETE /me/permissions`
  to revoke the token in Meta, then deletes the integration locally.

### 7) Internal API protection
- `/internal/meta/token` requires `x-internal-api-secret` which must match
  `INTERNAL_API_SECRET` in ENV.
- The secret is accepted only via header, never via query string.
- This endpoint returns `accessToken`, `appSecretProof`, and `expiresAt` only if
  the token is valid and not expired.
- Responses from this endpoint are marked `no-store` to avoid cache leakage.
- `/api/webhooks/n8n/status` also requires the same `x-internal-api-secret`
  header and rejects unauthenticated status updates.

### 8) Integration API response hygiene
- `/api/integrations` and `/api/integrations/:provider` return only safe
  metadata summaries to the frontend.
- Raw `accessToken`, `refreshToken`, encrypted token blobs, and secret material
  must never be returned in browser responses.

### 9) API logging hygiene
- API request logs include operational metadata only: method, path, status,
  duration, and `request_id`.
- JSON response bodies must not be logged because they may contain secrets,
  tokens, or user data.

### 10) Rate limiting on exposed routes
- `/api/auth/login` is rate-limited to slow brute-force attempts.
- `/internal/meta/token` is rate-limited per IP and tenant.
- `/api/webhooks/n8n/status` is rate-limited to reduce abuse or accidental
  loops.
- `/api/public/storage/upload-links/:publicId/files` and
  `/api/public/task-assets/:token` are rate-limited to contain flood traffic.
- When a limit is exceeded, the API responds with `429` and `Retry-After`.

## Environment variables
- `META_APP_SECRET` (required in production) - Meta App Secret used to generate
  `appsecret_proof`.
- `META_TOKEN_ENC_KEY` (required in production) - 32-byte key for token
  encryption.
- `APP_SETTINGS_ENC_KEY` (recommended) - 32-byte key dedicated to encrypt
  secrets persisted in `app_settings`.
- `INTERNAL_API_SECRET` (required) - protects internal endpoints (n8n access).
- `PUBLIC_APP_URL` - used for OAuth redirect URLs.

## n8n usage (safe pattern)

1) Get token + proof from the backend:

```
GET https://YOUR_DOMAIN/internal/meta/token?tenant_id=123
Header: x-internal-api-secret: YOUR_INTERNAL_API_SECRET
```

3) When n8n calls back into the app webhook:

```
POST https://YOUR_DOMAIN/api/webhooks/n8n/status
Header: x-internal-api-secret: YOUR_INTERNAL_API_SECRET
```

4) Use the returned values in Graph calls:

```
https://graph.facebook.com/v24.0/...?
  access_token={{$json.accessToken}}&
  appsecret_proof={{$json.appSecretProof}}
```

Notes:
- Do NOT store tokens in n8n.
- Disable "Save Execution Data" for flows that handle tokens.

## Operational checklist
- Enable "Require App Secret" in Meta app settings.
- Use HTTPS for all OAuth and internal endpoints.
- Keep secrets out of logs and client responses.
- Rotate `INTERNAL_API_SECRET` and `META_APP_SECRET` if compromised.
