# Casos de Uso do Auto Ads

Este documento descreve os principais casos de uso do Auto Ads do ponto de
vista de produto, usuario e integracoes.

## Atores

| Ator | Descricao |
| --- | --- |
| `system_admin` | Admin global da instancia |
| `tenant_admin` | Admin de um tenant/cliente |
| `member` | Usuario operacional do tenant |
| Visitante de upload | Pessoa que acessa um link publico de upload |
| n8n | Automacao externa que recebe payload e retorna status |
| Meta | Plataforma externa de anuncios |
| Google Cloud Storage | Storage tecnico de arquivos |

## UC-01 - Login

Objetivo: autenticar um usuario interno.

Ator principal: qualquer usuario cadastrado.

Fluxo:

1. Usuario acessa `/login`.
2. Informa email e senha.
3. Backend valida senha com bcrypt.
4. Passport cria sessao.
5. Frontend carrega `/api/auth/me`.
6. Usuario acessa as paginas permitidas.

Regras:

- Login tem rate limit.
- Senha nunca e retornada ao frontend.
- A sessao define `tenantId` e `role`.

## UC-02 - Administrar Usuarios

Objetivo: criar, editar ou remover usuarios.

Ator principal: `system_admin` ou `tenant_admin`.

Fluxo:

1. Admin acessa `/admin`.
2. Abre aba de usuarios.
3. Cria usuario com nome/email/senha/role.
4. Backend valida permissao:
   - `system_admin` pode listar tenants e criar usuarios em tenants.
   - `tenant_admin` cria usuarios apenas no proprio tenant.
5. Usuario passa a conseguir login.

Regras:

- Somente `system_admin` pode criar outro `system_admin`.
- Reatribuicao para tenant existente e bloqueada no fluxo atual.
- Remocao de usuario deve respeitar permissoes por role.

## UC-03 - Configurar Credenciais Globais

Objetivo: configurar parametros globais da instancia.

Ator principal: `system_admin`.

Fluxo:

1. Admin acessa `/admin`.
2. Visualiza status das configuracoes.
3. Ajusta webhook n8n quando necessario.
4. Credenciais sensiveis devem preferir ENV.

Configuracoes relevantes:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_TOKEN_ENC_KEY`
- `APP_SETTINGS_ENC_KEY`
- `INTERNAL_API_SECRET`
- `GCS_BUCKET_NAME`
- `GCS_SERVICE_ACCOUNT_JSON` ou `GCS_SERVICE_ACCOUNT_FILE`
- `PUBLIC_APP_URL`

Regras:

- O Meta App Secret deve ficar no servidor, nao no frontend.
- Secrets salvos em `app_settings` sao criptografados.
- Google Drive nao e parte do fluxo principal atual.

## UC-04 - Conectar Meta OAuth

Objetivo: autorizar o tenant a acessar recursos Meta.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario acessa `/integrations`.
2. Clica para conectar Meta.
3. Backend gera `state` e redireciona para Meta OAuth.
4. Meta retorna para `/auth/meta/callback`.
5. Backend valida `state`.
6. Backend troca `code` por token.
7. Token e criptografado e salvo em `integrations`.
8. Backend sincroniza recursos Meta para `resources`.

Regras:

- Tokens nao sao exibidos ao frontend.
- Chamadas Graph usam `appsecret_proof`.
- Token expirado bloqueia uso ate nova autorizacao.

## UC-05 - Criar Link Publico de Upload

Objetivo: permitir que alguem envie midias sem login.

Ator principal: admin/usuario interno.

Fluxo:

1. Usuario acessa `/storage`.
2. Cria link com nome, prefixo e expiracao.
3. Sistema gera `publicId`.
4. Usuario compartilha `/upload/:publicId`.

Regras:

- Link pode expirar.
- Link pode ser revogado.
- Link nao torna o bucket publico.
- Upload publico tem rate limit.

## UC-06 - Enviar Arquivos

Objetivo: salvar midias no GCS e registrar uploads no banco.

Atores:

- Usuario interno em `/storage`.
- Visitante em `/upload/:publicId`.

Fluxo:

1. Usuario seleciona arquivos.
2. Frontend envia arquivo para backend.
3. Backend valida link/usuario/tenant.
4. Backend envia buffer para GCS.
5. Backend salva `storage_uploads`.
6. Backend cria ou atualiza `storage_tasks` quando aplicavel.
7. Arquivos ficam disponiveis para montagem de pares.

Regras:

- Arquivos sao salvos por tenant e data.
- O caminho evita colisao por UUID.
- Arquivos permanecem no GCS mesmo se uma tarefa for removida.

## UC-07 - Visualizar Kanban de Tarefas

Objetivo: acompanhar tarefas por etapa.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario acessa `/tasks`.
2. Frontend chama `GET /api/tasks`.
3. Backend retorna apenas tarefas do tenant.
4. Frontend agrupa por coluna:
   - Recebidas
   - Configurando
   - Em andamento
   - Concluidas

Regras de coluna:

- `completed` ou `success` -> Concluidas.
- `publishing` -> Em andamento.
- Tarefa com destinos distribuidos -> Em andamento.
- Tarefa com pares -> Configurando.
- Sem pares -> Recebidas.

## UC-08 - Remover Tarefa no Kanban

Objetivo: ocultar/remover uma tarefa do fluxo operacional.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario clica na lixeira pequena no card da tarefa.
2. Frontend abre confirmacao.
3. Usuario confirma.
4. Frontend chama `DELETE /api/tasks/:id`.
5. Backend valida `taskId + tenantId`.
6. Backend remove ligacoes em `storage_task_uploads`.
7. Backend remove registro em `storage_tasks`.
8. Frontend atualiza o Kanban.

Regras:

- Nao remove uploads do GCS.
- Nao remove registros de `storage_uploads`.
- Nao permite remover tarefa de outro tenant.

## UC-09 - Montar Pares Feed + Stories

Objetivo: transformar uploads em pares criativos.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario abre `/tasks/:id`.
2. Sistema mostra uploads da tarefa.
3. Usuario seleciona imagem/feed e imagem/story.
4. Usuario informa titulo e texto.
5. Frontend salva em `PUT /api/tasks/:id/pairs`.
6. Backend grava `pairs_json`.

Regras:

- Botao de proxima etapa nao depende de todos os pares estarem completos.
- Tempo de configuracao e acumulado enquanto usuario trabalha.
- Inatividade pausa acumulacao apos timeout configurado.

## UC-10 - Distribuir Pares em Campanhas

Objetivo: associar pares a campanhas e adsets existentes na Meta.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario abre `/tasks/:id/distribution`.
2. Sistema lista pares disponiveis.
3. Usuario adiciona conta Meta.
4. Backend consulta campanhas/adsets da conta.
5. Usuario arrasta pares para campanhas.
6. Usuario escolhe todos os adsets ou adsets especificos.
7. Usuario define formulario padrao ou excecao por par.
8. Frontend salva em `PUT /api/tasks/:id/distribution`.
9. Backend grava `distribution_json`.

Regras:

- Contas/campanhas carregadas pertencem ao tenant.
- Leadforms sao resolvidos por page_id.
- Pares podem ser usados em mais de uma campanha.
- Area de pares fica disponivel durante o scroll global da distribuicao.

## UC-11 - Revisar Distribuicao

Objetivo: validar configuracao antes de publicar.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario abre `/tasks/:id/distribution/review`.
2. Sistema calcula resumo:
   - contas
   - campanhas
   - adsets
   - pares
   - formularios
   - jobs
3. Sistema exibe alertas e erros.
4. Usuario volta ou publica.

Regras:

- Revisao nao altera payload por si so.
- Publicacao e bloqueada se houver erro critico.

## UC-12 - Gerar Payload da Tarefa

Objetivo: montar payload final para n8n.

Ator principal: backend.

Fluxo:

1. Backend carrega tarefa por `taskId + tenantId`.
2. Monta `pair_assets`.
3. Monta `creative_jobs`.
4. Resolve leadform:
   - override por par
   - default da campanha
   - ultimo formulario da pagina
   - formulario do adset
5. Gera `request_id`.
6. Inclui `callback_url`.

Endpoint de preview:

```text
GET /api/tasks/:id/distribution/payload
```

Regras:

- Payload usa URLs assinadas/temporarias para assets.
- `tenant_id` vai no payload.
- Campos enviados ao n8n devem permanecer estaveis.

## UC-13 - Publicar no n8n

Objetivo: enviar a distribuicao para automacao.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario clica em publicar.
2. Frontend chama `POST /api/tasks/:id/distribution/send`.
3. Backend monta payload.
4. Backend envia `{ body: payload }` para `n8nWebhookUrl`.
5. Backend marca tarefa como `publishing`.
6. Frontend mostra status azul "Publicando".

Regras:

- Publicacao exige webhook n8n configurado.
- Publicacao exige pelo menos um asset e um job.
- Tempo de automacao comeca em `automation_started_at`.

## UC-14 - Receber Callback n8n

Objetivo: finalizar status da tarefa/campanha.

Ator principal: n8n.

Fluxo:

1. n8n termina execucao.
2. n8n chama `/api/webhooks/n8n/status`.
3. Envia `x-internal-api-secret`.
4. Envia `tenant_id`.
5. Envia `task_id` ou `campaign_id`.
6. Backend valida segredo e tenant.
7. Backend normaliza status.
8. Backend atualiza tarefa/campanha.
9. Tarefa fica verde se status for sucesso.

Regras:

- Sem `tenant_id`, callback e rejeitado.
- Sem segredo interno valido, callback e rejeitado.
- Tempo de automacao para ao receber status terminal.

## UC-15 - Servir Miniaturas

Objetivo: carregar previews visuais com menor custo.

Ator principal: frontend.

Fluxo:

1. Frontend usa `thumbnailUrl`.
2. Backend valida `taskId + tenantId + uploadId`.
3. Backend envia `ETag`.
4. Se habilitado, backend redireciona para signed URL do GCS.
5. Navegador carrega imagem.

Regras:

- Endpoint nao altera payload da tarefa.
- URL de thumbnail continua igual para o frontend.
- GCS signed URL e temporaria.

## UC-16 - Dashboard

Objetivo: consultar metricas Meta agregadas.

Ator principal: usuario autenticado.

Fluxo:

1. Usuario acessa `/`.
2. Frontend chama endpoints de dashboard.
3. Backend consulta Meta API e snapshots/cache.
4. Sistema exibe metricas, campanhas e criativos.

Regras:

- Dashboard permanece visivel no menu.
- Campanhas, Publicos e Recursos existem como rotas, mas atalhos estao ocultos.

## UC-17 - Compartilhar Dashboard

Objetivo: expor leitura limitada de dashboard por token.

Ator principal: usuario autenticado e visitante com link.

Fluxo:

1. Usuario gera compartilhamento.
2. Backend cria token/metadata.
3. Visitante abre `/shared/dashboard`.
4. Endpoints publicos retornam metricas permitidas.

Regras:

- Accounts compartilhadas sao validadas por tenant.
- Link publico nao concede acesso ao admin nem a tarefas.

## Matriz de Permissoes

| Funcionalidade | system_admin | tenant_admin | member | publico |
| --- | --- | --- | --- | --- |
| Login | sim | sim | sim | nao |
| Gerenciar settings globais | sim | nao | nao | nao |
| Gerenciar tenants | sim | nao | nao | nao |
| Gerenciar usuarios do tenant | sim | sim | nao | nao |
| Conectar Meta OAuth | sim | sim | sim | nao |
| Criar link de upload | sim | sim | sim | nao |
| Usar link publico de upload | nao | nao | nao | sim |
| Ver Kanban de tarefas | sim | sim | sim | nao |
| Remover tarefa | sim | sim | sim | nao |
| Montar pares | sim | sim | sim | nao |
| Distribuir pares | sim | sim | sim | nao |
| Publicar no n8n | sim | sim | sim | nao |
| Callback n8n | nao | nao | nao | interno |

## Regras Criticas

- Nunca misturar dados entre tenants.
- Nunca enviar token Meta bruto ao frontend.
- Nunca salvar segredo novo em logs.
- Payload do n8n deve ser alterado com cuidado, pois automacoes dependem dele.
- Links publicos de upload nao devem dar acesso direto ao bucket.
- Remover tarefa nao remove arquivos do storage.
