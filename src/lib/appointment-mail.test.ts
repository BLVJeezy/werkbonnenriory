import { expect, it, vi } from "vitest";
import { moveAppointmentMessage } from "./appointment-mail";

it("moves the original message to Uitgevoerd after remembering its stable ID", async () => {
  const calls: string[] = [];
  const graph = vi.fn(async (path: string) => {
    calls.push(path);
    return Response.json(path.includes("mailFolders") ? { value: [{ id: "done" }] } : path.endsWith("/move") ? { id: "stable" } : { id: "stable", parentFolderId: "inbox" });
  });
  await moveAppointmentMessage(graph, "original", null, async (id) => { calls.push(`remember:${id}`); });
  expect(calls).toEqual(["/me/mailFolders?$filter=displayName eq 'Uitgevoerd'&$select=id,displayName", "/me/messages/original?$select=id,parentFolderId", "remember:stable", "/me/messages/stable/move"]);
  expect(JSON.parse(graph.mock.calls[2]?.[1]?.body as string)).toEqual({ destinationId: "done" });
});

it("does not move an already processed mail again", async () => {
  const graph = vi.fn(async (path: string) => Response.json(path.includes("mailFolders") ? { value: [{ id: "done" }] } : { id: "stable", parentFolderId: "done" }));
  await moveAppointmentMessage(graph, "old", "stable", async () => {});
  expect(graph).toHaveBeenCalledTimes(2);
});

it("never moves a mail when the original cannot be read", async () => {
  const graph = vi.fn(async (path: string) => path.includes("mailFolders") ? Response.json({ value: [{ id: "done" }] }) : new Response(null, { status: 404 }));
  await expect(moveAppointmentMessage(graph, "missing", null, async () => {})).rejects.toThrow();
  expect(graph.mock.calls.some(([path]) => path.endsWith("/move"))).toBe(false);
});