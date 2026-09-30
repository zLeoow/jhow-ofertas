create extension if not exists "pgcrypto";

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  website text,
  affiliate_template text,
  active boolean not null default true,
  trust_score numeric(5,2) not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  model text,
  ean text,
  category text,
  image_url text,
  active boolean not null default true,
  popularity_score numeric(5,2) not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  code text not null,
  description text,
  discount_type text check (discount_type in ('percent','fixed','shipping')),
  discount_value numeric(12,2),
  minimum_purchase numeric(12,2),
  expires_at timestamptz,
  verified boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  url text not null,
  affiliate_url text,
  current_price numeric(12,2),
  original_price numeric(12,2),
  shipping_price numeric(12,2) not null default 0,
  installments text,
  in_stock boolean not null default true,
  coupon_id uuid references coupons(id) on delete set null,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  active boolean not null default true,
  unique(product_id, store_id, url)
);

create table if not exists price_history (
  id bigserial primary key,
  product_offer_id uuid not null references product_offers(id) on delete cascade,
  price numeric(12,2) not null,
  shipping_price numeric(12,2) not null default 0,
  in_stock boolean not null default true,
  collected_at timestamptz not null default now()
);

create index if not exists idx_price_history_offer_time on price_history(product_offer_id, collected_at desc);

create table if not exists offer_scores (
  id bigserial primary key,
  product_offer_id uuid not null references product_offers(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  avg_7d numeric(12,2),
  avg_30d numeric(12,2),
  avg_40d numeric(12,2),
  avg_90d numeric(12,2),
  median_40d numeric(12,2),
  low_40d numeric(12,2),
  low_90d numeric(12,2),
  percent_below_avg numeric(8,3),
  is_new_low boolean not null default false,
  classification text not null,
  reasons jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now()
);

create table if not exists collection_jobs (
  id bigserial primary key,
  product_offer_id uuid not null references product_offers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  priority integer not null default 50,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

create index if not exists idx_collection_jobs_queue on collection_jobs(status, priority desc, scheduled_at asc);

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'offline',
  last_heartbeat timestamptz,
  processed_count bigint not null default 0,
  error_count bigint not null default 0,
  avg_duration_ms integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists telegram_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chat_id text not null unique,
  active boolean not null default true,
  min_score integer not null default 75,
  allowed_categories text[] not null default '{}'
);

create table if not exists telegram_posts (
  id bigserial primary key,
  product_offer_id uuid references product_offers(id) on delete set null,
  channel_id uuid references telegram_channels(id) on delete cascade,
  telegram_message_id text,
  status text not null default 'pending',
  price numeric(12,2),
  score integer,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists collector_logs (
  id bigserial primary key,
  level text not null default 'info',
  event text not null,
  source text,
  product_offer_id uuid references product_offers(id) on delete set null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings(key, value) values
  ('scoring', '{"min_publish_score":75,"min_drop_percent":5,"repost_minutes":120}'::jsonb),
  ('collector', '{"batch_size":500,"max_attempts":3,"popular_interval_minutes":2,"normal_interval_minutes":10,"low_interval_minutes":30,"out_of_stock_interval_minutes":120}'::jsonb)
on conflict (key) do nothing;

alter table stores enable row level security;
alter table products enable row level security;
alter table coupons enable row level security;
alter table product_offers enable row level security;
alter table price_history enable row level security;
alter table offer_scores enable row level security;
alter table collection_jobs enable row level security;
alter table workers enable row level security;
alter table telegram_channels enable row level security;
alter table telegram_posts enable row level security;
alter table collector_logs enable row level security;
alter table settings enable row level security;
