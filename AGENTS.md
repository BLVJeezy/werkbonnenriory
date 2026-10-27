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
- Running-task indicators derive from open time entries, not order status; the task list and calendar refetch every ten seconds while visible so admins see starts and stops from other devices without new permissions or subscriptions.
- Work orders keep customer and optional worksite addresses separately in split fields; resolve the destination through the shared address helper, and invalidate cached driving distance through the database trigger on address changes.
- Customer work-order emails use the pure price-free mail-data allowlist and Worker-compatible PDF generator; send the PDF as a private Outlook file attachment with only a short covering message so billing changes cannot expose prices or inline work-order details.
- Signing and payment share the tested task-completion helper; navigate crews only after a successful save and after the mail attempt, including failures, so a mail error cannot strand them on a completed task.
- Billing math lives in `src/lib/billing.ts` (pure, tested); the UI computes totals live and stores only the paid amount when payment is recorded.
- Driving distance uses free OpenStreetMap services (Nominatim + OSRM) in `src/lib/distance.functions.ts`, cached on `work_orders.distance_km` and reset when the address changes.
- Crews log in with name + password; `src/lib/login.ts` maps a name to an internal non-mailable email. Per-crew visibility flags live on `technicians` (signed orders enforced in RLS, the rest hidden in the UI).
- Mail import reads the inbox through a per-admin Microsoft Outlook App User Connector connection (encrypted key in `app_user_connections`, flow in `src/lib/outlook.functions.ts`), not the shared workspace connection — so the mailbox account itself signs in once without Exchange delegation.
- Per-crew accessibility flags (like `technicians.large_text`) are admin-set on the Ploegen page, read through `src/lib/use-role.ts`, and applied as a class on `<html>` so rem-based Tailwind scales everywhere; a crew can override the flag locally via `src/lib/text-size.ts` because a shared tablet should not force one size.
- Invoices snapshot customer/lines and use `next_invoice_number()`; send customer PDF and business UBL as separate Outlook mails, recording each accepted leg with a per-invoice send lock so retries skip completed legs. OkiOki mail acceptance is not Peppol delivery confirmation; only fully paid invoices auto-send. Business detection uses a nonempty VAT number.
- Bulk work-order deletion uses the shared delete-task helper with one explicit confirmation and selected IDs only; invalidate both work-order and invoice lists so deleted orders cannot remain selectable.
- Quotes live in `quotes` with their own `OFF-` numbering (`next_quote_number()`); the public signing page `/offerte/$token` uses the random token as the only secret and server fns that load `supabaseAdmin` inside the handler after token lookup. Approved quotes convert to a task via `convertQuoteToTask` (idempotent through `quotes.work_order_id`).
- Credit notes are rows in `invoices` with `kind = 'creditnota'` and `credit_for` pointing at the original; they follow the same `next_invoice_number()` sequence and reverse amounts via the pure, tested `buildCreditNote`. `invoices.work_order_id` is intentionally not unique so a credit note can share the work order.
- Products can be flagged `admin_only`; the read policy excludes them for non-admins and the material picker filters them too, so crews cannot select them even via the API.
- The accountant UBL mail (`sendAllToAccountant`) sends every invoice and credit note as separate UBL attachments in one Outlook mail to `settings.accountant_email`, without embedded PDFs to stay under mail size limits.
