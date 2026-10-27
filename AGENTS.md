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


- Roles live in `user_roles` (admin|technician); RLS gives admins everything and technicians only rows of work orders assigned to them via `my_technician_id()`. Technician logins are created by `src/lib/technicians.functions.ts` (admin-checked server fn) because public sign-up is removed.
- Work orders keep customer and optional worksite addresses separately in split fields; resolve the destination through the shared address helper, and invalidate cached driving distance through the database trigger on address changes.
- Customer work-order emails use the pure mail-data allowlist and renderer, excluding financial fields so billing changes cannot expose prices in email.
- Billing math lives in `src/lib/billing.ts` (pure, tested); the UI computes totals live and stores only the paid amount when payment is recorded.
- Driving distance uses free OpenStreetMap services (Nominatim + OSRM) in `src/lib/distance.functions.ts`, cached on `work_orders.distance_km` and reset when the address changes.
- Crews log in with name + password; `src/lib/login.ts` maps a name to an internal non-mailable email. Per-crew visibility flags live on `technicians` (signed orders enforced in RLS, the rest hidden in the UI).
- Mail import reads the inbox through a per-admin Microsoft Outlook App User Connector connection (encrypted key in `app_user_connections`, flow in `src/lib/outlook.functions.ts`), not the shared workspace connection — so the mailbox account itself signs in once without Exchange delegation.
- Per-crew accessibility flags (like `technicians.large_text`) are admin-set on the Ploegen page, read through `src/lib/use-role.ts`, and applied as a class on `<html>` so rem-based Tailwind scales everywhere; a crew can override the flag locally via `src/lib/text-size.ts` because a shared tablet should not force one size.
