import { brusselsDate } from "@/lib/tikklok/calendar-rules";

const OUTLOOK_GATEWAY = "https://connector-gateway.lovable.dev/microsoft_outlook";

export type BirthdayRecipient = { employee_id: string; name: string; email: string };

// Pure selection rule: only active employees with a birth date matching today
// (month-day) and a known e-mail address receive the birthday mail.
export function birthdayRecipients(
  employees: { id: string; name: string; active: boolean }[],
  profiles: { employee_id: string; email: string | null; birth_date: string | null }[],
  today: string,
): BirthdayRecipient[] {
  const activeNames = new Map(
    employees.filter((e) => e.active).map((e) => [e.id, e.name]),
  );
  return profiles
    .filter(
      (p) =>
        Boolean(p.email) &&
        Boolean(p.birth_date) &&
        p.birth_date!.slice(5) === today.slice(5) &&
        activeNames.has(p.employee_id),
    )
    .map((p) => ({ employee_id: p.employee_id, name: activeNames.get(p.employee_id)!, email: p.email! }));
}

export function birthdayEmailContent(name: string) {
  const safeName = name.replace(/[<>&"']/g, "");
  return {
    subject: `Gelukkige verjaardag, ${safeName}!`,
    html: `<p>Beste ${safeName},</p><p>Vandaag is het jouw dag! Het hele Riory-team wenst je een fantastische verjaardag vol geluk, gezondheid en mooie momenten.</p><p>Geniet er ten volle van.</p><p>Met vriendelijke groeten,<br>Het Riory-team</p>`,
  };
}

export async function sendOutlookBirthdayEmail(input: { recipient: string; employeeName: string }) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const outlookKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
  if (!lovableKey || !outlookKey) throw new Error("Outlook-mailbox is niet gekoppeld");
  const { subject, html } = birthdayEmailContent(input.employeeName);
  const response = await fetch(`${OUTLOOK_GATEWAY}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": outlookKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: input.recipient } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Outlook birthday sendMail failed", response.status, detail);
    throw new Error(`Outlook verzenden mislukt (${response.status})`);
  }
}

export async function processBirthdayEmails() {
  const today = brusselsDate();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [employeesResult, profilesResult] = await Promise.all([
    supabaseAdmin.from("tk_employees").select("id, name, active"),
    supabaseAdmin
      .from("tk_employee_profiles")
      .select("employee_id, email, birth_date")
      .not("email", "is", null)
      .not("birth_date", "is", null),
  ]);
  if (employeesResult.error) throw new Error("Medewerkers ophalen mislukt");
  if (profilesResult.error) throw new Error("Dossiers ophalen mislukt");

  const recipients = birthdayRecipients(
    (employeesResult.data ?? []) as { id: string; name: string; active: boolean }[],
    (profilesResult.data ?? []) as { employee_id: string; email: string | null; birth_date: string | null }[],
    today,
  );

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    // Claim the send for this birthday; an existing row means it already went out.
    const existing = await supabaseAdmin
      .from("tk_birthday_email_jobs")
      .select("id")
      .eq("employee_id", recipient.employee_id)
      .eq("birthday_date", today)
      .maybeSingle();
    if (existing.error || existing.data) continue;
    const claimed = await supabaseAdmin
      .from("tk_birthday_email_jobs")
      .insert({
        employee_id: recipient.employee_id,
        birthday_date: today,
        recipient_email: recipient.email,
        status: "processing" as const,
        attempts: 1,
      })
      .select("id")
      .single();
    if (claimed.error || !claimed.data) continue;
    try {
      await sendOutlookBirthdayEmail({ recipient: recipient.email, employeeName: recipient.name });
      await supabaseAdmin
        .from("tk_birthday_email_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
        .eq("id", claimed.data.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Onbekende fout";
      await supabaseAdmin
        .from("tk_birthday_email_jobs")
        .update({ status: "failed", error_message: message })
        .eq("id", claimed.data.id);
      failed += 1;
    }
  }
  return { today, candidates: recipients.length, sent, failed };
}
