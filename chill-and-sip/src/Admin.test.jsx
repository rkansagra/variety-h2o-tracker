import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client, createEphemeralSupabaseClient: () => client };
});

const { filterCustomers } = await import("./lib/customers.js");
const { MainApp } = await import("./screens/MainApp.jsx");
const { UserContext } = await import("./userContext.js");

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
// Active = a transaction (visit) in the last 60 days; "no login" = no authUserId.
const USERS = [
  { id: 1, role: "admin", name: "Store Admin", email: "admin@example.com", gallons: 0, authUserId: "a-1" },
  customer({ id: 1042, profileId: "p-1042", name: "Alex Rivera", email: "alex@example.com", gallons: 342, authUserId: "u-1", waterType: "remineralized", lastTransactionAt: now }),
  customer({ id: 1051, profileId: "p-1051", name: "Dana Brooks", gallons: 75, lastTransactionAt: now }),
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

  it("leaves customers whose data was deleted out of 'no login yet'", () => {
    const users = [...USERS, customer({ id: 1099, name: "Deleted customer", anonymizedAt: now })];
    expect(filterCustomers(users, { filter: "nologin" }).map((u) => u.id)).toEqual([1051]);
    expect(filterCustomers(users).map((u) => u.id)).toContain(1099);
  });
});

const originalWindow = { width: window.innerWidth, height: window.innerHeight };
const setWindow = (width, height) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};
afterEach(() => setWindow(originalWindow.width, originalWindow.height));

// MainApp with a fake signed-in admin context; override any context value per test.
function renderAdmin({ users = USERS, ...overrides } = {}) {
  const context = {
    currentUser: USERS[0],
    users,
    notifications: [],
    isLoading: false,
    logout: vi.fn(),
    adjustGallons: vi.fn(async () => ({ ok: true })),
    fetchUserHistory: vi.fn(async () => ({ ok: true, transactions: [] })),
    updateWaterType: vi.fn(async () => ({ ok: true })),
    generateClaimCode: vi.fn(async () => ({ ok: true, code: "ABCD1234" })),
    anonymizeCustomer: vi.fn(async () => ({ ok: true })),
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

// MainApp opens on the Menu tab; the admin customer view lives under Home.
async function openHome(user) {
  const tab = document.getElementById("vh2o-top-nav-tracker") || document.getElementById("vh2o-bottom-nav-tracker");
  await user.click(tab);
}

describe("Admin customers view", () => {

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

  // The Home tab unmounts when the admin leaves it; MainApp holds this state so it survives.
  it("keeps the search, filter, and selected customer after visiting another tab", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "example.com");
    await user.click(document.getElementById("vh2o-admin-filter-active"));
    await user.click(document.getElementById("vh2o-admin-customer-row-1042"));

    await user.click(document.getElementById("vh2o-top-nav-menu"));
    expect(document.getElementById("vh2o-admin-user-search-input")).not.toBeInTheDocument();
    await openHome(user);

    expect(document.getElementById("vh2o-admin-user-search-input")).toHaveValue("example.com");
    expect(document.getElementById("vh2o-admin-filter-active")).toHaveAttribute("aria-pressed", "true");
    expect(document.getElementById("vh2o-admin-user-card-1042")).toBeInTheDocument();
  });
});

describe("Admin customer actions", () => {
  beforeEach(() => setWindow(1440, 900));

  async function openCustomer(user, search, id) {
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), search);
    await user.click(document.getElementById(`vh2o-admin-customer-row-${id}`));
  }

  it("credits gallons only after the confirmation step", async () => {
    const user = userEvent.setup();
    const context = renderAdmin();
    await openCustomer(user, "alex", 1042);

    await user.type(document.getElementById("vh2o-admin-user-amount-input-1042"), "25");
    await user.type(document.getElementById("vh2o-admin-user-note-input-1042"), "5 gal jugs");
    await user.click(document.getElementById("vh2o-admin-user-credit-btn-1042"));

    expect(document.getElementById("vh2o-admin-confirm-sheet")).toBeInTheDocument();
    expect(context.adjustGallons).not.toHaveBeenCalled();

    await user.click(document.getElementById("vh2o-admin-confirm-submit"));

    expect(context.adjustGallons).toHaveBeenCalledWith(1042, 25, "5 gal jugs");
    expect(document.getElementById("vh2o-admin-confirm-sheet")).not.toBeInTheDocument();
  });

  it("debits as a negative amount, and cancelling changes nothing", async () => {
    const user = userEvent.setup();
    const context = renderAdmin();
    await openCustomer(user, "alex", 1042);

    await user.type(document.getElementById("vh2o-admin-user-amount-input-1042"), "10");
    await user.click(document.getElementById("vh2o-admin-user-debit-btn-1042"));
    await user.click(document.getElementById("vh2o-admin-confirm-cancel"));
    expect(context.adjustGallons).not.toHaveBeenCalled();

    await user.type(document.getElementById("vh2o-admin-user-amount-input-1042"), "10");
    await user.click(document.getElementById("vh2o-admin-user-debit-btn-1042"));
    await user.click(document.getElementById("vh2o-admin-confirm-submit"));
    expect(context.adjustGallons).toHaveBeenCalledWith(1042, -10, "");
  });

  it("ignores an empty or zero amount", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openCustomer(user, "alex", 1042);

    await user.click(document.getElementById("vh2o-admin-user-credit-btn-1042"));
    await user.type(document.getElementById("vh2o-admin-user-amount-input-1042"), "0");
    await user.click(document.getElementById("vh2o-admin-user-credit-btn-1042"));

    expect(document.getElementById("vh2o-admin-confirm-sheet")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and shows the server's error when an adjustment fails", async () => {
    const user = userEvent.setup();
    renderAdmin({ adjustGallons: vi.fn(async () => ({ ok: false, message: "Insufficient balance" })) });
    await openCustomer(user, "brooks", 1051);

    await user.type(document.getElementById("vh2o-admin-user-amount-input-1051"), "500");
    await user.click(document.getElementById("vh2o-admin-user-debit-btn-1051"));
    await user.click(document.getElementById("vh2o-admin-confirm-submit"));

    expect(document.getElementById("vh2o-admin-confirm-error")).toHaveTextContent("Insufficient balance");
    expect(document.getElementById("vh2o-admin-confirm-sheet")).toBeInTheDocument();
  });

  it("generates a claim code for a customer without a login, and shows it with their ID", async () => {
    const user = userEvent.setup();
    const context = renderAdmin();
    await openCustomer(user, "brooks", 1051);

    await user.click(document.getElementById("vh2o-admin-user-generate-code-btn-1051"));

    expect(context.generateClaimCode).toHaveBeenCalledWith("p-1051");
    expect(document.getElementById("vh2o-admin-user-claim-code-1051")).toHaveTextContent("ABCD1234");
    expect(document.getElementById("vh2o-admin-user-claim-code-1051")).toHaveTextContent("(1051)");
  });

  it("offers no claim code to a customer who already has a login", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openCustomer(user, "alex", 1042);

    expect(document.getElementById("vh2o-admin-user-generate-code-btn-1042")).not.toBeInTheDocument();
  });

  it("shows a claim-code error from the server", async () => {
    const user = userEvent.setup();
    renderAdmin({ generateClaimCode: vi.fn(async () => ({ ok: false, message: "This customer already has a linked login" })) });
    await openCustomer(user, "brooks", 1051);

    await user.click(document.getElementById("vh2o-admin-user-generate-code-btn-1051"));

    expect(document.getElementById("vh2o-admin-user-claim-code-error-1051")).toHaveTextContent("already has a linked login");
    expect(document.getElementById("vh2o-admin-user-claim-code-1051")).not.toBeInTheDocument();
  });

  it("deletes a customer's personal data only after their customer ID is typed", async () => {
    const user = userEvent.setup();
    const context = renderAdmin();
    await openCustomer(user, "alex", 1042);

    await user.click(document.getElementById("vh2o-admin-user-delete-data-btn-1042"));
    const confirm = document.getElementById("vh2o-admin-user-delete-data-confirm-btn-1042");
    expect(confirm).toBeDisabled();

    await user.type(document.getElementById("vh2o-admin-user-delete-data-input-1042"), "1043");
    expect(confirm).toBeDisabled();

    await user.clear(document.getElementById("vh2o-admin-user-delete-data-input-1042"));
    await user.type(document.getElementById("vh2o-admin-user-delete-data-input-1042"), "1042");
    await user.click(confirm);

    expect(context.anonymizeCustomer).toHaveBeenCalledTimes(1);
    expect(context.anonymizeCustomer).toHaveBeenCalledWith("p-1042");
  });

  it("cancelling the delete leaves the customer alone", async () => {
    const user = userEvent.setup();
    const context = renderAdmin();
    await openCustomer(user, "alex", 1042);

    await user.click(document.getElementById("vh2o-admin-user-delete-data-btn-1042"));
    await user.type(document.getElementById("vh2o-admin-user-delete-data-input-1042"), "1042");
    await user.click(document.getElementById("vh2o-admin-user-delete-data-cancel-btn-1042"));

    expect(context.anonymizeCustomer).not.toHaveBeenCalled();
    expect(document.getElementById("vh2o-admin-user-delete-data-confirm-1042")).not.toBeInTheDocument();
  });

  it("shows the server's error if deleting fails", async () => {
    const user = userEvent.setup();
    renderAdmin({ anonymizeCustomer: vi.fn(async () => ({ ok: false, message: "Only admins can delete customer data" })) });
    await openCustomer(user, "alex", 1042);

    await user.click(document.getElementById("vh2o-admin-user-delete-data-btn-1042"));
    await user.type(document.getElementById("vh2o-admin-user-delete-data-input-1042"), "1042");
    await user.click(document.getElementById("vh2o-admin-user-delete-data-confirm-btn-1042"));

    expect(document.getElementById("vh2o-admin-user-delete-data-error-1042")).toHaveTextContent("Only admins can delete customer data");
  });

  it("marks a deleted customer and offers neither a claim code nor another delete", async () => {
    const user = userEvent.setup();
    const deleted = customer({ id: 1099, name: "Deleted customer", anonymizedAt: now });
    renderAdmin({ users: [...USERS, deleted] });
    await openCustomer(user, "deleted", 1099);

    expect(document.getElementById("vh2o-admin-user-data-deleted-1099")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-user-generate-code-btn-1099")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-user-delete-data-btn-1099")).not.toBeInTheDocument();
    // History stays available: the transaction records are kept.
    expect(document.getElementById("vh2o-admin-user-history-btn-1099")).toBeInTheDocument();
  });
});
