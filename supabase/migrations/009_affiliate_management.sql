-- Jhow Ofertas - Etapa 6.5: gerenciamento de afiliados

alter table public.stores
  add column if not exists affiliate_enabled boolean not null default false,
  add column if not exists affiliate_required boolean not null default false,
  add column if not exists affiliate_program text,
  add column if not exists affiliate_notes text;

alter table public.product_offers
  add column if not exists affiliate_source text,
  add column if not exists affiliate_verified boolean not null default false,
  add column if not exists affiliate_verified_at timestamptz,
  add column if not exists affiliate_last_error text;

alter table public.telegram_channels
  add column if not exists require_affiliate boolean not null default true;

alter table public.telegram_posts
  add column if not exists published_url text,
  add column if not exists used_affiliate boolean not null default false;

insert into public.settings(key,value)
values (
  'affiliate',
  jsonb_build_object(
    'require_affiliate_for_publication', true,
    'allow_offer_url_fallback', false,
    'require_verified_affiliate', true
  )
)
on conflict (key) do nothing;

create index if not exists idx_product_offers_affiliate_coverage
  on public.product_offers(store_id, affiliate_verified)
  where active;

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
  v_affiliate_settings jsonb := '{}'::jsonb;
  v_global_require boolean := true;
  v_allow_fallback boolean := false;
  v_require_verified boolean := true;
  v_affiliate_ok boolean := false;
  v_channel record;
  v_last_sent record;
  v_inserted integer := 0;
  v_effective_price numeric;
  v_drop numeric;
  v_require_affiliate boolean;
  v_published_url text;
  v_used_affiliate boolean;
begin
  select
    po.*,
    p.name as product_name,
    p.category,
    p.brand,
    s.name as store_name,
    s.slug as store_slug,
    s.affiliate_enabled,
    s.affiliate_required,
    s.affiliate_program,
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

  select value
  into v_affiliate_settings
  from public.settings
  where key='affiliate';
  v_affiliate_settings := coalesce(v_affiliate_settings,'{}'::jsonb);

  v_global_require := coalesce((v_affiliate_settings->>'require_affiliate_for_publication')::boolean,true);
  v_allow_fallback := coalesce((v_affiliate_settings->>'allow_offer_url_fallback')::boolean,false);
  v_require_verified := coalesce((v_affiliate_settings->>'require_verified_affiliate')::boolean,true);

  v_affiliate_ok :=
    coalesce(v_offer.affiliate_enabled,false)
    and v_offer.affiliate_url is not null
    and v_offer.affiliate_url ~* '^https?://'
    and (not v_require_verified or coalesce(v_offer.affiliate_verified,false));

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
    v_require_affiliate :=
      coalesce(v_channel.require_affiliate,true)
      or v_global_require
      or coalesce(v_offer.affiliate_required,false);

    if v_affiliate_ok then
      v_published_url := v_offer.affiliate_url;
      v_used_affiliate := true;
    elsif v_require_affiliate then
      continue;
    elsif v_allow_fallback and v_offer.url ~* '^https?://' then
      v_published_url := v_offer.url;
      v_used_affiliate := false;
    else
      continue;
    end if;

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
      dedupe_key,
      published_url,
      used_affiliate
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
        'offer_url',v_offer.url,
        'affiliate_url',v_offer.affiliate_url,
        'affiliate_source',v_offer.affiliate_source,
        'affiliate_verified',v_offer.affiliate_verified,
        'affiliate_program',v_offer.affiliate_program,
        'used_affiliate',v_used_affiliate,
        'published_url',v_published_url
      ),
      v_score.id,
      now(),
      v_channel.id::text||':'||p_offer_id::text||':'||v_score.id::text,
      v_published_url,
      v_used_affiliate
    );

    v_inserted := v_inserted+1;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.queue_telegram_offer(uuid)
  from public,anon,authenticated;

create or replace function public.queue_telegram_on_affiliate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active
     and (
       old.affiliate_url is distinct from new.affiliate_url
       or old.affiliate_verified is distinct from new.affiliate_verified
       or old.affiliate_source is distinct from new.affiliate_source
     ) then
    perform public.queue_telegram_offer(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.queue_telegram_on_affiliate_change()
  from public,anon,authenticated;

drop trigger if exists offer_affiliate_change_queue on public.product_offers;
create trigger offer_affiliate_change_queue
after update of affiliate_url, affiliate_verified, affiliate_source
on public.product_offers
for each row execute function public.queue_telegram_on_affiliate_change();
