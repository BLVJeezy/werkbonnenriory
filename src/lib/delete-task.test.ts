import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), inIds: vi.fn(), from: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { deleteSelectedWorkOrders } from "./delete-task";
import { QueryClient } from "@tanstack/react-query";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ delete: mocks.remove });
  mocks.remove.mockReturnValue({ in: mocks.inIds });
  mocks.inIds.mockReturnValue({ select: mocks.select });
  mocks.select.mockResolvedValue({ data: [{ id: "selected-1" }, { id: "selected-2" }], error: null });
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
});

describe("selected work order deletion", () => {
  it("deletes only the selected work orders in one request", async () => {
    await deleteSelectedWorkOrders(new QueryClient(), ["selected-1", "selected-2"]);
    expect(mocks.from).toHaveBeenCalledWith("work_orders");
    expect(mocks.inIds).toHaveBeenCalledExactlyOnceWith("id", ["selected-1", "selected-2"]);
    expect(mocks.select).toHaveBeenCalledWith("id");
  });
  it("does not delete when the confirmation is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    expect(await deleteSelectedWorkOrders(new QueryClient(), ["selected-1"])).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not delete with an empty selection", async () => {
    expect(await deleteSelectedWorkOrders(new QueryClient(), [])).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not report success when deletion fails", async () => {
    mocks.select.mockResolvedValue({ data: null, error: { message: "Verwijderen geweigerd" } });
    expect(await deleteSelectedWorkOrders(new QueryClient(), ["selected-1"])).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Verwijderen geweigerd");
  });
});