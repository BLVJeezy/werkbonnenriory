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

- Simpla sales sync is retired; enqueue does nothing; purchase imports stay read-only.
- Mailtaken/review feeds require separate server tokens and stable IDs. Reviews expose sent invoice emails only, with sent_at+id cursors.
- Document links use hashed tokens, private PDF snapshots and POST opens; admin reports count opens, not reading.
- Password recovery: public /reset-password and recovery sessions; never disclose passwords.
- Purchase payments use a tested direction/reference/amount matcher and an atomic transaction-key ledger; SEPA export only stages payment, supplier credit notes excluded. Original purchase PDFs stay private attachments.
- Bank linking uses admin-checked link_bank_transaction with stored transaction details, atomic ledger claims and invoice locks; partial payments add only receipts and overpayments are rejected. Ponto sync uses insert-only conflict handling via ponto-store to preserve immutable transactions without widening RLS.
- Purchase suppliers link via DB trigger; documents snapshot supplier defaults without rewriting source amounts. Receipt AI is server-side, originals private, hash dedup; mobile scanning stops camera tracks on capture/close/unmount.
- Customers use normalized name/full-address identity, preserve source codes/aliases and link via a work-order trigger; projects belong to customer IDs. allCustomers paginates newest-first; CustomerPicker/SearchSelect share ID-based, order-preserving search.
- Roles live in `user_roles` (admin|technician|marketing); technicians only see assigned work orders via `my_technician_id()`, marketing only customers/newsletters/photos via `is_admin_or_marketing()` and the price-free `photo_overview()` RPC. Logins are created by admin-checked server fns; public sign-up is removed.
- Running indicators use open time entries, not task status; lists and calendars refetch every ten seconds while visible.
- Work orders keep customer and optional worksite addresses in split fields; resolve the destination through the shared address helper; a DB trigger invalidates cached driving distance on address changes.
- Work-order mail/previews share the allowlist, Worker PDF and RLS-scoped private photo loader; photo annex precedes terms, errors block omission. Previews enforce crew visibility via PDF.js dialogs. Mail uses private attachments, never inline details/rates.
- Signing and payment share the tested task-completion helper; navigate crews only after a successful save and after the mail attempt, even on failure, so a mail error cannot strand them on a completed task.
- Billing math lives in `src/lib/billing.ts` and document line math (travel kilometres, per-line totals) in pure tested helpers in `src/lib/invoice.ts`, so quotes and invoices cannot drift; the UI computes totals live and stores only the paid amount when payment is recorded.
- Every customer-driven VAT default goes through the single pure helper `vatRateForCustomer` in `src/lib/vat-number.ts`, and mail-text rules (urgency, professional status) through tested helpers there; screens never compute their own rate, so a new rule only has to be added once.
- Work-order payment removal uses an admin-checked server function and a tested narrow patch; it preserves completion/signature and does not modify invoice payments.
- Newsletters: email-bound audited consent, hashed-token unsubscribe POSTs; draft-only until delivery linked. Admin server AI creates unsaved suggestions; provider denials persist in settings.
- PDF/UBL share invoice-vat-notices for all line rates; preserve tax treatment and sent snapshots.
- Crews log in with name + password; `src/lib/login.ts` maps a name to an internal non-mailable email. Per-crew visibility flags live on `technicians` (signed orders enforced in RLS, the rest hidden in the UI).
- Mail import reads the inbox through a per-admin Outlook App User Connector connection (`src/lib/outlook.functions.ts`), so the mailbox signs in itself without Exchange delegation.
- Crew accessibility uses use-role/html and text-size device overrides; mobile nav collapses. Embedded pages use a dvh flex shell with min-h-0 and no outer scroll.
- Invoices snapshot customer/lines, send PDF+UBL with OkiOki in BCC, and lock accepted legs for retries; only paid invoices auto-send. Mail acceptance is not Peppol confirmation. Reminders use explicit debtor type, tested balance/fee/waiting rules and one-time claims; uncertain Outlook outcomes require review.
- Invoice numbers come from the create_numbered_invoice RPC (counter + insert in one transaction); never call next_invoice_number separately, or failed inserts burn numbers and leave gaps.
- Bulk work-order deletion uses the shared delete-task helper with one explicit confirmation and selected IDs only; invalidate work-order and invoice lists so deleted orders cannot remain selectable.
- invoice-payment-reference shares modulo-97 across PDF/UBL/reminders/QR; EPC v2 uses free text (structured is RF-only), retaining digits for Ponto. Open PDFs embed QR. Stripe stays off unless asked.
- Quotes use OFF numbering and secret-token signing; privileged reads stay inside handlers. Approval atomically creates one task via `ensure_approved_quote_task` (`work_order_id` prevents duplicates); source worksite and crew persist, `quote_approved` drives labels.
- Quote signing emails use the canonical published app URL through the tested signing-link helper, never the request origin, because preview and internal hosts are inaccessible to customers.
- Credit notes are `invoices` rows with `kind = 'creditnota'` and `credit_for` to the original; same numbering, reversed by tested `buildCreditNote`. `work_order_id` is nullable and not unique: credit notes share it, manual invoices have none and reuse `contract_reference`.
- Products can be flagged `admin_only`; the read policy and material picker exclude them for non-admins, so crews cannot select them even via the API.
- Invoices/credit notes use a separate, sender-verified Outlook connection; other mails retain theirs. Accountant exports attach UBL only.
- External crews use price-free token DTOs, quote text/quantities and atomic scheduling RPCs. Slot entry uses raw text normalized before validation; native pickers can leave visible selections uncommitted.
- Quote scheduling/conversion queues original mails; admin sync uses owner-scoped Outlook keys and stable IDs for retry-safe moves.
- Contracts invoice confirmed per-visit lines via unique queue/RPC every five minutes. Informational tasks skip normal invoicing/Simpla. Activation explicit; sending server-only; uncertain mail never retries.
- Work order numbers are nullable; assign at first time entry or completion via triggers. Render unnumbered tasks as "Nieuw" via werkbonNr().
- Active tasks and completed work orders use separate pages with shared status selectors; completed reads retain crew RLS and visibility flags so separating lists never broadens access.
- `cold-entry.ts` records the boot URL once, so a browser-restored page differs from a deliberate click.
- Insurance estimates are `quotes` rows with `kind = 'verzekering'`; their photos are private `werkbon-fotos` paths in `photo_paths` (uploads under `bestek/`), appended to the quote PDF before the terms, and AI only suggests unsaved text without prices — keeps one numbering and signing flow.
- A completed work order converts to a bestek via `bestekFromWorkOrder` (admin-only, idempotent per work order); quote triggers (`archive_quote_source_task`, `guard_quote_task_visibility`, `refresh_quote_task_visibility`, `queue_processed_appointment_mail`) exclude `kind = 'verzekering'` so a bestek never archives or hides its source werkbon.
- Finance/bookkeeping retain Mail Assist calculation helpers/tests in finance, boekhouding and mar; company ownership plus admin role is required in RLS/RPCs, finance tasks stay in fin_tasks, and provider/sales adapters reuse local invoices and existing Ponto credentials without altering operational invoicing.
