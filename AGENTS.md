<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep authenticated Jhow admin pages under the pathless `_authenticated` layout and verify the admin role in its gate; this prevents non-admin access while preserving original section URLs.
- Use the generated browser database client with admin-only RLS for management screens; this avoids exposing privileged credentials in the app.
- Record offer price edits in a database trigger; this keeps history consistent regardless of which editor changes an offer.
- Display the newest persisted offer score from the shared admin query and recalculate through analyze_offer RPC; this keeps the diagnostic, list, and dashboard aligned with the database engine.
- Keep affiliate status and explicit template generation in the shared affiliates helper, and send only the queued published_url in Telegram; this aligns management views and preserves the publication decision.