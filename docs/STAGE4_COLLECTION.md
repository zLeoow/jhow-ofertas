# Etapa 4 — Coleta automática

A Etapa 4 adiciona a fila de coleta, workers concorrentes e o primeiro adaptador real.

## Arquitetura

```text
GitHub Actions (5 min)
        |
        v
schedule_collection_jobs()
        |
        v
collection_jobs
        |
        v
claim_collection_jobs()  -- SKIP LOCKED
        |
        v
worker TypeScript
        |
        +--> manual (teste)
        |
        +--> mercadolivre (API oficial)
        |
        v
complete_collection_job()
        |
        +--> product_offers
        +--> price_history
        +--> offer_scores (trigger da Etapa 3)
        +--> collector_logs
```

## Segurança

O worker usa `SUPABASE_SERVICE_ROLE_KEY`. Essa chave **nunca** deve ir para o frontend ou para o repositório.

Adicione em GitHub > Settings > Secrets and variables > Actions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MERCADOLIVRE_ACCESS_TOKEN` (necessário somente para ofertas Mercado Livre)

## Habilitar uma oferta para coleta

Por segurança, ofertas existentes começam com `collector_enabled = false`.

Exemplo Mercado Livre:

```sql
update product_offers
set collector_enabled = true,
    collector_kind = 'mercadolivre',
    collector_config = '{"item_id":"MLB1234567890"}'::jsonb,
    collection_interval_minutes = 10,
    next_check_at = now()
where id = 'UUID_DA_OFERTA';
```

Use o ID real da publicação Mercado Livre.

## Mercado Livre

O adaptador usa:

- `GET /items/{ITEM_ID}/sale_price?context=channel_marketplace` para o preço vencedor;
- `GET /items/{ITEM_ID}` para status/estoque disponível.

O preço de frete não é inventado. Quando a API consultada não fornece frete de forma confiável, o worker mantém o valor que já estava salvo.

## Teste manual

Para testar toda a fila sem acessar uma loja externa:

```sql
update product_offers
set collector_enabled = true,
    collector_kind = 'manual',
    collection_interval_minutes = 120,
    next_check_at = now()
where id = 'UUID_DA_OFERTA';
```

Depois execute manualmente o workflow **Jhow Collector** no GitHub Actions.

## Próximos adaptadores

Adicionar adaptadores somente por APIs/feeds oficiais ou fontes cujo uso automatizado seja permitido. O registro fica em `workers/collector/src/adapters/index.ts`.
