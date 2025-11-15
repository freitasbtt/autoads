## Architecture Overview

This document maps the current structure after introducing the Meta and Storage modules and now the dedicated **Resources** router.

```
/
├─ client/                 # React app (feature-first)
├─ server/
│  ├─ modules/
│  │  ├─ auth/
│  │  ├─ meta/             # Graph API client + dashboard services
│  │  ├─ resources/
│  │  │   └─ routes.ts     # CRUD de `/api/resources`
│  │  ├─ audiences/
│  │  │   └─ routes.ts     # CRUD de `/api/audiences`
│  │  ├─ campaigns/
│  │  │   └─ routes.ts     # CRUD + `/api/webhooks/n8n*`
│  │  ├─ integrations/
│  │  │   └─ routes.ts     # CRUD de `/api/integrations`
│  │  └─ storage/          # Persistence abstractions (memory/db)
│  ├─ middlewares/
│  ├─ routes.ts            # Registers routers/middlewares only
│  └─ index.ts             # Express bootstrap
├─ shared/                 # Drizzle schema + shared types
└─ docs/                   # Architecture notes
```

## Frontend

- **Features (`client/src/features`)** house pages, hooks and APIs per domain.  
- **Shared (`client/src/shared`)** contains reusable UI/utilities.  
- **App (`client/src/app`)** wires routing and global providers.

To create or locate a feature:
1. Go to `client/src/features/<feature>/`.
2. Use subfolders like `components/`, `pages/`, `hooks/`, `api/`, `types.ts`.
3. Export through an `index.ts` for clean imports (`import { CampaignsPage } from "@/features/campaigns"`).

## Backend

### Layers
- `server/modules`: domain logic (controllers/services/routes/repositories).
- `server/middlewares`: authentication, validation, cross-cutting pieces.
- `server/routes.ts`: composes routers and shared middleware.

### Highlighted modules

**Meta (`server/modules/meta`)**
- `client.ts`: `MetaGraphClient` and `MetaApiError`.
- `services/dashboard.service.ts`: `fetchMetaDashboardMetrics`.
- `constants.ts`, `types.ts`, `utils/`: action/objective mapping and aggregation helpers.

**Storage (`server/modules/storage`)**
- `types.ts`: `IStorage`, filter definitions and shared exports.
- `memory.storage.ts`: in-memory implementation for tests/dev.
- `db.storage.ts`: Drizzle/Postgres implementation.
- `index.ts`: exposes the correct `storage` singleton.

**Resources (`server/modules/resources`)**
- `routes.ts`: encapsulates all `/api/resources` endpoints (list, filter by type, create, update, delete) behind a dedicated router wired in `server/routes.ts`.
  - This keeps the base router lean and makes it easier to evolve resource-specific policies or middlewares.

**Audiences (`server/modules/audiences`)**
- `routes.ts`: concentra o CRUD completo de `/api/audiences`, aplicando `isAuthenticated` e verificações de tenant em um único lugar. Ideal para evoluir regras de validação ou rate-limits sem tocar no router principal.

**Campaigns (`server/modules/campaigns`)**
- `routes.ts`: expõe o CRUD de `/api/campaigns`, o envio manual de campanhas para o n8n e os webhooks (`/api/webhooks/n8n` e `/api/webhooks/n8n/status`). Internamente mantém helpers de objetivos/segmentação que antes viviam em `server/routes.ts`.

**Integrations (`server/modules/integrations`)**
- `routes.ts`: controla todas as operações de `/api/integrations` (listar, buscar por provider, criar/atualizar, deletar), reaplicando as regras de tenant. Se novas integrações ou provedores surgirem, basta estender esse módulo.

### Auth / Roles
- `server/modules/auth/services/role.service.ts`: role helpers (`isAdminRole`, `isSystemAdminRole`, `ADMIN_ROLES`).
- `server/middlewares/auth.ts`: HTTP-level guards (`isAuthenticated`, `isAdmin`, etc.).

## Responsibility Cheat Sheet

| Need                                   | Where to look                                           |
|----------------------------------------|---------------------------------------------------------|
| Dashboard / Meta metrics               | `server/modules/meta/**`                                |
| Persistence or DB tweaks               | `server/modules/storage/**`                             |
| Resource CRUD endpoints                | `server/modules/resources/routes.ts`                    |
| Audience CRUD endpoints                | `server/modules/audiences/routes.ts`                    |
| Campaign CRUD & n8n webhooks           | `server/modules/campaigns/routes.ts`                    |
| Integration CRUD                       | `server/modules/integrations/routes.ts`                 |
| Auth / RBAC helpers                    | `server/modules/auth/services/role.service.ts`          |
| New frontend feature                   | `client/src/features/<feature>/`                        |
| Shared UI elements                     | `client/src/shared/components/`                         |

## Next recommendations
1. Continue extracting other API domains (audiences, campaigns, integrations) into routers under `server/modules/<feature>/`.
2. Migrate the remaining legacy pages under `client/src/pages` into the feature-first structure.
3. Keep this document updated whenever a new module or convention is introduced.
