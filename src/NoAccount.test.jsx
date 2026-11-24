import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client };
});

const { NoAccount } = await import("./screens/NoAccount.jsx");
const { UnlinkedSessionRedirect } = await import("./screens/UnlinkedSessionRedirect.jsx");
const { UserContext } = await import("./userContext.js");

// Pure component tests with a fake UserContext (see Login.test.jsx); UserProvider.test.jsx
// covers how unlinkedAuthEmail gets set by a real sign-in. Like the real provider, logout()
// clears unlinkedAuthEmail -- otherwise UnlinkedSessionRedirect would send /login straight back.
function renderAt(path, contextOverrides = {}) {
  const context = {
    recheckAccount: vi.fn(async () => false),
    logout: vi.fn(async () => {}),
    unlinkedAuthEmail: null,
    isLoading: false,
    ...contextOverrides,
  };

  function FakeProvider({ children }) {
    const [unlinkedAuthEmail, setUnlinkedAuthEmail] = useState(context.unlinkedAuthEmail);
    const logout = async () => {
      await context.logout();
      setUnlinkedAuthEmail(null);
    };
    return (
      <UserContext.Provider value={{ ...context, unlinkedAuthEmail, logout }}>
        {children}
      </UserContext.Provider>
    );
  }

  render(
    <MemoryRouter initialEntries={[path]}>
      <FakeProvider>
        <UnlinkedSessionRedirect />
        <Routes>
          <Route path="/login" element={<div id="login-page" />} />
          <Route path="/" element={<div id="home-page" />} />
          <Route path="/no-account" element={<NoAccount />} />
        </Routes>
      </FakeProvider>
    </MemoryRouter>
  );

  return context;
}

describe("NoAccount: signed in, but no customer record has this email", () => {
  it("is where a signed-in login with no record lands, from any page", async () => {
    renderAt("/login", { unlinkedAuthEmail: "new@gmail.com" });

    expect(await screen.findByText("new@gmail.com")).toBeInTheDocument();
    expect(document.getElementById("vh2o-no-account-message")).toHaveTextContent(/ask us to add this email/i);
  });

  it("shows the store's address, hours, and phone", () => {
    renderAt("/no-account", { unlinkedAuthEmail: "new@gmail.com" });

    const store = document.getElementById("vh2o-no-account-store");
    expect(store).toHaveTextContent("Tucson, AZ 85730");
    expect(store).toHaveTextContent("Mon – Sat: 10am – 7pm");
    expect(store.querySelector('a[href="tel:+15208121532"]')).toBeInTheDocument();
  });

  it("goes on to the app when Check again finds the record staff added", async () => {
    const user = userEvent.setup();
    const context = renderAt("/no-account", { unlinkedAuthEmail: "new@gmail.com", recheckAccount: vi.fn(async () => true) });

    await user.click(document.getElementById("vh2o-no-account-check-again-btn"));

    expect(context.recheckAccount).toHaveBeenCalled();
    await waitFor(() => expect(document.getElementById("home-page")).toBeInTheDocument());
  });

  it("says so when Check again still finds nothing", async () => {
    const user = userEvent.setup();
    renderAt("/no-account", { unlinkedAuthEmail: "new@gmail.com" });

    await user.click(document.getElementById("vh2o-no-account-check-again-btn"));

    expect(document.getElementById("vh2o-no-account-still-missing")).toBeInTheDocument();
  });

  it("signs out and returns to sign-in for a different email", async () => {
    const user = userEvent.setup();
    const context = renderAt("/no-account", { unlinkedAuthEmail: "new@gmail.com" });

    await user.click(document.getElementById("vh2o-no-account-different-email-btn"));

    expect(context.logout).toHaveBeenCalled();
    await waitFor(() => expect(document.getElementById("login-page")).toBeInTheDocument());
    // And it stays there: no bounce back to /no-account.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.getElementById("login-page")).toBeInTheDocument();
  });

  it("sends anyone without an unlinked login back to the app", () => {
    renderAt("/no-account");

    expect(document.getElementById("home-page")).toBeInTheDocument();
  });
});
