import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Supabase layer: the session user and the role rows returned by the service client.
const state = { user: null as null | { id: string; email: string }, roles: [] as string[] };

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user ? { ...state.user, user_metadata: {} } : null }, error: null }),
    },
  }),
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: state.roles.map((role) => ({ role })), error: null }) }),
    }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-tests-only-0000";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-for-tests-only";

const { getStaffContext, assertStaff, AuthorizationError } = await import("@/lib/auth");
const { adminAction } = await import("@/server/admin/guard");

describe("dashboard authorization (server-side)", () => {
  beforeEach(() => {
    state.user = null;
    state.roles = [];
  });

  it("denies anonymous visitors", async () => {
    expect(await getStaffContext()).toBeNull();
    await expect(assertStaff()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("denies signed-in customers without a role", async () => {
    state.user = { id: "u1", email: "c@example.com" };
    expect(await getStaffContext()).toBeNull();
  });

  it("allows staff for staff areas but not admin-only areas", async () => {
    state.user = { id: "u2", email: "s@example.com" };
    state.roles = ["staff"];
    expect(await getStaffContext("staff")).toMatchObject({ isAdmin: false });
    expect(await getStaffContext("admin")).toBeNull();
  });

  it("allows administrators everywhere", async () => {
    state.user = { id: "u3", email: "a@example.com" };
    state.roles = ["admin"];
    expect(await getStaffContext("admin")).toMatchObject({ isAdmin: true });
  });

  it("never runs a mutation for unauthorised callers", async () => {
    state.user = { id: "u1", email: "c@example.com" };
    const run = vi.fn(async () => ({ ok: true as const }));
    expect(await adminAction("staff", run)).toEqual({ ok: false, error: "forbidden" });
    state.roles = ["staff"];
    expect(await adminAction("admin", run)).toEqual({ ok: false, error: "forbidden" });
    expect(run).not.toHaveBeenCalled();
  });

  it("maps database errors to safe codes without leaking details", async () => {
    state.user = { id: "u3", email: "a@example.com" };
    state.roles = ["admin"];
    const result = await adminAction("admin", async () => {
      throw new Error('relation "secret_table" does not exist SL_INVALID_TRANSITION');
    });
    expect(result).toEqual({ ok: false, error: "SL_INVALID_TRANSITION" });
    const generic = await adminAction("admin", async () => {
      throw new Error("connection refused at 10.0.0.5:5432");
    });
    expect(generic).toEqual({ ok: false, error: "error" });
  });
});
