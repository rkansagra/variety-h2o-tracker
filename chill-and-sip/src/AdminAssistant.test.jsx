import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { MainApp } = await import("./screens/MainApp.jsx");
const { UserContext } = await import("./userContext.js");

const ADMIN = { id: 1, role: "admin", name: "Store Admin", email: "admin@example.com", gallons: 0, authUserId: "a-1" };
const CUSTOMER = { id: 1042, role: "user", name: "Alex Rivera", email: "alex@example.com", gallons: 342, authUserId: "u-1", memberSince: "1/1/2025" };

const originalWindow = { width: window.innerWidth, height: window.innerHeight };
const setWindow = (width, height) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};
beforeEach(() => setWindow(1440, 900));
afterEach(() => setWindow(originalWindow.width, originalWindow.height));

function renderApp({ currentUser = ADMIN, ...overrides } = {}) {
  const context = {
    currentUser,
    users: [ADMIN, CUSTOMER],
    notifications: [],
    isLoading: false,
    logout: vi.fn(),
    adjustGallons: vi.fn(),
    fetchUserHistory: vi.fn(async () => ({ ok: true, transactions: [] })),
    updateWaterType: vi.fn(),
    generateClaimCode: vi.fn(),
    anonymizeCustomer: vi.fn(),
    askAssistant: vi.fn(async () => ({
      ok: true,
      answer: "5,000 gallons are outstanding across 1 customer.",
      toolCalls: [{ name: "balance_summary", args: {}, rowCount: 1 }],
    })),
    register: vi.fn(),
    biometricAvailable: false,
    biometryType: 0,
    biometricLockEnabled: false,
    isBiometricLocked: false,
    enableBiometricLock: vi.fn(),
    disableBiometricLock: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <UserContext.Provider value={context}>
        <MainApp />
      </UserContext.Provider>
    </MemoryRouter>
  );
  return context;
}

const byId = (id) => document.getElementById(id);

async function openAssistant(user) {
  await user.click(byId("vh2o-top-nav-tracker"));
  await user.click(byId("vh2o-admin-assistant-toggle"));
}

describe("Ask the ledger (admin assistant)", () => {
  it("starts collapsed, then answers an example question and lists the lookups it used", async () => {
    const user = userEvent.setup();
    const context = renderApp();
    await user.click(byId("vh2o-top-nav-tracker"));

    expect(byId("vh2o-admin-assistant-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(byId("vh2o-admin-assistant-body")).not.toBeInTheDocument();

    await user.click(byId("vh2o-admin-assistant-toggle"));
    await user.click(byId("vh2o-admin-assistant-example-0"));

    expect(context.askAssistant).toHaveBeenCalledWith("How much prepaid balance is outstanding?", []);
    expect(byId("vh2o-admin-assistant-question-0")).toHaveTextContent("How much prepaid balance is outstanding?");
    expect(byId("vh2o-admin-assistant-answer-0")).toHaveTextContent("5,000 gallons are outstanding across 1 customer.");
    const tools = byId("vh2o-admin-assistant-tools-0");
    expect(within(tools).getByText("Lookups used (1)")).toBeInTheDocument();
    expect(tools).toHaveTextContent("Store totals balance_summary() — 1 row");
    expect(byId("vh2o-admin-assistant-input")).toHaveValue("");
    // Examples are only offered before the first question.
    expect(byId("vh2o-admin-assistant-example-0")).not.toBeInTheDocument();
  });

  it("sends earlier turns with a follow-up, and Enter submits", async () => {
    const user = userEvent.setup();
    const askAssistant = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, answer: "12 visits this week.", toolCalls: [] })
      .mockResolvedValueOnce({
        ok: true,
        answer: "9 visits last week.",
        toolCalls: [{ name: "visits_by_day", args: { start: "2026-10-04", end: "2026-10-10" }, rowCount: 7 }],
      });
    renderApp({ askAssistant });
    await openAssistant(user);

    await user.type(byId("vh2o-admin-assistant-input"), "How many visits this week?{Enter}");
    await user.type(byId("vh2o-admin-assistant-input"), "and last week?");
    await user.click(byId("vh2o-admin-assistant-submit"));

    expect(askAssistant).toHaveBeenLastCalledWith("and last week?", [
      { question: "How many visits this week?", answer: "12 visits this week." },
    ]);
    expect(byId("vh2o-admin-assistant-answer-1")).toHaveTextContent("9 visits last week.");
    expect(byId("vh2o-admin-assistant-tools-1")).toHaveTextContent(
      'visits_by_day(start: "2026-10-04", end: "2026-10-10") — 7 rows',
    );
    // No lookups, no disclosure.
    expect(byId("vh2o-admin-assistant-tools-0")).not.toBeInTheDocument();
  });

  it("shows a lookup that failed", async () => {
    const user = userEvent.setup();
    renderApp({
      askAssistant: vi.fn(async () => ({
        ok: true,
        answer: "I couldn't find customer 5.",
        toolCalls: [{ name: "customer_history", args: { customer_number: 5 }, error: "No customer with that number" }],
      })),
    });
    await openAssistant(user);
    await user.type(byId("vh2o-admin-assistant-input"), "History for customer 5?{Enter}");

    expect(byId("vh2o-admin-assistant-tools-0")).toHaveTextContent("failed: No customer with that number");
  });

  it("shows the error and keeps the question when asking fails", async () => {
    const user = userEvent.setup();
    renderApp({ askAssistant: vi.fn(async () => ({ ok: false, message: "The assistant isn't set up yet (no API key)" })) });
    await openAssistant(user);
    await user.type(byId("vh2o-admin-assistant-input"), "Who came in today?{Enter}");

    expect(byId("vh2o-admin-assistant-error")).toHaveTextContent("The assistant isn't set up yet (no API key)");
    expect(byId("vh2o-admin-assistant-input")).toHaveValue("Who came in today?");
    expect(byId("vh2o-admin-assistant-turns")).not.toBeInTheDocument();
  });

  it("doesn't send a blank question", async () => {
    const user = userEvent.setup();
    const context = renderApp();
    await openAssistant(user);

    expect(byId("vh2o-admin-assistant-submit")).toBeDisabled();
    await user.type(byId("vh2o-admin-assistant-input"), "   {Enter}");
    expect(context.askAssistant).not.toHaveBeenCalled();
  });

  it("keeps the conversation after visiting another tab, and Start over clears it", async () => {
    const user = userEvent.setup();
    renderApp();
    await openAssistant(user);
    await user.type(byId("vh2o-admin-assistant-input"), "How much is outstanding?{Enter}");

    await user.click(byId("vh2o-top-nav-menu"));
    await user.click(byId("vh2o-top-nav-tracker"));

    // Reopens expanded because there's a conversation to show.
    expect(byId("vh2o-admin-assistant-answer-0")).toHaveTextContent("5,000 gallons");
    await user.click(byId("vh2o-admin-assistant-clear"));
    expect(byId("vh2o-admin-assistant-turns")).not.toBeInTheDocument();
    expect(byId("vh2o-admin-assistant-example-0")).toBeInTheDocument();
  });

  it("isn't shown to customers", async () => {
    const user = userEvent.setup();
    renderApp({ currentUser: CUSTOMER });
    await user.click(byId("vh2o-top-nav-tracker"));

    expect(byId("vh2o-admin-assistant")).not.toBeInTheDocument();
  });
});
