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

- Mailtaken/review feeds require separate server tokens and stable IDs. Reviews expose only id+email+timestamp for sent invoices or completed work orders, with timestamp+id cursors.
- Document links use hashed tokens, private PDF snapshots and POST opens; admin reports count opens, not reading.
- Password recovery: public /reset-password and recovery sessions; never disclose passwords.
- Purchase payments use a tested direction/reference/amount matcher and an atomic transaction-key ledger; SEPA export only stages payment, supplier credit notes excluded. Original purchase PDFs stay private attachments.
- Bank linking uses admin-checked link_bank_transaction with stored transaction details, atomic ledger claims and invoice locks; partial payments add only receipts and overpayments are rejected. Ponto sync uses insert-only conflict handling via ponto-store to preserve immutable transactions without widening RLS.
- Purchase suppliers link via DB trigger; documents snapshot supplier defaults without rewriting source amounts. Receipt AI is server-side, originals private, hash dedup; mobile scanning stops camera tracks on capture/close/unmount.
- Customers use normalized name/full-address identity, preserve source codes/aliases and link via a work-order trigger; projects belong to customer IDs. allCustomers paginates newest-first; CustomerPicker/SearchSelect share ID-based, order-preserving search.
- Roles live in `user_roles` (admin|technician|marketing); technicians only see assigned work orders via `my_technician_id()`, marketing only customers/newsletters/photos via `is_admin_or_marketing()` and the price-free `photo_overview()` RPC. Logins are created by admin-checked server fns; public sign-up is removed.
- Running uses open time entries; lists refetch every 10s. Calendar uses tested calendar-window and date-relative offsets for rollover.
- Work orders keep customer and optional worksite addresses in split fields; resolve the destination through the shared address helper; a DB trigger invalidates cached driving distance on address changes.
- Work-order mail/previews share the allowlist, Worker PDF and RLS-scoped private photo loader; photo annex precedes terms, errors block omission. Previews enforce crew visibility via PDF.js dialogs. Mail uses private attachments, never inline details/rates.
- Signing and payment share the tested task-completion helper; navigate crews only after a successful save and after the mail attempt, even on failure, so a mail error cannot strand them on a completed task.
- Work-order payment removal uses an admin-checked server function and a tested narrow patch; it preserves completion/signature and does not modify invoice payments.
- Newsletters: email-bound audited consent, hashed-token unsubscribe POSTs; draft-only until delivery linked. Admin server AI creates unsaved suggestions; provider denials persist in settings.
- PDF/UBL share invoice-vat-notices for all line rates; preserve tax treatment and sent snapshots.
- Crew names map via `login.ts`; visibility retains RLS. WhatsApp uses manual sharing with no passwords; hashed 72h single-use setup tokens are claimed atomically before Auth updates, preventing replay.
- Mail import reads the inbox through a per-admin Outlook App User Connector connection (`src/lib/outlook.functions.ts`), so the mailbox signs in itself without Exchange delegation.
- Crew accessibility uses use-role/html and text-size device overrides; mobile nav collapses. Embedded pages use a dvh flex shell with min-h-0 and no outer scroll.
- Invoices snapshot customer/lines, send PDF+UBL with OkiOki in BCC, and lock accepted legs for retries; only paid invoices auto-send. Mail acceptance is not Peppol confirmation. Reminders use explicit debtor type, tested balance/fee/waiting rules and one-time claims; uncertain Outlook outcomes require review.
- Invoice numbers come from the create_numbered_invoice RPC (counter + insert in one transaction); never call next_invoice_number separately, or failed inserts burn numbers and leave gaps.
- Bulk work-order deletion uses the shared delete-task helper with one explicit confirmation and selected IDs only; invalidate work-order and invoice lists so deleted orders cannot remain selectable.
- invoice-payment-reference shares modulo-97 across PDF/UBL/reminders/QR; EPC v2 uses free text (structured is RF-only), retaining digits for Ponto. Open PDFs embed QR. Stripe stays off unless asked.
- Quotes use OFF numbering and secret-token signing; privileged reads stay inside handlers. Approval atomically creates one task via `ensure_approved_quote_task` (`work_order_id` prevents duplicates); source worksite and crew persist, `quote_approved` drives labels.
- Quote signing emails use the canonical published app URL through the tested signing-link helper, never the request origin, because preview and internal hosts are inaccessible to customers.
- Credit notes share invoice numbering and nullable/non-unique work_order_id. Editors share isInvoiceEditable; credit previews/saves use buildManualCreditNote to preserve negative totals and lock settled notes.
- Product RLS enforces admin_only. Private photo paths snapshot onto quote lines; token reads sign only those files, PDFs embed bytes. Retain files for saved quotes.
- Invoices/credit notes use a separate, sender-verified Outlook connection; other mails retain theirs. Accountant exports attach UBL only.
- External crews use price-free token DTOs, quote text/quantities and atomic scheduling RPCs. Slot entry uses raw text normalized before validation; native pickers can leave visible selections uncommitted.
- Quote scheduling/conversion queues original mails; admin sync uses owner-scoped Outlook keys and stable IDs for retry-safe moves.
- Contracts invoice confirmed per-visit lines via unique queue/RPC every five minutes. Informational tasks skip normal invoicing/Simpla. Activation explicit; sending server-only; uncertain mail never retries.
- Work order numbers are nullable; assign at first time entry or completion via triggers. Render unnumbered tasks as "Nieuw" via werkbonNr().
- Active tasks and completed work orders use separate pages with shared status selectors; completed reads retain crew RLS and visibility flags so separating lists never broadens access.
- `cold-entry.ts` distinguishes restored pages; module recovery runs in the head before bootstrap, with bounded reload and standalone retry UI because effects run too late.
- Insurance estimates are `quotes` with `kind = 'verzekering'`: private `werkbon-fotos` paths (`bestek/`) appended before terms; AI suggests price-free unsaved text — one numbering/signing flow.
- `bestekFromWorkOrder` (admin, idempotent) converts completed orders; quote triggers exclude `kind = 'verzekering'` so a bestek never archives/hides its source werkbon.
- Finance keeps Mail Assist math and admin+owner checks; local sales link to Riory BV, imported numbers dedupe. `fin_reconcile_bank` atomically claims ledger, locks invoice and posts balanced journal (partials open, overpayments fail). `fin_restore_archive` preserves IDs.
- Range-paged reads order by id first (un-ordered paging drops rows; parallel salvo's on the joined journal query return 500). Dashboard journal figures use the `fin_journal_summary` month-aggregate RPC (invoker, so RLS holds); accounting pages keep raw lines for arbitrary periods.
- Prior-year accountant figures are one `jaarafsluiting`-source entry that trialBalance counts only for periods ending in that year, so it never doubles the next opening balance.
- Supplier payment details resolve through `creditorBank` (what the admin typed on the invoice first, then the supplier record), and a corrected invoice writes those details back to `suppliers`; the BIC is only ever derived from the static bank-code table in `src/lib/iban-bic.ts`, so a hand-typed BIC is never overwritten.
