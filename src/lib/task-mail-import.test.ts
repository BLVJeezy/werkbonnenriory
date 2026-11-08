import { expect, it, vi } from "vitest";
import { importTaskMailbox } from "./task-mail-import.server";

vi.mock("@/lib/appUserConnections.server", () => ({ getConnectionKeyForUser: vi.fn().mockResolvedValue("test-connection") }));
vi.mock("@/integrations/lovable/appUserConnector", () => ({
  appUserReconnectRequired: vi.fn().mockResolvedValue(false),
  callAsAppUser: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: [{ id: "stable-mail", receivedDateTime: "2026-11-08T07:00:00Z", from: { emailAddress: { address: "customer@example.test" } } }] }) }),
}));

it("imports a daily arrival as unplanned with the mailbox owner and no crew or activity", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "test-only");
  const extracted = { customer_name: "Test VME", street: "Teststraat", house_number: "1", postal_code: "3740", city: "Bilzen", email: "customer@example.test", description: "Interventie", customer_type: "unknown" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(extracted) })}\n\n`)));
  const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { customer_id: null }, error: null }) }) });
  const db = { from: () => ({ select: () => ({ in: async () => ({ data: [] }) }), insert }) };
  const result = await importTaskMailbox(db as unknown as Parameters<typeof importTaskMailbox>[0], "admin-owner");
  expect(result.imported).toBe(1);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: null, technician_id: null, activity_id: null, status: "nieuw", source_mailbox_user_id: "admin-owner", source_message_id: "stable-mail" }));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});