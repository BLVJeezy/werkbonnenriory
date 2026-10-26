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
- Roles live in `user_roles` (admin|technician); RLS gives admins everything and technicians only rows of work orders assigned to them via `my_technician_id()`. Technician logins are created by `src/lib/technicians.functions.ts` (admin-checked server fn) because public sign-up is removed.
- Work orders store address split (street, house_number, postal_code, city) plus a derived `address` string kept for list display.
