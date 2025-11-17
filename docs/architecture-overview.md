## Visão Geral da Arquitetura

Este documento descreve como o backend e o frontend estão organizados depois da separação completa dos domínios HTTP em routers dedicados. O arquivo `server/routes.ts` agora cuida apenas do bootstrap do Express (passport, sessões, arquivos estáticos) e delega toda a lógica de cada área para o respectivo módulo em `server/modules`.

```
/
├─ client/                       # Aplicação React (feature-first)
├─ server/
│  ├─ modules/
│  │  ├─ admin/                  # /api/admin/** → settings, tenants e usuários
│  │  ├─ audiences/              # /api/audiences/**
│  │  ├─ auth/                   # /api/auth/** + helpers de senha/roles
│  │  ├─ campaigns/              # /api/campaigns/** + /api/webhooks/n8n*
│  │  ├─ integrations/           # /api/integrations/**
│  │  ├─ meta/                   # /api/dashboard, /api/meta/** e /internal/meta/token
│  │  ├─ oauth/                  # /auth/meta* e /auth/google*
│  │  ├─ resources/              # /api/resources/**
│  │  └─ storage/                # Abstrações de persistência (memory/db)
│  ├─ middlewares/               # Autenticação/autorização cross-cutting
│  ├─ routes.ts                  # Configurações globais + montagem dos routers
│  └─ index.ts                   # Ponto de entrada do servidor
├─ shared/                       # Schema Drizzle e tipos compartilhados
└─ docs/                         # Documentação e notas de arquitetura
```

## Frontend

- **Features (`client/src/features`)**: cada domínio da aplicação (campanhas, audiências etc.) possui componentes, páginas, hooks, APIs e tipos agrupados em uma pasta única.
- **Shared (`client/src/shared`)**: utilitários e componentes reutilizáveis (botões, inputs, helpers de data, etc.).
- **App (`client/src/app`)**: roteamento, provedores globais e bootstrap da aplicação.

Como criar ou localizar uma nova feature:
1. Navegue até `client/src/features/<feature>/`.
2. Crie subpastas como `components/`, `pages/`, `hooks/`, `api/`, `types.ts` conforme a necessidade.
3. Centralize as exportações em um `index.ts` dentro da feature para manter os imports enxutos (`import { CampaignsPage } from "@/features/campaigns"`).

## Backend

### Camadas principais

- `server/modules`: cada domínio possui seus controllers, serviços, routers e repositórios.
- `server/middlewares`: guardas HTTP como `isAuthenticated`, `isAdmin`, rate limiters, etc.
- `server/routes.ts`: inicializa passport/sessões, configura arquivos estáticos e conecta todos os routers especializados.

### Destaque dos módulos

**Meta (`server/modules/meta`)**
- `routes.ts`: concentra `/api/dashboard/metrics`, `/api/meta/**` (busca de interesses, pages/posts, creatives) e o endpoint interno `/internal/meta/token`. Internamente garante que cada rota cheque autenticação.
- `client.ts` / `services/dashboard.service.ts`: wrapper do Graph API (`MetaGraphClient`) e o agregador `fetchMetaDashboardMetrics`.
- `utils/`, `constants.ts`, `types.ts`: conversões de objetivos, agregações, criptografia de tokens e tipos compartilhados.

**Storage (`server/modules/storage`)**
- `types.ts`: interfaces (`IStorage`), enums e filtros reutilizados pelos módulos.
- `memory.storage.ts`: implementação em memória para testes/dev.
- `db.storage.ts`: implementação real usando Drizzle/Postgres.
- `index.ts`: seleciona dinamicamente qual storage expor (`storage` singleton).

**Resources (`server/modules/resources`)**
- `routes.ts`: CRUD completo de `/api/resources` (listar, filtrar por tipo, criar, atualizar e deletar) sempre forçando que o recurso pertença ao tenant logado.

**Audiences (`server/modules/audiences`)**
- `routes.ts`: CRUD de audiências com validações, schema `zod` e reuso dos guardas de autenticação.

**Campaigns (`server/modules/campaigns`)**
- `routes.ts`: CRUD de campanhas, envio manual para o n8n, webhooks (`/api/webhooks/n8n` e `/api/webhooks/n8n/status`) e todos os helpers de normalização que antes estavam no router principal.

**Integrations (`server/modules/integrations`)**
- `routes.ts`: gerenciamento de integrações por tenant (listar, buscar por provider, criar/atualizar, deletar), garantindo idempotência ao reusar provider existente.

**Auth API (`server/modules/auth`)**
- `routes.ts`: `/api/auth/login`, `/api/auth/logout` e `/api/auth/me`, reutilizando o `passport` configurado no bootstrap.
- `services/`: hashing de senha e helpers de roles consumidos por outros módulos (ex.: admin).

**Admin (`server/modules/admin`)**
- `routes.ts`: endpoints para system admins/tenant admins (`/api/admin/settings`, `/api/admin/tenants`, CRUD de usuários). Aplica regras extras (ex.: apenas system admin cria outro system admin).

**OAuth (`server/modules/oauth`)**
- `routes.ts`: fluxos completos de `/auth/meta*` e `/auth/google*`, salvando tokens, sincronizando recursos (contas Meta, páginas, pastas do Drive) e retornando o usuário para a UI.

**Realtime (`server/modules/realtime`)**
- `routes.ts`: expõe `/api/events/campaigns`, um endpoint SSE autenticado por sessão para transmitir atualizações.
- `sse.ts`: registra os clientes por tenant e envia eventos `campaign:update` quando a campanha muda de status (ex.: callback do n8n).

## Guia rápido de responsabilidades

| Necessidade                              | Onde procurar                                             |
|------------------------------------------|-----------------------------------------------------------|
| Dashboard / métricas / buscas da Meta    | `server/modules/meta/routes.ts` + `services/**`           |
| Ajustes de persistência/DB               | `server/modules/storage/**`                               |
| CRUD de resources                        | `server/modules/resources/routes.ts`                      |
| CRUD de audiências                       | `server/modules/audiences/routes.ts`                      |
| Campanhas + webhooks do n8n              | `server/modules/campaigns/routes.ts`                      |
| Integrações externas                     | `server/modules/integrations/routes.ts`                   |
| Settings, tenants e usuários (admin)     | `server/modules/admin/routes.ts`                          |
| Login/logout/me                          | `server/modules/auth/routes.ts`                           |
| Fluxos OAuth (Meta/Google)               | `server/modules/oauth/routes.ts`                          |
| Push em tempo real (SSE)                 | `server/modules/realtime/**` + `useCampaignRealtime`      |
| Helpers de autenticação/RBAC             | `server/modules/auth/services/role.service.ts`            |
| Nova feature no frontend                 | `client/src/features/<feature>/`                          |
| Componentes/úteis compartilhados (front) | `client/src/shared/components/` e `client/src/shared/lib/` |

Mantenha este documento atualizado sempre que um novo módulo, fluxo OAuth ou regra cross-cutting surgir — ele é o mapa oficial da arquitetura do projeto.
