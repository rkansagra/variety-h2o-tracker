import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { MENU_CACHE_KEY, mapMenu, mapStoreInfo, menuCacheValue, readMenuCache } from "./lib/menu";
import { MenuContext } from "./menuContext";

// Loads the menu and store info (ROADMAP item E) for everyone, signed in or not, and owns the
// admin's menu edits. Along with UserProvider, the only place that talks to Supabase. If the menu
// can't load (no signal, Supabase down), it shows the last copy this device loaded, marked with
// when it was saved; with no copy, the screens say the menu is unavailable.

const ITEM_COLUMNS = "id, category_id, name, price, unit, description, size_tiers, sort_order, hidden";
const CATEGORY_COLUMNS = "id, name, icon, image_key, color, sort_order, size_tiers";
const STORE_COLUMNS = "address_line1, address_line2, phone_display, phone_tel, hours, tagline, welcome, order_url, facebook_url, maps_google_url, maps_apple_url";

// Categories, items, and store info. Hidden items come back only for the admin (RLS).
async function fetchMenu() {
  const [categories, items, store] = await Promise.all([
    supabase.from("menu_categories").select(CATEGORY_COLUMNS),
    supabase.from("menu_items").select(ITEM_COLUMNS),
    supabase.from("store_info").select(STORE_COLUMNS),
  ]);
  const error = categories.error || items.error || store.error;
  if (error) throw error;
  return { categories: mapMenu(categories.data, items.data), store: mapStoreInfo((store.data || [])[0]) };
}

// The latest menu edits, newest first, with who made them (admin only, by RLS). Module-level: it
// uses no state, so its identity is stable for effects that depend on it.
async function fetchMenuChanges(limit = 20) {
  const { data, error } = await supabase
    .from("menu_changes")
    .select("id, changed_at, changed_by, table_name, row_key, action, old_values, new_values")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, message: error.message };
  return { ok: true, changes: data || [] };
}

function readCache() {
  try {
    return readMenuCache(localStorage.getItem(MENU_CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(categories, store) {
  try {
    localStorage.setItem(MENU_CACHE_KEY, menuCacheValue(categories, store));
  } catch {
    // Private browsing or full storage: the menu still works, just without an offline copy.
  }
}

// Turns a { data, error } result into { ok, message } and, on success, reloads the menu.
function withReload(reload) {
  return async (result) => {
    if (result.error) return { ok: false, message: result.error.message };
    await reload();
    return { ok: true };
  };
}

// The provider's next state: the live menu (remembered for next time), else the remembered copy,
// else "unavailable".
async function loadMenuState() {
  try {
    const { categories, store } = await fetchMenu();
    if (categories.length === 0 || !store) throw new Error("The menu is empty");
    writeCache(categories, store);
    return { status: "live", categories, store, cachedAt: null };
  } catch (err) {
    console.warn("Menu load failed:", err);
    const cached = readCache();
    return cached
      ? { status: "cached", categories: cached.categories, store: cached.store, cachedAt: cached.savedAt }
      : { status: "unavailable", categories: [], store: null, cachedAt: null };
  }
}

export function MenuProvider({ children }) {
  const [state, setState] = useState({ status: "loading", categories: [], store: null, cachedAt: null });

  const reload = useCallback(async () => {
    setState(await loadMenuState());
  }, []);

  useEffect(() => {
    let active = true;
    loadMenuState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  // ---------- Admin edits (RLS and column grants refuse anyone else) ----------

  const done = withReload(reload);

  const addMenuItem = async (categoryId, fields) => done(
    await supabase.from("menu_items").insert({ category_id: categoryId, ...fields }),
  );

  const saveMenuItem = async (id, fields) => done(
    await supabase.from("menu_items").update(fields).eq("id", id),
  );

  const deleteMenuItem = async (id) => done(
    await supabase.from("menu_items").delete().eq("id", id),
  );

  const saveCategorySizes = async (categoryId, sizeTiers) => done(
    await supabase.from("menu_categories").update({ size_tiers: sizeTiers }).eq("id", categoryId),
  );

  const saveStoreInfo = async (fields) => done(
    await supabase.from("store_info").update(fields).eq("id", true),
  );

  return (
    <MenuContext.Provider
      value={{
        ...state,
        reloadMenu: reload,
        addMenuItem,
        saveMenuItem,
        deleteMenuItem,
        saveCategorySizes,
        saveStoreInfo,
        fetchMenuChanges,
      }}
    >
      {children}
    </MenuContext.Provider>
  );
}
