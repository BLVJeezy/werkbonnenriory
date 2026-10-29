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
- Mailtaken sales feed requires a shared server token and stable source IDs to prevent duplicate accounting imports.
- Document links use hashed tokens, private PDF snapshots and POST opens; admin reports count opens, not reading.
- Password recovery: public /reset-password and recovery sessions; never disclose passwords.
- Purchase payments use a tested direction/reference/amount matcher and an atomic transaction-key ledger; SEPA export only stages payment, supplier credit notes excluded. Original purchase PDFs stay private attachments.
- Purchase suppliers link via DB trigger; documents snapshot supplier defaults without rewriting source amounts. Receipt AI is server-side, originals private, hash dedup; mobile scanning stops camera tracks on capture/close/unmount.
- Customers use normalized name/full-address identity, preserve source codes/aliases and link via a work-order trigger; projects belong to customer IDs. allCustomers paginates newest-first; CustomerPicker/SearchSelect share ID-based, order-preserving search.
- Roles live in `user_roles` (admin|technician|marketing); technicians only see assigned work orders via `my_technician_id()`, marketing only customers/newsletters/photos via `is_admin_or_marketing()` and the price-free `photo_overview()` RPC. Logins are created by admin-checked server fns; public sign-up is removed.
- Running indicators use open time entries, not task status; lists and calendars refetch every ten seconds while visible.
- Work orders keep customer and optional worksite addresses in split fields; resolve the destination through the shared address helper; a DB trigger invalidates cached driving distance on address changes.
- Work-order mail/previews share the allowlist, Worker PDF and RLS-scoped private photo loader; photo annex precedes terms, errors block omission. Previews enforce crew visibility and use browser-only PDF.js dialogs. Mail uses private attachments, never inline details/rates.
- Signing and payment share the tested task-completion helper; navigate crews only after a successful save and after the mail attempt, including failures, so a mail error cannot strand them on a completed task.
- Billing math lives in `src/lib/billing.ts` (pure, tested); the UI computes totals live and stores only the paid amount when payment is recorded.
- Work-order payment removal uses an admin-checked server function and a tested narrow patch; it preserves completion/signature and does not modify invoice payments.
- Newsletters: email-bound audited consent, hashed-token unsubscribe POSTs; draft-only until delivery linked. Admin server AI creates unsaved suggestions; provider denials persist in settings.
- PDF/UBL share invoice-vat-notices for all line rates; preserve tax treatment and sent snapshots.
- Crews log in with name + password; `src/lib/login.ts` maps a name to an internal non-mailable email. Per-crew visibility flags live on `technicians` (signed orders enforced in RLS, the rest hidden in the UI).
- Mail import reads the inbox through a per-admin Microsoft Outlook App User Connector connection (`src/lib/outlook.functions.ts`), so the mailbox account signs in itself without Exchange delegation.
- Admin-set crew accessibility flags use `use-role.ts` and an `<html>` class; `text-size.ts` provides local overrides for shared tablets. Shared layout collapses mobile navigation into a menu.
- Invoices snapshot customer/lines, send PDF+UBL with OkiOki in BCC, and lock accepted legs for retries; only paid invoices auto-send. Mail acceptance is not Peppol confirmation. Reminders use explicit debtor type, tested balance/fee/waiting rules and one-time claims; uncertain Outlook outcomes require review.
- Invoice numbers are assigned atomically by the create_numbered_invoice RPC (counter + insert in one transaction); never call next_invoice_number separately from the insert, or failed inserts burn numbers and create gaps.
- Bulk work-order deletion uses the shared delete-task helper with one explicit confirmation and selected IDs only; invalidate both work-order and invoice lists so deleted orders cannot remain selectable.
- Quotes use OFF numbering and secret-token signing; privileged reads stay inside handlers. Approval atomically creates a task via `ensure_approved_quote_task`; `work_order_id` prevents duplicates, source worksite and crew persist, and `quote_approved` drives labels. Admin-only quote crew changes propagate without altering completion.
- Quote signing emails use the canonical published app URL through the tested signing-link helper, never the request origin, because preview and internal hosts are inaccessible to customers.
- Credit notes are `invoices` rows with `kind = 'creditnota'` and `credit_for` to the original; same numbering, reversed by tested `buildCreditNote`. `work_order_id` is nullable and not unique: credit notes share it, manual invoices have none and reuse `contract_reference` as reference.
- Products can be flagged `admin_only`; the read policy excludes them for non-admins and the material picker filters them too, so crews cannot select them even via the API.
- Invoices/credit notes use a separate, sender-verified Outlook connection; other mails retain theirs. Accountant exports attach UBL only.
- External crews use price-free token DTOs, quote text/quantities and atomic scheduling RPCs. Slot entry uses raw text normalized before validation; native pickers can leave visible selections uncommitted.
- Quotes keep source/output tasks separate; DB-enforced quote_pending hides sources and unapproved outputs. Scheduling/conversion queues original mails; admin sync uses owner-scoped Outlook keys and stable IDs for retry-safe moves.
- Contracts invoice confirmed per-visit lines via unique queue/RPC every five minutes. Informational tasks skip normal invoicing/Simpla. Activation explicit; sending server-only; uncertain mail never retries.
- Work order numbers are assigned only at the first time entry (trigger on time_entries) or on completion (BEFORE UPDATE trigger); tasks without a number render as "Nieuw" via werkbonNr() from src/lib/werkbon-number.ts. The number column is nullable — never assume it exists for open tasks.
