import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { createSupabaseMock } from "./test/supabaseMock.js";
import { fakeAdminServer } from "./test/fakeAdminServer.js";

vi.mock("./lib/supabaseClient", () => {
  const { client } = createSupabaseMock();
  return { supabase: client };
});

const { MainApp } = await import("./screens/MainApp.jsx");
const { UserContext } = await import("./userContext.js");

const now = new Date().toISOString();
// Customers in the shape the admin panel gets from the server (mapCustomerRow()).
const customer = (overrides) => ({
  gallons: 0,
  email: null,
  hasLogin: false,
  lastTransactionAt: null,
  anonymizedAt: null,
  waterType: null,
  memberSince: "1/1/2025",
  ...overrides,
  profileId: overrides.profileId ?? `p-${overrides.id}`,
});
const ADMIN = { id: 1, role: "admin", name: "Store Admin", email: "admin@example.com", gallons: 0, authUserId: "a-1" };
// Active = a transaction (visit) in the last 60 days.
const CUSTOMERS = [
  customer({ id: 1042, name: "Alex Rivera", email: "alex@example.com", gallons: 342, hasLogin: true, waterType: "remineralized", lastTransactionAt: now }),
  customer({ id: 1051, name: "Dana Brooks", gallons: 75, lastTransactionAt: now }),
  customer({ id: 1066, name: "Marcus Lee", email: "marcus@example.com", hasLogin: true }),
  customer({ id: 1088, name: "jordan kim", email: "jkim@example.com", hasLogin: true, lastTransactionAt: now }),
];

// The list appears after a short pause and a (fake) server round trip.
const findById = (id) => waitFor(() => {
  const el = document.getElementById(id);
  expect(el).toBeInTheDocument();
  return el;
});

const originalWindow = { width: window.innerWidth, height: window.innerHeight };
const setWindow = (width, height) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};
afterEach(() => setWindow(originalWindow.width, originalWindow.height));

// MainApp with a fake signed-in admin context; override any context value per test.
function renderAdmin({ customers = CUSTOMERS, ...overrides } = {}) {
  const context = {
    currentUser: ADMIN,
    ...fakeAdminServer(customers),
    notifications: [],
    isLoading: false,
    logout: vi.fn(),
    adjustGallons: vi.fn(async () => ({ ok: true })),
    fetchUserHistory: vi.fn(async () => ({ ok: true, transactions: [] })),
    updateWaterType: vi.fn(async () => ({ ok: true })),
    setCustomerEmail: vi.fn(async () => ({ ok: true })),
    anonymizeCustomer: vi.fn(async () => ({ ok: true })),
    addCustomer: vi.fn(async () => ({ ok: true, customerId: 1099 })),
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

  it("opens Home on the customer panel, without a customer's profile card or tier badge", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);

    expect(document.getElementById("vh2o-admin-manage-users")).toBeInTheDocument();
    expect(document.getElementById("vh2o-tracker-profile")).toBeNull();
    expect(document.getElementById("vh2o-tracker-tier-badge")).toBeNull();
  });

  it("lists no one until 3+ characters are typed", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    const context = renderAdmin();
    await openHome(user);

    expect(document.getElementById("vh2o-admin-user-search-hint")).toBeInTheDocument();
    expect(document.querySelector('[id^="vh2o-admin-customer-row-"]')).toBeNull();

    await user.type(document.getElementById("vh2o-admin-user-search-input"), "ri");
    expect(document.querySelector('[id^="vh2o-admin-customer-row-"]')).toBeNull();

    await user.type(document.getElementById("vh2o-admin-user-search-input"), "v");
    expect(document.getElementById("vh2o-admin-user-search-hint")).not.toBeInTheDocument();
    await findById("vh2o-admin-customer-row-1042");
    expect(document.getElementById("vh2o-admin-customer-count")).toHaveTextContent("1 of 4");
    // Short queries never reach the server; the search itself happens there.
    expect(context.searchCustomers).not.toHaveBeenCalledWith(expect.objectContaining({ query: "ri" }));
    expect(context.searchCustomers).toHaveBeenLastCalledWith({ query: "riv", filter: "all", sort: "name" });
  });

  it("shows details for the selected customer beside the list (desktop)", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "alex");

    expect(document.getElementById("vh2o-admin-customer-detail-empty")).toBeInTheDocument();

    await user.click(await findById("vh2o-admin-customer-row-1042"));

    const card = await findById("vh2o-admin-user-card-1042");
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
    expect(await findById("vh2o-admin-customer-count")).toHaveTextContent("3 of 4");

    await user.click(document.getElementById("vh2o-admin-filter-inactive"));

    await waitFor(() => expect(document.getElementById("vh2o-admin-customer-count")).toHaveTextContent("1 of 4"));
    expect(document.getElementById("vh2o-admin-customer-row-1066")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-customer-row-1042")).not.toBeInTheDocument();
  });

  it("on a phone, opens details as their own view with a way back to the list", async () => {
    setWindow(390, 844);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "brooks");

    await user.click(await findById("vh2o-admin-customer-row-1051"));

    await findById("vh2o-admin-user-card-1051");
    expect(document.getElementById("vh2o-admin-customer-list")).not.toBeInTheDocument();

    await user.click(document.getElementById("vh2o-admin-back-btn"));

    await findById("vh2o-admin-customer-list");
    expect(document.getElementById("vh2o-admin-user-card-1051")).not.toBeInTheDocument();
  });

  it("shows the server's error instead of results when a search fails", async () => {
    const user = userEvent.setup();
    renderAdmin({ searchCustomers: vi.fn(async () => ({ ok: false, message: "Only admins can search customers" })) });
    await openHome(user);

    await user.type(document.getElementById("vh2o-admin-user-search-input"), "alex");

    expect(await findById("vh2o-admin-customer-search-error")).toHaveTextContent("Only admins can search customers");
    expect(document.querySelector('[id^="vh2o-admin-customer-row-"]')).toBeNull();
  });

  // The Home tab unmounts when the admin leaves it; MainApp holds this state so it survives.
  it("keeps the search, filter, and selected customer after visiting another tab", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    renderAdmin();
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), "example.com");
    await user.click(document.getElementById("vh2o-admin-filter-active"));
    await user.click(await findById("vh2o-admin-customer-row-1042"));

    await user.click(document.getElementById("vh2o-top-nav-menu"));
    expect(document.getElementById("vh2o-admin-user-search-input")).not.toBeInTheDocument();
    await openHome(user);

    expect(document.getElementById("vh2o-admin-user-search-input")).toHaveValue("example.com");
    expect(document.getElementById("vh2o-admin-filter-active")).toHaveAttribute("aria-pressed", "true");
    await findById("vh2o-admin-user-card-1042");
  });
});

describe("Admin customer actions", () => {
  beforeEach(() => setWindow(1440, 900));

  async function openCustomer(user, search, id) {
    await openHome(user);
    await user.type(document.getElementById("vh2o-admin-user-search-input"), search);
    await user.click(await findById(`vh2o-admin-customer-row-${id}`));
    await findById(`vh2o-admin-user-card-${id}`);
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

    const searchesBefore = context.searchCustomers.mock.calls.length;
    await user.click(document.getElementById("vh2o-admin-confirm-submit"));

    expect(context.adjustGallons).toHaveBeenCalledWith("p-1042", 25, "5 gal jugs");
    expect(document.getElementById("vh2o-admin-confirm-sheet")).not.toBeInTheDocument();
    // The list and the card re-fetch from the server to show the new balance.
    await waitFor(() => expect(context.searchCustomers.mock.calls.length).toBeGreaterThan(searchesBefore));
    expect(context.getCustomer).toHaveBeenLastCalledWith(1042);
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
    expect(context.adjustGallons).toHaveBeenCalledWith("p-1042", -10, "");
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

  it("saves a sign-in email for a customer without a login", async () => {
    const user = userEvent.setup();
    const context = renderAdmin();
    await openCustomer(user, "brooks", 1051);

    const save = document.getElementById("vh2o-admin-user-email-save-btn-1051");
    expect(save).toBeDisabled();
    // Blank can't be saved: an email can be added or corrected, not cleared.
    await user.type(document.getElementById("vh2o-admin-user-email-input-1051"), "   ");
    expect(save).toBeDisabled();
    await user.clear(document.getElementById("vh2o-admin-user-email-input-1051"));
    await user.type(document.getElementById("vh2o-admin-user-email-input-1051"), "dana@example.com");
    await user.click(save);

    expect(context.setCustomerEmail).toHaveBeenCalledWith("p-1051", "dana@example.com");
    expect(document.getElementById("vh2o-admin-user-email-saved-1051")).toHaveTextContent(/sign in now with a code/i);
  });

  it("offers no email field for a customer who already has a login", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openCustomer(user, "alex", 1042);

    expect(document.getElementById("vh2o-admin-user-email-input-1042")).not.toBeInTheDocument();
  });

  it("shows the server's refusal when saving an email", async () => {
    const user = userEvent.setup();
    renderAdmin({ setCustomerEmail: vi.fn(async () => ({ ok: false, message: "Another customer already has this email" })) });
    await openCustomer(user, "brooks", 1051);

    await user.type(document.getElementById("vh2o-admin-user-email-input-1051"), "taken@example.com");
    await user.click(document.getElementById("vh2o-admin-user-email-save-btn-1051"));

    expect(document.getElementById("vh2o-admin-user-email-error-1051")).toHaveTextContent("already has this email");
    expect(document.getElementById("vh2o-admin-user-email-saved-1051")).not.toBeInTheDocument();
  });

  it("adds a customer, then looks up the new customer number", async () => {
    setWindow(1440, 900);
    const user = userEvent.setup();
    const context = renderAdmin();
    await openHome(user);

    await user.click(document.getElementById("vh2o-admin-add-customer-btn"));
    // Every customer gets an email: they set up their own sign-in with it.
    expect(screen.getByLabelText(/^Email/)).toBeRequired();
    await user.type(screen.getByLabelText("Name"), "Gus New");
    await user.type(screen.getByLabelText(/^Email/), "gus@example.com");
    await user.click(document.getElementById("vh2o-admin-add-customer-submit"));

    expect(context.addCustomer).toHaveBeenCalledWith("Gus New", "gus@example.com");
    expect(document.getElementById("vh2o-admin-add-customer-form")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-user-search-input")).toHaveValue("1099");
  });

  it("keeps the Add customer form open with the server's error", async () => {
    const user = userEvent.setup();
    renderAdmin({ addCustomer: vi.fn(async () => ({ ok: false, message: "Another customer already has this email" })) });
    await openHome(user);

    await user.click(document.getElementById("vh2o-admin-add-customer-btn"));
    await user.type(screen.getByLabelText("Name"), "Gus New");
    await user.type(screen.getByLabelText(/^Email/), "taken@example.com");
    await user.click(document.getElementById("vh2o-admin-add-customer-submit"));

    expect(document.getElementById("vh2o-admin-add-customer-error")).toHaveTextContent("Another customer already has this email");
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

  it("marks a deleted customer and offers neither an email field nor another delete", async () => {
    const user = userEvent.setup();
    const deleted = customer({ id: 1099, name: "Deleted customer", anonymizedAt: now });
    renderAdmin({ customers: [...CUSTOMERS, deleted] });
    await openCustomer(user, "deleted", 1099);

    expect(document.getElementById("vh2o-admin-user-data-deleted-1099")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-user-email-input-1099")).not.toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-user-delete-data-btn-1099")).not.toBeInTheDocument();
    // History stays available: the transaction records are kept.
    expect(document.getElementById("vh2o-admin-user-history-btn-1099")).toBeInTheDocument();
  });
});
