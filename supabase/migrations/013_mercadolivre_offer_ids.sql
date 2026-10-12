-- Jhow Ofertas - Mercado Livre external offer identifiers

alter table public.product_offers
  add column if not exists external_source text,
  add column if not exists external_id text;

create unique index if not exists product_offers_external_source_id_uidx
  on public.product_offers(external_source, external_id)
  where external_source is not null and external_id is not null;
