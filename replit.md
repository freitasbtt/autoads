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

### n8n Webhook Integration
- **Auto-send on Campaign Creation**: Webhook automatically triggered when creating new campaigns
- **Manual Resend**: "Send to n8n" button in campaigns list for reprocessing
- **Payload Format**: Matches n8n expected schema with all resource IDs (campaign_id, page_id, instagram_user_id, whatsapp_number_id, drive_folder_id, leadgen_form_id, etc.)
- **Error Handling**: Webhook failures logged but don't block campaign creation
- **Configuration**: Webhook URL set via Admin > Configurações

### Campaign Form Enhancements
- **Resource Selectors**: Dynamic dropdowns populated from OAuth-imported resources
- **Complete Payload**: All fields (title, message, driveFolderId) included in submissions
- **Form State Management**: Controlled inputs with proper state binding

## How to Test OAuth Flow

### Prerequisites
1. Configure OAuth credentials in Admin page (accessible only to admin users)
2. For Meta: Set Meta App ID and Secret
3. For Google: Set Google Client ID and Secret
4. For n8n: Set Webhook URL

### Testing Meta OAuth
1. Navigate to "Recursos" page
2. Click "Conectar com Meta" button
3. You'll be redirected to Meta's OAuth login
4. After authorization, you'll return to the app
5. Resources will be auto-imported (check Recursos page for new accounts, pages, etc.)

### Testing Google Drive OAuth
1. Navigate to "Integrações" page
2. Click "Conectar OAuth" under Google Drive section
3. Authorize access to Google Drive
4. Tokens will be stored securely

### Testing Campaign Creation with Webhook
1. Create a new campaign using "Nova Campanha"
2. Fill in all required fields
3. Select OAuth-imported resources from dropdowns
4. Click "Criar Campanha"
5. Campaign is created AND webhook is sent to n8n automatically
6. Check n8n for webhook receipt

### Testing Manual Webhook Resend
1. Go to "Campanhas" page
2. Find an existing campaign
3. Click the "Send" icon (paper plane) button
4. Webhook will be resent to n8n
5. Toast notification confirms success/failure

## Important Notes
- **OAuth Callback URLs**: Make sure to configure your Meta App and Google Cloud Project with the correct callback URLs:
  - Meta: `https://your-domain.replit.app/auth/meta/callback`
  - Google: `https://your-domain.replit.app/auth/google/callback`
- **Permissions**: Meta App needs permissions for: ads_management, pages_show_list, instagram_basic, whatsapp_business_management, leads_retrieval
- **Google Scopes**: Drive API requires: https://www.googleapis.com/auth/drive.readonly