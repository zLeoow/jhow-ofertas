CREATE OR REPLACE FUNCTION public.analyze_offer(p_offer_id uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_offers WHERE id = p_offer_id AND active) THEN RAISE EXCEPTION 'Oferta não encontrada ou inativa'; END IF;
  RETURN public.calculate_offer_score_internal(p_offer_id);
END $$;
REVOKE ALL ON FUNCTION public.analyze_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analyze_offer(uuid) TO authenticated;