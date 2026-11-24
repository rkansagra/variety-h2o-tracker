import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { sharedMock, resetSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", async () => {
  const { sharedMock } = await import("./test/supabaseMock.js");
  return { supabase: sharedMock.client };
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
    expect(getCtx().notifications).toEqual([]);
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

describe("UserProvider / emailed-code sign-in", () => {
  it("sends a code to the normalized email, creating the login on a first sign-in", async () => {
    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      result = await getCtx().sendSignInCode("  Jane@Example.com ");
    });

    expect(result).toBe(true);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "jane@example.com",
      options: { shouldCreateUser: true },
    });
  });

  it("refuses an obviously invalid email without calling Supabase", async () => {
    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      result = await getCtx().sendSignInCode("jane");
    });

    expect(result).toBe("Enter a valid email");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("checks a 6-digit code as an email OTP and passes Supabase's error through", async () => {
    auth.verifyOtpResult = { data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } };
    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let malformed;
    let wrong;
    await act(async () => {
      malformed = await getCtx().verifySignInCode("jane@example.com", "12ab");
      wrong = await getCtx().verifySignInCode("Jane@Example.com", "123 456");
    });

    expect(malformed).toBe("Enter the 6-digit code from the email");
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "jane@example.com", token: "123456", type: "email" });
    expect(wrong).toBe("Token has expired or is invalid");
  });

  it("links a first sign-in to the record staff saved the email on, through link_my_profile", async () => {
    const unlinked = { id: "profile-5", auth_user_id: null, email: "jane@example.com", role: "user", gallons: 30, name: "Jane", legacy_id: 5 };
    let linked = false;
    state.responses.profiles = () => ({ data: [linked ? { ...unlinked, auth_user_id: "code-auth-1" } : unlinked], error: null });
    state.setRows("gallon_transactions", []);
    state.rpcResults.link_my_profile = () => {
      linked = true;
      return { data: { ...unlinked, auth_user_id: "code-auth-1" }, error: null };
    };
    auth.verifyOtpResult = { data: { user: { id: "code-auth-1" }, session: {} }, error: null };

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let result;
    await act(async () => {
      state.user = { id: "code-auth-1", email: "jane@example.com" };
      result = await getCtx().verifySignInCode("jane@example.com", "123456");
    });

    expect(result).toBe(true);
    expect(sharedMock.client.rpc).toHaveBeenCalledWith("link_my_profile");
    await waitFor(() => expect(screen.getByTestId("current-user")).toHaveTextContent("jane@example.com"));
    expect(screen.getByTestId("unlinked-auth-email")).toHaveTextContent("");
    // The browser never writes the link itself.
    expect(state.calls.some((call) => call.chain.includes("update"))).toBe(false);
  });

  it("re-checks after staff add the email (recheckAccount)", async () => {
    state.setRows("profiles", []);
    state.setRows("gallon_transactions", []);
    state.rpcResults.link_my_profile = { data: null, error: null };
    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    let before;
    await act(async () => {
      before = await getCtx().recheckAccount();
    });
    expect(before).toBe(false);

    state.rpcResults.link_my_profile = { data: { id: "profile-6" }, error: null };
    let after;
    await act(async () => {
      after = await getCtx().recheckAccount();
    });
    expect(after).toBe(true);
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
      credit = await getCtx().adjustGallons("p-42", 25, "5 gal jug");
      debit = await getCtx().adjustGallons("p-42", -10);
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
      result = await getCtx().adjustGallons("p-42", -500);
    });

    expect(result).toEqual({ ok: false, message: "Insufficient balance: customer has 100 gallons, cannot debit 500" });
  });

  it("searches customers on the server and maps the rows the panel shows", async () => {
    state.rpcResults.admin_search_customers = (args) => ({
      data: [{
        id: "p-42", legacy_id: 42, name: "Dana", email: null, gallons: 100, water_type: "alkaline",
        has_login: false, member_since: null, last_transaction_at: null, anonymized_at: null, total_matches: 7,
      }],
      error: null,
      args,
    });
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().searchCustomers({ query: "dan", filter: "nologin", sort: "gallons" });
    });

    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_search_customers", { p_query: "dan", p_filter: "nologin", p_sort: "gallons" });
    expect(result).toEqual({
      ok: true,
      totalMatches: 7,
      customers: [{
        id: 42, profileId: "p-42", name: "Dana", email: null, gallons: 100, waterType: "alkaline",
        hasLogin: false, memberSince: "N/A", lastTransactionAt: null, anonymizedAt: null,
      }],
    });
  });

  it("gets one customer and the totals, and passes refusals through", async () => {
    state.rpcResults.admin_get_customer = { data: [{ id: "p-42", legacy_id: 42, name: "Dana", gallons: 100, has_login: true }], error: null };
    state.rpcResults.admin_customer_summary = { data: [{ total_customers: 400, active_customers: 25 }], error: null };
    state.rpcResults.admin_search_customers = { data: null, error: { message: "Only admins can search customers" } };
    const getCtx = await renderAsAdmin();

    let one;
    let totals;
    let refused;
    await act(async () => {
      one = await getCtx().getCustomer(42);
      totals = await getCtx().fetchCustomerSummary();
      refused = await getCtx().searchCustomers({ query: "dan" });
    });

    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_get_customer", { p_legacy_id: 42 });
    expect(one.customer).toMatchObject({ id: 42, profileId: "p-42", hasLogin: true });
    expect(totals).toEqual({ ok: true, total: 400, active: 25 });
    expect(refused).toEqual({ ok: false, message: "Only admins can search customers" });
  });

  // No browser holds the whole customer list any more, the admin's included.
  it("loads only the signed-in user's own record and their 5 latest transactions", async () => {
    await renderAsAdmin();

    const profileRead = state.calls.find((c) => c.table === "profiles");
    const historyRead = state.calls.find((c) => c.table === "gallon_transactions");
    expect(profileRead.steps).toContainEqual(["eq", "auth_user_id", "auth-admin"]);
    expect(historyRead.steps).toContainEqual(["eq", "user_profile_id", "p-admin"]);
    expect(historyRead.steps).toContainEqual(["limit", 5]);
  });

  it("adds a customer through admin_add_customer and returns the new customer number", async () => {
    state.rpcResults.admin_add_customer = { data: { id: "p-43", legacy_id: 43 }, error: null };
    const getCtx = await renderAsAdmin();

    let result;
    await act(async () => {
      result = await getCtx().addCustomer("Eli", "eli@example.com");
    });

    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_add_customer", { p_name: "Eli", p_email: "eli@example.com" });
    expect(result).toEqual({ ok: true, customerId: 43 });
  });

  it("saves a sign-in email through admin_set_customer_email, and passes refusals through", async () => {
    state.rpcResults.admin_set_customer_email = { data: {}, error: null };
    const getCtx = await renderAsAdmin();

    let saved;
    await act(async () => {
      saved = await getCtx().setCustomerEmail("p-42", "dana@example.com");
    });
    expect(sharedMock.client.rpc).toHaveBeenCalledWith("admin_set_customer_email", { target_profile_id: "p-42", p_email: "dana@example.com" });
    expect(saved).toEqual({ ok: true });

    state.rpcResults.admin_set_customer_email = { data: null, error: { message: "Another customer already has this email" } };
    let refused;
    await act(async () => {
      refused = await getCtx().setCustomerEmail("p-42", "taken@example.com");
    });
    expect(refused).toEqual({ ok: false, message: "Another customer already has this email" });
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
  it("keeps the session and exposes unlinkedAuthEmail, so Check again works once staff add the email", async () => {
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
    // link_my_profile() runs as this signed-in user, so the session must survive.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("never links a login to a profile in the browser, even when the emails match", async () => {
    // Linking happens only in the database (link_my_profile(), which also checks the email is
    // confirmed and the login has no password); here it finds nothing to link.
    state.setRows("profiles", [
      { id: "profile-7", auth_user_id: null, email: "same@example.com", role: "user", gallons: 50, name: "Sam", legacy_id: 7 },
    ]);
    state.setRows("gallon_transactions", []);

    const { getCtx } = renderProvider();
    await waitFor(() => getCtx());

    await act(async () => {
      state.emitAuthStateChange("SIGNED_IN", { user: { id: "google-auth-3", email: "same@example.com" } });
      state.user = { id: "google-auth-3", email: "same@example.com" };
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("unlinked-auth-email")).toHaveTextContent("same@example.com"));
    expect(screen.getByTestId("current-user")).toHaveTextContent("none");
    expect(state.calls.some((call) => call.chain.includes("update"))).toBe(false);
  });

  it("clears unlinkedAuthEmail once the login is linked (e.g. after staff add the email)", async () => {
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

    // Linked server-side: the profile now points at this auth user.
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
