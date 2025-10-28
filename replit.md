# Meta Ads Campaign Management Platform

## Overview

A multi-tenant Meta Ads campaign management platform that enables users to create, manage, and monitor advertising campaigns across Meta's platforms (Facebook, Instagram, WhatsApp). The application provides a guided onboarding experience for connecting external services, a comprehensive dashboard for campaign analytics, and automated workflows for campaign creation and management.

The platform is designed as an enterprise productivity application with a focus on data-dense interfaces, efficient workflows for repetitive tasks, and progressive disclosure of complexity.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool

**UI Component Library**: Shadcn UI (built on Radix UI primitives)
- Component-based architecture with reusable UI elements
- Custom design system following Microsoft Fluent Design principles
- Tailwind CSS for styling with custom color tokens and spacing primitives

**State Management**: 
- TanStack Query (React Query) for server state and API data fetching
- Local React state for UI-specific state management
- No global state management library (Redux/Zustand) - intentionally lightweight

**Routing**: Wouter for client-side routing
- Lightweight alternative to React Router
- File-based route structure with dedicated page components

**Design Philosophy**:
- Clarity over decoration with functional-first approach
- Efficient workflows minimizing clicks for repetitive tasks
- Progressive disclosure of complexity
- Consistent patterns across the application
- Typography using Inter (primary) and JetBrains Mono (monospace) fonts

**Key UI Patterns**:
- Sidebar navigation with collapsible states
- Modal dialogs for forms and confirmations
- Card-based layouts for resource display
- Status badges for connection states
- KPI cards for metrics visualization

### Backend Architecture

**Runtime**: Node.js with Express.js framework

**Language**: TypeScript with ES modules

**API Design**: RESTful architecture
- Session-based authentication with Passport.js (LocalStrategy)
- Express middleware for request logging and JSON parsing
- Structured logging with request/response tracking

**Authentication & Authorization**:
- JWT-based sessions stored in memory (MemoryStore)
- Passport.js for authentication strategy
- bcrypt for password hashing
- Multi-tenant architecture with role-based access control (RBAC)
- Roles: admin, manager, user

**Data Layer Pattern**:
- Repository pattern with IStorage interface abstraction
- Clean separation between storage interface and implementation
- Supports multiple storage backends through interface

**Build & Development**:
- tsx for TypeScript execution in development
- esbuild for production bundling
- Vite dev server with HMR for frontend development
- Custom Vite plugins for Replit integration (cartographer, dev-banner, error overlay)

### Data Storage Solutions

**Database**: PostgreSQL (via Neon serverless)

**ORM**: Drizzle ORM with Neon serverless driver
- Type-safe database queries
- Schema-first approach with migration support
- WebSocket connection pooling for serverless environment

**Schema Design** (Multi-tenant with Row-Level Security):

1. **Tenants Table**: Core multi-tenancy isolation
   - Primary key: serial id
   - Tenant name and creation timestamp

2. **Users Table**: Authentication and user management
   - Foreign key to tenants (tenant_id)
   - Email/password authentication
   - Role field for RBAC (admin, manager, user)

3. **Resources Table**: Meta Ads platform resources
   - Types: account, page, instagram, whatsapp, leadform, website
   - Stores platform-specific IDs and configuration
   - Tenant-scoped via tenant_id

4. **Audiences Table**: Target audience definitions
   - Custom audience segments
   - Tenant-scoped for data isolation

5. **Campaigns Table**: Campaign metadata and tracking
   - Campaign configuration and status
   - Links to audiences and resources
   - Tenant-scoped

6. **Integrations Table**: External service credentials
   - Encrypted credential storage (credentials_json field)
   - Integration types: Meta, WhatsApp, Google Drive
   - Tenant-scoped secure storage

7. **Automations Table**: Workflow automation definitions
   - n8n workflow integration
   - Event-driven automation triggers

**Data Isolation Strategy**:
- Row-Level Security (RLS) enforced at database level using tenant_id
- All queries scoped to authenticated user's tenant
- Prevents cross-tenant data access

### External Dependencies

**Meta Business Platform**:
- Meta Marketing API for ad account management
- OAuth 2.0 or System User token authentication
- Resources managed: Ad Accounts, Pages, Instagram Business Accounts
- Endpoints: Graph API v17.0+

**WhatsApp Cloud API**:
- WhatsApp Business API integration
- Phone number ID and WABA ID configuration
- Message template management
- Webhook support for message events

**Google Drive API**:
- OAuth 2.0 authentication flow
- Creative asset storage and management
- Folder-based organization (configurable drive_folder_id)
- Automatic subfolder creation for campaign assets

**n8n Workflow Automation**:
- Webhook-based event triggering
- Callback mechanism for workflow completion
- Idempotency support via X-Idempotency-Key headers
- Campaign creation and management automation

**Observability & Monitoring**:
- Structured logging with timestamp and source tracking
- Request/response logging for API endpoints
- Duration tracking for performance monitoring
- Audit trail for integration connections (without exposing secrets)

**Onboarding Flow**:
- Three-step wizard: Meta → WhatsApp → Google Drive
- Connection testing endpoints for each service
- Status visualization (green/yellow/red indicators)
- Credential validation before storage
- Re-test functionality for troubleshooting

**Security Considerations**:
- Credentials encrypted at rest in database
- No secrets in logs or client responses
- Session-based authentication with secure cookie handling
- CORS and credential inclusion for API requests
- Raw body preservation for webhook signature verification
- Multi-tenant isolation enforced at API route level (prevents cross-tenant data access)
- TenantId cannot be overridden by client requests
- All update/delete operations verify tenant ownership before execution

## Recent Changes

### OAuth Integration Implementation (October 28, 2025)

**OAuth Meta Flow Complete**:
- Implemented `/auth/meta` and `/auth/meta/callback` routes
- Auto-fetch resources via Meta Graph API: ad accounts, pages, Instagram accounts
- Security: `appsecret_proof` using HMAC SHA-256 for all Graph API calls
- Auto-save fetched resources to database with tenant isolation
- Frontend: "Conectar com Meta" button on Resources page
- Success toast notification after OAuth callback

**OAuth Google Drive Flow Complete**:
- Implemented `/auth/google` and `/auth/google/callback` routes
- Token exchange with offline access (refresh token)
- Save access/refresh tokens to integrations table
- Frontend: "Conectar OAuth" button on Integrations page
- Success toast notification after OAuth callback

**Admin Configuration Page**:
- Created `/admin` page (admin-only access via role='admin')
- Configure Meta App ID/Secret, Google Client ID/Secret, n8n webhook URL
- Server-side validation with isAdmin middleware
- Credentials masked in API responses (never expose secrets)
- Created `app_settings` table schema

**Schema Updates**:
- Added `app_settings` table: stores OAuth credentials and n8n webhook URL
- Fields: metaAppId, metaAppSecret, googleClientId, googleClientSecret, n8nWebhookUrl

**Security Enhancements**:
- OAuth state parameter validation (prevents CSRF attacks)
- appsecret_proof for Meta API calls (required for secure API access)
- Credentials stored encrypted (config JSONB field in integrations table)
- Admin-only routes protected by RBAC middleware

### Backend Implementation (October 27, 2025)

**Complete RESTful API Implementation**:
- Implemented full authentication system with register, login, logout, and session management
- Created CRUD endpoints for all entities: Resources, Audiences, Campaigns, Integrations
- Added multi-tenant security enforcement across all routes

**API Endpoints**:

*Authentication Routes*:
- POST /api/auth/register - Register new user and create tenant
- POST /api/auth/login - Authenticate user with email/password
- POST /api/auth/logout - Destroy user session
- GET /api/auth/me - Get authenticated user info

*Resource Routes* (Meta Ads platform resources):
- GET /api/resources - List all resources for tenant
- GET /api/resources/:type - Filter resources by type (account, page, instagram, whatsapp, leadform, website)
- POST /api/resources - Create new resource
- PATCH /api/resources/:id - Update resource (tenant-scoped)
- DELETE /api/resources/:id - Delete resource (tenant-scoped)

*Audience Routes* (Target audience management):
- GET /api/audiences - List all audiences for tenant
- GET /api/audiences/:id - Get single audience (tenant-scoped)
- POST /api/audiences - Create new audience with geolocation targeting
- PATCH /api/audiences/:id - Update audience (tenant-scoped)
- DELETE /api/audiences/:id - Delete audience (tenant-scoped)

*Campaign Routes* (Campaign management):
- GET /api/campaigns - List all campaigns for tenant
- GET /api/campaigns/:id - Get single campaign (tenant-scoped)
- POST /api/campaigns - Create new campaign with validation
- PATCH /api/campaigns/:id - Update campaign status/config (tenant-scoped)
- DELETE /api/campaigns/:id - Delete campaign (tenant-scoped)

*Integration Routes* (External service connections):
- GET /api/integrations - List all integrations for tenant
- GET /api/integrations/:provider - Get integration by provider name
- POST /api/integrations - Create or update integration
- DELETE /api/integrations/:id - Delete integration (tenant-scoped)

**Database Schema**:
- All tables successfully migrated to PostgreSQL
- 7 tables: tenants, users, resources, audiences, campaigns, integrations, automations
- Multi-tenant architecture with tenant_id foreign keys
- Auto-incrementing serial IDs for all entities

**Security Enhancements**:
- Registration endpoint validates only email/password/tenantName (tenantId generated server-side)
- All GET/UPDATE/DELETE routes verify tenant ownership before operation
- Client cannot override tenantId in request bodies
- Password hashing with bcrypt (10 rounds)
- Session-based authentication with MemoryStore

**Testing Status**:
- ✅ End-to-end API tests passing for all CRUD operations
- ✅ Multi-tenant isolation verified (401 unauthorized after logout)
- ✅ Registration and authentication flow tested successfully

### Frontend-Backend Integration (October 27, 2025)

**Complete CRUD Implementation**:
- All frontend pages now fully connected to backend API
- React Query (TanStack Query) used for data fetching and mutations
- All insert schemas correctly omit tenantId (server-side injection)
- Field naming consistency between frontend forms and backend validation

**Schema Corrections**:
- Resources: Field `value` (not platformId) for storing platform-specific IDs
- Audiences: Fields `type` and `locations` (not geolocations) - locations as string array
- Integrations: Field `config` (not credentialsJson) for credential storage
- All schemas use correct field names matching database columns

**Frontend Pages Implementation**:
1. **Resources Page** (client/src/pages/Resources.tsx):
   - Create, list, and delete resources by type
   - Tab-based filtering by resource type
   - Dialog form for resource creation
   - Success toasts and optimistic UI updates

2. **Audiences Page** (client/src/pages/Audiences.tsx):
   - Create, list, and delete audiences
   - Age range, interests, behaviors, and location targeting
   - Card-based layout with badge displays
   - Multi-line location input (newline-separated)

3. **Campaigns Page** (client/src/pages/Campaigns.tsx):
   - List campaigns with status toggle
   - Pause/activate campaign functionality
   - Delete campaigns
   - Status indicators and objective badges

4. **Integrations Page** (client/src/pages/Integrations.tsx):
   - Configure Meta Ads API credentials
   - Configure Google Drive API credentials
   - Status badges showing connection state
   - Dialog forms for credential entry
   - Masked credential display for security

**Data Flow**:
- Frontend forms → apiRequest helper → Backend routes → Zod validation → Storage layer → Database
- tenantId injected server-side from authenticated session
- Multi-tenant isolation enforced at every layer
- Cache invalidation via queryClient after mutations

**End-to-End Testing**:
- ✅ Full CRUD workflow tested for all entities
- ✅ Registration and login flow working
- ✅ Resources create/delete verified
- ✅ Audiences create/delete verified
- ✅ Integrations create verified
- ✅ UI state updates confirmed (toasts, badges, lists)
- ✅ API responses validated