# Google Cloud Storage no Auto Ads

## Como o storage funciona

O Auto Ads nao usa login pessoal do Google para o bucket.

Ele funciona assim:

1. Um administrador define o bucket do Google Cloud Storage no ambiente do servidor.
2. O servidor le o JSON de uma service account a partir de variavel de ambiente ou arquivo local privado.
3. Quando alguem faz upload pela tela interna ou pela pagina publica, o backend do Auto Ads:
   - autentica no Google usando a service account
   - gera um access token OAuth server-to-server
   - envia o arquivo para o bucket
   - registra o upload no banco local
4. Os links publicos de upload ficam salvos por tenant, podem expirar e podem ser revogados.

O link publico controla acesso a uma pagina de upload.

Ele nao torna o bucket publico.

## O que configurar no Google Cloud

### 1. Criar ou escolher um projeto

- Abra o Google Cloud Console.
- Selecione o projeto que vai hospedar o bucket.

### 2. Criar o bucket

- Acesse `Cloud Storage > Buckets`.
- Crie um bucket novo ou escolha um existente.
- Guarde o nome exato do bucket.

Sugestao:

- Use um bucket dedicado ao Auto Ads.
- Ative `Uniform bucket-level access`.

### 3. Criar a service account

- Acesse `IAM & Admin > Service Accounts`.
- Clique em `Create service account`.
- Dê um nome como `autoads-storage`.

### 4. Dar permissao no bucket

No bucket:

- Abra a aba de permissoes.
- Adicione a service account como principal.

Permissao recomendada para o fluxo atual:

- `Storage Object Creator`

Permissao mais permissiva, mas mais simples para testes:

- `Storage Object Admin`

### 5. Gerar a chave JSON

- Abra a service account criada.
- Vá em `Keys`.
- Crie uma chave do tipo `JSON`.
- Baixe o arquivo.

## O que configurar no Auto Ads

### 1. Variavel publica da app

Defina:

- `PUBLIC_APP_URL`

Exemplo:

```env
PUBLIC_APP_URL=https://app.seudominio.com
```

### 2. Aplicar o schema

Use o schema atualizado do projeto:

```bash
npm run db:push
```

Se voce aplica SQL manualmente, use a migration:

- `migrations/meta/0003_gcs_storage_uploads.sql`

### 3. Definir bucket e arquivo de credenciais

No `.env`:

```env
GCS_BUCKET_NAME=seu-bucket
GCS_SERVICE_ACCOUNT_FILE=focus-copilot-430220-a8-9affb0c35e8a.json
```

Se preferir, o caminho tambem pode ser algo como:

```env
GCS_SERVICE_ACCOUNT_FILE=.local/secrets/gcs.json
```

O backend agora tenta ler, nesta ordem:

1. `GCS_SERVICE_ACCOUNT_JSON`
2. `GCS_SERVICE_ACCOUNT_FILE`
3. `focus-copilot-430220-a8-9affb0c35e8a.json` na raiz do projeto
4. `.local/secrets/gcs.json`

Ou seja: se voce ja deixou `focus-copilot-430220-a8-9affb0c35e8a.json` na raiz, ele ja pode ser usado sem passar pelo `Admin`.

### 4. Se voce roda com Docker Compose

O container precisa receber o bucket e enxergar a chave JSON.

Este projeto agora monta automaticamente:

- `./focus-copilot-430220-a8-9affb0c35e8a.json`
- em `/app/.local/secrets/gcs.json`

e define no container:

- `GCS_BUCKET_NAME`
- `GCS_SERVICE_ACCOUNT_FILE=/app/.local/secrets/gcs.json`

Depois de alterar o `docker-compose.yml`, recrie o container da app.

## Como associar sua conta

No caso de Google Cloud Storage, a associacao nao e feita com OAuth de usuario final.

Ela e feita por IAM:

- sua conta Google administra o projeto
- voce cria uma service account
- voce concede acesso dessa service account ao bucket
- o Auto Ads passa a operar usando essa identidade tecnica

Isso e o modelo normal para backend em producao.

## Como usar

### Upload interno

- Abra `Uploads` no menu lateral
- Escolha arquivos
- Opcionalmente informe uma pasta logica
- Clique em `Enviar para o bucket`

### Criar um link publico

- Abra `Uploads`
- Preencha nome, pasta logica e data de expiracao
- Clique em `Criar link publico`
- Copie o link gerado

### Revogar um link publico

- Ainda em `Uploads`
- Localize o link
- Clique em `Excluir`

Depois disso, a pagina publica para de aceitar uploads.

## Observacoes importantes

- O link publico e da pagina de upload, nao do arquivo final.
- A URL tecnica do objeto no bucket nao garante acesso publico ao arquivo.
- O Auto Ads grava os uploads no banco para manter historico mesmo sem listar o bucket diretamente.
- Os arquivos sao salvos com caminho por tenant e data para evitar colisao de nome.
