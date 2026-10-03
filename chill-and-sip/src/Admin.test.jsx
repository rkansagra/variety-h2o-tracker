import { describe, it, expect, vi, afterEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { filterCustomers, MainApp, UserContext } = await import("./App.jsx");

const now = new Date().toISOString();
const customer = (overrides) => ({
  role: "user",
  gallons: 0,
  email: null,
  authUserId: null,
  lastTransactionAt: null,
  waterType: null,
  memberSince: "1/1/2025",
  ...overrides,
});
// Active = holds gallons or transacted in the last 31 days; "no login" = no authUserId.
const USERS = [
  { id: 1, role: "admin", name: "Store Admin", email: "admin@example.com", gallons: 0, authUserId: "a-1" },
  customer({ id: 1042, name: "Alex Rivera", email: "alex@example.com", gallons: 342, authUserId: "u-1", waterType: "remineralized" }),
  customer({ id: 1051, name: "Dana Brooks", gallons: 75 }),
  customer({ id: 1066, name: "Marcus Lee", email: "marcus@example.com", authUserId: "u-2" }),
  customer({ id: 1088, name: "jordan kim", email: "jkim@example.com", authUserId: "u-3", lastTransactionAt: now }),
];

describe("filterCustomers", () => {
  it("lists customers only, sorted by name (case-insensitive)", () => {
    expect(filterCustomers(USERS).map((u) => u.id)).toEqual([1042, 1051, 1088, 1066]);
  });

  it("filters by status and by missing login", () => {
    expect(filterCustomers(USERS, { filter: "active" }).map((u) => u.id)).toEqual([1042, 1051, 1088]);
    expect(filterCustomers(USERS, { filter: "inactive" }).map((u) => u.id)).toEqual([1066]);
    expect(filterCustomers(USERS, { filter: "nologin" }).map((u) => u.id)).toEqual([1051]);
  });

  it("searches name, email, and customer ID", () => {
    expect(filterCustomers(USERS, { query: "BROOKS" }).map((u) => u.id)).toEqual([1051]);
    expect(filterCustomers(USERS, { query: "jkim@" }).map((u) => u.id)).toEqual([1088]);
    expect(filterCustomers(USERS, { query: "1066" }).map((u) => u.id)).toEqual([1066]);
  });

  it("sorts by gallons, highest first", () => {
    expect(filterCustomers(USERS, { sort: "gallons" }).map((u) => u.id)).toEqual([1042, 1051, 1088, 1066]);
  });
});

describe("Admin customers view", () => {
  const original = { width: window.innerWidth, height: window.innerHeight };
  const setWindow = (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  };
  afterEach(() => setWindow(original.width, original.height));

  function renderAdmin() {
    const context = {
      currentUser: USERS[0],
      users: USERS,
      notifications: [],
      isLoading: false,
      logout: vi.fn(),
      adjustGallons: vi.fn(async () => ({ ok: true })),
      fetchUserHistory: vi.fn(async () => ({ ok: true, transactions: [] })),
      updateWaterType: vi.fn(async () => ({ ok: true })),
      generateClaimCode: vi.fn(async () => ({ ok: true, code: "ABCD1234" })),
      register: vi.fn(),
      biometricAvailable: false,
      biometryType: 0,
      biometricLockEnabled: false,
      isBiometricLocked: false,
      enableBiometricLock: vi.fn(),
      disableBiometricLock: vi.fn(),
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

  // MainApp opens on the Menu tab; the admin customer view lives under Home.
  async function openHome(user) {
    const tab = document.getElementById("vh2o-top-nav-tracker") || document.getElementById("vh2o-bottom-nav-tracker");
    await user.click(tab);
  }

  it("lists no one until 3+ characters are typed", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);

    expect(document.getElementById("vh2o-admin-user-search-hint")).toBeInTheDocument();
    expect(document.querySelector('[id^="vh2o-admin-customer-row-"]')).toBeNull();

    await user.type(document.getElementById("vh2o-admin-user-search-input"), "ri");
    expect(document.querySelector('[id^="vh2o-admin-customer-row-"]')).toBeNull();

    await user.type(document.getElementById("vh2o-admin-user-search-input"), "v");
    expect(document.getElementById("vh2o-admin-user-search-hint")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-customer-row-1042")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-customer-count")).toHaveTextContent("1 of 4");
  });

  it("shows details for the selected customer beside the list (desktop)", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "alex");

    expect(document.getElementById("vh2o-admin-customer-detail-empty")).toBeInTheDocument();

    await user.click(document.getElementById("vh2o-admin-customer-row-1042"));

    const card = document.getElementById("vh2o-admin-user-card-1042");
    expect(within(card).getByText("Alex Rivera")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-customer-row-1042")).toHaveAttribute("aria-current", "true");
    // Side by side: the list is still there next to the details.
    expect(document.getElementById("vh2o-admin-customer-list")).toBeInTheDocument();
  });

  it("narrows search results with the status filters", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    // Matches Alex, Marcus, and Jordan (all have example.com emails).
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "example.com");
    expect(document.getElementById("vh2o-admin-customer-count")).toHaveTextContent("3 of 4");

    await user.click(document.getElementById("vh2o-admin-filter-inactive"));

    expect(document.getElementById("vh2o-admin-customer-count")).toHaveTextContent("1 of 4");
    expect(document.getElementById("vh2o-admin-customer-row-1066")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-customer-row-1042")).not.toBeInTheDocument();
  });

  it("on a phone, opens details as their own view with a way back to the list", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "brooks");

    await user.click(document.getElementById("vh2o-admin-customer-row-1051"));

    expect(document.getElementById("vh2o-admin-user-card-1051")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-customer-list")).not.toBeInTheDocument();

    await user.click(document.getElementById("vh2o-admin-back-btn"));

    expect(document.getElementById("vh2o-admin-customer-list")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-user-card-1051")).not.toBeInTheDocument();
  });
});
