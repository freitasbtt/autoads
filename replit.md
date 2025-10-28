# Meta Ads Campaign Management Platform

## Overview
A multi-tenant Meta Ads campaign management platform for creating, managing, and monitoring advertising campaigns across Meta's platforms (Facebook, Instagram, WhatsApp). It provides a guided onboarding experience, a comprehensive dashboard for analytics, and automated workflows. The platform is designed as an enterprise productivity application focusing on data-dense interfaces, efficient workflows, and progressive disclosure of complexity.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript using Vite.
- **UI**: Shadcn UI (Radix UI) with Tailwind CSS, custom design system adhering to Microsoft Fluent Design.
- **State Management**: TanStack Query for server state, local React state for UI. No global state management library.
- **Routing**: Wouter for client-side routing with a file-based structure.
- **Design Philosophy**: Clarity, functional-first approach, efficient workflows, progressive disclosure, consistent patterns.
- **Typography**: Inter (primary) and JetBrains Mono (monospace).
- **Key UI Patterns**: Sidebar navigation, modal dialogs, card-based layouts, status badges, KPI cards.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful architecture with session-based authentication (Passport.js) and structured logging.
- **Authentication & Authorization**: JWT-based sessions, bcrypt for password hashing, multi-tenant RBAC (admin, manager, user).
- **Data Layer**: Repository pattern with `IStorage` interface abstraction.
- **Build & Development**: `tsx` for dev, `esbuild` for production, Vite dev server with HMR.

### Data Storage Solutions
- **Database**: PostgreSQL (via Neon serverless).
- **ORM**: Drizzle ORM with Neon serverless driver for type-safe queries and schema-first migrations.
- **Schema Design** (Multi-tenant with Row-Level Security):
    - **Tenants**: Core multi-tenancy isolation.
    - **Users**: Authentication, user management, RBAC.
    - **Resources**: Meta Ads platform resources (accounts, pages, etc.), tenant-scoped.
    - **Audiences**: Custom audience definitions, tenant-scoped.
    - **Campaigns**: Campaign metadata and configuration, tenant-scoped.
    - **Integrations**: Encrypted external service credentials (Meta, WhatsApp, Google Drive), tenant-scoped.
    - **Automations**: n8n workflow definitions.
- **Data Isolation**: Row-Level Security (RLS) enforced via `tenant_id` at the database level.

### Security Considerations
- Credentials encrypted at rest.
- No secrets in logs or client responses.
- Session-based authentication with secure cookie handling.
- CORS and credential inclusion.
- Raw body preservation for webhook signature verification.
- Multi-tenant isolation at API route level; `tenantId` cannot be overridden by clients.
- All update/delete operations verify tenant ownership.

## External Dependencies
- **Meta Business Platform**: Meta Marketing API (Graph API v17.0+) for ad account, page, and Instagram Business Account management, using OAuth 2.0 or System User tokens.
- **WhatsApp Cloud API**: Integration for messaging, template management, and webhooks.
- **Google Drive API**: OAuth 2.0 for creative asset storage and management, including folder organization.
- **n8n Workflow Automation**: Webhook-based event triggering and callback mechanisms for workflow completion.

## Recent Updates (October 28, 2025)

### OAuth & Resource Management
- **OAuth Meta Flow**: Complete integration with automatic resource fetching (accounts, pages, Instagram, WhatsApp, lead forms)
- **OAuth Google Drive**: Token management for Drive folder access
- **Admin Configuration**: Secure credential storage for Meta App ID/Secret, Google Client ID/Secret
- **Resource Auto-Import**: Resources automatically populated after OAuth login
- **Security**: appsecret_proof for Meta API calls, CSRF protection, multi-tenant isolation

### n8n Webhook Integration & Campaign Status System
- **Auto-send on Campaign Creation**: Webhook automatically triggered when creating new campaigns (via POST `/api/campaigns`)
  - Campaign status set to `pending` when webhook sent successfully
  - Status shown as "Processando" with loading spinner in UI
- **Manual Resend**: "Send to n8n" button in campaigns list for reprocessing (via POST `/api/campaigns/:id/send-webhook`)
  - Updates campaign status to `pending` when sent
  - Allows re-processing of campaigns
- **Direct Send (Existing Campaign Form)**: POST `/api/webhooks/n8n` endpoint for sending data directly without creating a campaign
- **Status Callback from n8n**: POST `/api/webhooks/n8n/status` endpoint receives status updates from n8n
  - **Endpoint**: `POST https://YOUR-APP-URL/api/webhooks/n8n/status`
  - **Required Payload**:
    ```json
    {
      "campaign_id": "1",
      "status": "active",
      "status_detail": "Campanha criada com sucesso no Meta Ads"
    }
    ```
  - **Valid Status Values**: `active`, `error`, `paused`, `completed`
  - **Response**: `200 OK` with updated campaign data
  - **Usage in n8n**: Add HTTP Request node at end of workflow to send status update back to platform
- **Campaign Status Flow**:
  1. `draft` → Campaign created but not sent to n8n (gray)
  2. `pending` → Sent to n8n, awaiting processing (yellow, loading spinner)
  3. `active` → Confirmed active by n8n (green, checkmark icon)
  4. `error` → n8n reported an error (red, X icon)
  5. `paused` / `completed` → Final states
- **UI Features**:
  - Real-time status badges with icons
  - Status detail text shown below badge
  - Auto-refresh after webhook send
- **Payload Format**: Matches n8n expected schema with all resource IDs (campaign_id, page_id, instagram_user_id, whatsapp_number_id, drive_folder_id, leadgen_form_id, etc.)
- **Error Handling**: 
  - Webhook failures logged but don't block campaign creation
  - Returns user-friendly error if n8n webhook is not configured
  - Returns specific message if n8n webhook is in test mode and not active: "Webhook n8n não está ativo. No n8n, clique em 'Execute workflow' e tente novamente."
- **Configuration**: Webhook URL set via Admin > Configurações
- **Test Mode**: n8n test webhooks require manual activation - click "Execute workflow" button in n8n before testing

### Campaign Form Enhancements
- **Resource Selectors**: Dynamic dropdowns populated from OAuth-imported resources
- **Complete Payload**: All fields (title, message, driveFolderId) included in submissions
- **Form State Management**: Controlled inputs with proper state binding

## How to Test OAuth Flow

### Step 1: Get Your Development URL
Before configuring OAuth, you need your Replit development URL:

```bash
echo https://$REPLIT_DEV_DOMAIN
```

This will output something like: `https://abc123-xyz789.id.replit.dev`

**Use this URL for OAuth callback configuration during development.**

### Step 2: Configure OAuth Providers

#### Meta App Configuration (developers.facebook.com)
1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create or select your app
3. Go to **Settings > Basic**
4. Add **Valid OAuth Redirect URIs**:
   - Development: `https://YOUR-DEV-URL.replit.dev/auth/meta/callback`
   - Production (after publish): `https://YOUR-APP.replit.app/auth/meta/callback`
5. Add required permissions: `ads_management`, `pages_show_list`, `instagram_basic`, `whatsapp_business_management`, `leads_retrieval`
6. Copy your **App ID** and **App Secret**

#### Google Cloud Console Configuration (console.cloud.google.com)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select or create a project
3. Enable **Google Drive API**
4. Go to **APIs & Services > Credentials**
5. Create or edit OAuth 2.0 Client ID
6. Add **Authorized redirect URIs**:
   - Development: `https://YOUR-DEV-URL.replit.dev/auth/google/callback`
   - Production (after publish): `https://YOUR-APP.replit.app/auth/google/callback`
7. Add scope: `https://www.googleapis.com/auth/drive.readonly`
8. Copy your **Client ID** and **Client Secret**

### Step 3: Configure Credentials in App
1. Login as admin (`admin@test.com` / `password`)
2. Navigate to **Admin > Configurações**
3. Enter Meta App ID and Secret
4. Enter Google Client ID and Secret
5. Enter n8n Webhook URL (if using n8n)
6. Click **Save**

### Step 4: Test Meta OAuth
1. Navigate to **Integrações** page
2. Click **"Conectar OAuth"** button in Meta Ads API card
3. You'll be redirected to Facebook login
4. Login and authorize the requested permissions
5. You'll be redirected back to the app
6. Success message appears: "Conectado com sucesso!"
7. Navigate to **Recursos** page
8. Verify resources appear in tabs:
   - Contas de Anúncios
   - Páginas
   - Instagram
   - WhatsApp
   - Formulários de Leads

### Step 5: Test Google Drive OAuth
1. Navigate to **Integrações** page
2. Click **"Conectar OAuth"** button in Google Drive API card
3. You'll be redirected to Google login
4. Login and authorize Drive access
5. You'll be redirected back to the app
6. Success message appears: "Conectado com sucesso!"
7. Navigate to **Recursos** page
8. Check **Drive Folders** tab for imported folders

### Step 6: Test Campaign Creation with OAuth Resources
1. Navigate to **Campanhas** > **"Nova Campanha"**
2. Fill in campaign details
3. **Verify dropdowns are populated**:
   - Página Facebook (from Meta OAuth)
   - Instagram User ID (from Meta OAuth)
   - WhatsApp Number ID (from Meta OAuth)
   - Formulário de Leads (from Meta OAuth)
   - Pasta Google Drive (from Google OAuth)
4. Select resources and fill other fields
5. Click **"Criar Campanha"**
6. Verify:
   - Campaign created successfully
   - Webhook sent to n8n automatically
   - Redirected to campaigns list

### Step 7: Test "Adicionar a Campanha Existente"
1. Navigate to **Campanhas**
2. Click **"Adicionar a Campanha Existente"**
3. **Verify all dropdowns populate with OAuth resources**
4. Select objectives, resources, fill fields
5. Click **"Enviar para n8n"**
6. Verify webhook sent successfully

### Step 8: Test Manual Webhook Resend
1. Go to **Campanhas** page
2. Find an existing campaign
3. Click the **Send icon** (paper plane) button
4. Verify toast notification confirms success
5. Check n8n for webhook receipt

## OAuth Troubleshooting

### Issue: "Recusou estabelecer ligação" or 403 Error
**Cause**: Session not preserved during OAuth redirect
**Solution**: Already fixed - session saves `userId` and `tenantId` before redirect

### Issue: Dropdowns are empty after OAuth
**Cause**: Resources not imported or wrong resource type filters
**Solution**: 
- Check that resources were imported (go to Recursos page)
- Verify resource type filters use lowercase: `page`, `instagram`, `whatsapp`, `leadform`, `drive_folder`

### Issue: OAuth callback URL mismatch
**Cause**: Callback URL in Meta/Google doesn't match actual URL
**Solution**: 
- Verify your dev URL with `echo https://$REPLIT_DEV_DOMAIN`
- Update callback URLs in Meta App and Google Cloud Console
- Use exact URL format: `https://YOUR-URL/auth/meta/callback`

### Issue: Missing permissions
**Cause**: Meta App doesn't have required permissions
**Solution**: Add all required permissions in Meta App settings:
- `ads_management`
- `pages_show_list`
- `instagram_basic`
- `whatsapp_business_management`
- `leads_retrieval`

## Important Notes
- **Development vs Production**: You need different callback URLs for dev and production
- **Multiple Callback URLs**: You can configure multiple callback URLs in both Meta and Google
- **Token Refresh**: OAuth tokens are stored encrypted and managed automatically
- **Multi-tenant Isolation**: Each tenant has its own OAuth credentials and resources
- **Session Management**: OAuth flow uses session state to prevent CSRF and preserve authentication