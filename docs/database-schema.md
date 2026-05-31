# Esquema do Banco de Dados

Este documento descreve o schema relacional atual do Auto Ads conforme
`shared/schema.ts` e as estruturas JSON persistidas nas colunas `jsonb`.

Banco: PostgreSQL  
ORM: Drizzle  
Fonte principal: `shared/schema.ts`

## Visao Geral Relacional

```text
tenants
  +- users
  +- resources
  |  +- campaigns.account_id/page_id/instagram_id/whatsapp_id/leadform_id
  |  +- campaign_metrics.account_id
  |  +- meta_account_snapshots.resource_id
  +- audiences
  +- campaigns
  |  +- automations
  |  +- campaign_metrics
  +- integrations
  +- automations
  +- existing_campaign_runs
  +- campaign_metrics
  +- storage_upload_links
  |  +- storage_uploads
  +- storage_uploads
  |  +- storage_tasks.storage_upload_id
  |  +- storage_task_uploads.storage_upload_id
  +- storage_tasks
  |  +- storage_task_uploads
  +- meta_destination_snapshots
  +- meta_account_snapshots
  +- meta_campaign_snapshots
  +- meta_adset_snapshots

app_settings
  +- configuracao global da instancia
```

## Convencoes

- Quase todas as tabelas de negocio possuem `tenant_id`.
- `tenant_id` e a fronteira principal de isolamento multi-tenant.
- `app_settings` e global da instancia, nao por tenant.
- Campos sensiveis de settings e integracoes sao criptografados antes de serem
  persistidos.
- O schema tem colunas `jsonb` para estruturas flexiveis que mudam com a Meta
  API e com o payload de automacao.

## Enum

### `user_role`

Valores:

- `system_admin`
- `tenant_admin`
- `member`

## Tabelas

### `tenants`

Representa um cliente/tenant isolado.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `name` | text | sim | Nome do tenant |
| `created_at` | timestamp | sim | Default `now()` |

Relacionamentos:

- 1:N com `users`, `resources`, `audiences`, `campaigns`, `integrations`,
  `storage_uploads`, `storage_tasks` e snapshots Meta.

### `users`

Usuarios autenticados por email/senha.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Referencia `tenants.id` |
| `email` | text unique | sim | Login do usuario |
| `password` | text | sim | Hash bcrypt |
| `role` | user_role | sim | Default `member` |
| `created_at` | timestamp | sim | Default `now()` |

Regras:

- Email e unico globalmente.
- `system_admin` pode administrar tenants e settings globais.
- `tenant_admin` administra usuarios do proprio tenant.

### `resources`

Recursos Meta sincronizados ou cadastrados por tenant.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `type` | text | sim | Ex.: `account`, `page`, `instagram`, `leadform`, `whatsapp` |
| `name` | text | sim | Nome exibido |
| `value` | text | sim | ID externo ou valor principal |
| `metadata` | jsonb | sim | Default `{}` |
| `created_at` | timestamp | sim | Default `now()` |

Indices:

- `uniq_tenant_resource(tenant_id, type, value)`

Usos:

- Fonte de contas, paginas, Instagram, WhatsApp e leadforms.
- Tambem usado por campanhas legadas e dashboard.

### `audiences`

Publicos-alvo reutilizaveis.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `name` | text | sim | Nome do publico |
| `type` | text | sim | Ex.: `interesse`, `custom_list` |
| `age_min` | integer | sim | Minimo 18 |
| `age_max` | integer | sim | Maximo 65 |
| `interests` | jsonb | nao | Lista de interesses Meta |
| `cities` | jsonb | nao | Lista de cidades Meta |
| `behaviors` | text[] | nao | Comportamentos |
| `locations` | text[] | nao | Localizacoes |
| `custom_list_file` | text | nao | Arquivo de lista customizada |
| `estimated_size` | text | nao | Estimativa livre |
| `created_at` | timestamp | sim | Default `now()` |

JSON `interests`:

```json
[
  { "id": "6003139266461", "name": "Automoveis" }
]
```

JSON `cities`:

```json
[
  {
    "key": "123",
    "radius": 20,
    "distance_unit": "kilometer",
    "name": "Sao Paulo",
    "region": "Sao Paulo"
  }
]
```

### `campaigns`

Campanhas do fluxo legado.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `name` | text | sim | Nome |
| `objective` | text | sim | Objetivo |
| `status` | text | sim | Default `draft` |
| `status_detail` | text | nao | Detalhe de callback |
| `account_id` | integer FK | nao | `resources.id` |
| `page_id` | integer FK | nao | `resources.id` |
| `instagram_id` | integer FK | nao | `resources.id` |
| `whatsapp_id` | integer FK | nao | `resources.id` |
| `leadform_id` | integer FK | nao | `resources.id` |
| `website_url` | text | nao | URL destino |
| `ad_sets` | jsonb | nao | Configuracoes de conjuntos |
| `creatives` | jsonb | nao | Criativos |
| `budget` | text | nao | Campo legado |
| `audience_ids` | integer[] | nao | Campo legado |
| `title` | text | nao | Campo legado |
| `message` | text | nao | Campo legado |
| `drive_folder_id` | text | nao | Campo legado |
| `start_time` | timestamp | nao | Inicio |
| `end_time` | timestamp | nao | Fim |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

Status comuns:

- `draft`
- `pending`
- `active`
- `error`
- `paused`
- `completed`

### `integrations`

Integracoes externas por tenant.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `provider` | text | sim | Ex.: `meta_ads` |
| `config` | jsonb | sim | Dados criptografados/sanitizados |
| `status` | text | sim | Default `pending` |
| `last_checked` | timestamp | nao | Ultima validacao |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

Observacao:

- Tokens brutos nao devem ser retornados ao frontend.

### `automations`

Historico de disparos para n8n no fluxo legado.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `campaign_id` | integer FK | nao | `campaigns.id` |
| `webhook_url` | text | sim | URL n8n |
| `status` | text | sim | Default `pending` |
| `payload` | jsonb | nao | Payload enviado |
| `response` | jsonb | nao | Resposta recebida |
| `created_at` | timestamp | sim | Default `now()` |
| `completed_at` | timestamp | nao | Fim |

### `existing_campaign_runs`

Preflight/historico para fluxo de campanhas existentes.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `run_id` | text PK | sim | Identificador externo/gerado |
| `tenant_id` | integer FK | sim | Tenant dono |
| `external_id` | text | nao | ID externo |
| `payload_original` | jsonb | sim | Payload recebido |
| `pairs_array` | jsonb | sim | Pares extraidos |
| `preview_text` | text | sim | Texto de preview |
| `warnings` | jsonb | sim | Alertas |
| `errors` | jsonb | sim | Erros |
| `summary` | jsonb | sim | Resumo |
| `status` | text | sim | Status do preflight |
| `can_continue` | boolean | sim | Pode continuar |
| `created_at` | timestamp | sim | Default `now()` |

### `campaign_metrics`

Metricas agregadas por campanha/conta/data.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `account_id` | integer FK | sim | `resources.id` |
| `campaign_id` | integer FK | nao | `campaigns.id` |
| `date` | date | sim | Dia da metrica |
| `spend` | numeric(14,2) | sim | Default `0` |
| `impressions` | integer | sim | Default `0` |
| `clicks` | integer | sim | Default `0` |
| `leads` | integer | sim | Default `0` |
| `created_at` | timestamp | sim | Default `now()` |

### `app_settings`

Configuracao global da instancia.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Normalmente um registro |
| `meta_app_id` | text | nao | Pode vir de ENV |
| `meta_app_secret` | text | nao | Criptografado se salvo |
| `google_client_id` | text | nao | Legado |
| `google_client_secret` | text | nao | Legado/criptografado |
| `gcs_bucket_name` | text | nao | Bucket GCS |
| `gcs_service_account_json` | text | nao | Criptografado se salvo |
| `n8n_webhook_url` | text | nao | Webhook da automacao |
| `updated_at` | timestamp | sim | Default `now()` |

Observacao:

- Credenciais sensiveis devem preferir ENV.
- Google Drive nao e mais parte do fluxo principal.

### `storage_upload_links`

Links publicos para upload.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `created_by_user_id` | integer FK | nao | Usuario criador |
| `name` | text | sim | Nome do link |
| `path_prefix` | text | sim | Prefixo logico no bucket |
| `public_id` | text unique | sim | ID publico da URL |
| `expires_at` | timestamp | sim | Expiracao |
| `revoked_at` | timestamp | nao | Revogacao |
| `created_at` | timestamp | sim | Default `now()` |

### `storage_uploads`

Arquivos enviados para GCS e registrados no banco.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `upload_link_id` | integer FK | nao | Link publico usado |
| `uploaded_by_user_id` | integer FK | nao | Usuario interno |
| `bucket_name` | text | sim | Bucket GCS |
| `object_path` | text | sim | Caminho no bucket |
| `original_file_name` | text | sim | Nome original |
| `content_type` | text | sim | MIME type |
| `size_bytes` | integer | sim | Tamanho |
| `created_at` | timestamp | sim | Default `now()` |

### `storage_tasks`

Tarefas geradas a partir de uploads.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `storage_upload_id` | integer FK | sim | Upload principal/capa |
| `upload_link_id` | integer FK | nao | Link publico origem |
| `batch_id` | text | nao | Agrupamento de upload |
| `title` | text | sim | Nome da tarefa |
| `status` | text | sim | Default `pending` |
| `configuration_elapsed_seconds` | integer | sim | Tempo configurando |
| `last_activity_at` | timestamp | nao | Ultima atividade do usuario |
| `automation_started_at` | timestamp | nao | Inicio n8n |
| `automation_finished_at` | timestamp | nao | Fim n8n |
| `pairs_json` | jsonb | sim | Pares Feed + Stories |
| `distribution_json` | jsonb | sim | Distribuicao em campanhas |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

JSON `pairs_json`:

```json
[
  {
    "feedUploadId": 74,
    "storiesUploadId": 75,
    "title": "Titulo do anuncio",
    "text": "Texto principal"
  }
]
```

JSON `distribution_json`:

```json
{
  "destinations": [
    {
      "resourceId": 10,
      "adAccountId": "act_123",
      "adAccountName": "Conta Meta",
      "connectionStatus": "connected",
      "campaign": {
        "id": "120000000",
        "name": "Campanha Leads",
        "objective": "OUTCOME_LEADS",
        "status": "ACTIVE",
        "buyingType": "AUCTION",
        "configuredStatus": "ACTIVE",
        "effectiveStatus": "ACTIVE",
        "budget": "1000",
        "updatedTime": "2026-05-31T10:00:00-0300",
        "specialAdCategories": []
      },
      "adsets": [
        {
          "id": "120000001",
          "name": "Adset A",
          "status": "ACTIVE",
          "configuredStatus": "ACTIVE",
          "effectiveStatus": "ACTIVE",
          "optimizationGoal": "LEAD_GENERATION",
          "billingEvent": "IMPRESSIONS",
          "bidStrategy": "LOWEST_COST_WITHOUT_CAP",
          "destination": {
            "type": "LEADGEN",
            "pageId": "123",
            "instagramUserId": "456",
            "leadgenFormId": "789",
            "whatsappNumber": null
          }
        }
      ],
      "applyToAllAdsets": true,
      "selectedAdsetIds": ["120000001"],
      "pairIds": ["pair-1"],
      "campaignLeadgenFormId": null,
      "campaignLeadgenFormName": null,
      "pairAssignments": [
        {
          "pairId": "pair-1",
          "useCampaignDefault": true,
          "leadgenFormId": null,
          "leadgenFormName": null
        }
      ],
      "createAdsStatus": "PAUSED"
    }
  ]
}
```

### `meta_destination_snapshots`

Snapshot de destino por adset.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `ad_account_id` | text | sim | Conta Meta |
| `campaign_id` | text | sim | Campanha Meta |
| `adset_id` | text | sim | Adset Meta |
| `destination_type` | text | sim | Default `WEBSITE` |
| `page_id` | text | nao | Pagina |
| `instagram_user_id` | text | nao | Instagram |
| `leadgen_form_id` | text | nao | Formulario |
| `whatsapp_number` | text | nao | Numero |
| `source` | text | sim | Default `meta` |
| `synced_at` | timestamp | sim | Sync |
| `expires_at` | timestamp | sim | Expiracao cache |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

### `meta_account_snapshots`

Snapshot de contas Meta.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `resource_id` | integer FK | nao | Recurso associado |
| `ad_account_id` | text | sim | ID da conta |
| `account_name` | text | sim | Nome |
| `connection_status` | text | sim | Default `connected` |
| `synced_at` | timestamp | sim | Sync |
| `expires_at` | timestamp | sim | Expiracao cache |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

Indice:

- `uniq_meta_account_snapshots(tenant_id, ad_account_id)`

### `meta_campaign_snapshots`

Snapshot de campanhas Meta.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `ad_account_id` | text | sim | Conta Meta |
| `campaign_id` | text | sim | Campanha Meta |
| `name` | text | nao | Nome |
| `objective` | text | nao | Objetivo |
| `status` | text | nao | Status |
| `buying_type` | text | nao | Compra |
| `configured_status` | text | nao | Status configurado |
| `effective_status` | text | nao | Status efetivo |
| `daily_budget` | text | nao | Orcamento diario |
| `lifetime_budget` | text | nao | Orcamento vitalicio |
| `updated_time` | text | nao | Atualizacao externa |
| `special_ad_categories` | jsonb | sim | Default `[]` |
| `synced_at` | timestamp | sim | Sync |
| `expires_at` | timestamp | sim | Expiracao cache |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

Indice:

- `uniq_meta_campaign_snapshots(tenant_id, ad_account_id, campaign_id)`

### `meta_adset_snapshots`

Snapshot de adsets Meta.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `tenant_id` | integer FK | sim | Tenant dono |
| `ad_account_id` | text | sim | Conta Meta |
| `campaign_id` | text | sim | Campanha Meta |
| `adset_id` | text | sim | Adset Meta |
| `name` | text | nao | Nome |
| `status` | text | nao | Status |
| `configured_status` | text | nao | Status configurado |
| `effective_status` | text | nao | Status efetivo |
| `optimization_goal` | text | nao | Otimizacao |
| `billing_event` | text | nao | Cobranca |
| `bid_strategy` | text | nao | Lance |
| `updated_time` | text | nao | Atualizacao externa |
| `promoted_object` | jsonb | nao | Objeto promovido |
| `synced_at` | timestamp | sim | Sync |
| `expires_at` | timestamp | sim | Expiracao cache |
| `created_at` | timestamp | sim | Default `now()` |
| `updated_at` | timestamp | sim | Default `now()` |

Indice:

- `uniq_meta_adset_snapshots(tenant_id, ad_account_id, campaign_id, adset_id)`

### `storage_task_uploads`

Tabela de ligacao N:N entre tarefas e uploads.

| Coluna | Tipo | Obrigatorio | Observacao |
| --- | --- | --- | --- |
| `id` | serial PK | sim | Identificador interno |
| `task_id` | integer FK | sim | `storage_tasks.id` |
| `storage_upload_id` | integer FK | sim | `storage_uploads.id` |
| `created_at` | timestamp | sim | Default `now()` |

## Payload Enviado ao n8n

A tarefa de distribuicao envia um objeto com a acao:

```json
{
  "body": {
    "action": "add_creatives_to_existing_campaigns",
    "task": {
      "task_id": "task_4",
      "task_name": "Nome da tarefa"
    },
    "tenant": {
      "tenant_id": "1",
      "client_id": "cliente"
    },
    "pair_assets": [],
    "creative_jobs": [],
    "creative_defaults": {
      "ad_status": "PAUSED",
      "creative_status": "ACTIVE"
    },
    "meta": {
      "request_id": "req_20260531_ab12cd",
      "callback_url": "https://app.exemplo.com/api/webhooks/n8n/status"
    }
  }
}
```

Campos principais de `creative_jobs`:

| Campo | Descricao |
| --- | --- |
| `job_id` | Sequencia do job |
| `tenant_id` | Tenant em string |
| `client_id` | Slug do tenant |
| `asset_key` | Chave do par por tarefa/conta |
| `ad_account_id` | Conta Meta |
| `campaign_id` | Campanha Meta |
| `adset_id` | Adset Meta |
| `objective` | Objetivo da campanha |
| `destination.page_id` | Pagina |
| `destination.instagram_user_id` | Instagram |
| `destination.leadgen_form_id` | Formulario |
| `destination.whatsapp_number` | WhatsApp normalizado |
| `message_text` | Texto do par |
| `title_text` | Titulo do par |
| `cta` | CTA, atualmente `SIGN_UP` |

## Callback n8n

Endpoint:

```text
POST /api/webhooks/n8n/status
Header: x-internal-api-secret: <INTERNAL_API_SECRET>
```

Campos esperados:

```json
{
  "tenant_id": "1",
  "task_id": "task_4",
  "status": "completed",
  "status_detail": "Publicado com sucesso"
}
```

Status normalizados:

- `completed`, `success`, `ok`, `active` -> `completed`
- `error`, `failed`, `failure` -> `error`
- `publishing`, `pending`, `processing`, `running` -> `publishing`

## Observacoes de Integridade

- O banco usa foreign keys simples por tabela.
- Regras multi-tenant sao reforcadas no codigo e parcialmente por constraints
  compostas adicionadas em `server/db.ts`.
- Ao remover uma tarefa, a tabela `storage_task_uploads` e limpa antes de
  remover `storage_tasks`.
- Arquivos em `storage_uploads` e no GCS sao preservados quando uma tarefa e
  removida.
