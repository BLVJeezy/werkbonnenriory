import { describe, expect, it, vi } from "vitest";
import { deliverInvoice, invoiceMailWithCc } from "./invoice-delivery";

const mk = () => ({ sendWithCc: vi.fn().mockResolvedValue(undefined), sendUbl: vi.fn().mockResolvedValue(undefined), record: vi.fn().mockResolvedValue(undefined) });

describe("invoice delivery", () => {
  it("sends every invoice, also for private customers, in one mail with OkiOki hidden in BCC", async () => {
    const f = mk();
    await deliverInvoice({ customer: { email: "klant@example.be", vatNumber: null }, pdfSent: false, okiokiSent: false, ...f });
    expect(f.sendWithCc).toHaveBeenCalledWith("klant@example.be");
    expect(f.sendUbl).not.toHaveBeenCalled();
    expect(f.record.mock.calls).toEqual([["pdf"], ["okioki"]]);
  });
  it("retries only OkiOki after an older PDF-only send", async () => {
    const f = mk();
    await deliverInvoice({ customer: { email: "klant@example.be", vatNumber: null }, pdfSent: true, okiokiSent: false, ...f });
    expect(f.sendWithCc).not.toHaveBeenCalled();
    expect(f.sendUbl).toHaveBeenCalledWith("BE0840931404701144@okioki.app");
  });
  it("does not record a failed mail", async () => {
    const f = { ...mk(), sendWithCc: vi.fn().mockRejectedValue(new Error("Mail geweigerd")) };
    await expect(deliverInvoice({ customer: { email: "k@x.be", vatNumber: null }, pdfSent: false, okiokiSent: false, ...f })).rejects.toThrow("Mail geweigerd");
    expect(f.record).not.toHaveBeenCalled();
  });
  it("puts OkiOki hidden in BCC with PDF and UBL attached", () => {
    const m = invoiceMailWithCc("klant@example.be", "2026-1", "JVBERg==", "PHhtbD4=");
    expect(m.message.toRecipients).toEqual([{ emailAddress: { address: "klant@example.be" } }]);
    expect(m.message.bccRecipients).toEqual([{ emailAddress: { address: "BE0840931404701144@okioki.app" } }]);
    expect(Object.keys(m.message)).not.toContain("ccRecipients");
    expect(m.message.attachments.map((a) => a.name)).toEqual(["Factuur-2026-1.pdf", "Factuur-2026-1.xml"]);
  });
});
