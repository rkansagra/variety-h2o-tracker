import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";
import { fakeAdminServer } from "./test/fakeAdminServer.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client };
});

const { MainApp } = await import("./screens/MainApp.jsx");
const { UserContext } = await import("./userContext.js");
const { MenuContext } = await import("./menuContext.js");
const { MENU_CONTEXT_FIXTURE } = await import("./test/menuFixture.js");

// Each section of the app has its own URL (ROADMAP item D). These render MainApp at a given URL
// with a fake UserContext and check where it lands.
const original = { width: window.innerWidth, height: window.innerHeight };
const setWindow = (width, height) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};
afterEach(() => setWindow(original.width, original.height));

const CUSTOMER = { id: 1042, role: "user", name: "Alex Rivera", email: "alex@example.com", gallons: 342, authUserId: "u1", memberSince: "March 2024" };
const ADMIN = { id: 1, role: "admin", name: "Store Owner", email: "owner@example.com", gallons: 0, authUserId: "a1" };
const ADMIN_CUSTOMERS = [
  { id: 1042, profileId: "p-1042", name: "Alex Rivera", email: "alex@example.com", gallons: 342, hasLogin: true, waterType: null, memberSince: null, lastTransactionAt: null, anonymizedAt: null },
];

let currentPath = "";
function PathProbe() {
  currentPath = useLocation().pathname;
  return null;
}

function renderAt(path, { currentUser = null, isLoading = false, ...overrides } = {}) {
  const context = {
    currentUser, isLoading, notifications: [], historyUnavailable: false,
    logout: vi.fn(), adjustGallons: vi.fn(), fetchUserHistory: vi.fn(async () => ({ ok: true, transactions: [] })),
    updateWaterType: vi.fn(), setCustomerEmail: vi.fn(), anonymizeCustomer: vi.fn(), addCustomer: vi.fn(),
    askAssistant: vi.fn(), biometricAvailable: false, biometryType: 0, biometricLockEnabled: false,
    isBiometricLocked: false, enableBiometricLock: vi.fn(), disableBiometricLock: vi.fn(),
    ...fakeAdminServer(ADMIN_CUSTOMERS),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={[path]}>
      <UserContext.Provider value={context}><MenuContext.Provider value={MENU_CONTEXT_FIXTURE}>
        <PathProbe />
        <MainApp />
      </MenuContext.Provider></UserContext.Provider>
    </MemoryRouter>
  );
  return context;
}

describe("Routes: where / sends each kind of visitor", () => {
  it("sends signed-out visitors to the menu", async () => {
    setWindow(390, 844);
    renderAt("/");
    await waitFor(() => expect(currentPath).toBe("/menu"));
    expect(document.getElementById("vh2o-menu-categories-grid")).toBeInTheDocument();
  });

  // Opening the site goes to the menu, but tapping Home later must not silently bounce there.
  it("shows a sign-in prompt when a signed-out visitor taps Home", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderAt("/");
    await waitFor(() => expect(currentPath).toBe("/menu"));

    await user.click(document.getElementById("vh2o-bottom-nav-tracker"));

    expect(currentPath).toBe("/");
    expect(document.getElementById("vh2o-bottom-nav-tracker")).toHaveAttribute("aria-current", "page");
    expect(document.getElementById("vh2o-tracker-signed-out")).toHaveTextContent("Sign in to see your prepaid balance");
    await user.click(document.getElementById("vh2o-tracker-browse-menu-btn"));
    expect(currentPath).toBe("/menu");
  });

  it("waits for the session to load instead of sending a signed-in customer to the menu", () => {
    renderAt("/", { isLoading: true });
    expect(currentPath).toBe("/");
  });

  it("shows a signed-in customer their Home", () => {
    renderAt("/", { currentUser: CUSTOMER });
    expect(currentPath).toBe("/");
    expect(document.getElementById("vh2o-tracker-points-pill")).toBeInTheDocument();
  });

  it("sends the admin to Customers, and labels the first tab that way", async () => {
    setWindow(1440, 900);
    renderAt("/", { currentUser: ADMIN });
    await waitFor(() => expect(currentPath).toBe("/admin"));
    expect(document.getElementById("vh2o-admin-manage-users")).toBeInTheDocument();
    expect(document.getElementById("vh2o-top-nav-tracker")).toHaveTextContent("Customers");
    expect(document.getElementById("vh2o-top-nav-tracker")).toHaveAttribute("aria-current", "page");
  });

  it("keeps customers and signed-out visitors out of /admin", async () => {
    renderAt("/admin/customers/1042", { currentUser: CUSTOMER });
    await waitFor(() => expect(currentPath).toBe("/"));
    expect(document.getElementById("vh2o-admin-manage-users")).toBeNull();
  });

  it("sends an unknown address Home", async () => {
    renderAt("/no-such-page", { currentUser: CUSTOMER });
    await waitFor(() => expect(currentPath).toBe("/"));
  });
});

describe("Routes: deep links and the back button", () => {
  it("opens a menu category straight from its link", () => {
    setWindow(390, 844);
    renderAt("/menu/ice-cream");
    expect(document.getElementById("vh2o-menu-back-btn")).toBeInTheDocument();
    expect(document.getElementById("vh2o-menu-items")).toHaveTextContent("Butter Pecan");
  });

  it("falls back to the menu for an unknown category", async () => {
    setWindow(390, 844);
    renderAt("/menu/not-a-category");
    await waitFor(() => expect(currentPath).toBe("/menu"));
    expect(document.getElementById("vh2o-menu-categories-grid")).toBeInTheDocument();
  });

  it("puts the chosen menu category in the URL, and Back to Menu returns to the grid", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderAt("/menu");
    await user.click(document.getElementById("vh2o-menu-category-card-water"));
    expect(currentPath).toBe("/menu/water");
    await user.click(document.getElementById("vh2o-menu-back-btn"));
    expect(currentPath).toBe("/menu");
  });

  it("opens a customer straight from /admin/customers/:id", async () => {
    setWindow(1440, 900);
    const context = renderAt("/admin/customers/1042", { currentUser: ADMIN });
    await waitFor(() => expect(document.getElementById("vh2o-admin-user-card-1042")).toBeInTheDocument());
    expect(context.getCustomer).toHaveBeenCalledWith(1042);
  });

  it("on a phone, a customer is its own page under /admin, with a way back to the list", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderAt("/admin/customers/1042", { currentUser: ADMIN });
    await waitFor(() => expect(document.getElementById("vh2o-admin-user-card-1042")).toBeInTheDocument());
    expect(document.getElementById("vh2o-admin-customer-list")).toBeNull();

    await user.click(document.getElementById("vh2o-admin-back-btn"));
    expect(currentPath).toBe("/admin");
    expect(document.getElementById("vh2o-admin-customer-list")).toBeInTheDocument();
  });

  it("the Customers tab returns to the customer that was open", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAt("/admin/customers/1042", { currentUser: ADMIN });
    await waitFor(() => expect(document.getElementById("vh2o-admin-user-card-1042")).toBeInTheDocument());

    await user.click(document.getElementById("vh2o-top-nav-menu"));
    expect(currentPath).toBe("/menu");
    await user.click(document.getElementById("vh2o-top-nav-tracker"));
    expect(currentPath).toBe("/admin/customers/1042");
  });
});

describe("Home when the recent history can't load", () => {
  it("still shows the balance, and says the history is unavailable instead of empty", () => {
    renderAt("/", { currentUser: CUSTOMER, historyUnavailable: true });
    expect(document.getElementById("vh2o-tracker-points-pill")).toHaveTextContent("342");
    expect(document.getElementById("vh2o-tracker-history-unavailable")).toBeInTheDocument();
    expect(document.getElementById("vh2o-tracker-history-empty")).toBeNull();
  });
});
