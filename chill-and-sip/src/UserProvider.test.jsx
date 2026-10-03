import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { sharedMock, resetSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", async () => {
  const { sharedMock } = await import("./test/supabaseMock.js");
  return { supabase: sharedMock.client, createEphemeralSupabaseClient: () => sharedMock.client };
});

const { UserProvider, useUser } = await import("./App.jsx");

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
