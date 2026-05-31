# Referencia de API

Esta referencia lista os endpoints principais montados pelo Express. Ela nao
substitui a leitura dos routers, mas serve como mapa operacional.

## Autenticacao

Base: `/api/auth`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `POST` | `/login` | Login com email/senha |
| `POST` | `/logout` | Encerra sessao |
| `GET` | `/me` | Retorna usuario autenticado |

## Admin

Base: `/api/admin`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/settings` | Configuracoes globais, system admin |
| `PUT` | `/settings` | Atualiza settings globais |
| `GET` | `/tenants` | Lista tenants, system admin |
| `GET` | `/users` | Lista usuarios permitidos |
| `POST` | `/users` | Cria usuario |
| `PATCH` | `/users/:id` | Atualiza usuario |
| `DELETE` | `/users/:id` | Remove usuario |

## Recursos

Base: `/api/resources`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/` | Lista recursos do tenant |
| `GET` | `/:type` | Lista recursos por tipo |
| `POST` | `/` | Cria recurso |
| `PATCH` | `/:id` | Atualiza recurso |
| `DELETE` | `/:id` | Remove recurso |
| `DELETE` | `/type/:type` | Remove recursos por tipo |

## Publicos

Base: `/api/audiences`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/` | Lista publicos |
| `GET` | `/:id` | Detalha publico |
| `POST` | `/` | Cria publico |
| `PATCH` | `/:id` | Atualiza publico |
| `DELETE` | `/:id` | Remove publico |

## Campanhas Legadas

Base: `/api/campaigns`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/` | Lista campanhas |
| `GET` | `/cooldown` | Estado de cooldown Meta |
| `GET` | `/:id` | Detalha campanha |
| `POST` | `/` | Cria campanha |
| `PATCH` | `/:id` | Atualiza campanha |
| `DELETE` | `/:id` | Remove campanha |
| `POST` | `/:id/send-webhook` | Reenvia campanha ao n8n |

## Webhooks n8n

Base: `/api/webhooks`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `POST` | `/n8n` | Webhook autenticado legado |
| `POST` | `/n8n/status` | Callback de status n8n |

Regras:

- `/n8n/status` exige `x-internal-api-secret`.
- Callback de tarefa deve informar `tenant_id`.

## Integracoes

Base: `/api/integrations`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/` | Lista integracoes sanitizadas |
| `GET` | `/:provider` | Busca integracao por provider |
| `POST` | `/` | Cria/atualiza integracao |
| `DELETE` | `/:id` | Remove integracao |

## OAuth Meta

Base: `/auth`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/meta` | Inicia OAuth Meta |
| `GET` | `/meta/callback` | Callback OAuth Meta |

## Google Cloud Storage e Uploads

Base autenticada: `/api`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/storage/config` | Status da configuracao GCS |
| `GET` | `/storage/upload-links` | Lista links publicos |
| `POST` | `/storage/upload-links` | Cria link publico |
| `DELETE` | `/storage/upload-links/:id` | Revoga link |
| `GET` | `/storage/uploads` | Lista uploads |
| `POST` | `/storage/uploads` | Upload interno |

Base publica: `/api/public`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/storage/upload-links/:publicId` | Consulta link publico |
| `POST` | `/storage/upload-links/:publicId/files` | Upload publico |

## Tarefas

Base: `/api`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/tasks` | Lista tarefas para Kanban |
| `DELETE` | `/tasks/:id` | Remove tarefa do tenant |
| `GET` | `/tasks/:id` | Detalha tarefa |
| `PUT` | `/tasks/:id/pairs` | Salva pares |
| `POST` | `/tasks/:id/activity` | Heartbeat/tempo de configuracao |
| `GET` | `/tasks/:taskId/uploads/:uploadId/thumbnail` | Miniatura validada |
| `GET` | `/tasks/:id/distribution` | Carrega distribuicao |
| `PUT` | `/tasks/:id/distribution` | Salva distribuicao |
| `GET` | `/tasks/:id/distribution/payload` | Preview do payload n8n |
| `POST` | `/tasks/:id/distribution/send` | Envia ao n8n |
| `GET` | `/tasks/:id/meta/accounts` | Busca contas para tarefa |
| `GET` | `/tasks/:id/meta/accounts/:resourceId/campaigns` | Lista campanhas da conta |
| `GET` | `/tasks/:id/meta/accounts/:resourceId/campaigns/:campaignId/context` | Contexto atualizado da campanha |

Base publica:

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/api/public/task-assets/:token` | Download temporario de asset |

## Meta e Dashboard

Base autenticada: `/api`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `POST` | `/dashboard/share` | Cria compartilhamento |
| `GET` | `/dashboard/metrics` | Metricas dashboard |
| `GET` | `/dashboard/top-creatives` | Criativos top |
| `GET` | `/meta/campaigns/:id/creatives` | Criativos de campanha |
| `GET` | `/meta/search/cities` | Busca cidades |
| `GET` | `/meta/search/interests` | Busca interesses |
| `GET` | `/meta/pages/:pageId/leadforms` | Leadforms da pagina |
| `GET` | `/meta/pages/:pageId/posts` | Posts da pagina |

Base publica:

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/api/public/dashboard/share/metadata` | Metadata do dashboard compartilhado |
| `GET` | `/api/public/dashboard/metrics` | Metricas compartilhadas |
| `GET` | `/api/public/dashboard/top-creatives` | Criativos compartilhados |

Base interna:

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/internal/meta/token` | Token Meta para automacoes internas |

Regras:

- `/internal/meta/token` exige `x-internal-api-secret`.
- Tambem exige `x-tenant-id` compativel com `tenant_id`.

## Realtime

Base: `/api/events`

| Metodo | Rota | Uso |
| --- | --- | --- |
| `GET` | `/campaigns` | SSE autenticado para eventos de campanha |

## Observacoes

- Endpoints autenticados dependem de sessao.
- Endpoints publicos possuem rate limit onde ha risco de abuso.
- Endpoints internos devem ser chamados apenas por automacoes confiaveis.
- A documentacao de payload n8n fica em `docs/database-schema.md`.
