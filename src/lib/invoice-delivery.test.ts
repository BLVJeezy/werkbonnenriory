import { describe, expect, it, vi } from "vitest";
import { deliverInvoice, invoiceMail, needsOkioki } from "./invoice-delivery";

describe("invoice delivery", () => {
  it("emails every business its PDF and separately sends UBL to the requested OkiOki address", async () => {
    const sendPdf = vi.fn().mockResolvedValue(undefined), sendUbl = vi.fn().mockResolvedValue(undefined), record = vi.fn().mockResolvedValue(undefined);
    await deliverInvoice({ customer: { email: "facturen@bedrijf.be", vatNumber: "BE0840931404" }, pdfSent: false, okiokiSent: false, sendPdf, sendUbl, record });
    expect(sendPdf).toHaveBeenCalledWith("facturen@bedrijf.be");
    expect(sendUbl).toHaveBeenCalledWith("BE0840931404701144@okioki.app");
    expect(record.mock.calls).toEqual([["pdf"], ["okioki"]]);
  });
  it("emails private customers only a PDF", async () => {
    const sendPdf = vi.fn().mockResolvedValue(undefined), sendUbl = vi.fn(), record = vi.fn().mockResolvedValue(undefined);
    await deliverInvoice({ customer: { email: "klant@example.be", vatNumber: null }, pdfSent: false, okiokiSent: false, sendPdf, sendUbl, record });
    expect(sendPdf).toHaveBeenCalledOnce();
    expect(sendUbl).not.toHaveBeenCalled();
    expect(needsOkioki({ vatNumber: " " })).toBe(false);
    expect(needsOkioki({ vatNumber: "NL123456789" })).toBe(true);
  });
  it("retries only OkiOki after the customer PDF was already sent", async () => {
    const sendPdf = vi.fn(), sendUbl = vi.fn().mockResolvedValue(undefined), record = vi.fn().mockResolvedValue(undefined);
    await deliverInvoice({ customer: { email: "klant@example.be", vatNumber: "BE0840931404" }, pdfSent: true, okiokiSent: false, sendPdf, sendUbl, record });
    expect(sendPdf).not.toHaveBeenCalled();
    expect(sendUbl).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith("okioki");
  });
  it("does not record a failed UBL mail as sent", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await expect(deliverInvoice({ customer: { email: "klant@example.be", vatNumber: "BE0840931404" }, pdfSent: false, okiokiSent: false, sendPdf: vi.fn().mockResolvedValue(undefined), sendUbl: vi.fn().mockRejectedValue(new Error("Mail geweigerd")), record })).rejects.toThrow("Mail geweigerd");
    expect(record.mock.calls).toEqual([["pdf"]]);
  });
  it("attaches XML only to OkiOki, PDF only to the customer", () => {
    const pdf = invoiceMail("klant@example.be", "2026-1", "JVBERg==", "pdf");
    const ubl = invoiceMail("BE0840931404701144@okioki.app", "2026-1", "PHhtbD4=", "ubl");
    expect(pdf.message.attachments[0]).toMatchObject({ name: "Factuur-2026-1.pdf", contentType: "application/pdf", contentBytes: "JVBERg==" });
    expect(ubl.message.attachments[0]).toMatchObject({ name: "Factuur-2026-1.xml", contentType: "application/xml", contentBytes: "PHhtbD4=" });
    expect(ubl.message.toRecipients).toEqual([{ emailAddress: { address: "BE0840931404701144@okioki.app" } }]);
  });
});