// Pure helpers for the menu and store info (ROADMAP item E): turning database rows into the shape
// the screens use, the device's remembered copy for when the menu can't load, and parsing what
// the admin types into the editor. No Supabase calls here (MenuProvider makes those).

function mapSizeTiers(tiers) {
  return Array.isArray(tiers)
    ? tiers.map((t) => ({ key: t.key, label: t.label, price: Number(t.price) }))
    : null;
}

export function mapMenuItem(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    unit: row.unit || "",
    description: row.description || "",
    sizeTiers: mapSizeTiers(row.size_tiers),
    sortOrder: row.sort_order ?? 0,
    hidden: Boolean(row.hidden),
  };
}

// Categories in order, each with its items in order.
export function mapMenu(categoryRows, itemRows) {
  const items = (itemRows || []).map(mapMenuItem).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return (categoryRows || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      imageKey: row.image_key || null,
      color: row.color,
      sizeTiers: mapSizeTiers(row.size_tiers),
      items: items.filter((item) => item.categoryId === row.id),
    }));
}

export function mapStoreInfo(row) {
  if (!row) return null;
  return {
    addressLines: [row.address_line1, row.address_line2].filter(Boolean),
    phone: { display: row.phone_display, tel: row.phone_tel },
    hours: Array.isArray(row.hours) ? row.hours : [],
    tagline: row.tagline || "",
    welcome: row.welcome || "",
    orderUrl: row.order_url || "",
    facebookUrl: row.facebook_url || "",
    mapsGoogleUrl: row.maps_google_url || "",
    mapsAppleUrl: row.maps_apple_url || "",
  };
}

// An item's sizes: none when it has its own price, otherwise its own sizes or its category's.
export function sizesOf(item, category) {
  if (item.price !== null && item.price !== undefined) return null;
  return item.sizeTiers ?? category.sizeTiers ?? null;
}

// ---------- The device's remembered copy ----------

export const MENU_CACHE_KEY = "vh2o-menu-cache-v1";

// What gets remembered: only what anyone may see (hidden items are dropped, in case an admin's
// browser loaded them).
export function menuCacheValue(categories, store, savedAt = new Date().toISOString()) {
  return JSON.stringify({
    savedAt,
    store,
    categories: categories.map((c) => ({ ...c, items: c.items.filter((item) => !item.hidden) })),
  });
}

// The remembered copy, or null when there is none or it doesn't parse.
export function readMenuCache(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.categories) || parsed.categories.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------- Parsing the editor's inputs ----------

// "4.5" -> 4.5, "$10" -> 10, "" -> null (no price); undefined for anything that isn't a price
// with at most 2 decimals.
export function parsePrice(text) {
  const trimmed = String(text ?? "").trim().replace(/^\$/, "");
  if (trimmed === "") return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

// A displayed phone number -> its tel: link. US numbers only: 10 digits, or 11 starting with 1.
// null when it isn't one.
export function phoneToTel(display) {
  const digits = String(display ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return null;
}

// ---------- The change history ----------

const STORE_FIELD_LABELS = {
  address_line1: "address", address_line2: "address", phone_display: "phone", phone_tel: "phone",
  hours: "hours", tagline: "tagline", welcome: "welcome text", order_url: "Order Online link",
  facebook_url: "Facebook link", maps_google_url: "Google Maps link", maps_apple_url: "Apple Maps link",
};

const money = (value) => (value === null || value === undefined ? "sizes" : `$${Number(value).toFixed(2)}`);

// One menu_changes row as a short line for the admin, e.g. "Reverse Osmosis Water: price $0.55 ->
// $0.60". categoryName looks up a category id's display name.
export function describeMenuChange(change, categoryName = (id) => id) {
  const before = change.old_values || {};
  const after = change.new_values || {};
  if (change.table_name === "store_info") {
    const fields = [...new Set(Object.keys(after)
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]) && STORE_FIELD_LABELS[key])
      .map((key) => STORE_FIELD_LABELS[key]))];
    return `Store details: ${fields.join(", ") || "updated"}`;
  }
  if (change.table_name === "menu_categories") {
    return `${categoryName(after.id || before.id)}: size prices changed`;
  }
  const name = after.name || before.name || "Item";
  if (change.action === "insert") return `${name}: added (${money(after.price)})`;
  if (change.action === "delete") return `${name}: removed`;
  const parts = [];
  if (before.name !== after.name) parts.push(`renamed from "${before.name}"`);
  if (Number(before.price) !== Number(after.price) || (before.price === null) !== (after.price === null)) {
    parts.push(`price ${money(before.price)} → ${money(after.price)}`);
  }
  if (before.hidden !== after.hidden) parts.push(after.hidden ? "hidden" : "shown again");
  if (JSON.stringify(before.size_tiers) !== JSON.stringify(after.size_tiers)) parts.push("sizes changed");
  if ((before.unit || "") !== (after.unit || "")) parts.push("unit changed");
  if ((before.description || "") !== (after.description || "")) parts.push("description changed");
  if (before.category_id !== after.category_id) parts.push(`moved to ${categoryName(after.category_id)}`);
  return `${name}: ${parts.join(", ") || "updated"}`;
}
