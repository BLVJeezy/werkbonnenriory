import type { Database } from '@/integrations/supabase/types';
import { getConnectionKeyForUser } from '@/lib/appUserConnections.server';
import { WERKBON_MAIL_SCOPES } from '@/lib/outlook-scopes';
type RequestRow=Database['public']['Tables']['appointment_requests']['Row'];
export async function deliverAppointment(r:RequestRow){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 if(!r.mail_pending)return {sent:true};
 const {data:claimed}=await db.from('appointment_requests').update({mail_lock_until:new Date(Date.now()+120000).toISOString()}).eq('id',r.id).eq('version',r.version).eq('mail_pending',r.mail_pending).or(`mail_lock_until.is.null,mail_lock_until.lt.${new Date().toISOString()}`).select('id').maybeSingle();
 if(!claimed)return {sent:false,error:'Mail wordt al verstuurd'};
 try{
  if([r.crew_email,r.customer_email].some(email=>email.toLowerCase().endsWith('.invalid')))throw new Error('Testadres: mail niet verstuurd');
  const {data:w}=await db.from('work_orders').select('*').eq('id',r.work_order_id).single();
  if(!w || w.technician_id!==r.technician_id || w.status==='afgetekend')throw new Error('Afspraak niet meer beschikbaar');
  const {data:admins}=await db.from('user_roles').select('user_id').eq('role','admin');
  let key:string|null=null;for(const a of admins??[]){key=await getConnectionKeyForUser(a.user_id,'microsoft_outlook_werkbon');if(key)break;}
  if(!key)throw new Error('Koppel eerst de mailbox info@riory.be');
  const base='https://werkbonnenriory.lovable.app';
  const {destinationAddress}=await import('@/lib/address');
  const address=destinationAddress(w)??'Adres niet ingevuld';
  const slot=`${r.proposed_date??''} tussen ${r.time_from?.slice(0,5)??''} en ${r.time_until?.slice(0,5)??''}`;
  const customer=r.mail_pending==='customer';
  const body=customer?`Beste ${w.customer_name},\n\nWij stellen uw afspraak voor op ${slot}.\nAdres: ${address}\n\nBevestig of kies dat dit moment niet past:\n${base}/afspraak/klant/${r.customer_token}\n\nMet vriendelijke groeten,\nRiory`:r.mail_pending==='confirmed'?`Afspraak bevestigd door ${w.customer_name}.\n${slot}\nAdres: ${address}\n\n${r.instruction}\n\nRiory`:`${r.mail_pending==='rejected'?'Het voorgestelde moment past niet voor de klant. Kies een nieuw moment.':'Kies een datum en tijdsvak voor deze afspraak.'}\nKlant: ${w.customer_name}\nAdres: ${address}\n${r.instruction}\n\n${base}/afspraak/ploeg/${r.crew_token}\n\nRiory`;
  const {callAsAppUser,appUserReconnectRequired}=await import('@/integrations/lovable/appUserConnector');
  const res=await callAsAppUser({gatewayBaseUrl:'https://connector-gateway.lovable.dev',connectionAPIKey:key,connectorId:'microsoft_outlook',path:'/me/sendMail',requiredScopes:WERKBON_MAIL_SCOPES,init:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:{subject:customer?'Riory — voorgestelde afspraak':r.mail_pending==='confirmed'?'Riory — afspraak bevestigd':'Riory — afspraak inplannen',body:{contentType:'Text',content:body},toRecipients:[{emailAddress:{address:customer?r.customer_email:r.crew_email}}]}})}});
  if(await appUserReconnectRequired(res))throw new Error('Koppel info@riory.be opnieuw');
  if(!res.ok){console.error('appointment mail',res.status,await res.text());throw new Error(`Afspraakmail niet verstuurd (${res.status})`);}
  const {error}=await db.from('appointment_requests').update({mail_pending:null,mail_sent_at:new Date().toISOString(),mail_error:null,mail_lock_until:null}).eq('id',r.id).eq('version',r.version);
  if(error)throw new Error('Mail geaccepteerd; registratie mislukt. Controleer verzonden mails vóór herproberen.');
  return {sent:true};
 }catch(e){const error=e instanceof Error?e.message:'Mail versturen mislukt';await db.from('appointment_requests').update({mail_error:error,mail_lock_until:null}).eq('id',r.id).eq('version',r.version);return {sent:false,error};}
}