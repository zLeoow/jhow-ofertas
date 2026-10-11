-- Jhow Ofertas - Mercado Livre OAuth private connection storage
-- Already applied to Lovable Cloud; keep this file as canonical schema history.

CREATE TABLE public.mercadolivre_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ml_user_id bigint UNIQUE NOT NULL,
 nickname text, site_id text, access_token text NOT NULL, refresh_token text NOT NULL,
 token_type text, scope text, expires_at timestamptz NOT NULL,
 connected_at timestamptz NOT NULL DEFAULT now(), last_refresh_at timestamptz,
 last_verified_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), refresh_lock_id uuid, refresh_locked_until timestamptz
);
GRANT ALL ON public.mercadolivre_connections TO service_role;
REVOKE ALL ON public.mercadolivre_connections FROM PUBLIC, anon, authenticated;
ALTER TABLE public.mercadolivre_connections ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX mercadolivre_single_connection ON public.mercadolivre_connections ((true));
CREATE TRIGGER mercadolivre_connections_touch BEFORE UPDATE ON public.mercadolivre_connections
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.mercadolivre_oauth_states (
 state_hash text PRIMARY KEY, created_by uuid, created_at timestamptz DEFAULT now(),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, return_to text
);
GRANT ALL ON public.mercadolivre_oauth_states TO service_role;
REVOKE ALL ON public.mercadolivre_oauth_states FROM PUBLIC, anon, authenticated;
ALTER TABLE public.mercadolivre_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE INDEX mercadolivre_oauth_states_expiry ON public.mercadolivre_oauth_states (expires_at);

COMMENT ON COLUMN public.mercadolivre_connections.refresh_lock_id IS
  'Server-only lease serializes rotating refresh tokens across workers';
