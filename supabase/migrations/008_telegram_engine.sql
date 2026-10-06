-- Jhow Ofertas - Etapa 6: fila de publicacao Telegram, regras por canal e anti-spam

alter table public.telegram_channels
  add column if not exists repost_cooldown_minutes integer not null default 360,
  add column if not exists repost_min_drop_percent numeric(8,3) not null default 5,
  add column if not exists message_template text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.telegram_posts
  add column if not exists source_score_id bigint references public.offer_scores(id) on delete set null,
  add column if not exists effective_price numeric(12,2),
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists dedupe_key text;

drop trigger if exists telegram_channels_touch on public.telegram_channels;
create trigger telegram_channels_touch
before update on public.telegram_channels
for each row execute function public.touch_updated_at();

create index if not exists idx_telegram_posts_queue
  on public.telegram_posts(status, next_attempt_at, created_at);

create index if not exists idx_telegram_posts_offer_channel_sent
  on public.telegram_posts(product_offer_id, channel_id, sent_at desc)
  where status='sent';

create unique index if not exists idx_telegram_posts_one_pending_per_offer_channel
  on public.telegram_posts(product_offer_id, channel_id)
  where status in ('pending','sending');

create or replace function public.queue_telegram_offer(p_offer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer record;
  v_score record;
  v_global_min integer := 75;
  v_channel record;
  v_last_sent record;
  v_inserted integer := 0;
  v_effective_price numeric;
  v_drop numeric;
begin
  select
    po.*,
    p.name as product_name,
    p.category,
    p.brand,
    s.name as store_name,
    c.code as coupon_code
  into v_offer
  from public.product_offers po
  join public.products p on p.id=po.product_id
  join public.stores s on s.id=po.store_id
  left join public.coupons c on c.id=po.coupon_id
  where po.id=p_offer_id
    and po.active
    and po.in_stock;

  if not found then
    return 0;
  end if;

  select *
  into v_score
  from public.offer_scores
  where product_offer_id=p_offer_id
  order by calculated_at desc,id desc
  limit 1;

  if not found then
    return 0;
  end if;

  select coalesce((value->>'min_publish_score')::integer,75)
  into v_global_min
  from public.settings
  where key='collector';

  v_global_min := coalesce(v_global_min,75);
  v_effective_price := coalesce(v_score.effective_price,v_offer.current_price);

  for v_channel in
    select *
    from public.telegram_channels tc
    where tc.active
      and v_score.score >= greatest(tc.min_score,v_global_min)
      and (
        coalesce(cardinality(tc.allowed_categories),0)=0
        or coalesce(v_offer.category,'') = any(tc.allowed_categories)
      )
  loop
    if exists (
      select 1
      from public.telegram_posts tp
      where tp.channel_id=v_channel.id
        and tp.product_offer_id=p_offer_id
        and tp.status in ('pending','sending')
    ) then
      continue;
    end if;

    select *
    into v_last_sent
    from public.telegram_posts tp
    where tp.channel_id=v_channel.id
      and tp.product_offer_id=p_offer_id
      and tp.status='sent'
      and tp.sent_at is not null
    order by tp.sent_at desc,tp.id desc
    limit 1;

    if found and v_last_sent.sent_at > now()-make_interval(mins => greatest(1,v_channel.repost_cooldown_minutes)) then
      if v_last_sent.price is null or v_last_sent.price <= 0 then
        continue;
      end if;

      v_drop := ((v_last_sent.price-v_effective_price)/v_last_sent.price)*100;
      if v_drop < greatest(0,v_channel.repost_min_drop_percent) then
        continue;
      end if;
    end if;

    insert into public.telegram_posts(
      product_offer_id,
      channel_id,
      status,
      price,
      effective_price,
      score,
      payload,
      source_score_id,
      next_attempt_at,
      dedupe_key
    )
    values (
      p_offer_id,
      v_channel.id,
      'pending',
      v_effective_price,
      v_effective_price,
      v_score.score,
      jsonb_build_object(
        'product_name',v_offer.product_name,
        'brand',v_offer.brand,
        'category',v_offer.category,
        'store_name',v_offer.store_name,
        'current_price',v_offer.current_price,
        'effective_price',v_effective_price,
        'shipping_price',v_score.effective_shipping_price,
        'coupon_applied',v_score.coupon_applied,
        'coupon_code',v_offer.coupon_code,
        'coupon_discount_amount',v_score.coupon_discount_amount,
        'classification',v_score.classification,
        'percent_below_avg',v_score.percent_below_avg,
        'affiliate_url',coalesce(v_offer.affiliate_url,v_offer.url),
        'offer_url',v_offer.url
      ),
      v_score.id,
      now(),
      v_channel.id::text||':'||p_offer_id::text||':'||v_score.id::text
    );

    v_inserted := v_inserted+1;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.queue_telegram_offer(uuid)
  from public,anon,authenticated;

create or replace function public.queue_telegram_offer_admin(p_offer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'Acesso negado';
  end if;

  return public.queue_telegram_offer(p_offer_id);
end;
$$;

revoke all on function public.queue_telegram_offer_admin(uuid)
  from public,anon;
grant execute on function public.queue_telegram_offer_admin(uuid)
  to authenticated;

create or replace function public.queue_telegram_after_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_telegram_offer(new.product_offer_id);
  return new;
end;
$$;

revoke all on function public.queue_telegram_after_score()
  from public,anon,authenticated;

drop trigger if exists offer_score_queue_telegram on public.offer_scores;
create trigger offer_score_queue_telegram
after insert on public.offer_scores
for each row execute function public.queue_telegram_after_score();

comment on function public.queue_telegram_offer(uuid)
  is 'Queues eligible offer/channel pairs using score, category and anti-spam rules.';
