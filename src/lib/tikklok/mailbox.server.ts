import { isTikklokSender } from './migration-rules';

const gateway = 'https://connector-gateway.lovable.dev/microsoft_outlook';

export async function tikklokMailbox() {
  const appKey = process.env['LOVABLE_API_KEY'];
  const connectionKey = process.env['MICROSOFT_OUTLOOK_API_KEY'];
  if (!appKey || !connectionKey) throw new Error('Outlook-mailbox is niet gekoppeld');
  const headers = { Authorization: `Bearer ${appKey}`, 'X-Connection-Api-Key': connectionKey, 'Content-Type': 'application/json' };
  const response = await fetch(`${gateway}/me?$select=mail,userPrincipalName`, { headers });
  if (!response.ok) {
    const body = await response.text();
    console.error('Tikklok Outlook-controle', response.status, body);
    throw new Error(`Outlook-controle mislukt (${response.status})`);
  }
  const user = await response.json() as { mail?: string; userPrincipalName?: string };
  const mailbox = user.mail ?? user.userPrincipalName ?? null;
  return { mailbox, correctSender: isTikklokSender(mailbox), headers, gateway };
}

export async function verifiedTikklokMailbox() {
  const result = await tikklokMailbox();
  if (!result.correctSender) throw new Error('Tikklokmails moeten vanuit info@riory.be vertrekken; controleer de Outlook-koppeling');
  return result;
}