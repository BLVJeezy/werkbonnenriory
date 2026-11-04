# Analyse en implementatieplan: Peppol-ontvangst, lerende boeking, Ponto AIS+PIS

Dit document is enkel analyse en planning. Er wordt geen code, database of bankkoppeling gewijzigd, en er worden geen secrets aangemaakt.

## 1. Wat er al is (vastgesteld in de code en het databaseschema)

Twee parallelle aankoopstromen:
- **Operationeel** (`purchase_invoices`, `suppliers`, `purchase_booking_rules`, pagina's `aankoopfacturen.tsx`/`leveranciers.tsx`/`betalingen.tsx`): bevat al `peppyrus_message_id`, `upload_hash`, `pdf_path` (privé), lijnen als `jsonb`, `payment_method` en btw-regel per leverancier, `payment_file_at`, `bank_transaction_key`, `booked_at`. Er zijn lib-modules `purchase-invoice.ts`, `purchase-booking.ts` (+ tests), `purchase-payment.ts` (matcher, getest), `pain001.ts` (+ test), `receipt.server.ts` (AI-uitlezing) en de public route `api/public/aankoopfacturen/import.ts`.
- **Boekhouding** (`fin_invoices`, `fin_invoice_lines` met `account`, `suggestion_rule_id`, `confidence`; `fin_rules`; `fin_journal_*`; `fin_audit`; `fin_bank_tx`; RPC's `fin_post_entry`, `fin_reconcile_bank(_multi)`, `fin_settle_paid_invoice`). Simpla-aankopen komen hier via `fin_supplier_imports` en `simpla.functions.ts`.

Ponto, ook twee keer:
- `ponto-sync.server.ts` + `api/public/ponto/sync.ts` → `ponto_transactions`/`ponto_reconciliations`, RPC's `reconcile_purchase_payment`/`reconcile_sales_payment` (atomische ledger op transaction key).
- `finance-ponto.server.ts` → `fin_bank_tx`, IBAN → 55x-rekening.
- Beide gebruiken alleen **AIS** met `client_credentials`; credentials staan versleuteld in `settings.ponto_client_ciphertext`. Er bestaat **geen PIS** (geen payment requests, bulk payments of redirect-flow).

Overig herbruikbaar: `fin_audit` (auditlog, insert-only), `has_role`-adminchecks, `finance-auth.ts`, `connectionKeyCrypto.server.ts` (versleutelen van secrets), `invoice-ubl.ts` (UBL-structuur, voor parser-tests), `document-tracking`, de cron-routes onder `api/public/cron`.

Peppyrus staat alleen voorbereid (`peppyrus_message_id` en verwijzingen in `aankoopfacturen.tsx`/`purchase-booking.functions.ts`); er is geen live ontvangstroute.

## 2. Belangrijkste architectuurbeslissing (vooraf bevestigen)

Er zijn nu twee aankoopmodellen en twee banktabellen. Nieuwe functionaliteit op beide bouwen verdubbelt het risico. Voorstel:
- `purchase_invoices` blijft het **ontvangst- en controle**-document (origineel, status, betaling).
- Bij **Goedkeuren/Inboeken** wordt het één keer omgezet naar `fin_invoices` + `fin_invoice_lines` + journaalpost (bestaande `fin_post_entry`). Leren gebeurt op `fin_rules` (al per lijn met confidence).
- Bank: `fin_bank_tx` wordt de enige bron voor afpunting; `ponto_transactions` blijft read-only als historie. Dit gebeurt pas na een reconciliatie die per transactie aantoont dat beide tabellen kloppen.

Dit staat nog niet vast: welke van de twee matchers (`purchase-payment.ts` of `fin_reconcile_bank`) leidend wordt. Dat beslissen we in fase 0 na een datavergelijking.

## 3. Ontbrekende onderdelen

Tabellen (nieuw, telkens met GRANT, RLS en enkel admin):
- `peppol_inbound_messages`: provider, message_id (uniek), ontvangen op, afzender-ID, documenttype, sha256, status (ontvangen/geparsed/fout/gekoppeld), fout, purchase_invoice_id.
- `purchase_invoice_files`: invoice_id, soort (`ubl_origineel`/`bijlage`/`pdf`), storage-pad, mime, sha256, grootte. Originele UBL ongewijzigd in een privébucket.
- `purchase_invoice_lines` (genormaliseerd i.p.v. jsonb): beschrijving, aantal, eenheidsprijs, netto, btw-%, **btw-code/rooster**, grootboekrekening, bron van de suggestie (regel/AI/manueel), confidence, gecorrigeerd door/op.
- `purchase_invoice_audit`, of hergebruik van `fin_audit` met entity `purchase_invoice` (voorkeur: hergebruik).
- `booking_rules_v2`, of uitbreiding van `fin_rules` met btw-code en een kolom voor het leverancier-ID (additief).
- `payment_batches` + `payment_batch_items`: batch-ID, kanaal (`ponto_bulk`/`pain001`), status (concept/aangevraagd/wacht op bankhandtekening/uitgevoerd/geweigerd/verlopen), Ponto bulk-ID, redirect-URL, totaal, aantal, idempotency key; items met invoice_id, bedrag, IBAN/BIC-snapshot en mededeling.
- `ponto_oauth_tokens` (versleuteld, alleen server/service_role): access/refresh-token, scope, verloopt op, organisatie.

Kolommen (additief): `suppliers.payment_method` bestaat al. Controleren of de waarden `domiciliering`/`kaart`/`overschrijving` dekken; zo nodig enkel een CHECK uitbreiden. Ook `purchase_invoices.payment_batch_id` en `supplier_peppol_id`.

Routes en serverfuncties:
- `api/public/peppol/webhook`: HMAC-verificatie van de provider, raw body, Zod, enkel opslaan + in de wachtrij zetten.
- `api/public/cron/peppol-poll`: fallback-polling met cron-secret.
- `api/public/ponto/oauth-callback`: state/PKCE-check en code → token, server-side.
- Serverfuncties (admin): `listInbound`, `parseInbound`, `updatePurchaseLine`, `approvePurchase`, `createPaymentBatch`, `submitBatchToPonto`, `exportPain001`, `refreshBatchStatus`.
- `src/lib/ubl-parse.ts` (pure en getest): UBL 2.1/PEPPOL BIS 3 → header, lijnen, btw-subtotalen, ingesloten bijlagen (`AdditionalDocumentReference/EmbeddedDocumentBinaryObject`).
- `src/lib/booking-suggest.ts` (pure en getest): eerst regels (leverancier+trefwoord+btw), daarna AI alleen bij lage confidence; de AI krijgt geen IBAN of bedrijfsgevoelige velden.

## 4. Beveiligingsrisico's en maatregelen

- **Webhook-spoofing**: zonder geldige handtekening geen verwerking. Idempotent op message_id + sha256.
- **XML-aanvallen** (XXE, billion laughs): een parser zonder DTD/entity-expansie, groottelimiet (bv. 10 MB) en een limiet op bijlagen.
- **Bijlagen**: mime-allowlist (pdf/png/jpg), opslag privé, enkel getekende kortlevende URL's voor admin, nooit inline renderen als HTML.
- **Ponto-secrets en tokens**: enkel in Secrets / versleutelde tabel zonder enige RLS-policy, en enkel gelezen binnen handlers. Tokens nooit naar de client of in logs.
- **PIS-misbruik**: een batch aanmaken vereist admin + expliciete bevestiging. Bedragen en IBAN worden server-side opnieuw uit de database gehaald (niet uit de client). De IBAN-snapshot wordt vergeleken met de leverancier, met een harde blokkade bij een gewijzigde IBAN sinds goedkeuring (fraudesignaal). Er is een idempotency key per batch. Leveranciers met domiciliëring of kaart worden geweigerd. Een factuur kan niet in twee open batches zitten (unieke constraint).
- **Bankhandtekening**: de app voert nooit zelf uit; de status "wacht op handtekening" duurt tot Ponto of de bank uitvoering meldt. Pas een bank-transactie (AIS) letterlijkt de factuur af, niet de PIS-status.
- **bulkPaymentsEnabled**: per rekening uit de Ponto-account-attributen lezen. Is het false of onbekend, dan wordt alleen pain.001 aangeboden. Fortis-ondersteuning wordt niet aangenomen; die wordt vastgesteld met een sandbox-/live-read.
- **Dubbel betalen**: domiciliëring-/kaartlabel blijft tot afpunting (bestaand gedrag) en wordt ook in de batch-selectie afgedwongen.
- **AI-lekken**: enkel lijnomschrijving, leveranciersnaam en bedragen; de suggestie wordt nooit automatisch geboekt.

## 5. Fasering

0. **Inventaris en beslissing** (geen gebruikerswijziging): datavergelijking `purchase_invoices` ↔ `fin_invoices` ↔ Simpla, en `ponto_transactions` ↔ `fin_bank_tx`. Keuze van de Peppol-provider (Peppyrus of een andere) en documentatie van webhook-, signing- en sandboxtoegang. Ponto: nagaan of de gebruiker een custom integration met PIS-scope krijgt.
1. **Peppol-ontvangst**: tabellen, privébucket, webhook en polling, UBL-parser, opslag van het origineel en de bijlagen, aanmaken van `purchase_invoices` met status "te controleren". Simpla blijft parallel draaien.
2. **Factuurdetail**: bewerkbare lijnen (rekening, btw-code, bedragen), live totalen met een controle tegen het UBL-totaal, auditlog per wijziging, preview van PDF/UBL-weergave.
3. **Leren**: regelsuggestie + AI-fallback; een correctie werkt de regel bij (hits/confidence); een overzicht van de regels met uitschakelen.
4. **Inboeken**: goedkeuren → `fin_invoices`/journaal via de bestaande RPC, eenmalig (uniek op purchase_invoice_id).
5. **Ponto AIS v2**: OAuth custom integration, één banktabel, automatische afpunting via de bestaande atomische RPC's, en een aparte lijst met twijfelgevallen.
6. **Betalingen**: batch-selectie, pain.001 (bestaand, uitgebreid met batchregistratie) en Ponto bulk payment wanneer `bulkPaymentsEnabled`. Statusopvolging en redirect naar de bankhandtekening. Eerst alleen in de Ponto-sandbox.
7. **Simpla uitfaseren**: pas nadat minstens 2 volledige maanden parallel lopen zonder verschillen in aantal, totalen en betaalstatus. Daarna de sync uitzetten (niet verwijderen) en de historie read-only houden.

## 6. Testplan

- Unit (vitest): UBL-parser met echte PEPPOL BIS 3-voorbeelden (lijnen, kortingen, meerdere btw-tarieven, creditnota 381, ingesloten PDF, kwaadaardige XML); booking-suggest (regel wint van AI, correctie leert); batch-validatie (domiciliëring geweigerd, IBAN-wijziging geblokkeerd, dubbele batch geweigerd); pain.001 tegen XSD-vorm; bulkPaymentsEnabled-beslisregel.
- Database: RPC-tests voor eenmalig inboeken, atomische afpunting en een batch-unieke constraint, plus RLS-checks voor ploeg en marketing (geen toegang).
- Route: webhook met een ongeldige handtekening geeft 401, een duplicaat geeft 200 zonder dubbel record.
- End-to-end (Playwright, als admin): een testfactuur ontvangen in de provider-sandbox → controleren → lijn aanpassen → inboeken → batch → pain.001 downloaden. Ponto alleen met sandbox-credentials.
- Reconciliatie: een script dat per maand de Simpla- en app-totalen vergelijkt, als voorwaarde voor fase 7.

## 7. Open punten (bevestiging nodig, niet aangenomen)

- Welke Peppol Access Point (Peppyrus bevestigen?) en of daar webhook-signing en een sandbox voor zijn.
- Of Ponto PIS en bulk payments beschikbaar zijn op het contract en voor de Fortis-rekeningen.
- Of `fin_invoices` de boekhoudkundige waarheid wordt (voorstel §2).
- Welke btw-codes/roosters (Belgische aangifte 81/82/83/59, verlegd 87) per lijn gebruikt moeten worden.
