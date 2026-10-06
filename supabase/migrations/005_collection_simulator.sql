-- Jhow Ofertas - Etapa 4.1: simulador administrativo de coleta
-- Permite testar o pipeline completo sem API externa nem service role no navegador.

create or replace function public.simulate_collection(
  p_offer_id uuid,
  p_price numeric,
  p_original_price numeric default null,
  p_shipping_price numeric default null,
  p_in_stock boolean default true
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id uuid;
  v_job_id bigint;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Apenas administradores podem simular coletas';
  end if;

  if p_price is null or p_price <= 0 then
    raise exception 'Preco simulado deve ser maior que zero';
  end if;

  perform 1
  from public.product_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Oferta nao encontrada';
  end if;

  if exists (
    select 1
    from public.collection_jobs
    where product_offer_id = p_offer_id
      and status in ('pending','processing')
  ) then
    raise exception 'Ja existe um job ativo para esta oferta';
  end if;

  v_worker_id := public.heartbeat_worker(
    'admin-simulator',
    jsonb_build_object(
      'mode','simulator',
      'actor_user_id',auth.uid(),
      'last_simulation_at',now()
    )
  );

  insert into public.collection_jobs(
    product_offer_id,
    status,
    priority,
    attempts,
    scheduled_at,
    started_at,
    claimed_by,
    locked_at,
    result
  )
  values (
    p_offer_id,
    'processing',
    100,
    1,
    now(),
    now(),
    v_worker_id,
    now(),
    jsonb_build_object('simulated',true)
  )
  returning id into v_job_id;

  perform public.complete_collection_job(
    v_job_id,
    p_price,
    p_original_price,
    p_shipping_price,
    coalesce(p_in_stock,true),
    jsonb_build_object(
      'simulated',true,
      'source','admin-panel',
      'actor_user_id',auth.uid()
    )
  );

  return v_job_id;
end;
$$;

revoke all on function public.simulate_collection(uuid,numeric,numeric,numeric,boolean)
  from public, anon;

grant execute on function public.simulate_collection(uuid,numeric,numeric,numeric,boolean)
  to authenticated;

comment on function public.simulate_collection(uuid,numeric,numeric,numeric,boolean)
  is 'Admin-only simulator that exercises the real collection pipeline without an external API.';
