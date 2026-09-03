# Monitoramento

O ambiente de monitoramento tem quatro servicos internos:

```text
app -> logs JSON -> Alloy -> Loki -> Grafana
app -> /internal/metrics -> Prometheus -> Grafana
```

Loki, Prometheus e Alloy nao possuem portas publicadas pelo Docker Compose. O
Grafana e a unica interface de acesso humano e ja esta vinculado a `127.0.0.1`.

## Segredo do Prometheus

Antes de iniciar a stack, crie o arquivo
`.local/secrets/prometheus-internal-api-secret` no servidor. Ele deve conter
exatamente o mesmo valor de `INTERNAL_API_SECRET` usado pelo servico `app`, sem
quebra de linha. Esse arquivo e ignorado pelo Git.

Tambem configure `LOG_IP_HASH_SECRET` no `.env` com um segredo aleatorio
independente. Ele e usado para correlacionar requisicoes da mesma origem sem
registrar o IP bruto.

## Verificacao

Depois do deploy:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 prometheus alloy loki
```

No Grafana, abra **Connections > Data sources** e confirme que Loki e
Prometheus respondem. Em seguida, use estas consultas:

```logql
sum(count_over_time({service="autoads"} | json | event="http_request" [1m]))
```

```promql
sum(rate(autoads_http_requests_total[5m]))
```

## Alertas iniciais

- Falhas de login: `sum(increase(autoads_http_requests_total{route="/api/auth",status="401"}[5m])) > 20`.
- Limites atingidos: `sum(increase(autoads_http_requests_total{status="429"}[5m])) > 10`.
- Erros de servidor: `sum(increase(autoads_http_requests_total{status=~"5.."}[5m])) > 5`.
