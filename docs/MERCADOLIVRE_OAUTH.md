# Mercado Livre OAuth

Private connection/state storage is applied by `drizzle/migrations/*_012_mercadolivre_oauth.sql`. No browser or authenticated Data API grants exist for tokens or states.

The admin opens `/integracoes` and chooses **Conectar Mercado Livre**. The registered callback is exactly `https://jhow-ofertas.lovable.app/api/mercadolivre/callback`. Credentials already live in Cloud secrets; PKCE is disabled. States contain 256 bits of entropy, are hashed with SHA-256, expire in ten minutes and are consumed by one conditional update.

The external collector no longer reads MERCADOLIVRE_ACCESS_TOKEN. Its Mercado Livre adapter is deliberately fail-closed pending the next collection stage. That stage must run collection in the trusted backend using `getValidAccessToken()`; do not export OAuth tokens or put the client secret in GitHub Actions. No collector or scheduler is activated here.

Refresh uses a database lease, writes both rotated tokens in one update before `/users/me`, and refreshes automatically only within ten minutes of expiry. A failed storage write after a provider rotation can require reconnecting; never retry the old refresh token blindly.

Official endpoints: https://auth.mercadolivre.com.br/authorization, https://api.mercadolibre.com/oauth/token, https://api.mercadolibre.com/users/me.