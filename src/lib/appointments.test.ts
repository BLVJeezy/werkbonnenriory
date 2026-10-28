import { expect,it } from 'vitest';
import { appointmentInstruction,appointmentSlotsInput,appointmentView,proposalInput } from './appointments';
it('ploeg kan meerdere geldige tijdsvakken voorstellen',()=>{expect(appointmentSlotsInput.parse([{date:'2026-10-30',from:'09:00',until:'12:00'},{date:'2026-10-31',from:'13:00',until:'16:00'}])).toHaveLength(2);});
it('klantalternatieven zijn beschikbaar voor ploeg maar niet voor klant',()=>{const r={status:'crew_pending',proposed_date:null,time_from:null,time_until:null,instruction:'Reiniging',customer_slots:[{date:'2026-10-31',from:'10:00',until:'12:00'}]};expect(appointmentView(r,{customer_name:'Klant',address:null},true).customerSlots).toEqual(r.customer_slots);expect(appointmentView(r,{customer_name:'Klant',address:null},false)).not.toHaveProperty('customerSlots');});
it('neemt offerteomschrijvingen automatisch over zonder prijzen of kilometerpost',()=>{expect(appointmentInstruction('Oude taaktekst',[{description:'Camera-inspectie',quantity:1,unit:'st',unitPrice:150,amount:150},{description:'Verplaatsing',quantity:20,unit:'km',unitPrice:1.45,amount:29}])).toBe('- Camera-inspectie: 1 st');});
it('gebruikt de taakomschrijving wanneer geen offerte gekoppeld is',()=>{expect(appointmentInstruction(' Riool reinigen ',undefined)).toBe('Riool reinigen');});
it('vereist een datum en geldig oplopend tijdsvak',()=>{const i={token:'11111111-1111-4111-8111-111111111111',date:'2026-10-30',from:'09:00',until:'12:00'};expect(proposalInput.safeParse(i).success).toBe(true);expect(proposalInput.safeParse({...i,until:'08:00'}).success).toBe(false);});
it('geeft nooit prijzen of offertes mee aan externe ploeg',()=>{const r={status:'crew_pending',proposed_date:null,time_from:null,time_until:null,instruction:'Reiniging',price:165,quotes:[123]};expect(appointmentView(r,{customer_name:'Klant',address:'Straat 1'},true)).toEqual({status:'crew_pending',date:null,from:null,until:null,slots:[],customerSlots:[],instruction:'Reiniging',customer:'Klant',address:'Straat 1'});});
it('klantpagina bevat geen interne werkomschrijving',()=>{expect(appointmentView({status:'customer_pending',proposed_date:'2026-10-30',time_from:'09:00:00',time_until:'12:00:00',instruction:'Intern'},{customer_name:'Klant',address:'Straat 1'},false)).not.toHaveProperty('instruction');});
import { normalizeSlot } from './appointments';
describe('normalizeSlot', () => {
  it('zet een Belgische datum 28-10-2026 om naar 2026-10-28', () => {
    expect(normalizeSlot({ date: '28-10-2026', from: '12:30', until: '14:30' }).date).toBe('2026-10-28');
  });
  it('aanvaardt 12.30 en 14:30:00 als uren', () => {
    const s = normalizeSlot({ date: '2026-10-28', from: '12.30', until: '14:30:00' });
    expect([s.from, s.until]).toEqual(['12:30', '14:30']);
  });
});
