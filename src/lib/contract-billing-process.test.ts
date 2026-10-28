import {expect,it,vi} from 'vitest';
vi.mock('./invoice-sending.server',()=>({sendOne:vi.fn()}));
import {processContractBilling} from './contract-billing.server';
it('herverwerking maakt geen tweede factuur voor een reeds gefactureerde beurt',async()=>{
 const rpc=vi.fn();
 const job={work_order_id:'beurt',contract_id:'contract',invoice_id:'bestaande-factuur',status:'created'};
 const chain:any={select:()=>chain,in:()=>chain,order:async()=>({data:[job],error:null}),update:()=>chain,eq:()=>chain,or:()=>chain,maybeSingle:async()=>({data:job,error:null}),then:(resolve:any)=>resolve({error:null})};
 const sb:any={from:vi.fn(()=>chain),rpc};
 expect(await processContractBilling(sb,false)).toEqual({created:0,sent:0});expect(rpc).not.toHaveBeenCalled();
});