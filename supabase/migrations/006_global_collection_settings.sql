-- Jhow Ofertas - Etapa 4.2: configuracoes globais do motor de coleta

insert into public.settings(key,value)
values (
  'collector',
  jsonb_build_object(
    'engine_enabled', true,
    'adaptive_intervals', true,
    'popular_threshold', 80,
    'normal_threshold', 40,
    'interval_popular_minutes', 5,
    'interval_normal_minutes', 30,
    'interval_low_minutes', 120,
    'interval_out_of_stock_minutes', 360,
    'priority_popular', 90,
    'priority_normal', 50,
    'priority_low', 20,
    'priority_out_of_stock', 10,
    'max_attempts', 3,
    'retry_delay_minutes', 5,
    'stale_job_minutes', 15,
    'worker_offline_minutes', 15,
    'schedule_limit', 500,
    'min_publish_score', 75
  )
)
on conflict (key) do nothing;

create or replace function public.schedule_collection_jobs(
  p_limit integer default 500
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_settings jsonb := '{}'::jsonb;
  v_limit integer;
  v_popular_threshold numeric;
  v_normal_threshold numeric;
  v_priority_popular integer;
  v_priority_normal integer;
  v_priority_low integer;
  v_priority_out integer;
  v_enabled boolean;
begin
  select value into v_settings
  from public.settings
  where key='collector';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_enabled := coalesce((v_settings->>'engine_enabled')::boolean,true);

  if not v_enabled then
    return 0;
  end if;

  v_limit := greatest(1, least(coalesce((v_settings->>'schedule_limit')::integer,p_limit,500),2000));
  v_popular_threshold := coalesce((v_settings->>'popular_threshold')::numeric,80);
  v_normal_threshold := coalesce((v_settings->>'normal_threshold')::numeric,40);
  v_priority_popular := greatest(1,least(coalesce((v_settings->>'priority_popular')::integer,90),100));
  v_priority_normal := greatest(1,least(coalesce((v_settings->>'priority_normal')::integer,50),100));
  v_priority_low := greatest(1,least(coalesce((v_settings->>'priority_low')::integer,20),100));
  v_priority_out := greatest(1,least(coalesce((v_settings->>'priority_out_of_stock')::integer,10),100));

  with candidates as (
    select
      po.id,
      case
        when not po.in_stock then v_priority_out
        when coalesce(p.popularity_score,50) >= v_popular_threshold then v_priority_popular
        when coalesce(p.popularity_score,50) >= v_normal_threshold then v_priority_normal
        else v_priority_low
      end as priority
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
    limit v_limit
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
  v_settings jsonb := '{}'::jsonb;
  v_adaptive boolean;
  v_popularity numeric := 50;
  v_popular_threshold numeric;
  v_normal_threshold numeric;
  v_next_minutes integer;
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

  select coalesce(p.popularity_score,50)
    into v_popularity
  from public.products p
  where p.id=v_offer.product_id;

  select value into v_settings
  from public.settings
  where key='collector';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_adaptive := coalesce((v_settings->>'adaptive_intervals')::boolean,true);
  v_popular_threshold := coalesce((v_settings->>'popular_threshold')::numeric,80);
  v_normal_threshold := coalesce((v_settings->>'normal_threshold')::numeric,40);

  if not v_adaptive then
    v_next_minutes := greatest(1,v_offer.collection_interval_minutes);
  elsif not coalesce(p_in_stock,true) then
    v_next_minutes := greatest(1,coalesce((v_settings->>'interval_out_of_stock_minutes')::integer,360));
  elsif v_popularity >= v_popular_threshold then
    v_next_minutes := greatest(1,coalesce((v_settings->>'interval_popular_minutes')::integer,5));
  elsif v_popularity >= v_normal_threshold then
    v_next_minutes := greatest(1,coalesce((v_settings->>'interval_normal_minutes')::integer,30));
  else
    v_next_minutes := greatest(1,coalesce((v_settings->>'interval_low_minutes')::integer,120));
  end if;

  update public.product_offers
    set current_price=p_price,
        original_price=coalesce(p_original_price,original_price),
        shipping_price=coalesce(p_shipping_price,shipping_price),
        in_stock=coalesce(p_in_stock,true),
        last_checked_at=now(),
        next_check_at=now()+make_interval(mins => v_next_minutes),
        last_collection_status='completed',
        last_collection_error=null
  where id=v_offer.id;

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
        result=coalesce(p_result,'{}'::jsonb) || jsonb_build_object('next_interval_minutes',v_next_minutes),
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
    jsonb_build_object(
      'job_id',p_job_id,
      'price',p_price,
      'duration_ms',v_duration,
      'next_interval_minutes',v_next_minutes
    ) || coalesce(p_result,'{}'::jsonb)
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
  v_settings jsonb := '{}'::jsonb;
  v_max_attempts integer := 3;
  v_retry_delay integer := 5;
  v_retry boolean;
begin
  select * into v_job
  from public.collection_jobs
  where id=p_job_id
  for update;

  if not found then
    raise exception 'Job % nao encontrado',p_job_id;
  end if;

  select value into v_settings
  from public.settings
  where key='collector';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_max_attempts := greatest(1,coalesce((v_settings->>'max_attempts')::integer,3));
  v_retry_delay := greatest(1,coalesce((v_settings->>'retry_delay_minutes')::integer,p_retry_delay_minutes,5));
  v_retry := v_job.attempts < v_max_attempts;

  update public.collection_jobs
    set status=case when v_retry then 'pending' else 'failed' end,
        scheduled_at=case when v_retry then now()+make_interval(mins => v_retry_delay) else scheduled_at end,
        started_at=case when v_retry then null else started_at end,
        finished_at=case when v_retry then null else now() end,
        claimed_by=case when v_retry then null else claimed_by end,
        locked_at=case when v_retry then null else locked_at end,
        error=left(coalesce(p_error,'Erro desconhecido'),2000),
        result=coalesce(p_result,'{}'::jsonb)
  where id=p_job_id;

  update public.product_offers
    set last_checked_at=now(),
        next_check_at=case when v_retry then now()+make_interval(mins => v_retry_delay) else next_check_at end,
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
    jsonb_build_object(
      'job_id',p_job_id,
      'attempts',v_job.attempts,
      'max_attempts',v_max_attempts,
      'retry_delay_minutes',v_retry_delay,
      'will_retry',v_retry
    ) || coalesce(p_result,'{}'::jsonb)
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
  v_settings jsonb := '{}'::jsonb;
  v_stale_minutes integer := 15;
  v_offline_minutes integer := 15;
begin
  select value into v_settings
  from public.settings
  where key='collector';

  v_settings := coalesce(v_settings,'{}'::jsonb);
  v_stale_minutes := greatest(5,coalesce((v_settings->>'stale_job_minutes')::integer,p_after_minutes,15));
  v_offline_minutes := greatest(1,coalesce((v_settings->>'worker_offline_minutes')::integer,15));

  with stale as (
    update public.collection_jobs
      set status='pending',
          scheduled_at=now(),
          started_at=null,
          claimed_by=null,
          locked_at=null,
          error='Job reaberto apos timeout do worker'
    where status='processing'
      and locked_at < now()-make_interval(mins => v_stale_minutes)
    returning id
  )
  select count(*) into v_count from stale;

  update public.workers
    set status='offline'
  where last_heartbeat < now()-make_interval(mins => v_offline_minutes)
    and status <> 'offline';

  return coalesce(v_count,0);
end;
$$;
