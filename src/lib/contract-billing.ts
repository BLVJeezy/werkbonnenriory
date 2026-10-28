import { z } from 'zod';
import type { InvoiceLine } from './invoice';
export const contractLineSchema = z.object({ description: z.string().trim().min(1), quantity: z.number().positive(), unit: z.string(), unitPrice: z.number().nonnegative(), discount: z.number().min(0).max(100), vatRate: z.union([z.literal(0),z.literal(6),z.literal(12),z.literal(21)]) });
export type ContractLine = z.infer<typeof contractLineSchema>;
const r = (n: number) => Math.round(n * 100) / 100;
export function contractTotals(input: unknown) {
  const source = z.array(contractLineSchema).min(1).parse(input);
  const lines: InvoiceLine[] = source.map(l => ({ description: l.description, quantity: l.quantity, unit: l.unit || 'stuk', unitPrice: l.unitPrice * (1-l.discount/100), amount: r(l.quantity * l.unitPrice * (1-l.discount/100)), vatRate: l.vatRate, discount: l.discount, originalUnitPrice: l.unitPrice }));
  const groups = invoiceTaxGroups(lines, 21);
  const net = r(lines.reduce((s,l)=>s+l.amount,0));
  const vat = r(groups.reduce((s,g)=>s+g.vat,0));
  return { lines, net, vat, total: r(net+vat), vatRate: source[0]?.vatRate ?? 21 };
}
export function invoiceTaxGroups(lines: InvoiceLine[], fallback: number) {
  const groups = new Map<number,number>();
  for (const l of lines) { const rate=l.vatRate ?? fallback; groups.set(rate,r((groups.get(rate)??0)+l.amount)); }
  return [...groups].map(([rate,net])=>({rate,net,vat:r(net*rate/100)}));
}
export function sourceContractLines(raw: unknown): ContractLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(l=>l&&typeof l==='object').map(l=>({description:String(l['verkoop']??''),quantity:Number(l['aantal']??1),unit:String(l['eenheid']??'stuk'),unitPrice:Number(l['eenheidsprijs']??0),discount:Number(l['kortingspercentage']??0),vatRate:Number(l['BTW-percentage']??21) as ContractLine['vatRate']}));
}