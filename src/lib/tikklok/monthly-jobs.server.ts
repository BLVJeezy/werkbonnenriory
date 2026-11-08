import { buildTimesheetPdf, sendOutlookTimesheet } from "./monthly-reports.server";

export async function processMonthlyTimesheets() {
        const now = new Date();
        if (now.getUTCDate() !== 1)
          return Response.json({ skipped: true, reason: "Geen eerste dag van de maand" });
        const reportMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const reportDate = reportMonth.toISOString().slice(0, 10);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profiles, error: profileError } = await supabaseAdmin
          .from("tk_employee_profiles")
          .select("employee_id, email, split_special_hours")
          .eq("monthly_report_enabled", true)
          .not("email", "is", null);
        if (profileError)
          return Response.json({ error: "Profielen ophalen mislukt" }, { status: 500 });

        let sent = 0;
        let failed = 0;
        for (const profile of profiles ?? []) {
          if (!profile.email) continue;
          const [{ data: employee }, { data: existing }] = await Promise.all([
            supabaseAdmin
              .from("tk_employees")
              .select("name")
              .eq("id", profile.employee_id)
              .eq("active", true)
              .maybeSingle(),
            supabaseAdmin
              .from("tk_monthly_report_jobs")
              .select("id, status, attempts")
              .eq("employee_id", profile.employee_id)
              .eq("report_month", reportDate)
              .maybeSingle(),
          ]);
          if (!employee || existing?.status === "sent" || existing?.status === "processing" || (existing?.attempts ?? 0) >= 10) continue;
          const jobPayload = {
            employee_id: profile.employee_id,
            report_month: reportDate,
            recipient_email: profile.email,
            status: "processing" as const,
            attempts: (existing?.attempts ?? 0) + 1,
            error_message: null,
          };
          const jobResult = existing
            ? await supabaseAdmin
                .from("tk_monthly_report_jobs")
                .update(jobPayload)
                .eq("id", existing.id)
                .eq("status", existing.status)
                .eq("attempts", existing.attempts)
                .select("id")
                .single()
            : await supabaseAdmin
                .from("tk_monthly_report_jobs")
                .insert(jobPayload)
                .select("id")
                .single();
          if (jobResult.error || !jobResult.data) {
            failed += 1;
            continue;
          }
          try {
            const { data: entries, error: entriesError } = await supabaseAdmin
              .from("tk_time_entries")
              .select("clock_in, clock_out")
              .eq("employee_id", profile.employee_id)
              .gte("clock_in", reportMonth.toISOString())
              .lt("clock_in", nextMonth.toISOString())
              .order("clock_in");
            if (entriesError) throw new Error("Uren ophalen mislukt");
            const pdf = await buildTimesheetPdf({
              employeeName: employee.name,
              reportMonth,
              entries: entries ?? [],
              splitSpecialHours: profile.split_special_hours,
            });
            const filename = `urenstaat-${reportDate.slice(0, 7)}.pdf`;
            await sendOutlookTimesheet({
              recipient: profile.email,
              employeeName: employee.name,
              month: pdf.month,
              filename,
              pdfBytes: pdf.bytes,
            });
            await supabaseAdmin
              .from("tk_monthly_report_jobs")
              .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
              .eq("id", jobResult.data.id);
            sent += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 500) : "Onbekende fout";
            await supabaseAdmin
              .from("tk_monthly_report_jobs")
              .update({ status: "failed", error_message: message })
              .eq("id", jobResult.data.id);
            failed += 1;
          }
        }
        return Response.json({ success: failed === 0, sent, failed, reportMonth: reportDate });
}
