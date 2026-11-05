export function purchaseBankChoices(rows: any[], claims: any[]) {
  return rows.map((p) => {
    const payments = claims.filter((claim) => claim.purchase_invoice_id === p.id);
    const paid = Math.round(payments.reduce((sum, claim) => sum - Number(claim.amount), Number(p.bank_paid_base ?? 0)) * 100) / 100;
    return { ...p, id: `purchase:${p.id}`, purchase_id: p.id, direction: 'aankoop', doc_type: p.kind,
      number: p.invoice_number, counterparty: p.supplier_name,
      paid_amount: payments.length || paid ? paid : p.status === 'betaald' ? Number(p.total) : 0,
      fin_invoice_lines: [{ ex_vat: Number(p.total), vat: 0 }] };
  });
}