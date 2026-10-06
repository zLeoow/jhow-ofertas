ALTER TABLE public.offer_scores ADD COLUMN previous_price numeric(12,2), ADD COLUMN previous_change_percent numeric(8,3), ADD COLUMN sample_count integer NOT NULL DEFAULT 0, ADD COLUMN confidence numeric(5,3) NOT NULL DEFAULT 0, ADD COLUMN is_new_low_90d boolean NOT NULL DEFAULT false;
CREATE INDEX idx_offer_scores_latest ON public.offer_scores(product_offer_id, calculated_at DESC, id DESC);

CREATE FUNCTION public.calculate_offer_score_internal(p_offer_id uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o record; stats record; latest record;
  v_now timestamptz := now(); v_conf numeric := 0; v_below numeric; v_change numeric;
  v_new40 boolean := false; v_new90 boolean := false; v_coupon boolean := false;
  p_discount integer := 0; p_low integer := 0; p_change integer := 0; p_history integer := 0;
  p_trust integer := 0; p_stock integer := 0; p_coupon integer := 0; p_shipping integer := 0;
  p_short integer := 0; p_outlier integer := 0; p_no_stock integer := 0; p_low_trust integer := 0;
  v_score integer; v_class text; v_id bigint;
BEGIN
  SELECT po.*, s.trust_score, c.verified AS coupon_verified, c.expires_at AS coupon_expiry, c.minimum_purchase AS coupon_minimum, c.store_id AS coupon_store
    INTO o FROM public.product_offers po JOIN public.stores s ON s.id = po.store_id
    LEFT JOIN public.coupons c ON c.id = po.coupon_id WHERE po.id = p_offer_id AND po.active;
  IF NOT FOUND OR o.current_price IS NULL OR o.current_price <= 0 THEN RETURN NULL; END IF;
  SELECT id, collected_at, price INTO latest FROM public.price_history
    WHERE product_offer_id = p_offer_id AND price > 0 ORDER BY collected_at DESC, id DESC LIMIT 1;
  SELECT count(*)::integer AS samples,
    count(DISTINCT (h.collected_at AT TIME ZONE 'UTC')::date)::integer AS days,
    avg(h.price) FILTER (WHERE h.collected_at >= v_now - interval '7 days') AS avg7,
    avg(h.price) FILTER (WHERE h.collected_at >= v_now - interval '30 days') AS avg30,
    avg(h.price) FILTER (WHERE h.collected_at >= v_now - interval '40 days') AS avg40,
    avg(h.price) AS avg90,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN h.collected_at >= v_now - interval '40 days' THEN h.price::double precision END) AS median40,
    min(h.price) FILTER (WHERE h.collected_at >= v_now - interval '40 days') AS low40,
    min(h.price) AS low90
    INTO stats FROM public.price_history h
    WHERE h.product_offer_id = p_offer_id AND h.price > 0
      AND h.collected_at >= v_now - interval '90 days' AND h.collected_at <= v_now
      AND (latest.id IS NULL OR h.id <> latest.id);
  SELECT h.price INTO v_change FROM public.price_history h WHERE h.product_offer_id = p_offer_id
    AND h.price > 0 AND h.collected_at <= v_now AND (latest.id IS NULL OR h.id <> latest.id)
    ORDER BY h.collected_at DESC, h.id DESC LIMIT 1;
  IF v_change > 0 THEN v_change := ((o.current_price - v_change) / v_change) * 100; ELSE v_change := NULL; END IF;
  IF stats.avg40 > 0 THEN v_below := ((stats.avg40 - o.current_price) / stats.avg40) * 100; END IF;
  v_new40 := stats.low40 IS NOT NULL AND o.current_price < stats.low40;
  v_new90 := stats.low90 IS NOT NULL AND o.current_price < stats.low90;
  -- At least six observations across five separate days are required for full historical confidence.
  v_conf := LEAST(1, stats.samples::numeric / 6) * 0.55 + LEAST(1, stats.days::numeric / 5) * 0.45;
  p_discount := LEAST(35, GREATEST(0, round(COALESCE(v_below,0) * 1.75 * v_conf)))::integer;
  p_low := round((CASE WHEN v_new40 THEN 12 ELSE 0 END + CASE WHEN v_new90 THEN 8 ELSE 0 END) * v_conf)::integer;
  p_change := LEAST(10, GREATEST(0, round(COALESCE(-v_change,0) * 0.5 * v_conf)))::integer;
  p_history := round(v_conf * 10)::integer;
  p_trust := LEAST(10, GREATEST(0, round(o.trust_score / 10)))::integer;
  p_stock := CASE WHEN o.in_stock THEN 5 ELSE 0 END;
  v_coupon := COALESCE(o.coupon_verified,false) AND (o.coupon_expiry IS NULL OR o.coupon_expiry > v_now)
    AND (o.coupon_minimum IS NULL OR o.current_price >= o.coupon_minimum)
    AND (o.coupon_store IS NULL OR o.coupon_store = o.store_id);
  p_coupon := CASE WHEN v_coupon THEN 5 ELSE 0 END;
  p_shipping := CASE WHEN o.shipping_price <= 0 THEN 5 WHEN o.shipping_price <= o.current_price * 0.05 THEN 3 ELSE 0 END;
  p_short := CASE WHEN stats.samples < 2 THEN -8 WHEN v_conf < 0.5 THEN -4 ELSE 0 END;
  p_outlier := CASE WHEN v_conf < 0.5 AND COALESCE(v_below,0) > 35 THEN -10 ELSE 0 END;
  p_no_stock := CASE WHEN NOT o.in_stock THEN -20 ELSE 0 END;
  p_low_trust := CASE WHEN o.trust_score < 30 THEN -10 ELSE 0 END;
  v_score := LEAST(100, GREATEST(0, p_discount+p_low+p_change+p_history+p_trust+p_stock+p_coupon+p_shipping+p_short+p_outlier+p_no_stock+p_low_trust));
  v_class := CASE WHEN v_score < 40 THEN 'Ignorar' WHEN v_score < 60 THEN 'Acompanhar' WHEN v_score < 75 THEN 'Oferta' WHEN v_score < 90 THEN 'Oferta quente' ELSE 'Oferta excepcional' END;
  INSERT INTO public.offer_scores(product_offer_id, score, avg_7d, avg_30d, avg_40d, avg_90d, median_40d, low_40d, low_90d, previous_price, previous_change_percent, sample_count, confidence, percent_below_avg, is_new_low, is_new_low_90d, classification, reasons)
  VALUES (p_offer_id, v_score, round(stats.avg7,2), round(stats.avg30,2), round(stats.avg40,2), round(stats.avg90,2), round(stats.median40::numeric,2), stats.low40, stats.low90,
    CASE WHEN v_change IS NULL THEN NULL ELSE (SELECT h.price FROM public.price_history h WHERE h.product_offer_id=p_offer_id AND h.price>0 AND h.collected_at<=v_now AND (latest.id IS NULL OR h.id<>latest.id) ORDER BY h.collected_at DESC,h.id DESC LIMIT 1) END,
    round(v_change,3), stats.samples, round(v_conf,3), round(v_below,3), v_new40, v_new90, v_class,
    jsonb_build_array(
      jsonb_build_object('label','Desconto vs média 40 dias','points',p_discount),
      jsonb_build_object('label','Novo menor preço 40/90 dias','points',p_low),
      jsonb_build_object('label','Queda desde a coleta anterior','points',p_change),
      jsonb_build_object('label','Qualidade do histórico','points',p_history),
      jsonb_build_object('label','Confiança na loja','points',p_trust),
      jsonb_build_object('label','Estoque disponível','points',p_stock),
      jsonb_build_object('label','Cupom verificado aplicável','points',p_coupon),
      jsonb_build_object('label','Frete favorável','points',p_shipping),
      jsonb_build_object('label','Histórico insuficiente','points',p_short),
      jsonb_build_object('label','Preço atípico sem histórico confiável','points',p_outlier),
      jsonb_build_object('label','Sem estoque','points',p_no_stock),
      jsonb_build_object('label','Loja de baixa confiança','points',p_low_trust))) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.calculate_offer_score_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.analyze_offer(p_offer_id uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_offers WHERE id = p_offer_id AND active) THEN RAISE EXCEPTION 'Oferta não encontrada ou inativa'; END IF;
  RETURN public.calculate_offer_score_internal(p_offer_id);
END $$;
REVOKE ALL ON FUNCTION public.analyze_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analyze_offer(uuid) TO authenticated;

CREATE FUNCTION public.analyze_offer_on_history_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.calculate_offer_score_internal(NEW.product_offer_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.analyze_offer_on_history_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER price_history_analyze AFTER INSERT ON public.price_history FOR EACH ROW EXECUTE FUNCTION public.analyze_offer_on_history_insert();

CREATE FUNCTION public.record_initial_offer_price() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.active AND NEW.current_price IS NOT NULL THEN
    INSERT INTO public.price_history(product_offer_id, price, shipping_price, in_stock) VALUES (NEW.id, NEW.current_price, NEW.shipping_price, NEW.in_stock);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_initial_offer_price() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER offer_initial_price AFTER INSERT ON public.product_offers FOR EACH ROW EXECUTE FUNCTION public.record_initial_offer_price();