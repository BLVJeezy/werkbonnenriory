import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppointmentSlot } from '@/lib/appointments';
export const emptySlot:AppointmentSlot={date:'',from:'',until:''};
export function AppointmentSlots({slots,onChange}:{slots:AppointmentSlot[];onChange:(slots:AppointmentSlot[])=>void}){
 const update=(index:number,patch:Partial<AppointmentSlot>)=>onChange(slots.map((s,i)=>i===index?{...s,...patch}:s));
 return <div className="space-y-4">{slots.map((s,i)=><div key={i} className="space-y-2 border-b pb-4"><div className="flex items-center justify-between"><h3 className="font-bold">Tijdsvak {i+1}</h3>{slots.length>1 && <Button type="button" variant="ghost" size="icon" aria-label={`Tijdsvak ${i+1} verwijderen`} title="Tijdsvak verwijderen" onClick={()=>onChange(slots.filter((_,n)=>n!==i))}><Trash2 /></Button>}</div><Label htmlFor={`slot-date-${i}`}>Datum {i+1}</Label><Input id={`slot-date-${i}`} type="date" required value={s.date} onChange={e=>update(i,{date:e.target.value})} /><div className="grid grid-cols-2 gap-4"><div><Label htmlFor={`slot-from-${i}`}>Vanaf {i+1}</Label><Input id={`slot-from-${i}`} type="time" required value={s.from} onChange={e=>update(i,{from:e.target.value})} /></div><div><Label htmlFor={`slot-until-${i}`}>Tot {i+1}</Label><Input id={`slot-until-${i}`} type="time" required value={s.until} onChange={e=>update(i,{until:e.target.value})} /></div></div></div>)}<Button type="button" variant="outline" disabled={slots.length>=10} onClick={()=>onChange([...slots,{...emptySlot}])}><Plus />Tijdsvak toevoegen</Button></div>;
}