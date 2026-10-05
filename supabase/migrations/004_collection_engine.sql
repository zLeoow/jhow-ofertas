-- Jhow Ofertas - Etapa 4: fila de coleta e workers
-- Seguro para reaplicacao parcial: novas colunas usam IF NOT EXISTS.

alter table public.product_offers
  add column if not exists collector_enabled boolean not null default false,
  add column if not exists collector_kind text not null default 'manual',
  add column if not exists collector_config jsonb not null default '{}'::jsonb,
  add column if not exists collection_interval_minutes integer not null default 10,
  add column if not exists last_collection_status text,
  add column if not exists last_collection_error text;

alter table public.collection_jobs
  add column if not exists claimed_by uuid references public.workers(id) on delete set null,
  add column if not exists locked_at timestamptz,
  add column if not exists duration_ms integer,
  add column if not exists result jsonb not null default '{}'::jsonb;

create unique index if not exists idx_collection_jobs_one_active_per_offer
  on public.collection_jobs(product_offer_id)
  where status in ('pending','processing');

create index if not exists idx_product_offers_collection_due
  on public.product_offers(collector_enabled, active, next_check_at)
  where collector_enabled = true and active = true;

create or replace function public.heartbeat_worker(
  p_worker_name text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid;
begin
  insert into public.workers(name,status,last_heartbeat,metadata)
  values (p_worker_name,'online',now(),coalesce(p_metadata,'{}'::jsonb))
  on conflict (name) do update
    set status='online',
        last_heartbeat=now(),
        metadata=public.workers.metadata || excluded.metadata
  returning id into v_worker_id;

  return v_worker_id;
end;
$$;

create or replace function public.schedule_collection_jobs(
  p_limit integer default 500
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with candidates as (
    select po.id,
           least(100, greatest(1, round(coalesce(p.popularity_score,50))))::integer as priority
    from public.product_offers po
    join public.products p on p.id = po.product_id
    where po.active
      and po.collector_enabled
      and (po.next_check_at is null or po.next_check_at <= now())
      and not exists (
        select 1 from public.collection_jobs j
        where j.product_offer_id = po.id
          and j.status in ('pending','processing')
      )
    order by po.next_check_at nulls first, p.popularity_score desc, po.id
    limit greatest(1, least(coalesce(p_limit,500),2000))
  ),
  inserted as (
    insert into public.collection_jobs(product_offer_id,status,priority,scheduled_at)
    select id,'pending',priority,now() from candidates
    on conflict do nothing
    returning id
  )
  select count(*) into v_count from inserted;

  return coalesce(v_count,0);
end;
$$;

create or replace function public.claim_collection_jobs(
  p_worker_name text,
  p_limit integer default 10
) returns table (
  job_id bigint,
  product_offer_id uuid,
  offer_url text,
  collector_kind text,
  collector_config jsonb,
  current_price numeric,
  shipping_price numeric,
  in_stock boolean,
  store_slug text,
  product_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid;
begin
  v_worker_id := public.heartbeat_worker(
    p_worker_name,
    jsonb_build_object('last_claim_at',now())
  );

  return query
  with picked as (
    select j.id
    from public.collection_jobs j
    where j.status='pending'
      and j.scheduled_at <= now()
    order by j.priority desc, j.scheduled_at asc, j.id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,10),100))
  ),
  claimed as (
    update public.collection_jobs j
      set status='processing',
          attempts=j.attempts+1,
          started_at=now(),
          finished_at=null,
          claimed_by=v_worker_id,
          locked_at=now(),
          error=null
    from picked p
    where j.id=p.id
    returning j.id,j.product_offer_id
  )
  select c.id,
         po.id,
         po.url,
         po.collector_kind,
         po.collector_config,
         po.current_price,
         po.shipping_price,
         po.in_stock,
         s.slug,
         p.name
  from claimed c
  join public.product_offers po on po.id=c.product_offer_id
  join public.stores s on s.id=po.store_id
  join public.products p on p.id=po.product_id;
end;
$$;

create or replace function public.complete_collection_job(
  p_job_id bigint,
  p_price numeric,
  p_original_price numeric default null,
  p_shipping_price numeric default null,
  p_in_stock boolean default true,
  p_result jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.collection_jobs%rowtype;
  v_offer public.product_offers%rowtype;
  v_duration integer;
begin
  select * into v_job
  from public.collection_jobs
  where id=p_job_id
  for update;

  if not found or v_job.status <> 'processing' then
    raise exception 'Job % nao esta em processamento', p_job_id;
  end if;

  if p_price is null or p_price <= 0 then
    raise exception 'Preco coletado invalido';
  end if;

  select * into v_offer
  from public.product_offers
  where id=v_job.product_offer_id
  for update;

  update public.product_offers
    set current_price=p_price,
        original_price=coalesce(p_original_price,original_price),
        shipping_price=coalesce(p_shipping_price,shipping_price),
        in_stock=coalesce(p_in_stock,true),
        last_checked_at=now(),
        next_check_at=now()+make_interval(mins => greatest(1,collection_interval_minutes)),
        last_collection_status='completed',
        last_collection_error=null
  where id=v_offer.id;

  -- Se o trigger de mudanca de preco nao inseriu uma amostra agora, registra
  -- a coleta mesmo com preco repetido. Isso melhora a confianca do historico.
  if not exists (
    select 1 from public.price_history h
    where h.product_offer_id=v_offer.id
      and h.collected_at >= now()-interval '10 seconds'
      and h.price=p_price
  ) then
    insert into public.price_history(product_offer_id,price,shipping_price,in_stock,collected_at)
    values (
      v_offer.id,
      p_price,
      coalesce(p_shipping_price,v_offer.shipping_price),
      coalesce(p_in_stock,true),
      now()
    );
  end if;

  v_duration := greatest(0, extract(epoch from (now()-coalesce(v_job.started_at,now())))*1000)::integer;

  update public.collection_jobs
    set status='completed',
        finished_at=now(),
        duration_ms=v_duration,
        result=coalesce(p_result,'{}'::jsonb),
        error=null
  where id=p_job_id;

  update public.workers
    set status='online',
        last_heartbeat=now(),
        processed_count=processed_count+1,
        avg_duration_ms=case
          when processed_count=0 then v_duration
          else round(((avg_duration_ms::numeric*processed_count)+v_duration)/(processed_count+1))::integer
        end
  where id=v_job.claimed_by;

  insert into public.collector_logs(level,event,source,product_offer_id,message,metadata)
  values (
    'info',
    'collection_completed',
    'worker',
    v_offer.id,
    'Coleta concluida',
    jsonb_build_object('job_id',p_job_id,'price',p_price,'duration_ms',v_duration) || coalesce(p_result,'{}'::jsonb)
  );
end;
$$;

create or replace function public.fail_collection_job(
  p_job_id bigint,
  p_error text,
  p_retry_delay_minutes integer default 5,
  p_result jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.collection_jobs%rowtype;
  v_max_attempts integer := 3;
  v_retry boolean;
begin
  select * into v_job
  from public.collection_jobs
  where id=p_job_id
  for update;

  if not found then
    raise exception 'Job % nao encontrado',p_job_id;
  end if;

  select coalesce((value->>'max_attempts')::integer,3)
    into v_max_attempts
  from public.settings
  where key='collector';

  v_max_attempts := coalesce(v_max_attempts,3);
  v_retry := v_job.attempts < v_max_attempts;

  update public.collection_jobs
    set status=case when v_retry then 'pending' else 'failed' end,
        scheduled_at=case when v_retry then now()+make_interval(mins => greatest(1,coalesce(p_retry_delay_minutes,5))) else scheduled_at end,
        started_at=case when v_retry then null else started_at end,
        finished_at=case when v_retry then null else now() end,
        claimed_by=case when v_retry then null else claimed_by end,
        locked_at=case when v_retry then null else locked_at end,
        error=left(coalesce(p_error,'Erro desconhecido'),2000),
        result=coalesce(p_result,'{}'::jsonb)
  where id=p_job_id;

  update public.product_offers
    set last_checked_at=now(),
        next_check_at=case when v_retry then now()+make_interval(mins => greatest(1,coalesce(p_retry_delay_minutes,5))) else next_check_at end,
        last_collection_status=case when v_retry then 'retry' else 'failed' end,
        last_collection_error=left(coalesce(p_error,'Erro desconhecido'),2000)
  where id=v_job.product_offer_id;

  update public.workers
    set status='online',
        last_heartbeat=now(),
        error_count=error_count+1
  where id=v_job.claimed_by;

  insert into public.collector_logs(level,event,source,product_offer_id,message,metadata)
  values (
    case when v_retry then 'warn' else 'error' end,
    case when v_retry then 'collection_retry' else 'collection_failed' end,
    'worker',
    v_job.product_offer_id,
    left(coalesce(p_error,'Erro desconhecido'),2000),
    jsonb_build_object('job_id',p_job_id,'attempts',v_job.attempts,'will_retry',v_retry) || coalesce(p_result,'{}'::jsonb)
  );
end;
$$;

create or replace function public.requeue_stale_collection_jobs(
  p_after_minutes integer default 15
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.collection_jobs
      set status='pending',
          scheduled_at=now(),
          started_at=null,
          claimed_by=null,
          locked_at=null,
          error='Job reaberto apos timeout do worker'
    where status='processing'
      and locked_at < now()-make_interval(mins => greatest(5,coalesce(p_after_minutes,15)))
    returning id
  )
  select count(*) into v_count from stale;

  update public.workers
    set status='offline'
  where last_heartbeat < now()-interval '15 minutes'
    and status <> 'offline';

  return coalesce(v_count,0);
end;
$$;

revoke all on function public.heartbeat_worker(text,jsonb) from public,anon,authenticated;
revoke all on function public.schedule_collection_jobs(integer) from public,anon,authenticated;
revoke all on function public.claim_collection_jobs(text,integer) from public,anon,authenticated;
revoke all on function public.complete_collection_job(bigint,numeric,numeric,numeric,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.fail_collection_job(bigint,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.requeue_stale_collection_jobs(integer) from public,anon,authenticated;

grant execute on function public.heartbeat_worker(text,jsonb) to service_role;
grant execute on function public.schedule_collection_jobs(integer) to service_role;
grant execute on function public.claim_collection_jobs(text,integer) to service_role;
grant execute on function public.complete_collection_job(bigint,numeric,numeric,numeric,boolean,jsonb) to service_role;
grant execute on function public.fail_collection_job(bigint,text,integer,jsonb) to service_role;
grant execute on function public.requeue_stale_collection_jobs(integer) to service_role;
