import { describe, expect, it } from 'vitest';
import { canSendPeppolTest, creditorBank, daysUntilDue, dueLabel, learnedAccount, lineKey, parsePurchaseUbl, paymentCommunication, paymentMethodLock, supplierBankWarnings } from './purchase-booking';

describe('purchase booking', () => {
  it('toont de testfactuurknop enkel als verzenden én ontvangen geregistreerd zijn', () => {
    expect(canSendPeppolTest({ configured: true, participantId: '0208:0840931404', senderId: '9925:BE0840931404' })).toBe(true);
    expect(canSendPeppolTest({ configured: true, participantId: '0208:0840931404', senderId: null })).toBe(false);
    expect(canSendPeppolTest({ configured: true, participantId: null, senderId: '9925:BE0840931404' })).toBe(false);
    expect(canSendPeppolTest({ configured: false })).toBe(false);
  });

  it('leest UBL-lijnkorting en documentkorting zonder dubbele aftrek', () => {
    const xml = `<Invoice><ID>DISC-1</ID><TaxTotal><TaxAmount>16.8</TaxAmount></TaxTotal><LegalMonetaryTotal><TaxExclusiveAmount>80</TaxExclusiveAmount><PayableAmount>96.8</PayableAmount></LegalMonetaryTotal><AllowanceCharge><ChargeIndicator>false</ChargeIndicator><Amount>10</Amount><TaxCategory><Percent>21</Percent></TaxCategory></AllowanceCharge><InvoiceLine><InvoicedQuantity>2</InvoicedQuantity><LineExtensionAmount>90</LineExtensionAmount><AllowanceCharge><ChargeIndicator>false</ChargeIndicator><MultiplierFactorNumeric>10</MultiplierFactorNumeric><Amount>10</Amount></AllowanceCharge><Item><Name>Buis</Name><ClassifiedTaxCategory><Percent>21</Percent></ClassifiedTaxCategory></Item><Price><PriceAmount>50</PriceAmount></Price></InvoiceLine></Invoice>`;
    const r = parsePurchaseUbl(xml);
    expect(r.lines[0]).toMatchObject({ amount: 90, discountPercent: 10, discountAmount: 10, vatRate: 21 });
    expect(r.lines[1]).toMatchObject({ amount: -10, vat: -2.1 });
    expect(r.net).toBe(80);
    expect(r.total).toBe(96.8);
  });
  it('learns per supplier and description, ignoring numbers', () => {
    const rules = [{ supplier_id: 's1', match_key: lineKey('Diesel 45,2 L'), account: '612200', uses: 3 }];
    expect(learnedAccount({ description: 'Diesel 51,0 L', quantity: 1, unit: 'st', unitPrice: 1, amount: 1 }, 's1', rules)).toBe('612200');
    expect(learnedAccount({ description: 'Diesel', quantity: 1, unit: 'st', unitPrice: 1, amount: 1 }, 's2', rules)).toBeNull();
  });
  it('counts down to the due date and flags overdue', () => {
    expect(daysUntilDue('2026-11-11', '2026-11-01')).toBe(10);
    expect(dueLabel(daysUntilDue('2026-10-30', '2026-11-01')).overdue).toBe(true);
    expect(dueLabel(0).text).toBe('Vervalt vandaag');
  });
  it('uses the payment reference, else the invoice number', () => {
    expect(paymentCommunication('+++123/4567/89002+++', 'F1')).toBe('+++123/4567/89002+++');
    expect(paymentCommunication(null, '202612878')).toBe('202612878');
    expect(paymentCommunication('   ', '202612878')).toBe('202612878');
    expect(paymentCommunication(null, null)).toBeNull();
  });
  it('warns when IBAN or BIC is missing', () => {
    expect(supplierBankWarnings({ iban: 'BE1', bic: null })).toEqual(['BIC ontbreekt bij deze leverancier']);
  });
  it('pays with the invoice bank details first, then the supplier record', () => {
    const sup = { iban: 'BE71 0961 2345 6769', bic: 'GKCCBEBB' };
    expect(creditorBank({ supplier_iban: 'BE68 5390 0754 7034', supplier_bic: null }, sup)).toEqual({ iban: 'BE68 5390 0754 7034', bic: 'GKCCBEBB' });
    expect(creditorBank({ supplier_iban: null, supplier_bic: ' KREDBEBB ' }, null)).toEqual({ iban: null, bic: 'KREDBEBB' });
  });
  it('locks domiciliation until settled', () => {
    expect(paymentMethodLock('domiciliering', 'goedgekeurd')).toMatch(/niet manueel/);
    expect(paymentMethodLock('domiciliering', 'betaald')).toBeNull();
  });
  it('reads a Peppol UBL invoice', () => {
    const xml = `<Invoice><cbc:ID>INV-9</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate><cbc:DueDate>2026-10-31</cbc:DueDate>
<cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>BE0123456789</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>Acme</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:PaymentMeans><cbc:PaymentID>+++123/4567/89002+++</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>BE68 5390 0754 7034</cbc:ID><cac:FinancialInstitutionBranch><cbc:ID>GKCCBEBB</cbc:ID></cac:FinancialInstitutionBranch></cac:PayeeFinancialAccount></cac:PaymentMeans>
<cac:TaxTotal><cbc:TaxAmount>21</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>100</cbc:TaxExclusiveAmount><cbc:PayableAmount>121</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>100</cbc:LineExtensionAmount><cac:Item><cbc:Name>Buis</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount>50</cbc:PriceAmount></cac:Price></cac:InvoiceLine></Invoice>`;
    const r = parsePurchaseUbl(xml) as ReturnType<typeof parsePurchaseUbl> & { supplierBic?: string };
    expect(r.invoiceNumber).toBe('INV-9');
    expect(r.supplierName).toBe('Acme');
    expect(r.supplierIban).toBe('BE68539007547034');
    expect(r.supplierBic).toBe('GKCCBEBB');
    expect(r.dueDate).toBe('2026-10-31');
    expect(r.paymentRef).toBe('+++123/4567/89002+++');
    expect(r.total).toBe(121);
    expect(r.lines[0]?.amount).toBe(100);
  });
});
