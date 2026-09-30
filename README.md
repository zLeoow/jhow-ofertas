# Jhow Ofertas

Plataforma de inteligência de preços para monitorar produtos, construir histórico próprio, detectar quedas reais, calcular score de oportunidade e publicar ofertas qualificadas.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Recharts
- Supabase/PostgreSQL

## Rodar localmente
```bash
npm install
cp .env.example .env
npm run dev
```

Sem credenciais do Supabase, a aplicação abre em **modo demonstração** usando dados simulados.

## Banco
A migration inicial está em:

`supabase/migrations/001_initial_schema.sql`

Ela prepara produtos, lojas, ofertas, histórico, score, fila de coleta, workers, Telegram, logs e configurações.

## Princípio de análise
O sistema não usa o campo “de/por” da loja como verdade principal. O desconto real é calculado comparando o preço atual com o histórico interno de 7/30/40/90 dias.

## Score
- 0–39: Ignorar
- 40–59: Acompanhar
- 60–74: Oferta
- 75–89: Oferta quente
- 90–100: Oferta excepcional

## Integração com Lovable
Depois de publicar este repositório no GitHub, conecte-o ao projeto do Lovable pela integração GitHub. O código está organizado para ser continuado pelo Lovable sem trocar a stack.
