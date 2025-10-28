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