- [x] Recreate original schema with admin-only access controls and example data.
- [x] Finish administrative sign-in, protected pages, real management screens, and verification.
- [x] Assign first administrator after a confirmed account exists.
- [ ] Import original operational records and assets, if any (blocked: exports not provided).
- [x] Finish Stage 3 offer analysis page, refresh, sample validation, and build verification.
- [x] Stage 4 collection engine: queue, workers, logs, simulator, and global collection settings.
- [x] Stage 5 coupon engine: CRUD, verification, expiry/minimum rules, effective price, score integration, and automatic reanalysis.
- [x] Stage 6 Telegram publishing core: channels, score/category rules, anti-spam, templates, queue, secure Bot API sender, test/send/retry UI.\n- [x] Affiliate management: store programs, templates, verified links, publication policy, frozen published URL, and Telegram audit.\n- [x] Stage 6.1 Telegram automation core synced from canonical 7db1949: atomic claim, retries, stale recovery, authenticated cron endpoint, and worker history.
- [x] Telegram unattended scheduler active through GitHub Actions every 5 minutes against the published Lovable endpoint.
- [x] Verify real bot identity (@JhowOfertasBot) and send the single authorized channel smoke test (message_id 4).
- [x] Verify authenticated Telegram scheduler with automation enabled: HTTP 200, completed, zero sends on empty queue; unauthenticated callback rejected.
- [ ] Finalize external collectors (Mercado Livre first), first real products, and monitoring.

- [x] Validate canonical affiliate sync e8fb780: schema, tests, and authenticated preview.
- Published app URL: https://jhow-ofertas.lovable.app

- [x] Mercado Livre OAuth core: private token/state schema applied, server-only OAuth/refresh helpers, callback, admin integration page, and GitHub typecheck/build/test passing.
- [ ] Sync the final Mercado Livre OAuth type fixes to Lovable runtime and republish.
- [ ] Authorize the real Mercado Livre account from /integracoes and validate /users/me.
- [ ] Enable the first 5–10 real Mercado Livre products for collection.
