import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { ClaimAccount, UnlinkedSessionRedirect, UserContext } = await import("./App.jsx");

// Pure component tests with a fake UserContext (see Login.test.jsx); UserProvider.test.jsx
// covers how unlinkedAuthEmail gets set by a real sign-in.
function renderAt(path, contextOverrides = {}) {
  const context = {
    claimProfile: vi.fn(async () => true),
    logout: vi.fn(async () => {}),
    unlinkedAuthEmail: null,
    ...contextOverrides,
  };

  render(
    <MemoryRouter initialEntries={[path]}>
      <UserContext.Provider value={context}>
        <UnlinkedSessionRedirect />
        <Routes>
          <Route path="/login" element={<div id="login-page" />} />
          <Route path="/" element={<div id="home-page" />} />
          <Route path="/claim" element={<ClaimAccount />} />
        </Routes>
      </UserContext.Provider>
    </MemoryRouter>
  );

  return context;
}

describe("ClaimAccount for a signed-in login with no linked profile (e.g. first Google sign-in)", () => {
  it("shows who is signed in and asks only for the customer ID and claim code", async () => {
    renderAt("/claim", { unlinkedAuthEmail: "new@gmail.com" });

    expect(await screen.findByText("new@gmail.com")).toBeInTheDocument();
    expect(document.getElementById("vh2o-claim-legacy-id-input")).toBeInTheDocument();
    expect(document.getElementById("vh2o-claim-code-input")).toBeInTheDocument();
    expect(document.getElementById("vh2o-claim-email-input")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-claim-password-input")).not.toBeInTheDocument();
  });

  it("claims with just the ID and code", async () => {
    const user = userEvent.setup();
    const context = renderAt("/claim", { unlinkedAuthEmail: "new@gmail.com" });

    await user.type(await screen.findByLabelText("Customer ID"), "42");
    await user.type(screen.getByLabelText("Claim code"), "abcd1234");
    await user.click(document.getElementById("vh2o-claim-submit"));

    expect(context.claimProfile).toHaveBeenCalledWith("42", "abcd1234", "", "", "");
    expect(await screen.findByText(/account linked/i)).toBeInTheDocument();
  });

  it("lets them sign out and use a different account", async () => {
    const user = userEvent.setup();
    const context = renderAt("/claim", { unlinkedAuthEmail: "wrong@gmail.com" });

    await user.click(await screen.findByRole("button", { name: "Use a different account" }));

    expect(context.logout).toHaveBeenCalled();
  });

  it("keeps the full email + password signup form for someone not signed in", async () => {
    renderAt("/claim");

    expect(await screen.findByLabelText("Your email")).toBeInTheDocument();
    expect(document.getElementById("vh2o-claim-signed-in-as")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-claim-switch-account-btn")).not.toBeInTheDocument();
  });
});

describe("UnlinkedSessionRedirect", () => {
  it("sends an unlinked signed-in login from /login (where Google returns) to /claim", async () => {
    renderAt("/login", { unlinkedAuthEmail: "new@gmail.com" });

    expect(await screen.findByLabelText("Claim code")).toBeInTheDocument();
    expect(document.getElementById("login-page")).not.toBeInTheDocument();
  });

  it("leaves everyone else where they are", () => {
    renderAt("/login");
    expect(document.getElementById("login-page")).toBeInTheDocument();
  });
});
