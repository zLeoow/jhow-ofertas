-- Jhow Ofertas - Etapa 5: motor de cupons e preco efetivo

alter table public.coupons
  add column if not exists active boolean not null default true,
  add column if not exists max_discount numeric(12,2),
  add column if not exists source_url text,
  add column if not exists notes text,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.offer_scores
  add column if not exists effective_price numeric(12,2),
  add column if not exists coupon_discount_amount numeric(12,2) not null default 0,
  add column if not exists effective_shipping_price numeric(12,2),
  add column if not exists coupon_applied boolean not null default false;

drop trigger if exists coupons_touch on public.coupons;
create trigger coupons_touch
before update on public.coupons
for each row execute function public.touch_updated_at();

create index if not exists idx_coupons_store_active
  on public.coupons(store_id, active, verified, expires_at);

create or replace function public.calculate_offer_score_internal(p_offer_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  stats record;
  latest record;
  v_now timestamptz := now();
  v_conf numeric := 0;
  v_below numeric;
  v_change numeric;
  v_new40 boolean := false;
  v_new90 boolean := false;
  v_coupon boolean := false;
  v_coupon_discount numeric := 0;
  v_effective_price numeric;
  v_effective_shipping numeric;
  p_discount integer := 0;
  p_low integer := 0;
  p_change integer := 0;
  p_history integer := 0;
  p_trust integer := 0;
  p_stock integer := 0;
  p_coupon integer := 0;
  p_shipping integer := 0;
  p_short integer := 0;
  p_outlier integer := 0;
  p_no_stock integer := 0;
  p_low_trust integer := 0;
  v_score integer;
  v_class text;
  v_id bigint;
begin
  select
    po.*,
    s.trust_score,
    c.active as coupon_active,
    c.verified as coupon_verified,
    c.expires_at as coupon_expiry,
    c.minimum_purchase as coupon_minimum,
    c.store_id as coupon_store,
    c.discount_type as coupon_type,
    c.discount_value as coupon_value,
    c.max_discount as coupon_max_discount
  into o
  from public.product_offers po
  join public.stores s on s.id = po.store_id
  left join public.coupons c on c.id = po.coupon_id
  where po.id = p_offer_id
    and po.active;

  if not found or o.current_price is null or o.current_price <= 0 then
    return null;
  end if;

  v_coupon :=
    coalesce(o.coupon_active,false)
    and coalesce(o.coupon_verified,false)
    and (o.coupon_expiry is null or o.coupon_expiry > v_now)
    and (o.coupon_minimum is null or o.current_price >= o.coupon_minimum)
    and (o.coupon_store is null or o.coupon_store = o.store_id)
    and o.coupon_type in ('percent','fixed','shipping');

  v_effective_price := o.current_price;
  v_effective_shipping := coalesce(o.shipping_price,0);

  if v_coupon then
    if o.coupon_type = 'percent' then
      v_coupon_discount := greatest(0, o.current_price * coalesce(o.coupon_value,0) / 100);
      if o.coupon_max_discount is not null then
        v_coupon_discount := least(v_coupon_discount, greatest(0,o.coupon_max_discount));
      end if;
      v_coupon_discount := least(v_coupon_discount,o.current_price);
      v_effective_price := greatest(0,o.current_price-v_coupon_discount);
    elsif o.coupon_type = 'fixed' then
      v_coupon_discount := least(o.current_price,greatest(0,coalesce(o.coupon_value,0)));
      v_effective_price := greatest(0,o.current_price-v_coupon_discount);
    elsif o.coupon_type = 'shipping' then
      v_coupon_discount := least(v_effective_shipping,greatest(0,v_effective_shipping));
      v_effective_shipping := 0;
    end if;
  end if;

  select id, collected_at, price
    into latest
  from public.price_history
  where product_offer_id = p_offer_id
    and price > 0
  order by collected_at desc, id desc
  limit 1;

  select
    count(*)::integer as samples,
    count(distinct (h.collected_at at time zone 'UTC')::date)::integer as days,
    avg(h.price) filter (where h.collected_at >= v_now - interval '7 days') as avg7,
    avg(h.price) filter (where h.collected_at >= v_now - interval '30 days') as avg30,
    avg(h.price) filter (where h.collected_at >= v_now - interval '40 days') as avg40,
    avg(h.price) as avg90,
    percentile_cont(0.5) within group (
      order by case when h.collected_at >= v_now - interval '40 days' then h.price::double precision end
    ) as median40,
    min(h.price) filter (where h.collected_at >= v_now - interval '40 days') as low40,
    min(h.price) as low90
  into stats
  from public.price_history h
  where h.product_offer_id = p_offer_id
    and h.price > 0
    and h.collected_at >= v_now - interval '90 days'
    and h.collected_at <= v_now
    and (latest.id is null or h.id <> latest.id);

  select h.price
    into v_change
  from public.price_history h
  where h.product_offer_id = p_offer_id
    and h.price > 0
    and h.collected_at <= v_now
    and (latest.id is null or h.id <> latest.id)
  order by h.collected_at desc, h.id desc
  limit 1;

  if v_change > 0 then
    v_change := ((v_effective_price - v_change) / v_change) * 100;
  else
    v_change := null;
  end if;

  if stats.avg40 > 0 then
    v_below := ((stats.avg40 - v_effective_price) / stats.avg40) * 100;
  end if;

  v_new40 := stats.low40 is not null and v_effective_price < stats.low40;
  v_new90 := stats.low90 is not null and v_effective_price < stats.low90;

  v_conf := least(1, stats.samples::numeric / 6) * 0.55
          + least(1, stats.days::numeric / 5) * 0.45;

  p_discount := least(35, greatest(0, round(coalesce(v_below,0) * 1.75 * v_conf)))::integer;
  p_low := round((case when v_new40 then 12 else 0 end + case when v_new90 then 8 else 0 end) * v_conf)::integer;
  p_change := least(10, greatest(0, round(coalesce(-v_change,0) * 0.5 * v_conf)))::integer;
  p_history := round(v_conf * 10)::integer;
  p_trust := least(10, greatest(0, round(o.trust_score / 10)))::integer;
  p_stock := case when o.in_stock then 5 else 0 end;
  p_coupon := case when v_coupon then 5 else 0 end;
  p_shipping := case
    when v_effective_shipping <= 0 then 5
    when v_effective_shipping <= greatest(v_effective_price,1) * 0.05 then 3
    else 0
  end;
  p_short := case when stats.samples < 2 then -8 when v_conf < 0.5 then -4 else 0 end;
  p_outlier := case when v_conf < 0.5 and coalesce(v_below,0) > 35 then -10 else 0 end;
  p_no_stock := case when not o.in_stock then -20 else 0 end;
  p_low_trust := case when o.trust_score < 30 then -10 else 0 end;

  v_score := least(100, greatest(
    0,
    p_discount+p_low+p_change+p_history+p_trust+p_stock+p_coupon+p_shipping
      +p_short+p_outlier+p_no_stock+p_low_trust
  ));

  v_class := case
    when v_score < 40 then 'Ignorar'
    when v_score < 60 then 'Acompanhar'
    when v_score < 75 then 'Oferta'
    when v_score < 90 then 'Oferta quente'
    else 'Oferta excepcional'
  end;

  insert into public.offer_scores(
    product_offer_id,
    score,
    avg_7d,
    avg_30d,
    avg_40d,
    avg_90d,
    median_40d,
    low_40d,
    low_90d,
    previous_price,
    previous_change_percent,
    sample_count,
    confidence,
    percent_below_avg,
    is_new_low,
    is_new_low_90d,
    classification,
    reasons,
    effective_price,
    coupon_discount_amount,
    effective_shipping_price,
    coupon_applied
  )
  values (
    p_offer_id,
    v_score,
    round(stats.avg7,2),
    round(stats.avg30,2),
    round(stats.avg40,2),
    round(stats.avg90,2),
    round(stats.median40::numeric,2),
    stats.low40,
    stats.low90,
    case when v_change is null then null else (
      select h.price
      from public.price_history h
      where h.product_offer_id=p_offer_id
        and h.price>0
        and h.collected_at<=v_now
        and (latest.id is null or h.id<>latest.id)
      order by h.collected_at desc,h.id desc
      limit 1
    ) end,
    round(v_change,3),
    stats.samples,
    round(v_conf,3),
    round(v_below,3),
    v_new40,
    v_new90,
    v_class,
    jsonb_build_array(
      jsonb_build_object('label','Desconto vs média 40 dias','points',p_discount),
      jsonb_build_object('label','Novo menor preço 40/90 dias','points',p_low),
      jsonb_build_object('label','Queda desde a coleta anterior','points',p_change),
      jsonb_build_object('label','Qualidade do histórico','points',p_history),
      jsonb_build_object('label','Confiança na loja','points',p_trust),
      jsonb_build_object('label','Estoque disponível','points',p_stock),
      jsonb_build_object(
        'label',
        case
          when v_coupon and o.coupon_type='shipping' then 'Cupom verificado de frete'
          when v_coupon then 'Cupom verificado aplicável'
          else 'Cupom verificado aplicável'
        end,
        'points',
        p_coupon
      ),
      jsonb_build_object('label','Frete favorável','points',p_shipping),
      jsonb_build_object('label','Histórico insuficiente','points',p_short),
      jsonb_build_object('label','Preço atípico sem histórico confiável','points',p_outlier),
      jsonb_build_object('label','Sem estoque','points',p_no_stock),
      jsonb_build_object('label','Loja de baixa confiança','points',p_low_trust)
    ),
    round(v_effective_price,2),
    round(v_coupon_discount,2),
    round(v_effective_shipping,2),
    v_coupon
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reanalyze_offers_for_coupon_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer_id uuid;
begin
  for v_offer_id in
    select id
    from public.product_offers
    where coupon_id = new.id
      and active
  loop
    perform public.calculate_offer_score_internal(v_offer_id);
  end loop;
  return new;
end;
$$;

revoke all on function public.reanalyze_offers_for_coupon_change()
  from public, anon, authenticated;

drop trigger if exists coupon_change_reanalyze on public.coupons;
create trigger coupon_change_reanalyze
after update of active, verified, expires_at, minimum_purchase, discount_type, discount_value, max_discount, store_id
on public.coupons
for each row execute function public.reanalyze_offers_for_coupon_change();

create or replace function public.reanalyze_offer_on_coupon_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.coupon_id is distinct from new.coupon_id and new.active then
    perform public.calculate_offer_score_internal(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.reanalyze_offer_on_coupon_assignment()
  from public, anon, authenticated;

drop trigger if exists offer_coupon_changed on public.product_offers;
create trigger offer_coupon_changed
after update of coupon_id on public.product_offers
for each row execute function public.reanalyze_offer_on_coupon_assignment();
