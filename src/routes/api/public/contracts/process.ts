import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/contracts/process')({server:{handlers:{POST:async({request})=>{
 const denied=await authenticateCronRequest(request);if(denied)return denied;
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {processContractBilling}=await import('@/lib/contract-billing.server');
 return Response.json(await processContractBilling(supabaseAdmin));
}}}});