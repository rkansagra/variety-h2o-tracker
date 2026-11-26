import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { sharedMock, resetSupabaseMock } from "./test/supabaseMock.js";

vi.mock("./lib/supabaseClient", async () => {
  const { sharedMock } = await import("./test/supabaseMock.js");
  return { supabase: sharedMock.client };
});

const {
  mapMenu, sizesOf, menuCacheValue, readMenuCache, parsePrice, phoneToTel, describeMenuChange, MENU_CACHE_KEY,
} = await import("./lib/menu.js");
const { MenuProvider } = await import("./MenuProvider.jsx");
const { MenuContext, useMenu } = await import("./menuContext.js");
const MenuTab = (await import("./screens/tabs/MenuTab.jsx")).default;
const MenuEditor = (await import("./admin/MenuEditor.jsx")).default;
const { MENU_CONTEXT_FIXTURE, MENU_FIXTURE, STORE_FIXTURE } = await import("./test/menuFixture.js");

const { state } = sharedMock;

// ---------- Database rows, as Supabase returns them ----------
const CATEGORY_ROWS = [
  { id: "smoothies", name: "Smoothies", icon: "🥤", image_key: null, color: "#a78bfa", sort_order: 20, size_tiers: [{ key: "small", label: "Small", price: 8.05 }, { key: "large", label: "Large", price: 10.12 }] },
  { id: "water", name: "Water", icon: "💧", image_key: null, color: "#38bdf8", sort_order: 10, size_tiers: null },
];
const ITEM_ROWS = [
  { id: 3, category_id: "smoothies", name: "Mango", price: null, unit: null, description: null, size_tiers: null, sort_order: 10, hidden: false },
  { id: 4, category_id: "smoothies", name: "Protein Smoothie", price: null, unit: null, description: null, size_tiers: [{ key: "small", label: "Small", price: 9.89 }], sort_order: 20, hidden: false },
  { id: 2, category_id: "water", name: "Alkaline Water", price: "2.25", unit: "per gallon", description: null, size_tiers: null, sort_order: 20, hidden: false },
  { id: 1, category_id: "water", name: "Reverse Osmosis Water", price: "0.55", unit: "per gallon", description: "Filtered.", size_tiers: null, sort_order: 10, hidden: false },
  { id: 5, category_id: "water", name: "Secret Water", price: "9.99", unit: "each", description: null, size_tiers: null, sort_order: 30, hidden: true },
];
const STORE_ROW = {
  address_line1: "6330 E Golf Links Rd #A138", address_line2: "Tucson, AZ 85730", phone_display: "(520) 812-1532",
  phone_tel: "tel:+15208121532", hours: [{ days: "Mon – Sat", hours: "10am – 7pm" }], tagline: "Purified", welcome: "Hello",
  order_url: "https://order.example", facebook_url: null, maps_google_url: null, maps_apple_url: null,
};

describe("menu helpers", () => {
  it("orders categories and their items, and maps prices and sizes", () => {
    const menu = mapMenu(CATEGORY_ROWS, ITEM_ROWS);
    expect(menu.map((c) => c.id)).toEqual(["water", "smoothies"]);
    expect(menu[0].items.map((i) => i.name)).toEqual(["Reverse Osmosis Water", "Alkaline Water", "Secret Water"]);
    expect(menu[0].items[0]).toMatchObject({ price: 0.55, unit: "per gallon", description: "Filtered.", hidden: false });
    expect(menu[1].sizeTiers).toEqual([{ key: "small", label: "Small", price: 8.05 }, { key: "large", label: "Large", price: 10.12 }]);
  });

  it("gives an item its own price, its own sizes, or its category's sizes", () => {
    const [water, smoothies] = mapMenu(CATEGORY_ROWS, ITEM_ROWS);
    expect(sizesOf(water.items[0], water)).toBeNull();
    expect(sizesOf(smoothies.items[0], smoothies)).toEqual(smoothies.sizeTiers);
    expect(sizesOf(smoothies.items[1], smoothies)).toEqual([{ key: "small", label: "Small", price: 9.89 }]);
  });

  it("remembers only what the public may see, and ignores a broken copy", () => {
    const saved = readMenuCache(menuCacheValue(mapMenu(CATEGORY_ROWS, ITEM_ROWS), { phone: {} }, "2026-11-25T10:00:00Z"));
    expect(saved.savedAt).toBe("2026-11-25T10:00:00Z");
    expect(saved.categories[0].items.map((i) => i.name)).not.toContain("Secret Water");
    expect(readMenuCache("not json")).toBeNull();
    expect(readMenuCache(JSON.stringify({ categories: [] }))).toBeNull();
    expect(readMenuCache(null)).toBeNull();
  });

  it("parses prices with at most 2 decimals", () => {
    expect(parsePrice("4.5")).toBe(4.5);
    expect(parsePrice("$10")).toBe(10);
    expect(parsePrice(" ")).toBeNull();
    expect(parsePrice("1.234")).toBeUndefined();
    expect(parsePrice("-1")).toBeUndefined();
    expect(parsePrice("ten")).toBeUndefined();
  });

  it("turns a US phone number into a tel: link", () => {
    expect(phoneToTel("(520) 812-1532")).toBe("tel:+15208121532");
    expect(phoneToTel("1-520-812-1532")).toBe("tel:+15208121532");
    expect(phoneToTel("812-1532")).toBeNull();
  });

  it("describes changes in plain words", () => {
    expect(describeMenuChange({ table_name: "menu_items", action: "update", old_values: { name: "RO", price: "0.55", hidden: false }, new_values: { name: "RO", price: "0.60", hidden: false } }))
      .toBe("RO: price $0.55 → $0.60");
    expect(describeMenuChange({ table_name: "menu_items", action: "update", old_values: { name: "RO", price: "0.55", hidden: false }, new_values: { name: "RO", price: "0.55", hidden: true } }))
      .toBe("RO: hidden");
    expect(describeMenuChange({ table_name: "menu_items", action: "insert", new_values: { name: "Trail Mix", price: "3.50" } })).toBe("Trail Mix: added ($3.50)");
    expect(describeMenuChange({ table_name: "menu_items", action: "delete", old_values: { name: "Trail Mix" } })).toBe("Trail Mix: removed");
    expect(describeMenuChange({ table_name: "menu_categories", action: "update", old_values: { id: "smoothies" }, new_values: { id: "smoothies" } }, () => "Smoothies"))
      .toBe("Smoothies: size prices changed");
    expect(describeMenuChange({ table_name: "store_info", action: "update", old_values: { hours: [1], phone_display: "a", phone_tel: "b" }, new_values: { hours: [2], phone_display: "c", phone_tel: "d" } }))
      .toBe("Store details: hours, phone");
  });
});

// ---------- MenuProvider ----------

function Probe({ onValue }) {
  onValue(useMenu());
  return null;
}

function renderProvider() {
  let value;
  render(<MenuProvider><Probe onValue={(v) => { value = v; }} /></MenuProvider>);
  return () => value;
}

describe("MenuProvider", () => {
  beforeEach(() => {
    resetSupabaseMock();
    localStorage.clear();
  });

  it("loads the menu and store info, and remembers them on the device", async () => {
    state.setRows("menu_categories", CATEGORY_ROWS);
    state.setRows("menu_items", ITEM_ROWS);
    state.setRows("store_info", [STORE_ROW]);
    const get = renderProvider();

    await waitFor(() => expect(get().status).toBe("live"));
    expect(get().categories[0].name).toBe("Water");
    expect(get().store.phone).toEqual({ display: "(520) 812-1532", tel: "tel:+15208121532" });
    expect(readMenuCache(localStorage.getItem(MENU_CACHE_KEY)).categories).toHaveLength(2);
  });

  it("shows the remembered copy, with its date, when the menu can't load", async () => {
    localStorage.setItem(MENU_CACHE_KEY, menuCacheValue(MENU_FIXTURE, STORE_FIXTURE, "2026-11-20T12:00:00Z"));
    state.setRows("menu_categories", null, { message: "Failed to fetch" });
    const get = renderProvider();

    await waitFor(() => expect(get().status).toBe("cached"));
    expect(get().cachedAt).toBe("2026-11-20T12:00:00Z");
    expect(get().categories.length).toBe(MENU_FIXTURE.length);
  });

  it("says the menu is unavailable when it can't load and there's no copy", async () => {
    state.setRows("menu_categories", null, { message: "Failed to fetch" });
    const get = renderProvider();
    await waitFor(() => expect(get().status).toBe("unavailable"));
    expect(get().categories).toEqual([]);
  });

  it("saves an item, then reloads the menu", async () => {
    state.setRows("menu_categories", CATEGORY_ROWS);
    state.setRows("menu_items", ITEM_ROWS);
    state.setRows("store_info", [STORE_ROW]);
    const get = renderProvider();
    await waitFor(() => expect(get().status).toBe("live"));
    state.calls = [];

    let result;
    await act(async () => {
      result = await get().saveMenuItem(1, { price: 0.6 });
    });

    expect(result).toEqual({ ok: true });
    const update = state.calls.find((c) => c.table === "menu_items" && c.chain.includes("update"));
    expect(update.steps).toEqual([["update", { price: 0.6 }], ["eq", "id", 1]]);
    expect(state.calls.some((c) => c.table === "menu_categories" && c.chain.includes("select"))).toBe(true);
  });

  it("passes a refused save through without reloading", async () => {
    state.setRows("menu_categories", CATEGORY_ROWS);
    state.setRows("menu_items", ITEM_ROWS);
    state.setRows("store_info", [STORE_ROW]);
    const get = renderProvider();
    await waitFor(() => expect(get().status).toBe("live"));
    state.responses.menu_items = (chain) => (chain.some(([name]) => name === "delete")
      ? { data: null, error: { message: "new row violates row-level security policy" } }
      : { data: ITEM_ROWS, error: null });

    let result;
    await act(async () => {
      result = await get().deleteMenuItem(1);
    });
    expect(result).toEqual({ ok: false, message: "new row violates row-level security policy" });
  });
});

// ---------- The menu screen ----------

function renderMenu(value, path = "/menu") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <MenuContext.Provider value={value}>
        <Routes>
          <Route path="/menu" element={<MenuTab isDesktop={false} />} />
          <Route path="/menu/:categoryId" element={<MenuTab isDesktop={false} />} />
        </Routes>
      </MenuContext.Provider>
    </MemoryRouter>
  );
}

describe("MenuTab with database data", () => {
  it("never shows hidden items, even when an admin's browser loaded them", () => {
    const categories = mapMenu(CATEGORY_ROWS, ITEM_ROWS);
    renderMenu({ status: "live", categories, store: STORE_FIXTURE, cachedAt: null }, "/menu/water");
    expect(screen.getByText("Reverse Osmosis Water")).toBeInTheDocument();
    expect(screen.queryByText("Secret Water")).toBeNull();
  });

  it("marks the remembered copy with its date", () => {
    renderMenu({ ...MENU_CONTEXT_FIXTURE, status: "cached", cachedAt: "2026-11-20T12:00:00Z" });
    expect(document.getElementById("vh2o-menu-cached-note")).toHaveTextContent(/as of/);
    expect(document.getElementById("vh2o-menu-categories-grid")).toBeInTheDocument();
  });

  it("says so when the menu is unavailable", () => {
    renderMenu({ status: "unavailable", categories: [], store: null, cachedAt: null });
    expect(document.getElementById("vh2o-menu-unavailable")).toBeInTheDocument();
  });

  it("shows the tagline and welcome text from the store details", () => {
    renderMenu(MENU_CONTEXT_FIXTURE);
    expect(document.getElementById("vh2o-menu-tagline")).toHaveTextContent(STORE_FIXTURE.tagline);
  });
});

// ---------- The admin editor ----------

function renderEditor(overrides = {}) {
  const value = {
    ...MENU_CONTEXT_FIXTURE,
    reloadMenu: vi.fn(async () => {}),
    addMenuItem: vi.fn(async () => ({ ok: true })),
    saveMenuItem: vi.fn(async () => ({ ok: true })),
    deleteMenuItem: vi.fn(async () => ({ ok: true })),
    saveCategorySizes: vi.fn(async () => ({ ok: true })),
    saveStoreInfo: vi.fn(async () => ({ ok: true })),
    fetchMenuChanges: vi.fn(async () => ({ ok: true, changes: [] })),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <MenuContext.Provider value={value}>
        <MenuEditor />
      </MenuContext.Provider>
    </MemoryRouter>
  );
  return value;
}

describe("Menu & hours editor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reloads the menu on open, so hidden items show", () => {
    const value = renderEditor();
    expect(value.reloadMenu).toHaveBeenCalled();
  });

  it("saves the store details, deriving the tap-to-call link from the phone", async () => {
    const user = userEvent.setup();
    const value = renderEditor();

    await user.clear(document.getElementById("vh2o-admin-store-phone"));
    await user.type(document.getElementById("vh2o-admin-store-phone"), "(520) 555-0100");
    await user.clear(document.getElementById("vh2o-admin-store-hours-hours-1"));
    await user.type(document.getElementById("vh2o-admin-store-hours-hours-1"), "Closed");
    await user.click(document.getElementById("vh2o-admin-store-save"));

    expect(value.saveStoreInfo).toHaveBeenCalledWith(expect.objectContaining({
      phone_display: "(520) 555-0100",
      phone_tel: "tel:+15205550100",
      hours: [{ days: "Mon – Sat", hours: "10am – 7pm" }, { days: "Sun", hours: "Closed" }],
    }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("refuses a phone number it can't call, and a link that isn't https", async () => {
    const user = userEvent.setup();
    const value = renderEditor();

    await user.clear(document.getElementById("vh2o-admin-store-phone"));
    await user.type(document.getElementById("vh2o-admin-store-phone"), "555");
    await user.click(document.getElementById("vh2o-admin-store-save"));
    expect(document.getElementById("vh2o-admin-store-result")).toHaveTextContent("10-digit phone");

    await user.clear(document.getElementById("vh2o-admin-store-phone"));
    await user.type(document.getElementById("vh2o-admin-store-phone"), "(520) 812-1532");
    await user.clear(document.getElementById("vh2o-admin-store-orderUrl"));
    await user.type(document.getElementById("vh2o-admin-store-orderUrl"), "http://insecure.example");
    await user.click(document.getElementById("vh2o-admin-store-save"));
    expect(document.getElementById("vh2o-admin-store-result")).toHaveTextContent("https://");
    expect(value.saveStoreInfo).not.toHaveBeenCalled();
  });

  it("re-prices an item, and won't save a price it can't read", async () => {
    const user = userEvent.setup();
    const value = renderEditor();
    const id = "water-0"; // Reverse Osmosis Water

    await user.click(document.getElementById(`vh2o-admin-menu-item-edit-${id}`));
    const price = document.getElementById(`vh2o-admin-menu-item-price-${id}`);
    await user.clear(price);
    await user.type(price, "0.5.5");
    await user.click(document.getElementById(`vh2o-admin-menu-item-save-${id}`));
    expect(document.getElementById(`vh2o-admin-menu-item-result-${id}`)).toHaveTextContent("price like 4.50");

    await user.clear(price);
    await user.type(price, "0.60");
    await user.click(document.getElementById(`vh2o-admin-menu-item-save-${id}`));
    expect(value.saveMenuItem).toHaveBeenCalledWith(id, expect.objectContaining({ name: "Reverse Osmosis Water", price: 0.6, hidden: false }));
  });

  it("needs a price for an item in a category without sizes", async () => {
    const user = userEvent.setup();
    const value = renderEditor();
    const id = "water-0";

    await user.click(document.getElementById(`vh2o-admin-menu-item-edit-${id}`));
    await user.clear(document.getElementById(`vh2o-admin-menu-item-price-${id}`));
    await user.click(document.getElementById(`vh2o-admin-menu-item-save-${id}`));

    expect(document.getElementById(`vh2o-admin-menu-item-result-${id}`)).toHaveTextContent("needs a price");
    expect(value.saveMenuItem).not.toHaveBeenCalled();
  });

  it("hides an item, and removes one only after confirming", async () => {
    const user = userEvent.setup();
    const value = renderEditor();
    const id = "water-1";

    await user.click(document.getElementById(`vh2o-admin-menu-item-edit-${id}`));
    await user.click(document.getElementById(`vh2o-admin-menu-item-hidden-toggle-${id}`));
    await user.click(document.getElementById(`vh2o-admin-menu-item-save-${id}`));
    expect(value.saveMenuItem).toHaveBeenCalledWith(id, expect.objectContaining({ hidden: true }));

    await user.click(document.getElementById(`vh2o-admin-menu-item-edit-${id}`));
    await user.click(document.getElementById(`vh2o-admin-menu-item-delete-${id}`));
    expect(value.deleteMenuItem).not.toHaveBeenCalled();
    await user.click(document.getElementById(`vh2o-admin-menu-item-delete-confirm-${id}`));
    expect(value.deleteMenuItem).toHaveBeenCalledWith(id);
  });

  it("adds an item at the end of the category", async () => {
    const user = userEvent.setup();
    const value = renderEditor();

    await user.type(document.getElementById("vh2o-admin-menu-add-name"), "Mineral Water");
    await user.type(document.getElementById("vh2o-admin-menu-add-price"), "1.25");
    await user.type(document.getElementById("vh2o-admin-menu-add-unit"), "per gallon");
    await user.click(document.getElementById("vh2o-admin-menu-add-submit"));

    expect(value.addMenuItem).toHaveBeenCalledWith("water", {
      name: "Mineral Water", price: 1.25, unit: "per gallon", description: null, sort_order: 40,
    });
  });

  it("edits a category's size prices", async () => {
    const user = userEvent.setup();
    const value = renderEditor();

    await user.selectOptions(document.getElementById("vh2o-admin-menu-category-select"), "smoothies");
    const large = document.getElementById("vh2o-admin-menu-category-smoothies-size-large-price");
    await user.clear(large);
    await user.type(large, "10.50");
    await user.click(document.getElementById("vh2o-admin-menu-category-smoothies-sizes-save"));

    expect(value.saveCategorySizes).toHaveBeenCalledWith("smoothies", [
      { key: "small", label: "Small", price: 8.05 },
      { key: "large", label: "Large", price: 10.5 },
    ]);
  });

  it("lists recent changes in plain words", async () => {
    renderEditor({
      fetchMenuChanges: vi.fn(async () => ({
        ok: true,
        changes: [{ id: 9, changed_at: "2026-11-25T15:00:00Z", table_name: "menu_items", action: "update", old_values: { name: "RO", price: "0.55", hidden: false }, new_values: { name: "RO", price: "0.60", hidden: false } }],
      })),
    });
    expect(await screen.findByText(/RO: price \$0\.55 → \$0\.60/)).toBeInTheDocument();
  });

  it("won't edit a menu it couldn't load live", () => {
    renderEditor({ status: "cached", cachedAt: "2026-11-20T12:00:00Z" });
    expect(document.getElementById("vh2o-admin-menu-unavailable")).toBeInTheDocument();
    expect(document.getElementById("vh2o-admin-store-form")).toBeNull();
  });
});
