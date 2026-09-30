# Roadmap — Jhow Ofertas

## Etapa 1 — Fundação
- Dashboard responsivo
- Produtos e detalhe do produto
- Ofertas e classificação por score
- Estrutura completa de rotas
- Tipos, serviços e mock data
- Schema PostgreSQL/Supabase inicial

## Etapa 2 — Supabase real
- Autenticação administrativa
- RLS por perfil
- CRUD de lojas/produtos/ofertas
- Views para dashboard
- Seeds e dados reais de teste

## Etapa 3 — Motor de histórico e score
- Médias 7/30/40/90 dias
- Mediana 40 dias
- Menor preço 40/90 dias
- Detecção de preço inflado e queda real
- Score 0–100 parametrizável

## Etapa 4 — Fila e workers
- Scheduler
- collection_jobs
- heartbeat
- retries/backoff
- ingest endpoint autenticado

## Etapa 5 — Coletores reais
- Adapter por fonte
- APIs e feeds oficiais quando disponíveis
- Rate limit e caching
- Normalização de SKU/EAN

## Etapa 6 — Cupons
- Cadastro/validação
- Preço final com cupom
- Regras por loja

## Etapa 7 — Telegram
- Bot API via backend
- Templates
- Deduplicação/repost
- Canais e score mínimo

## Etapa 8 — Produção
- Observabilidade
- Alertas
- Backup
- Segurança
- Escala horizontal de workers
