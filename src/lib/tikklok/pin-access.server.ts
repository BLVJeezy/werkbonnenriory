import { compare } from 'bcryptjs';
export const pinValidator = (data: { pin: string; deviceToken: string }) => {
  const pin = data?.pin?.trim();
  if (!pin || !/^\d{4,8}$/.test(pin)) throw new Error('Ongeldige PIN');
  const deviceToken = data?.deviceToken?.trim();
  if (!deviceToken || !/^[A-Za-z0-9_-]{40,100}$/.test(deviceToken)) throw new Error('Dit toestel is niet goedgekeurd');
  return { pin, deviceToken };
};
export async function findEmployeeByPin(pin: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: employees, error } = await supabaseAdmin.from('tk_employees').select('id, name, active, pin').eq('active', true);
  if (error) throw new Error('Databasefout');
  for (const employee of employees ?? []) {
    if (await compare(pin, employee.pin)) return { employee, supabaseAdmin };
  }
  throw new Error('PIN niet herkend');
}