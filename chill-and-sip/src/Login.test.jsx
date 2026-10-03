import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { Login, ForgotPassword, UserContext } = await import("./App.jsx");

// This is a pure component test: it supplies its own fake UserContext value instead of the
// real UserProvider, so it exercises Login's own rendering/interaction logic (what it does
// with what login()/loginWithGoogle() return) without also depending on UserProvider's
// Supabase bootstrapping. See UserProvider.test.jsx for that integration-level coverage,
// in particular of the login() contract this component relies on.
function renderLogin(contextOverrides = {}, initialEntry = "/login") {
  const context = {
    login: vi.fn(async () => true),
    loginWithGoogle: vi.fn(async () => true),
    isPasswordRecovery: false,
    requestPasswordReset: vi.fn(async () => true),
    completePasswordReset: vi.fn(async () => true),
    ...contextOverrides,
  };

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <UserContext.Provider value={context}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Routes>
      </UserContext.Provider>
    </MemoryRouter>
  );

  return context;
}

describe("Login", () => {
  it("links to the privacy policy (a Google Play requirement) in a new tab", () => {
    renderLogin();

    const link = document.getElementById("vh2o-login-privacy-link");
    expect(link).toHaveAttribute("href", "https://varietyh2o.com/privacy/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("submits the entered email/password to login()", async () => {
    const user = userEvent.setup();
    const context = renderLogin();

    await user.type(document.getElementById("vh2o-login-username-input"), "jane@example.com");
    await user.type(document.getElementById("vh2o-login-password-input"), "hunter2");
    await user.click(document.getElementById("vh2o-login-submit"));

    expect(context.login).toHaveBeenCalledWith("jane@example.com", "hunter2");
  });

  it("shows the message login() returns instead of navigating away", async () => {
    const user = userEvent.setup();
    renderLogin({ login: vi.fn(async () => "No VH2O profile is linked to this account yet.") });

    await user.type(document.getElementById("vh2o-login-username-input"), "jane@example.com");
    await user.type(document.getElementById("vh2o-login-password-input"), "hunter2");
    await user.click(document.getElementById("vh2o-login-submit"));

    expect(await screen.findByText("No VH2O profile is linked to this account yet.")).toBeInTheDocument();
  });

  it("kicks off Google sign-in when its button is clicked", async () => {
    const user = userEvent.setup();
    const context = renderLogin();

    await user.click(document.getElementById("vh2o-login-google-btn"));

    expect(context.loginWithGoogle).toHaveBeenCalled();
  });

  it("shows an error instead of a crash if loginWithGoogle() fails to start", async () => {
    const user = userEvent.setup();
    renderLogin({ loginWithGoogle: vi.fn(async () => "Unable to start Google sign-in") });

    await user.click(document.getElementById("vh2o-login-google-btn"));

    expect(await screen.findByText("Unable to start Google sign-in")).toBeInTheDocument();
  });

  it("hides password-reset fields behind a Forgot password? link", () => {
    renderLogin();

    expect(document.getElementById("vh2o-login-forgot-link")).toHaveAttribute("href", "/forgot-password");
    expect(document.getElementById("vh2o-forgot-email-input")).not.toBeInTheDocument();
  });

  it("carries the typed email over to the forgot-password page and sends the reset from there", async () => {
    const user = userEvent.setup();
    const context = renderLogin();

    await user.type(document.getElementById("vh2o-login-username-input"), "jane@example.com");
    await user.click(document.getElementById("vh2o-login-forgot-link"));

    expect(document.getElementById("vh2o-forgot-email-input")).toHaveValue("jane@example.com");
    await user.click(document.getElementById("vh2o-forgot-submit"));

    expect(context.requestPasswordReset).toHaveBeenCalledWith("jane@example.com");
    expect(await screen.findByText(/check your email for a password reset link/i)).toBeInTheDocument();
  });

  it("shows the message requestPasswordReset() returns on the forgot-password page", async () => {
    const user = userEvent.setup();
    renderLogin({ requestPasswordReset: vi.fn(async () => "Enter a valid email") }, "/forgot-password");

    await user.type(document.getElementById("vh2o-forgot-email-input"), "jane@example.com");
    await user.click(document.getElementById("vh2o-forgot-submit"));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
  });

  it("links back to login from the forgot-password page", async () => {
    const user = userEvent.setup();
    renderLogin({}, "/forgot-password");

    await user.click(document.getElementById("vh2o-forgot-back-link"));

    expect(document.getElementById("vh2o-login-submit")).toBeInTheDocument();
  });

  it("only renders the new-password recovery fields when isPasswordRecovery is true", () => {
    renderLogin({ isPasswordRecovery: false });
    expect(document.getElementById("vh2o-login-recovery-submit")).not.toBeInTheDocument();

    renderLogin({ isPasswordRecovery: true });
    expect(document.getElementById("vh2o-login-recovery-submit")).toBeInTheDocument();
  });

  it("hides Continue with Google in the native app, where Google blocks embedded-webview OAuth", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    try {
      renderLogin();
      expect(document.getElementById("vh2o-login-google-btn")).not.toBeInTheDocument();
      expect(document.getElementById("vh2o-login-submit")).toBeInTheDocument();
    } finally {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    }
  });

  it("gives every field an accessible name, not just placeholder text", () => {
    renderLogin({ isPasswordRecovery: true });

    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "vh2o-login-username-input");
    expect(screen.getByLabelText("Password")).toHaveAttribute("id", "vh2o-login-password-input");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  });

  it("shows a visible label for each field, not just placeholder text", () => {
    renderLogin();

    const label = document.querySelector('label[for="vh2o-login-username-input"]');
    expect(label).toHaveTextContent("Email");
    expect(document.getElementById("vh2o-login-username-input")).not.toHaveAttribute("placeholder");
  });

  it("gives the forgot-password email field an accessible name", () => {
    renderLogin({}, "/forgot-password");
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "vh2o-forgot-email-input");
  });
});
