import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { sharedMock, resetSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", async () => {
  const { sharedMock } = await import("./test/supabaseMock.js");
  return { supabase: sharedMock.client, createEphemeralSupabaseClient: () => sharedMock.client };
});

const { UserProvider } = await import("./UserProvider.jsx");
const { useUser } = await import("./userContext.js");

const { state, auth } = sharedMock;

beforeEach(() => {
  resetSupabaseMock();
});

// Exposes the live context value to the test body via a ref-like callback, since UserProvider
// itself has no external API -- this is the integration-test counterpart to Login.test.jsx's
// fake-context approach, exercising login()/refreshFromSupabase()'s actual logic against a
// mocked Supabase client instead of a hand-fed context value.
function Probe({ onReady }) {
  const ctx = useUser();
  useEffect(() => {
    onReady(ctx);
  });
  return (
    <div>
      <div data-testid="current-user">{ctx.currentUser ? ctx.currentUser.email : "none"}</div>
      <div data-testid="unlinked-auth-email">{ctx.unlinkedAuthEmail ?? ""}</div>
    </div>
  );
}

function renderProvider() {
  let ctx;
  render(
    <UserProvider>
      <Probe onReady={(c) => { ctx = c; }} />
    </UserProvider>
  );
  return {
    getCtx: () => ctx,
  };
}

describe("UserProvider / signed out", () => {
  it("doesn't read customer data without a session", async () => {
    state.setRows("profiles", [], { message: "permission denied" });
    renderProvider();

    await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    await act(async () => {});
    expect(state.calls).toEqual([]);
    expect(screen.getByTestId("current-user")).toHaveTextContent("none");
  });

  it("clears the previous user's data on sign-out", async () => {
    state.user = { id: "auth-1", email: "jane@example.com" };
    state.setRows("profiles", [
      { id: "profile-1", auth_user_id: "auth-1", email: "jane@example.com", role: "user", gallons: 10, name: "Jane", legacy_id: 1 },
    ]);
    state.setRows("gallon_transactions", []);
    const { getCtx } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("jane@example.com"));

    state.calls = [];
    await act(async () => state.emitAuthStateChange("SIGNED_OUT", null));

    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("none"));
    expect(getCtx().users).toEqual([]);
    expect(state.calls).toEqual([]);
  });
});

describe("UserProvider / login()", () => {
  it("signs a user in and loads their profile when a matching profiles row exists", async () => {
    auth.signInWithPasswordResult = { data: { user: { id: "auth-1" } }, error: null };
    state.user = { id: "auth-1", email: "jane@example.com" };
    state.setSingle("profiles", { id: "profile-1" }); // login()'s own linked-profile pre-check
    state.setRows("profiles", [
      { id: "profile-1", auth_user_id: "auth-1", email: "jane@example.com", role: "user", gallons: 10, name: "Jane", legacy_id: 1 },
    ]);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("none"));

    let result;
    await act(async () => {
      result = await getCtx().login("jane@example.com", "hunter2");
    });

    expect(result).toBe(true);
    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("jane@example.com"));
  });

  it("rejects and signs back out when the credentials are valid but no profile is linked", async () => {
    auth.signInWithPasswordResult = { data: { user: { id: "auth-1" } }, error: null };
    state.setSingle("profiles", null); // no linked profiles row for this auth user
    state.setRows("profiles", []);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      result = await getCtx().login("orphan@example.com", "hunter2");
    });

    expect(result).toBe("No VH2O profile is linked to this account yet. Ask admin to complete setup.");
    expect(auth.signOut).toHaveBeenCalled();
    expect(screen.getByTestId("current-user")).toHaveTextContent("none");
  });

  it("surfaces the wrong-password error from Supabase directly, without touching profiles", async () => {
    auth.signInWithPasswordResult = { data: { user: null }, error: { message: "Invalid login credentials" } };

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      result = await getCtx().login("jane@example.com", "wrong");
    });

    expect(result).toBe("Invalid login credentials");
  });
});

describe("UserProvider / claimProfile()", () => {
  it("asks the user to confirm their email instead of claiming signed out when signUp returns no session", async () => {
    auth.signUpResult = { data: { user: { id: "new-auth" }, session: null }, error: null };
    state.setRows("profiles", []);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      result = await getCtx().claimProfile("2", "abcd1234", "New@Example.com", "secret1", "secret1");
    });

    expect(result).toMatch(/confirmation link to new@example\.com/);
    expect(sharedMock.client.rpc).not.toHaveBeenCalledWith("claim_profile", expect.anything());
  });

  it("claims right away when signUp returns a session", async () => {
    auth.signUpResult = { data: { user: { id: "new-auth" }, session: { user: { id: "new-auth" } } }, error: null };
    state.rpcResults.claim_profile = { data: {}, error: null };
    state.setRows("profiles", []);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      result = await getCtx().claimProfile("2", "abcd1234", "new@example.com", "secret1", "secret1");
    });

    expect(result).toBe(true);
    expect(sharedMock.client.rpc).toHaveBeenCalledWith("claim_profile", { p_legacy_id: 2, p_claim_code: "ABCD1234" });
  });
});

// Admin actions go through SECURITY DEFINER RPCs that re-check admin status server-side; these
// pin down exactly which RPC each one calls, with which profile, and what the UI gets back.
describe("UserProvider / admin actions", () => {
  const ADMIN = { id: "p-admin", auth_user_id: "auth-admin", email: "admin@example.com", role: "admin", gallons: 0, name: "Admin", legacy_id: 1 };
  const CUSTOMER = { id: "p-42", auth_user_id: null, email: null, role: "user", gallons: 100, name: "Dana", legacy_id: 42 };

  async function renderAsAdmin() {
    state.user = { id: "auth-admin", email: "admin@example.com" };
    state.session = { user: state.user };
    state.setRows("profiles", [ADMIN, CUSTOMER]);
    state.setRows("gallon_transactions", []);
    const { getCtx } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("admin@example.com"));
    return getCtx;
  }

  it("credits and debits through admin_adjust_gallons with the customer's profile id", async () => {
    state.rpcResults.admin_adjust_gallons = (args) => ({ data: { gallons: 100 + args.delta }, error: null });
    const getCtx = await renderAsAdmin();

    let credit;
    let debit;
    await act(async () => {
      credit = await getCtx().adjustGallons(42, 25, "5 gal jug");
      debit = await getCtx().adjustGallons(42, -10);
    });

    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_adjust_gallons", { target_profile_id: "p-42", delta: 25, note: "5 gal jug" });
    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_adjust_gallons", { target_profile_id: "p-42", delta: -10, note: null });
    expect(credit).toEqual({ ok: true, newBalance: 125 });
    expect(debit).toEqual({ ok: true, newBalance: 90 });
  });

  it("passes the server's refusal through (e.g. a debit below zero)", async () => {
    state.rpcResults.admin_adjust_gallons = { data: null, error: { message: "Insufficient balance: customer has 100 gallons, cannot debit 500" } };
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().adjustGallons(42, -500);
    });

    expect(result).toEqual({ ok: false, message: "Insufficient balance: customer has 100 gallons, cannot debit 500" });
  });

  it("doesn't call the server for a customer it doesn't know", async () => {
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().adjustGallons(999, 5);
    });

    expect(result).toEqual({ ok: false, message: "Customer not found" });
    expect(sharedMock.client.rpc).not.toHaveBeenCalledWith("admin_adjust_gallons", expect.anything());
  });

  it("generates a claim code through admin_generate_claim_code", async () => {
    state.rpcResults.admin_generate_claim_code = { data: "ABCD1234", error: null };
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().generateClaimCode("p-42");
    });

    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_generate_claim_code", { target_profile_id: "p-42" });
    expect(result).toEqual({ ok: true, code: "ABCD1234" });
  });

  it("deletes a customer's personal data through admin_anonymize_customer", async () => {
    state.rpcResults.admin_anonymize_customer = { data: {}, error: null };
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().anonymizeCustomer("p-42");
    });

    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_anonymize_customer", { target_profile_id: "p-42" });
    expect(result).toEqual({ ok: true });
  });

  it("reports a refused anonymize (e.g. an admin account)", async () => {
    state.rpcResults.admin_anonymize_customer = { data: null, error: { message: "Admin accounts cannot be anonymized" } };
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().anonymizeCustomer("p-admin");
    });

    expect(result).toEqual({ ok: false, message: "Admin accounts cannot be anonymized" });
  });

  it("asks the admin-assistant Edge Function and returns its answer and lookups", async () => {
    const toolCalls = [{ name: "balance_summary", args: {}, rowCount: 1 }];
    state.functionResults["admin-assistant"] = { data: { answer: "5,000 gallons are outstanding.", toolCalls }, error: null };
    const getCtx = await renderAsAdmin();

    let result;
    const history = [{ question: "q1", answer: "a1" }];
    await act(async () => {
      result = await getCtx().askAssistant("How much is outstanding?", history);
    });

    expect(sharedMock.client.functions.invoke).toHaveBeenCalledWith("admin-assistant", {
      body: { question: "How much is outstanding?", history },
    });
    expect(result).toEqual({ ok: true, answer: "5,000 gallons are outstanding.", toolCalls });
  });

  it("passes the assistant's own error message through, or a generic one", async () => {
    const getCtx = await renderAsAdmin();
    state.functionResults["admin-assistant"] = {
      data: null,
      error: { context: { json: async () => ({ error: "Only admins can use the assistant" }) } },
    };
    let result;
    await act(async () => {
      result = await getCtx().askAssistant("q");
    });
    expect(result).toEqual({ ok: false, message: "Only admins can use the assistant" });

    state.functionResults["admin-assistant"] = { data: null, error: new Error("Failed to fetch") };
    await act(async () => {
      result = await getCtx().askAssistant("q");
    });
    expect(result).toEqual({ ok: false, message: "The assistant isn't available right now. Try again later." });
  });
});

describe("UserProvider / OAuth session with no linked profile (unlinkedAuthEmail)", () => {
  it("keeps the session and exposes unlinkedAuthEmail, so the user can redeem a claim code", async () => {
    // No profiles row anywhere matches this auth user or its email -- as if someone completed
    // a Google sign-in but no admin-created profile exists for them yet.
    state.setRows("profiles", []);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    await act(async () => {
      state.emitAuthStateChange("SIGNED_IN", { user: { id: "google-auth-1", email: "new-google-user@example.com" } });
      // refreshFromSupabase() reads the current user off supabase.auth.getUser(), not the
      // session argument onAuthStateChange was called with -- keep them in sync like the real
      // client would.
      state.user = { id: "google-auth-1", email: "new-google-user@example.com" };
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("unlinked-auth-email")).toHaveTextContent("new-google-user@example.com"));
    expect(screen.getByTestId("current-user")).toHaveTextContent("none");
    // claim_profile() runs as this signed-in user, so the session must survive.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("clears unlinkedAuthEmail once the login is linked (e.g. after a successful claim)", async () => {
    state.setRows("profiles", []);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    await act(async () => {
      state.user = { id: "google-auth-2", email: "claimer@example.com" };
      state.emitAuthStateChange("SIGNED_IN", { user: state.user });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("unlinked-auth-email")).toHaveTextContent("claimer@example.com"));

    // claim_profile() succeeded server-side: the profile now points at this auth user.
    state.setRows("profiles", [
      { id: "profile-9", auth_user_id: "google-auth-2", email: "claimer@example.com", role: "user", gallons: 5, name: "Claimer", legacy_id: 9 },
    ]);
    await act(async () => {
      state.emitAuthStateChange("TOKEN_REFRESHED", { user: state.user });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("claimer@example.com"));
    expect(screen.getByTestId("unlinked-auth-email")).toHaveTextContent("");
  });
});
