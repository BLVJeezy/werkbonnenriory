import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  readAppointment,
  proposeAppointment,
  answerAppointment,
} from "@/lib/appointments.functions";
import {
  appointmentStatuses,
  appointmentSlotsInput,
  slotLabel,
  normalizeSlot,
  type AppointmentSlot,
} from "@/lib/appointments";
import { Button } from "@/components/ui/button";
import { AppointmentSlots, emptySlot } from "./AppointmentSlots";
export function PublicAppointment({ token, crew }: { token: string; crew: boolean }) {
  const read = useServerFn(readAppointment),
    propose = useServerFn(proposeAppointment),
    answer = useServerFn(answerAppointment);
  const [rawSlots, setSlots] = useState<AppointmentSlot[]>([{ ...emptySlot }]),
    [choice, setChoice] = useState(0),
    [rejecting, setRejecting] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [answered, setAnswered] = useState(false);
  const {
    data: r,
    error,
    refetch,
  } = useQuery({
    queryKey: ["public-appointment", token, crew],
    queryFn: () => read({ data: { token, crew } }),
    retry: false,
  });
  async function submit(accept?: boolean) {
    if (busy) return;
    const field = (id: string, fallback: string) => {
      const el = typeof document !== "undefined" ? document.getElementById(id) : null;
      return el instanceof HTMLInputElement && el.value ? el.value : fallback;
    };
    const slots = rawSlots.map((s, i) =>
      normalizeSlot({
        date: field(`slot-date-${i}`, s.date),
        from: field(`slot-from-${i}`, s.from),
        until: field(`slot-until-${i}`, s.until),
      }),
    );
    if (crew || accept === false) {
      const result = appointmentSlotsInput.safeParse(slots);
      if (!result.success) {
        const index = result.error.issues[0]?.path[0];
        const slot = typeof index === "number" ? slots[index] : undefined;
        const nr = typeof index === "number" ? index + 1 : 1;
        setMessage(
          !slot?.date || !slot.from || !slot.until
            ? `Vul de datum, het beginuur en het einduur in voor tijdsvak ${nr}.`
            : !/^\d{4}-\d{2}-\d{2}$/.test(slot.date)
              ? `De datum van tijdsvak ${nr} is niet herkend. Schrijf bijvoorbeeld 29-10-2026.`
              : !/^\d{2}:\d{2}$/.test(slot.from) || !/^\d{2}:\d{2}$/.test(slot.until)
                ? `Het uur van tijdsvak ${nr} is niet herkend. Schrijf bijvoorbeeld 12:30.`
                : `Het einduur moet na het beginuur liggen (tijdsvak ${nr}).`,
        );
        return;
      }
    }
    setBusy(true);
    setMessage("Versturen…");
    try {
      if (crew) {
        const m = await propose({ data: { token, slots } });
        setMessage(
          m.sent
            ? "Voorstellen verstuurd naar de klant."
            : `Voorstellen opgeslagen, maar de mail is niet verstuurd. ${m.error ?? "Riory kan de mail opnieuw proberen."}`,
        );
        await refetch();
      } else {
        await answer({
          data: { token, accept: accept === true, choice, ...(!accept ? { slots } : {}) },
        });
        setAnswered(true);
        setMessage(
          accept
            ? "Uw afspraak is bevestigd."
            : "Uw mogelijkheden zijn doorgegeven aan Riory en de ploeg.",
        );
        if (accept) await refetch();
      }
    } catch (e) {
      setMessage(
        e instanceof Error && e.message === "Failed to fetch"
          ? "Geen verbinding. Controleer uw internetverbinding en probeer opnieuw."
          : e instanceof Error
            ? e.message
            : "Opslaan mislukt. Probeer opnieuw.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-primary bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-2xl px-5 py-5 text-xl font-black">
          RIORY <span className="text-primary">AFSPRAKEN</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        <h1 className="text-3xl font-black">
          {crew ? "Afspraak inplannen" : "Uw afspraak bij Riory"}
        </h1>
        {message && (
          <p role="status" className="border-l-4 border-primary pl-4 font-bold">
            {message}
          </p>
        )}
        {error && !answered ? (
          <p>Deze afspraaklink is ongeldig of verlopen.</p>
        ) : !r ? (
          <p>Laden…</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xl font-bold">{r.customer}</p>
              <p className="whitespace-pre-line">{r.address}</p>
              {"instruction" in r && <p className="whitespace-pre-line">{r.instruction}</p>}
              <p className="font-bold">{appointmentStatuses[r.status]}</p>
              {r.status === "confirmed" && r.date && (
                <p className="text-lg">
                  {r.date} · {r.from}–{r.until}
                </p>
              )}
            </div>
            {crew && r.status === "crew_pending" ? (
              <form
                noValidate
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {"customerSlots" in r && r.customerSlots && r.customerSlots.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-lg font-bold">Mogelijkheden van de klant</h2>
                    {r.customerSlots.map((s, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
                      >
                        <span>{slotLabel(s)}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSlots([s])}
                        >
                          Overnemen
                        </Button>
                      </div>
                    ))}
                  </section>
                )}
                <AppointmentSlots slots={rawSlots} onChange={setSlots} />
                <Button type="submit" disabled={busy}>
                  {busy ? "Versturen…" : "Voorstellen naar klant sturen"}
                </Button>
                {message && (
                  <p role="status" aria-live="polite" className="font-bold">
                    {message}
                  </p>
                )}
              </form>
            ) : r.status === "customer_pending" && !answered ? (
              <section className="space-y-4">
                {!rejecting && (
                  <fieldset className="space-y-3">
                    <legend className="mb-3 font-bold">
                      {crew ? "Voorgestelde tijdsvakken" : "Kies uw tijdsvak"}
                    </legend>
                    {r.slots.map((s, i) => (
                      <label key={i} className="flex items-center gap-3 border-b py-3">
                        {!crew && (
                          <input
                            type="radio"
                            name="slot-choice"
                            checked={choice === i}
                            onChange={() => setChoice(i)}
                          />
                        )}
                        <span>{slotLabel(s)}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {!crew &&
                  (rejecting ? (
                    <form
                      noValidate
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submit(false);
                      }}
                    >
                      <h2 className="text-xl font-bold">Uw beschikbare tijdsvakken</h2>
                      <AppointmentSlots slots={rawSlots} onChange={setSlots} />
                      <div className="flex flex-wrap gap-3">
                        <Button type="submit" disabled={busy}>
                          {busy ? "Versturen…" : "Mogelijkheden doorgeven"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
                          Terug
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        disabled={busy || !r.slots.length}
                        onClick={() => submit(true)}
                      >
                        Afspraak bevestigen
                      </Button>
                      <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                        Geen van deze momenten past
                      </Button>
                    </div>
                  ))}
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
