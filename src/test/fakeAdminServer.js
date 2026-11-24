import { vi } from "vitest";
import { isActiveCustomer } from "../lib/customers.js";

// Stand-ins for the admin panel's server-side lookups (searchCustomers, getCustomer,
// fetchCustomerSummary), working over an in-memory list of customers in the shape
// mapCustomerRow() produces. They follow the same rules as admin_search_customers() in
// schema.sql (3+ characters; name, email, or part of the customer number; the four filters;
// name or gallons sort), which supabase/tests/admin_lists.test.sql checks on the real database.
export function fakeAdminServer(customers) {
  const matches = (c, q) => (
    String(c.name || "").toLowerCase().includes(q)
    || String(c.email || "").toLowerCase().includes(q)
    || String(c.id).includes(q)
  );
  const passesFilter = (c, filter) => {
    if (filter === "active") return isActiveCustomer(c);
    if (filter === "inactive") return !isActiveCustomer(c);
    if (filter === "nologin") return !c.hasLogin && !c.anonymizedAt;
    return true;
  };

  return {
    searchCustomers: vi.fn(async ({ query, filter = "all", sort = "name" }) => {
      const q = String(query).trim().toLowerCase();
      if (q.length < 3) {
        return { ok: false, message: "Type 3 to 100 characters to search" };
      }
      const found = customers
        .filter((c) => matches(c, q) && passesFilter(c, filter))
        .sort((a, b) => (sort === "gallons" ? b.gallons - a.gallons : 0)
          || String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()));
      return { ok: true, customers: found, totalMatches: found.length };
    }),
    getCustomer: vi.fn(async (customerId) => {
      const found = customers.find((c) => c.id === customerId);
      return found ? { ok: true, customer: found } : { ok: false, message: "Customer not found" };
    }),
    fetchCustomerSummary: vi.fn(async () => ({
      ok: true,
      total: customers.length,
      active: customers.filter(isActiveCustomer).length,
    })),
  };
}
