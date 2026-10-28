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

- Simpla completion sync uses a database-triggered queue independent of invoice mail statuses; only verified read calls are enabled until the provider confirms creation and idempotency, preventing duplicate legal invoices.
- Password recovery uses the public /reset-password route and auth recovery sessions; never generate or disclose account passwords in chat.
- Purchase payments use a separate tested direction/reference/amount matcher and an atomic transaction-key ledger; SEPA export only stages payment, supplier credit notes are excluded from outgoing payment files. Original purchase PDFs are private attachments, never reconstructed as evidence.
- Purchase suppliers are linked by a DB trigger; new documents snapshot supplier defaults without rewriting source amounts. Receipt AI runs server-side, originals private, hash dedup; mobile scanning stops camera tracks on capture/close/unmount.
- Customers use normalized name/full-address identity, preserve source codes including aliases, and are linked by a work-order trigger; projects belong to customer IDs and customer lists are paginated to avoid truncated imports.
- Roles live in `user_roles` (admin|technician); RLS gives admins everything and technicians only rows of work orders assigned to them via `my_technician_id()`. Technician logins are created by `src/lib/technicians.functions.ts` (admin-checked server fn) because public sign-up is removed.
- Running indicators use open time entries, not task status; lists and calendars refetch every ten seconds while visible to show other devices' starts/stops.
- Work orders keep customer and optional worksite addresses separately in split fields; resolve the destination through the shared address helper, and invalidate cached driving distance through the database trigger on address changes.
- Customer work-order emails use the pure price-free mail-data allowlist and Worker-compatible PDF generator; send the PDF as a private Outlook file attachment with only a short covering message so billing changes cannot expose prices or inline work-order details.
- Signing and payment share the tested task-completion helper; navigate crews only after a successful save and after the mail attempt, including failures, so a mail error cannot strand them on a completed task.
- Billing math lives in `src/lib/billing.ts` (pure, tested); the UI computes totals live and stores only the paid amount when payment is recorded.
- Work-order payment removal uses an authenticated admin-checked server function and a tested narrow patch; it preserves completion/signature and does not modify invoice payments.
- Driving distance uses free OpenStreetMap services (Nominatim + OSRM) in `src/lib/distance.functions.ts`, cached on `work_orders.distance_km` and reset when the address changes.
- Crews log in with name + password; `src/lib/login.ts` maps a name to an internal non-mailable email. Per-crew visibility flags live on `technicians` (signed orders enforced in RLS, the rest hidden in the UI).
- Mail import reads the inbox through a per-admin Microsoft Outlook App User Connector connection (`src/lib/outlook.functions.ts`), so the mailbox account signs in itself without Exchange delegation.
- Per-crew accessibility flags (like `technicians.large_text`) are admin-set on the Ploegen page, read through `src/lib/use-role.ts`, and applied as a class on `<html>` so rem-based Tailwind scales everywhere; a crew can override the flag locally via `src/lib/text-size.ts` (shared tablets).
- Invoices snapshot customer/lines and use `next_invoice_number()`; send customer PDF and business UBL as separate Outlook mails, recording each accepted leg with a per-invoice send lock so retries skip completed legs. OkiOki mail acceptance is not Peppol delivery confirmation; only fully paid invoices auto-send. Business detection uses a nonempty VAT number.
- Bulk work-order deletion uses the shared delete-task helper with one explicit confirmation and selected IDs only; invalidate both work-order and invoice lists so deleted orders cannot remain selectable.
- Quotes live in `quotes` with their own `OFF-` numbering (`next_quote_number()`); the public signing page `/offerte/$token` uses the random token as the only secret and server fns that load `supabaseAdmin` inside the handler after token lookup. Approved quotes convert to a task via `convertQuoteToTask` (idempotent through `quotes.work_order_id`).
- Quote signing emails use the canonical published app URL through the tested signing-link helper, never the request origin, because preview and internal hosts are inaccessible to customers.
- Credit notes are rows in `invoices` with `kind = 'creditnota'` and `credit_for` pointing at the original; they follow the same `next_invoice_number()` sequence and reverse amounts via the pure, tested `buildCreditNote`. `invoices.work_order_id` is intentionally not unique so a credit note can share the work order.
- Products can be flagged `admin_only`; the read policy excludes them for non-admins and the material picker filters them too, so crews cannot select them even via the API.
- The accountant UBL mail (`sendAllToAccountant`) sends every invoice and credit note as separate UBL attachments in one Outlook mail to `settings.accountant_email`, without embedded PDFs to stay under mail size limits.
- External crews have no auth account; tokens expose a price-free DTO. Forwarding uses quote descriptions/quantities (no prices/km) or task text. JSON slot options/customer alternatives use a service-only atomic RPC; chosen scalar slot preserves scheduling guards and mail retries.
- Quotes keep source and approved output tasks separate; insertion atomically sets the source status to offerte, excluded from lists/calendars without deleting history.
- Recurring contract tasks are generated client-side by admins via `planContracts` (src/lib/contracts.ts) with a partial unique index on (contract_id, scheduled_date) for idempotency; contract work orders are excluded from invoicing and the Simpla queue.
