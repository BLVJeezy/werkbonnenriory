import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { splitWorkedMinutes } from "@/lib/tikklok/special-hours";
import { verifiedTikklokMailbox } from './mailbox.server';
type TimeEntry = { clock_in: string; clock_out: string | null };

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}u ${String(minutes % 60).padStart(2, "0")}m`;
}

function safePdfText(value: string) {
  return [...value.replace(/[–—]/g, "-")]
    .map((character) => (character.charCodeAt(0) <= 127 ? character : "?"))
    .join("");
}

export async function buildTimesheetPdf(input: {
  employeeName: string;
  reportMonth: Date;
  entries: TimeEntry[];
  splitSpecialHours?: boolean;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.95, 0.35, 0.08);
  const dark = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.42, 0.42, 0.42);
  const month = new Intl.DateTimeFormat("nl-BE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  }).format(input.reportMonth);
  const sorted = [...input.entries].sort((a, b) => a.clock_in.localeCompare(b.clock_in));
  const totalMinutes = sorted.reduce((sum, entry) => {
    if (!entry.clock_out) return sum;
    const duration = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
    return sum + Math.max(0, Math.round(duration / 60000));
  }, 0);
  const splitTotals = sorted.reduce(
    (totals, entry) => {
      const split = splitWorkedMinutes(entry.clock_in, entry.clock_out);
      totals.day += split.dayMinutes ?? 0;
      totals.special += split.specialMinutes ?? 0;
      return totals;
    },
    { day: 0, special: 0 },
  );
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;

  const drawHeader = () => {
    page.drawText("RIORY", { x: 44, y, size: 20, font: bold, color: orange });
    page.drawText("MAANDELIJKSE URENSTAAT", {
      x: 44,
      y: y - 30,
      size: 17,
      font: bold,
      color: dark,
    });
    page.drawText(safePdfText(input.employeeName), {
      x: 44,
      y: y - 52,
      size: 11,
      font: regular,
      color: muted,
    });
    page.drawText(safePdfText(month), { x: 410, y: y - 52, size: 11, font: regular, color: muted });
    page.drawLine({
      start: { x: 44, y: y - 68 },
      end: { x: 551, y: y - 68 },
      thickness: 1,
      color: orange,
    });
    y -= 94;
    page.drawText("Datum", { x: 44, y, size: 9, font: bold, color: dark });
    page.drawText("In", { x: 205, y, size: 9, font: bold, color: dark });
    page.drawText("Uit", { x: 300, y, size: 9, font: bold, color: dark });
    page.drawText("Duur", { x: 430, y, size: 9, font: bold, color: dark });
    y -= 18;
  };
  drawHeader();
  const dateFormat = new Intl.DateTimeFormat("nl-BE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
  const timeFormat = new Intl.DateTimeFormat("nl-BE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Brussels",
  });
  for (const entry of sorted) {
    if (y < 72) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
      drawHeader();
    }
    const duration = entry.clock_out
      ? new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()
      : null;
    const minutes = duration == null ? null : Math.max(0, Math.round(duration / 60000));
    page.drawText(safePdfText(dateFormat.format(new Date(entry.clock_in))), {
      x: 44,
      y,
      size: 10,
      font: regular,
      color: dark,
    });
    page.drawText(timeFormat.format(new Date(entry.clock_in)), {
      x: 205,
      y,
      size: 10,
      font: regular,
      color: dark,
    });
    page.drawText(
      entry.clock_out ? timeFormat.format(new Date(entry.clock_out)) : "Niet uitgeklokt",
      {
        x: 300,
        y,
        size: 10,
        font: regular,
        color: entry.clock_out ? dark : orange,
      },
    );
    page.drawText(minutes == null ? "-" : formatDuration(minutes), {
      x: 430,
      y,
      size: 10,
      font: regular,
      color: dark,
    });
    y -= 22;
    page.drawLine({
      start: { x: 44, y: y + 7 },
      end: { x: 551, y: y + 7 },
      thickness: 0.4,
      color: rgb(0.86, 0.86, 0.86),
    });
  }
  y = Math.max(44, y - 18);
  page.drawText(`Totaal gewerkte uren: ${formatDuration(totalMinutes)}`, {
    x: 44,
    y,
    size: 13,
    font: bold,
    color: orange,
  });
  if (input.splitSpecialHours) {
    page.drawText(`Overdag (weekdagen voor 18u): ${formatDuration(splitTotals.day)}`, {
      x: 44, y: y - 20, size: 10, font: regular, color: dark,
    });
    page.drawText(`Na 18u of in het weekend: ${formatDuration(splitTotals.special)}`, {
      x: 44, y: y - 36, size: 10, font: regular, color: dark,
    });
  }
  return { bytes: await pdf.save(), totalMinutes, month };
}

export async function sendOutlookTimesheet(input: {
  recipient: string;
  employeeName: string;
  month: string;
  filename: string;
  pdfBytes: Uint8Array;
}) {
  const { headers, gateway } = await verifiedTikklokMailbox();
  const employeeName = input.employeeName.replace(/[<>&"']/g, "");
  const response = await fetch(`${gateway}/me/sendMail`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: {
        subject: `Urenstaat ${input.month}`,
        body: {
          contentType: "HTML",
          content: `<p>Beste ${employeeName},</p><p>In bijlage vind je jouw urenstaat voor ${input.month}.</p><p>Met vriendelijke groeten,<br>Riory</p>`,
        },
        toRecipients: [{ emailAddress: { address: input.recipient } }],
        attachments: [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: input.filename,
            contentType: "application/pdf",
            contentBytes: Buffer.from(input.pdfBytes).toString("base64"),
          },
        ],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Outlook sendMail failed", response.status, detail);
    throw new Error(`Outlook verzenden mislukt (${response.status})`);
  }
}
