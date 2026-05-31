# Arquitetura do Projeto

Este documento descreve a arquitetura atual do Auto Ads, incluindo frontend,
backend, persistencia, integracoes externas e fronteiras de seguranca
multi-tenant.

## Visao Geral

O Auto Ads e uma aplicacao web multi-tenant para receber midias, montar pares
Feed + Stories, distribuir esses pares em campanhas Meta Ads existentes e
enviar um payload estruturado para uma automacao n8n.

Fluxo de alto nivel:

1. Usuario autentica por sessao.
2. Usuario ou link publico envia arquivos para o Google Cloud Storage.
3. O backend registra uploads e tarefas no PostgreSQL.
4. Usuario monta pares na tarefa.
5. Usuario conecta/consulta recursos Meta do tenant.
6. Usuario distribui pares em campanhas/adsets.
7. Backend gera payload para n8n.
8. n8n processa a automacao e retorna callback de status.
9. A tarefa muda de status e tempo acumulado e atualizado.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | React, TypeScript, Vite, Wouter, TanStack Query, Tailwind, shadcn/ui |
| Backend | Node.js, Express, TypeScript, Passport, sessions |
| Banco | PostgreSQL, Drizzle ORM |
| Storage de arquivos | Google Cloud Storage via service account |
| Integracao Meta | Meta Graph/Marketing API via OAuth de usuario |
| Automacao | n8n via webhook HTTP |
| Build/Deploy | Docker, Docker Compose |

## Estrutura de Diretorios

```text
/
+- client/
|  +- src/
|     +- components/          # Componentes compartilhados e UI
|     +- contexts/            # AuthContext e provedores globais
|     +- features/            # Features maiores, como dashboard/campaigns
|     +- hooks/               # Hooks compartilhados
|     +- lib/                 # Query client e utilitarios
|     +- pages/               # Paginas roteadas pelo Wouter
+- server/
|  +- middlewares/            # Auth, autorizacao e rate limit
|  +- modules/
|  |  +- admin/               # Settings, tenants e usuarios
|  |  +- audiences/           # CRUD de publicos
|  |  +- auth/                # Login, logout, usuario atual
|  |  +- campaigns/           # Campanhas legadas e webhooks n8n
|  |  +- gcs/                 # Upload/download/signed URL para GCS
|  |  +- integrations/        # Integracoes por provider
|  |  +- meta/                # Dashboard, Meta API, OAuth token interno
|  |  +- oauth/               # Fluxo OAuth Meta
|  |  +- realtime/            # SSE para eventos de campanhas
|  |  +- resources/           # Recursos Meta por tenant
|  |  +- storage/             # Interface de persistencia db/memoria
|  |  +- tasks/               # Fluxo principal de tarefas
|  +- db.ts                   # Bootstrap/migracoes defensivas do banco
|  +- index.ts                # Entrada HTTP
|  +- routes.ts               # Montagem dos routers
+- shared/
|  +- schema.ts               # Schema Drizzle e tipos compartilhados
+- docs/
+- migrations/
+- docker/
```

## Frontend

### Roteamento

As rotas principais ficam em `client/src/App.tsx`.

| Rota | Pagina | Observacao |
| --- | --- | --- |
| `/` | Dashboard | Mantida visivel no menu |
| `/campaigns` | CampaignsPage | Rota existe, atalho oculto no menu |
| `/audiences` | Audiences | Rota existe, atalho oculto no menu |
| `/resources` | Resources | Rota existe, atalho oculto no menu |
| `/integrations` | Integrations | Integracoes do usuario |
| `/storage` | Storage | Uploads e links publicos |
| `/tasks` | Tasks | Kanban de tarefas |
| `/tasks/:id` | TaskDetail | Montagem de pares |
| `/tasks/:id/distribution` | TaskDistribution | Distribuicao em campanhas |
| `/tasks/:id/distribution/review` | TaskDistributionReview | Revisao final |
| `/admin` | Admin | Settings e usuarios |
| `/upload/:publicId` | PublicUpload | Upload publico |
| `/shared/dashboard` | SharedDashboard | Dashboard compartilhado |

### Estado e chamadas HTTP

- TanStack Query gerencia cache de consultas e invalidacoes.
- `client/src/lib/queryClient.ts` centraliza `apiRequest`, CSRF e cookies.
- Autenticacao fica em `client/src/contexts/AuthContext.tsx`.
- A sidebar fica em `client/src/components/AppSidebar.tsx`.

## Backend

### Bootstrap HTTP

`server/index.ts` configura:

- JSON e URL encoded body parsers.
- Logging HTTP com `request_id`.
- Bootstrap das rotas.
- Handler global de erros.

`server/routes.ts` configura:

- Sessao Express.
- Passport.
- CSRF.
- Rotas publicas, autenticadas, internas e estaticas.

### Montagem dos routers

| Prefixo | Router | Responsabilidade |
| --- | --- | --- |
| `/api/public` | `publicGcsRouter` | Links publicos de upload |
| `/api/public` | `publicMetaRouter` | Dashboard compartilhado |
| `/api/public` | `publicTasksRouter` | Download temporario de assets da tarefa |
| `/api/auth` | `authRouter` | Login, logout, usuario atual |
| `/api/resources` | `resourcesRouter` | CRUD de recursos Meta |
| `/api/integrations` | `integrationsRouter` | Integracoes por provider |
| `/api/audiences` | `audiencesRouter` | CRUD de publicos |
| `/api/campaigns` | `campaignsRouter` | Campanhas legadas |
| `/api/webhooks` | `campaignWebhookRouter` | Webhooks n8n |
| `/api/admin` | `adminRouter` | Settings, tenants e usuarios |
| `/api/events` | `realtimeRouter` | SSE |
| `/api` | `gcsRouter` | Upload interno e links |
| `/api` | `tasksRouter` | Tarefas e distribuicao |
| `/api` | `metaRouter` | Dashboard, Meta API e leadforms |
| `/internal` | `internalMetaRouter` | Token Meta para automacoes internas |
| `/auth` | `oauthRouter` | OAuth Meta |

## Modulos Principais

### `server/modules/tasks`

Modulo central do fluxo atual.

Responsabilidades:

- Listar tarefas para Kanban.
- Remover tarefa com isolamento por tenant.
- Carregar detalhe da tarefa.
- Salvar pares Feed + Stories.
- Servir miniaturas com validacao de tenant.
- Consultar contas/campanhas/adsets Meta para a tarefa.
- Salvar distribuicao por conta/campanha/adset.
- Gerar preview de payload.
- Enviar payload para n8n.
- Atualizar status e tempo de configuracao/automacao.

Status principais:

| Status | Significado |
| --- | --- |
| `pending` | Tarefa recebida, ainda sem configuracao relevante |
| `configuring` | Usuario esta configurando pares/distribuicao |
| `publishing` | Payload enviado ao n8n, aguardando callback |
| `completed` ou `success` | Callback confirmou sucesso |
| `error` ou `failed` | Callback indicou falha |

### `server/modules/gcs`

Responsavel por storage de arquivos:

- Resolve configuracao GCS por ENV, arquivo local ou settings.
- Autentica service account via JWT.
- Envia uploads para bucket.
- Baixa objetos quando necessario.
- Gera signed URL temporaria para leitura.
- Mantem links publicos de upload por tenant.

### `server/modules/meta`

Responsavel por integracao Meta:

- Dashboard de metricas.
- Busca de cidades/interesses.
- Consulta de criativos.
- Consulta de posts e leadforms.
- Snapshots de contas/campanhas/adsets.
- Token interno protegido para n8n.

### `server/modules/oauth`

Responsavel pelo OAuth Meta:

- Gera `state` anti-CSRF.
- Troca `code` por token.
- Salva token criptografado na integracao do tenant.
- Sincroniza recursos Meta em `resources`.

### `server/modules/storage`

Abstracao de persistencia:

- `types.ts`: contrato `IStorage`.
- `db.storage.ts`: implementacao PostgreSQL/Drizzle.
- `memory.storage.ts`: implementacao em memoria.
- `index.ts`: singleton exportado como `storage`.

## Integracoes Externas

### Meta

Credenciais:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_TOKEN_ENC_KEY`

Token:

- Obtido via OAuth.
- Criptografado antes de salvar.
- Usado com `appsecret_proof`.

### Google Cloud Storage

Credenciais:

- `GCS_BUCKET_NAME`
- `GCS_SERVICE_ACCOUNT_JSON` ou `GCS_SERVICE_ACCOUNT_FILE`

Uso:

- Uploads internos e publicos.
- Assets usados em payloads enviados ao n8n.
- Signed URLs temporarias para leitura segura.

### n8n

Configuracao:

- `n8nWebhookUrl` em `app_settings`.
- `INTERNAL_API_SECRET` para callbacks internos.

Payload principal:

- Enviado por `POST` para `n8nWebhookUrl`.
- Corpo atual: `{ body: payload }`.
- Callback esperado em `/api/webhooks/n8n/status`.

## Seguranca Multi-Tenant

Regra principal: toda consulta ou escrita de dado de negocio deve validar
`tenantId` vindo da sessao do usuario.

Controles implementados:

- `users.tenant_id` obrigatorio.
- Recursos, publicos, campanhas, uploads e tarefas possuem `tenant_id`.
- Mutacoes de storage aceitam `tenantId` quando precisam restringir escopo.
- Endpoints de tarefas carregam contexto por `taskId + tenantId`.
- Endpoints Meta validam ownership de recursos.
- Callback n8n exige `tenant_id` e valida tarefa/campanha do tenant.
- Endpoint interno de token exige `x-internal-api-secret` e `x-tenant-id`.
- Tokens e secrets sao criptografados em repouso.

## Caches

| Cache | Onde | Objetivo |
| --- | --- | --- |
| Dashboard Meta | `server/modules/meta/utils/dashboard-cache.ts` | Reduz chamadas repetidas a Meta API |
| Estrutura de contas Meta | `server/modules/tasks/routes.ts` | Reuso curto de campanhas/adsets |
| Destinos/adsets | `server/modules/tasks/routes.ts` | Evita recarregar contexto Meta em sequencia |
| Leadforms por page | `server/modules/meta/routes.ts` | Reduz consultas de formularios |
| Miniaturas | `server/modules/tasks/routes.ts` | ETag, redirect para signed URL ou cache em memoria |
| GCS access token | `server/modules/gcs/service.ts` | Reusa token server-to-server |

## Documentos Relacionados

- `docs/database-schema.md`: schema relacional e estruturas JSON.
- `docs/use-cases.md`: casos de uso do produto.
- `docs/api-reference.md`: mapa dos endpoints HTTP.
- `docs/gcs-storage-setup.md`: configuracao do GCS.
- `docs/security-meta-oauth.md`: seguranca do OAuth Meta.
