# Meta Ads Campaign Management Platform

Aplicacao multi-tenant para receber criativos, montar pares Feed + Stories,
distribuir esses pares em campanhas Meta Ads existentes e enviar a configuracao
para uma automacao n8n.

## Documentacao

| Documento | Conteudo |
| --- | --- |
| [`docs/architecture-overview.md`](docs/architecture-overview.md) | Arquitetura do frontend, backend, modulos, integracoes e caches |
| [`docs/database-schema.md`](docs/database-schema.md) | Esquema relacional completo, relacionamentos e JSONs persistidos |
| [`docs/use-cases.md`](docs/use-cases.md) | Casos de uso, atores, fluxos e regras de negocio |
| [`docs/api-reference.md`](docs/api-reference.md) | Mapa dos endpoints HTTP principais |
| [`docs/gcs-storage-setup.md`](docs/gcs-storage-setup.md) | Configuracao do Google Cloud Storage |
| [`docs/security-meta-oauth.md`](docs/security-meta-oauth.md) | Modelo de seguranca do OAuth Meta |

## Funcionalidades Principais

- Autenticacao por sessao com RBAC.
- Isolamento multi-tenant por `tenant_id`.
- Admin global e admin por tenant.
- OAuth Meta com token criptografado e `appsecret_proof`.
- Upload interno e publico de arquivos para Google Cloud Storage.
- Kanban de tarefas.
- Montagem de pares Feed + Stories.
- Distribuicao visual de pares em campanhas/adsets Meta existentes.
- Selecao de formularios Lead Ads por campanha ou por par.
- Geracao e envio de payload para n8n.
- Callback n8n para atualizar status da tarefa.
- Tempo acumulado de configuracao e automacao.
- Dashboard Meta com metricas e criativos.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | React, TypeScript, Vite, Wouter, TanStack Query, Tailwind, shadcn/ui |
| Backend | Node.js, Express, TypeScript, Passport |
| Banco | PostgreSQL, Drizzle ORM |
| Storage | Google Cloud Storage com service account |
| Integracoes | Meta Graph/Marketing API, n8n |
| Deploy | Docker e Docker Compose |

## Estrutura Rapida

```text
client/      Frontend React
server/      Backend Express
shared/      Schema Drizzle e tipos compartilhados
docs/        Documentacao tecnica e funcional
migrations/  SQL auxiliar/migracoes
docker/      Arquivos de suporte ao container
```

## Variaveis de Ambiente Principais

```env
DATABASE_URL=postgresql://metaads:metaads_password@postgres:5432/metaads
SESSION_SECRET=troque-por-um-segredo-forte
PUBLIC_APP_URL=https://app.seudominio.com
FORCE_HTTPS=true

META_APP_ID=seu-meta-app-id
META_APP_SECRET=seu-meta-app-secret
META_TOKEN_ENC_KEY=chave-32-bytes
APP_SETTINGS_ENC_KEY=chave-32-bytes
INTERNAL_API_SECRET=segredo-interno-n8n

GCS_BUCKET_NAME=seu-bucket
GCS_SERVICE_ACCOUNT_FILE=/app/.local/secrets/gcs.json
```

Observacoes:

- Em producao, prefira manter secrets em ENV.
- O frontend nao deve receber Meta App Secret, tokens Meta ou service account.
- Google Drive nao faz parte do fluxo principal atual; o storage usado e GCS.

## Rodando com Docker Compose

1. Configure `.env`.
2. Suba os servicos:

```bash
docker-compose up -d
```

3. Acesse:

```text
http://localhost:5000
```

4. Credencial inicial, quando seedada:

```text
Email: admin@test.com
Senha: password
```

Comandos uteis:

```bash
docker-compose logs -f app
docker-compose down
docker-compose up -d --build
```

## Desenvolvimento Local

Requisitos:

- Node.js 20+
- PostgreSQL

Comandos:

```bash
npm install
npm run db:push
npm run dev
```

## Fluxo Operacional Principal

1. Admin configura app Meta, GCS e webhook n8n.
2. Usuario conecta OAuth Meta em Integracoes.
3. Usuario cria link publico ou faz upload interno.
4. Upload gera registros em `storage_uploads` e tarefas em `storage_tasks`.
5. Usuario abre a tarefa e monta pares Feed + Stories.
6. Usuario abre Distribuicao e adiciona contas/campanhas Meta.
7. Usuario arrasta pares para campanhas e escolhe adsets/formularios.
8. Usuario revisa a distribuicao.
9. Backend envia payload para n8n.
10. n8n chama callback e atualiza status para sucesso ou erro.

## Status de Tarefa

| Status | Cor/uso |
| --- | --- |
| `pending` | Tarefa recebida |
| `configuring` | Usuario configurando |
| `publishing` | Azul, automacao rodando |
| `completed` / `success` | Verde, callback n8n OK |
| `error` / `failed` | Erro reportado |

## Seguranca

Pontos principais:

- Toda operacao de negocio deve validar `tenant_id`.
- Tokens Meta sao criptografados em repouso.
- Chamadas Meta usam `appsecret_proof`.
- Endpoints internos exigem `x-internal-api-secret`.
- Callbacks n8n devem enviar `tenant_id`.
- Links publicos de upload tem expiracao/revogacao e rate limit.

Detalhes completos em [`docs/security-meta-oauth.md`](docs/security-meta-oauth.md).

## Banco de Dados

O schema completo esta documentado em
[`docs/database-schema.md`](docs/database-schema.md).

Tabela central do fluxo atual:

- `storage_upload_links`
- `storage_uploads`
- `storage_tasks`
- `storage_task_uploads`
- `resources`
- `integrations`
- `meta_*_snapshots`

## Payload n8n

O payload atual e montado no backend de tarefas e enviado como:

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
      "callback_url": "https://app.seudominio.com/api/webhooks/n8n/status"
    }
  }
}
```

Nao altere esse contrato sem revisar a automacao n8n correspondente.

## Observacoes de Manutencao

- Atualize `docs/database-schema.md` sempre que `shared/schema.ts` mudar.
- Atualize `docs/use-cases.md` quando um fluxo de produto mudar.
- Atualize `docs/architecture-overview.md` quando criar/remover modulo ou rota.
- Evite colocar credenciais reais em exemplos, logs ou screenshots.
