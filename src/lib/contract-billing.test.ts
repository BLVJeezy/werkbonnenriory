import { expect,it } from 'vitest';
import { contractTotals,invoiceTaxGroups,sourceContractLines } from './contract-billing';
import { buildCreditNote } from './invoice';
it('contractregels inclusief korting blijven het beurtbedrag bepalen',()=>{
 const t=contractTotals([{description:'Reiniging',quantity:1,unit:'stuk',unitPrice:165,discount:0,vatRate:6},{description:'Km volgens contract',quantity:22,unit:'km',unitPrice:1.35,discount:50,vatRate:6}]);
 expect(t.net).toBe(179.96);expect(t.vat).toBe(10.8);expect(t.total).toBe(190.76);
});
it('verschillende btw-tarieven worden apart berekend',()=>{const t=contractTotals([{description:'A',quantity:1,unit:'stuk',unitPrice:100,discount:0,vatRate:6},{description:'B',quantity:1,unit:'stuk',unitPrice:100,discount:0,vatRate:21}]);expect(t.net).toBe(200);expect(t.vat).toBe(27);expect(t.total).toBe(227);expect(invoiceTaxGroups(t.lines,t.vatRate)).toHaveLength(2);});
it('creditnota behoudt btw per regel en keert bedragen om',()=>{const t=contractTotals([{description:'A',quantity:1,unit:'stuk',unitPrice:100,discount:0,vatRate:6}]);const c=buildCreditNote(t);expect(c.total).toBe(-106);expect(c.lines[0]?.vatRate).toBe(6);});
it('import bewaart contracttarief en korting zonder taakarbeid toe te voegen',()=>{expect(sourceContractLines([{'verkoop':'Reiniging','aantal':2,'eenheidsprijs':300,'kortingspercentage':10,'BTW-percentage':0}])[0]).toMatchObject({quantity:2,unitPrice:300,discount:10,vatRate:0});});
it('ongeldige tarieven of lege regels blokkeren facturatie',()=>{expect(()=>contractTotals([])).toThrow();expect(()=>contractTotals([{description:'A',quantity:1,unit:'stuk',unitPrice:100,discount:101,vatRate:21}])).toThrow();});