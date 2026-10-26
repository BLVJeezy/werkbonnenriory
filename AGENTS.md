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

- Outlook mail import runs in `src/lib/mailbox.functions.ts` (authenticated server fn, gateway + AI extraction); dedupe on `work_orders.source_message_id` so re-imports are safe.
- All tables use a single "authenticated can do all" RLS policy because the app uses one shared login.
