-- Jhow Ofertas - Etapa 6.1: automacao 24/7 do Telegram

alter table public.telegram_posts
  add column if not exists locked_at timestamptz,
  add column if not exists lock_id uuid,
  add column if not exists finished_at timestamptz,
  add column if not exists automation_error text;

create table if not exists public.telegram_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  claimed_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  retry_count integer not null default 0,
  stale_recovered_count integer not null default 0,
  status text not null default 'running',
  error text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.telegram_worker_runs enable row level security;

drop policy if exists "Admins can read telegram worker runs" on public.telegram_worker_runs;
create policy "Admins can read telegram worker runs"
on public.telegram_worker_runs
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

revoke all on public.telegram_worker_runs from anon;
revoke insert, update, delete on public.telegram_worker_runs from authenticated;
grant select on public.telegram_worker_runs to authenticated;

insert into public.settings(key,value)
values (
  'telegram_automation',
  jsonb_build_object(
    'enabled', false,
    'batch_size', 10,
    'max_attempts', 5,
    'retry_delay_minutes', 5,
    'stale_sending_minutes', 10
  )
)
on conflict (key) do nothing;

create index if not exists idx_telegram_posts_worker_queue
  on public.telegram_posts(status, next_attempt_at, score desc, created_at)
  where status in ('pending','sending');

create index if not exists idx_telegram_posts_lock
  on public.telegram_posts(lock_id)
  where lock_id is not null;

create index if not exists idx_telegram_worker_runs_started
  on public.telegram_worker_runs(started_at desc);

create or replace function public.claim_telegram_posts(
  p_limit integer default null,
  p_lock_id uuid default gen_random_uuid(),
  p_force boolean default false,
  p_post_id bigint default null
) returns setof public.telegram_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_enabled boolean := false;
  v_batch integer := 10;
  v_max_attempts integer := 5;
  v_limit integer;
begin
  select value into v_settings
  from public.settings
  where key='telegram_automation';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_enabled := coalesce((v_settings->>'enabled')::boolean,false);
  v_batch := greatest(1,least(coalesce((v_settings->>'batch_size')::integer,10),50));
  v_max_attempts := greatest(1,least(coalesce((v_settings->>'max_attempts')::integer,5),20));
  v_limit := greatest(1,least(coalesce(p_limit,v_batch),50));

  if not v_enabled and not p_force then
    return;
  end if;

  return query
  with candidates as (
    select tp.id
    from public.telegram_posts tp
    where tp.status='pending'
      and (p_post_id is null or tp.id=p_post_id)
      and (tp.next_attempt_at is null or tp.next_attempt_at <= now())
      and tp.attempts < v_max_attempts
      and tp.published_url is not null
      and tp.published_url ~* '^https?://'
    order by tp.score desc nulls last, tp.created_at asc, tp.id asc
    for update skip locked
    limit v_limit
  )
  update public.telegram_posts tp
  set status='sending',
      attempts=tp.attempts+1,
      last_attempt_at=now(),
      locked_at=now(),
      lock_id=p_lock_id,
      finished_at=null,
      automation_error=null,
      error=null
  from candidates c
  where tp.id=c.id
  returning tp.*;
end;
$$;

revoke all on function public.claim_telegram_posts(integer,uuid,boolean,bigint)
  from public,anon,authenticated;
grant execute on function public.claim_telegram_posts(integer,uuid,boolean,bigint)
  to service_role;

create or replace function public.recover_stale_telegram_posts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_max_attempts integer := 5;
  v_retry_minutes integer := 5;
  v_stale_minutes integer := 10;
  v_retry_count integer := 0;
  v_failed_count integer := 0;
begin
  select value into v_settings
  from public.settings
  where key='telegram_automation';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_max_attempts := greatest(1,least(coalesce((v_settings->>'max_attempts')::integer,5),20));
  v_retry_minutes := greatest(1,coalesce((v_settings->>'retry_delay_minutes')::integer,5));
  v_stale_minutes := greatest(1,coalesce((v_settings->>'stale_sending_minutes')::integer,10));

  with stale as (
    select tp.id,tp.attempts
    from public.telegram_posts tp
    where tp.status='sending'
      and tp.locked_at is not null
      and tp.locked_at < now()-make_interval(mins=>v_stale_minutes)
    for update skip locked
  ),
  updated as (
    update public.telegram_posts tp
    set status=case when s.attempts >= v_max_attempts then 'failed' else 'pending' end,
        next_attempt_at=case when s.attempts >= v_max_attempts then null else now()+make_interval(mins=>v_retry_minutes) end,
        finished_at=case when s.attempts >= v_max_attempts then now() else null end,
        automation_error='Worker timeout: lock expirado antes da conclusao',
        error='Worker timeout: lock expirado antes da conclusao',
        locked_at=null,
        lock_id=null
    from stale s
    where tp.id=s.id
    returning tp.status
  )
  select
    count(*) filter (where status='pending'),
    count(*) filter (where status='failed')
  into v_retry_count,v_failed_count
  from updated;

  return jsonb_build_object(
    'recovered_pending',coalesce(v_retry_count,0),
    'failed',coalesce(v_failed_count,0)
  );
end;
$$;

revoke all on function public.recover_stale_telegram_posts()
  from public,anon,authenticated;
grant execute on function public.recover_stale_telegram_posts()
  to service_role;

create or replace function public.complete_telegram_post(
  p_post_id bigint,
  p_lock_id uuid,
  p_message_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.telegram_posts
  set status='sent',
      sent_at=now(),
      finished_at=now(),
      telegram_message_id=p_message_id,
      next_attempt_at=null,
      error=null,
      automation_error=null,
      locked_at=null,
      lock_id=null
  where id=p_post_id
    and status='sending'
    and lock_id=p_lock_id;

  get diagnostics v_updated = row_count;
  return v_updated=1;
end;
$$;

revoke all on function public.complete_telegram_post(bigint,uuid,text)
  from public,anon,authenticated;
grant execute on function public.complete_telegram_post(bigint,uuid,text)
  to service_role;

create or replace function public.retry_telegram_post(
  p_post_id bigint,
  p_lock_id uuid,
  p_error text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb := '{}'::jsonb;
  v_max_attempts integer := 5;
  v_retry_minutes integer := 5;
  v_attempts integer;
  v_status text;
begin
  select value into v_settings
  from public.settings
  where key='telegram_automation';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_max_attempts := greatest(1,least(coalesce((v_settings->>'max_attempts')::integer,5),20));
  v_retry_minutes := greatest(1,coalesce((v_settings->>'retry_delay_minutes')::integer,5));

  select attempts into v_attempts
  from public.telegram_posts
  where id=p_post_id
    and status='sending'
    and lock_id=p_lock_id
  for update;

  if not found then
    return 'not_owned';
  end if;

  v_status := case when v_attempts >= v_max_attempts then 'failed' else 'pending' end;

  update public.telegram_posts
  set status=v_status,
      next_attempt_at=case when v_status='failed' then null else now()+make_interval(mins=>v_retry_minutes) end,
      finished_at=case when v_status='failed' then now() else null end,
      automation_error=left(coalesce(p_error,'Erro desconhecido'),2000),
      error=left(coalesce(p_error,'Erro desconhecido'),2000),
      locked_at=null,
      lock_id=null
  where id=p_post_id
    and lock_id=p_lock_id;

  return v_status;
end;
$$;

revoke all on function public.retry_telegram_post(bigint,uuid,text)
  from public,anon,authenticated;
grant execute on function public.retry_telegram_post(bigint,uuid,text)
  to service_role;
