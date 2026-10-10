-- Jhow Ofertas - Etapa 6.2: autenticação estável do scheduler Telegram
-- O segredo bruto permanece somente nos secret stores. O banco guarda apenas SHA-256.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.internal_scheduler_auth (
  key text primary key,
  secret_hash bytea not null,
  updated_at timestamptz not null default now()
);

alter table public.internal_scheduler_auth enable row level security;

revoke all on public.internal_scheduler_auth from public, anon, authenticated;

create or replace function public.set_telegram_cron_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or length(trim(p_secret)) < 32 then
    raise exception 'Cron secret must contain at least 32 characters';
  end if;

  insert into public.internal_scheduler_auth(key, secret_hash, updated_at)
  values (
    'telegram-worker',
    extensions.digest(trim(p_secret), 'sha256'),
    now()
  )
  on conflict (key) do update
  set secret_hash=excluded.secret_hash,
      updated_at=excluded.updated_at;
end;
$$;

revoke all on function public.set_telegram_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.set_telegram_cron_secret(text)
  to service_role;

create or replace function public.verify_telegram_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    p_secret is not null
    and exists (
      select 1
      from public.internal_scheduler_auth a
      where a.key='telegram-worker'
        and a.secret_hash=extensions.digest(trim(p_secret), 'sha256')
    );
$$;

revoke all on function public.verify_telegram_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_telegram_cron_secret(text)
  to service_role;

comment on table public.internal_scheduler_auth is
  'Internal scheduler authentication hashes. Raw secrets are never stored here.';
comment on function public.verify_telegram_cron_secret(text) is
  'Service-role-only constant-purpose verifier for the Telegram scheduler secret.';
